var Promise = require('bluebird');
var System = require('systemjs');

var asp = require('bluebird').promisify;
var fs = require('fs');
var path = require('path');

var extend = require('./utils').extend;

var attachCompilers = require('./compile').attachCompilers;
var compileTree = require('./compile').compileTree;
var compileLoad = require('./compile').compileLoad;
var wrapSFXOutputs = require('./compile').wrapSFXOutputs;
var writeOutputs = require('./output').writeOutputs;

var rollupTree = require('./rollup').rollupTree;

var traceExpression = require('./arithmetic').traceExpression;

var Trace = require('./trace');

var getCanonicalName = require('./utils').getCanonicalName;

var fromFileURL = require('./utils').fromFileURL;

var createHash = require('crypto').createHash;
var getFormatHint = require('./utils').getFormatHint;

// new Builder(baseURL)
// new Builder({cfg})
// new Builder(baseURL, {cfg})
// new Builder(baseURL, 'cfg-file.js')
// 
// baseURL is ignored in cfg when given
// cfg is saved and used by reset
function Builder(baseURL, cfg) {
  if (typeof baseURL == 'object') {
    cfg = baseURL;
    baseURL = null;
  }

  this.loader = null;
  this.resetConfig = function() {};

  this.reset();

  if (baseURL)
    this.config({ baseURL: baseURL });

  // config passed to constructor will
  // be saved for future .reset() calls
  if (typeof cfg == 'object')
    this.config(cfg, true, !!baseURL);
  else if (typeof cfg == 'string')
    this.loadConfigSync(cfg, true, !!baseURL);
}

// invalidate the cache for a given module name
// accepts wildcards (*) which are taken to be deep-matching
Builder.prototype.invalidate = function(invalidationModuleName) {
  var loader = this.loader;

  var invalidated = [];

  // invalidation happens in normalized-space
  invalidationModuleName = loader.normalizeSync(invalidationModuleName);

  // wildcard detection and handling
  var invalidationWildcardIndex = invalidationModuleName.indexOf('*');
  if (invalidationModuleName.lastIndexOf('*') != invalidationWildcardIndex)
    throw new TypeError('Only a single wildcard supported for invalidation.');

  if (invalidationWildcardIndex != -1) {
    var wildcardLHS = invalidationModuleName.substr(0, invalidationWildcardIndex);
    var wildcardRHS = invalidationModuleName.substr(invalidationWildcardIndex + 1);
  }

  function matchesInvalidation(moduleName) {
    if (moduleName == invalidationModuleName)
      return true;

    if (invalidationWildcardIndex == -1)
      return false;

    return moduleName.substr(0, invalidationWildcardIndex) == wildcardLHS 
        && moduleName.substr(moduleName.length - wildcardRHS.length) == wildcardRHS;
  }

  // invalidate the given path in the trace cache
  var traceCache = this.cache.trace;
  Object.keys(traceCache).forEach(function(canonical) {
    var moduleName = loader.normalizeSync(canonical);
    if (matchesInvalidation(moduleName)) {
      if (traceCache[canonical])
        invalidated.push(moduleName);
      traceCache[canonical] = undefined;
    }
  });

  // clear the given path from the pluginLoader registry
  var pluginLoader = loader.pluginLoader;
  Object.keys(pluginLoader._loader.modules).forEach(function(moduleName) {
    if (matchesInvalidation(moduleName)) {
      invalidated.push(moduleName);
      pluginLoader.delete(moduleName);
    }
  });

  // clear the loader define cache
  loader.defined = {};

  // we leave the compile cache in-tact as it is hashed

  // return array of invalidated canonicals
  return invalidated;
};

Builder.prototype.reset = function(baseLoader) {
  baseLoader = baseLoader || this.loader || System;

  var loader = this.loader = new baseLoader.constructor();
  loader.import = function(name) {
    return Promise.reject(new Error('Unable to import "' + name + '".\nThe incorrect instance of System is being used to System.import.'));
  };

  // ensure this loader doesn't attempt to load the runtime
  loader._loader.loadedTranspilerRuntime = true;

  var pluginLoader = loader.pluginLoader = new baseLoader.constructor();

  loader.constructor = pluginLoader.constructor = baseLoader.constructor;
  loader.baseURL = pluginLoader.baseURL = baseLoader.baseURL;

  loader.normalize = pluginLoader.normalize = baseLoader.normalize;
  loader.normalizeSync = pluginLoader.normalizeSync = baseLoader.normalizeSync;

  // store original hooks for next reset
  loader.originalHooks = baseLoader.originalHooks || {
    locate: baseLoader.locate,
    fetch: baseLoader.fetch,
    translate: baseLoader.translate,
    instantiate: baseLoader.instantiate
  };

  loader.locate = pluginLoader.locate = loader.originalHooks.locate;
  loader.fetch = pluginLoader.fetch = loader.originalHooks.fetch;
  loader.translate = pluginLoader.translate = loader.originalHooks.translate;
  loader.instantiate = pluginLoader.instantiate = loader.originalHooks.instantiate;

  var loaderConfig = loader.config;
  loader.config = function(cfg) {
    loaderConfig.call(this, cfg);
    loader.pluginLoader.config(cfg);
    loader.configHash = generateConfigHash(loader);
  };

  loader.builder = true;
  
  this.getCanonicalName = getCanonicalName.bind(null, this.loader);
  this.loader.getCanonicalName = this.loader.pluginLoader.getCanonicalName = this.getCanonicalName;

  attachCompilers(loader);

  var builder = this;

  // allow a custom fetch hook
  var loaderFetch = loader.fetch;
  loader.fetch = function(load) {
    var self = this;
    return Promise.resolve((builder.fetch || loaderFetch).call(this, load, function(load) {
      return loaderFetch.call(self, load);
    }))
    .then(function(source) {
      // custom fetch hook has to handle custom statting too
      // by setting load.metadata.timestamp itself
      if (builder.fetch)
        return source;

      // calling default fs.readFile fetch -> set timestamp as well for cache invalidation
      return asp(fs.stat)(fromFileURL(load.address))
      .then(function(stats) {
        load.metadata.timestamp = stats.mtime.getTime();
        return source;
      }, function(err) {
        // if the stat fails on a plugin, it may not be linked to the file itself
        if (err.code == 'ENOENT' && load.metadata.loader)
          return source;
        throw err;
      });

      return source;
    });
  };

  // this allows us to normalize package conditionals into package conditionals
  // package environment normalization handling for fallbacks,
  // which dont resolve in the loader itself unlike other conditionals which
  // have this condition inlined under loader.builder in conditionals.js
  var loaderNormalize = loader.normalize;
  loader.normalize = function(name, parentName, parentAddress) {
    var pkgConditional;
    var pkgConditionalIndex = name.indexOf('/#:');
    if (pkgConditionalIndex != -1) {
      pkgConditional = name.substr(pkgConditionalIndex);
      name = name.substr(0, pkgConditionalIndex + 1);
    }
    return loaderNormalize.call(this, name, parentName, parentAddress)
    .then(function(normalized) {
      if (pkgConditional)
        normalized = normalized + pkgConditional;
      return normalized;
    });
  };

  var loaderNormalizeSync = loader.normalizeSync;
  loader.normalizeSync = function(name, parentName, parentAddress) {
    var pkgConditional;
    var pkgConditionalIndex = name.indexOf('#:');
    if (pkgConditionalIndex != -1) {
      pkgConditional = name.substr(pkgConditionalIndex);
      name = name.substr(0, pkgConditionalIndex) + '/';
    }
    var normalized = loaderNormalizeSync.call(this, name, parentName, parentAddress);
    if (pkgConditional)
      normalized = normalized.substr(0, normalized.length - 1) + pkgConditional;
    return normalized;
  };

  // run saved configuration functions against new loader instance
  this.resetConfig();

  // create cache if not existing
  this.setCache(this.cache || {});

  // mark all traces as unfresh
  var traceCache = this.cache.trace;
  Object.keys(traceCache).forEach(function(canonical) {
    if (traceCache[canonical])
      traceCache[canonical].fresh = false;
  });
};

function generateConfigHash(loader) {
  return createHash('md5')
  .update(JSON.stringify({
    paths: loader.paths,
    packages: loader.packages,
    meta: loader.meta,
    map: loader.map
  }))
  .digest('hex');
}

Builder.prototype.setCache = function(cacheObj) {
  this.cache = {
    compile: cacheObj.compile || { encodings: {}, loads: {} },
    trace: cacheObj.trace || {}
  };
  this.tracer = new Trace(this.loader, this.cache.trace);
};

Builder.prototype.getCache = function() {
  return this.cache;
};

Builder.prototype.clearCache = function() {
  this.setCache({});
};

function executeConfigFile(saveForReset, ignoreBaseURL, configPath, source) {
  var self = this;

  // create a safe loader to give to the config execution
  var configLoader = Object.create(this.loader);
  configLoader.config = function(cfg) {
    self.config(cfg, saveForReset, ignoreBaseURL);
  };

  // make everything in global available to config file code
  // only substitute local copy of System
  // and prevent that code from adding anything to the real global 
  var context = Object.create(global);
  context.SystemJS = context.System = configLoader;
  context.global = context.GLOBAL = context.root = context;
  // make require available too, make it look as if config file was
  // loaded like a module
  var Module = require('module');
  var m = new Module(configPath);
  m.filename = configPath;
  m.paths = Module._nodeModulePaths(path.dirname(configPath));
  context.require = m.require.bind(m);
  require('vm').runInNewContext(source.toString(), context);
}

Builder.prototype.loadConfig = function(configFile, saveForReset, ignoreBaseURL) {
  return asp(fs.readFile)(configFile)
  .then(executeConfigFile.bind(this, saveForReset, ignoreBaseURL, configFile));
};

Builder.prototype.loadConfigSync = function(configFile, saveForReset, ignoreBaseURL) {
  var source = fs.readFileSync(configFile);
  executeConfigFile.call(this, saveForReset, ignoreBaseURL, configFile, source);
};

// note ignore argument is part of API
Builder.prototype.config = function(config, saveForReset, ignoreBaseURL) {
  var cfg = {};
  for (var p in config) {
    if (ignoreBaseURL && p == 'baseURL' || p == 'bundles' || p == 'depCache')
      continue;
    cfg[p] = config[p];
  }
  this.loader.config(cfg);
  if (saveForReset) {
    // multiple config calls can be saved for reset
    var curReset = this.resetConfig;
    this.resetConfig = function() {
      curReset.call(this);
      this.loader.config(cfg);
    };
  }
};

/*
 * Builder Operations
 */
function processTraceOpts(options, defaults) {
  var opts = {    
    // conditional tracing options
    browser: undefined,
    node: undefined,
    production: undefined,
    development: undefined,
    traceAllConditionals: true,
    conditions: {},
    traceConditionsOnly: false,
    tracePackageConfig: true,

    // package config tracing (used for bundles only)
    tracePackageConfig: false,

    // when set, automatically excludes non-file URLs that don't resolve to canonical names
    // instead of showing the "Unable to calculate canonical name" error
    excludeURLs: true
  };

  extend(opts, defaults);
  extend(opts, options);

  // conditional tracing defaults
  if (typeof opts.browser == 'boolean' || typeof opts.node == 'boolean') {

    // browser true/false -> node is opposite
    if (typeof opts.browser == 'boolean' && typeof opts.node != 'boolean')
      opts.node = !opts.browser;
    // node true/false -> browser is opposite
    else if (typeof opts.node == 'boolean' && typeof opts.browser != 'boolean')
      opts.browser = !opts.node;

    // browser, node   -> browser, ~browser, node, ~node
    // !browser, node  -> ~browser, node
    // browser, !node  -> browser, ~node
    // !browser, !node -> ~browser, ~node
    opts.conditions['@system-env|browser'] = opts.browser;
    opts.conditions['~@system-env|browser'] = opts.browser === true ? opts.node : !opts.browser;
    opts.conditions['@system-env|node'] = opts.node;
    opts.conditions['~@system-env|node'] = opts.node === true ? opts.browser : !opts.node;
    
    if (typeof opts.production != 'boolean')
      opts.production = !opts.development;
    if (typeof opts.development != 'boolean')
      opts.development = !opts.production;

    opts.conditions['@system-env|production'] = opts.production;
    opts.conditions['~@system-env|production'] = opts.development;
  }

  return opts;
}

Builder.prototype.trace = function(expression, opts) {
  if (opts && opts.config)
    this.config(opts.config);

  return traceExpression(this, expression, processTraceOpts(opts));
};

function processCompileOpts(options, defaults) {
  // NB deprecate these warnings
  // all of the below features were undocumented and experimental, so deprecation needn't be long
  options = options || {};
  if ('sfxFormat' in options) {
    console.warn('SystemJS Builder "sfxFormat" is deprecated and has been renamed to "format".');
    options.format = options.sfxFormat; 
  }
  if ('sfxEncoding' in options) {
    console.warn('SystemJS Builder "sfxEncoding" is deprecated and has been renamed to "encodeNames".');
    options.encodeNames = sfxEncoding;
  }
  if ('sfxGlobals' in options) {
    console.warn('SystemJS Builder "sfxGlobals" is deprecated and has been renamed to "globalDeps".');
    options.globalDeps = options.sfxGlobals;
  }
  if ('sfxGlobalName' in options) {
    console.warn('SystemJS Builder "sfxGlobalName" is deprecated and has been renamed to "globalName".');
    options.globalName = options.sfxGlobalName;
  }

  var opts = {
    entryPoints: [],
    normalize: false,
    anonymous: false,

    systemGlobal: 'System',
    // whether to inline package configurations into bundles
    buildConfig: false,
    inlinePlugins: true,
    static: false,
    encodeNames: undefined,

    sourceMaps: false,
    lowResSourceMaps: false,

    // static build options
    // it may make sense to split this out into build options
    // at a later point as static build and bundle compile diverge further
    runtime: false,
    format: 'umd',
    globalDeps: {},
    globalName: null,
    // conditionalResolutions: {}, 
    // can add a special object here that matches condition predicates to direct module names to use for sfx

    // set to true to build in "format amd" style sfx hints for SystemJS loading
    formatHint: false,

    // this shouldn't strictly be a compile option (its a trace option)
    // but the cjs compiler needs it to do NODE_ENV optimization
    production: true,

    // use rollup optimizations
    rollup: false
  };

  extend(opts, defaults);
  extend(opts, options);

  if (opts.static) {
    if (opts.encodeNames !== false)
      opts.encodeNames = true;
    // include runtime by default if needed
    if (options.runtime !== false)
      opts.runtime = true;

    // static builds have a System closure with a dummy name
    opts.systemGlobal = '$__System';

    // static builds normalize all requires
    opts.normalize = true;
  }

  return opts;
}

Builder.prototype.compile = function(moduleNameOrLoad, outFile, opts) {
  if (outFile && typeof outFile == 'object') {
    opts = outFile;
    outFile = undefined;
  }

  if (opts && opts.config)
    this.config(opts.config);

  var self = this;

  return Promise.resolve()
  .then(function() {
    if (typeof moduleNameOrLoad != 'string')
      return moduleNameOrLoad;
    return self.loader.normalize(moduleNameOrLoad)
    .then(function(moduleName) {
      return self.tracer.getLoadRecord(getCanonicalName(self.loader, moduleName), true);  
    });
  })
  .then(function(load) {
    return compileLoad(self.loader, load, processCompileOpts(opts, { normalize: false, anonymous: true }), self.cache.compile);
  })
  .then(function(output) {
    return writeOutputs([output], self.loader.baseURL, processOutputOpts(opts, { outFile: outFile }));
  });
};

function processOutputOpts(options, defaults) {
  var opts = {
    outFile: undefined,
    
    minify: false,
    mangle: true,
    globalDefs: undefined,
    ascii: false,
    unused: undefined,

    sourceMaps: false,
    sourceMapContents: undefined
  };

  extend(opts, defaults);
  extend(opts, options);

  // source maps 'inline' handling
  if (opts.sourceMapContents === undefined)
    opts.sourceMapContents = opts.sourceMaps == 'inline';

  return opts;
}

// bundle
Builder.prototype.bundle = function(expressionOrTree, outFile, opts) {
  if (outFile && typeof outFile === 'object') {
    opts = outFile;
    outFile = undefined;
  }

  var self = this;

  if (opts && opts.config)
    this.config(opts.config);

  var outputOpts = processOutputOpts(opts, { outFile: outFile });
  var traceOpts = processTraceOpts(opts, { tracePackageConfig: true });

  // override the fetch function if given
  if (opts && opts.fetch)
    this.fetch = opts.fetch;

  return Promise.resolve()
  .then(function() {
    if (expressionOrTree instanceof Array)
      expressionOrTree = '[' + expressionOrTree.join('] [') + ']';

    if (typeof expressionOrTree != 'string')
      return expressionOrTree;

    return traceExpression(self, expressionOrTree, traceOpts);
  })
  .then(function(tree) {
    return compileTree(self.loader, tree, traceOpts, processCompileOpts(opts), outputOpts, self.cache.compile)
    .then(function(compiled) {
      return writeOutputs(compiled.outputs, self.loader.baseURL, outputOpts)
      .then(function(output) {
        output.modules = Object.keys(tree).filter(function(moduleName) {
          return tree[moduleName] && !tree[moduleName].conditional;
        });
        output.entryPoints = compiled.entryPoints;
        output.tree = tree;
        output.assetList = compiled.assetList;
        return output;
      });
    });
  });
};

// build into an optimized static module
Builder.prototype.buildStatic = function(expressionOrTree, outFile, opts) {
  if (outFile && typeof outFile === 'object') {
    opts = outFile;
    outFile = undefined;
  }

  var self = this;

  if (opts && opts.config)
    this.config(opts.config);

  var outputOpts = processOutputOpts(opts, { outFile: outFile });
  var traceOpts = processTraceOpts(opts, { tracePackageConfig: false });
  var compileOpts = processCompileOpts(opts, { static: true });
  var inlineMap;

  // override the fetch function if given
  if (opts && opts.fetch)
    this.fetch = opts.fetch;
  
  return Promise.resolve()
  .then(function() {
    if (expressionOrTree instanceof Array)
      expressionOrTree = '[' + expressionOrTree.join('] [') + ']';
    
    if (typeof expressionOrTree != 'string')
      return expressionOrTree;

    return traceExpression(self, expressionOrTree, traceOpts);
  })
  .then(function(tree) {
    // inline conditionals of the trace
    return self.tracer.inlineConditions(tree, self.loader, traceOpts.conditions)
    .then(function(inlinedTree) {
      if (!compileOpts.rollup)
        return compileTree(self.loader, inlinedTree, traceOpts, compileOpts, outputOpts, self.cache.compile);

      // attempt rollup optimizations of ESM entry points
      return rollupTree(self.loader, inlinedTree, [], traceOpts, compileOpts)
      .then(function(rolledUp) {
        inlineMap = rolledUp.inlineMap;

        // we rolled up parts of the tree
        if (rolledUp.tree)
          return compileTree(self.loader, rolledUp.tree, traceOpts, compileOpts, outputOpts, self.cache.compile);

        // if we rolled up the whole tree, then we can skip compile and sfx wrapping entirely
        else if (rolledUp.outputs) {
          return { outputs: (compileOpts.formatHint ? [getFormatHint(compileOpts)] : []).concat(rolledUp.outputs), assetList: [] };
        }
      });
    })
    .then(function(compiled) {
      return writeOutputs(compiled.outputs, self.loader.baseURL, outputOpts)
      .then(function(output) {
        if (inlineMap)
          output.inlineMap = inlineMap;
        output.assetList = compiled.assetList;
        output.modules = Object.keys(tree).filter(function(moduleName) {
          return tree[moduleName] && !tree[moduleName].conditional;
        });
        return output;        
      });
    });
  });
};

Builder.prototype.build = function() {
  console.warn('builder.build is deprecated. Using builder.bundle instead.');
  return this.bundle.apply(this, arguments);
};
Builder.prototype.buildSFX = function() {
  console.warn('builder.buildSFX is deprecated. Using builder.buildStatic instead.');
  return this.buildStatic.apply(this, arguments);
};
Builder.prototype.buildTree = function() {
  console.warn('builder.buildTree is deprecated. Using builder.bundle instead, which takes both a tree object or expression string.');
  return this.bundle.apply(this, arguments);
};

// given a tree, creates a depCache for it
Builder.prototype.getDepCache = function(tree) {
  var depCache = {};
  Object.keys(tree).forEach(function(moduleName) {
    var load = tree[moduleName];
    if (load && load.deps && load.deps.length)
      depCache[moduleName] = load.deps.map(function(dep) {
        return load.depMap[dep];
      });
  });
  return depCache;
};

Builder.prototype.getDeferredImports = function(tree) {
  var getDeferredImports = require('./get-deferred-imports');
  return getDeferredImports(this, tree);
}

// expose useful tree statics on the builder instance for ease-of-use
Builder.prototype.intersectTrees = require('./arithmetic').intersectTrees;
Builder.prototype.addTrees = require('./arithmetic').addTrees;
Builder.prototype.subtractTrees = require('./arithmetic').subtractTrees;

module.exports = Builder;
