var Promise = require('rsvp').Promise;
var System = require('systemjs');

var asp = require('rsvp').denodeify;
var fs = require('fs');
var path = require('path');

var extend = require('./utils').extend;

var attachCompilers = require('./compile').attachCompilers;
var compileTree = require('./compile').compileTree;
var compileLoad = require('./compile').compileLoad;

var writeOutputs = require('./output').writeOutputs;

var traceExpression = require('./arithmetic').traceExpression;

var Trace = require('./trace');

var getCanonicalName = require('./utils').getCanonicalName;

var fromFileURL = require('./utils').fromFileURL;

var createHash = require('crypto').createHash;

require('rsvp').on('error', function(reason) {
  throw new Error('Unhandled promise rejection.\n' + reason && reason.stack || reason || '' + '\n');
});

function Builder(baseURL, cfg) {
  if (typeof baseURL == 'object') {
    cfg = baseURL;
    baseURL = null;
  }

  this.loader = null;

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
    loaderConfig.call(loader, cfg);
    loader.pluginLoader.config(cfg);
    loader.configHash = generateConfigHash(loader);
  };

  loader.builder = true;
  
  this.getCanonicalName = getCanonicalName.bind(null, this.loader);
  this.loader.getCanonicalName = this.getCanonicalName;

  attachCompilers(loader);
  global.System = loader;

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
    var pkgConditionalIndex = name.indexOf('#:');
    if (pkgConditionalIndex != -1) {
      pkgConditional = name.substr(pkgConditionalIndex);
      name = name.substr(0, pkgConditionalIndex) + '/';
    }
    return loaderNormalize.call(this, name, parentName, parentAddress)
    .then(function(normalized) {
      if (pkgConditional)
        normalized = normalized.substr(0, normalized.length - 1) + pkgConditional;
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

  if (this.resetConfig)
    executeConfigFile.call(this, false, true, this.resetConfig);

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

function executeConfigFile(saveForReset, ignoreBaseURL, source) {
  if (saveForReset)
    this.resetConfig = source;

  var System = this.loader;

  // Save existing System.config function.
  var systemConfigFunc = System.config;

  // Assign a new temporary function which filters the config data; see `Builder.prototype.config`.
  System.config = function(config) {
    var cfg = {};
    for (var p in config) {
      if (ignoreBaseURL && p == 'baseURL' || p == 'bundles' || p == 'depCache')
        continue;
      cfg[p] = config[p];
    }
    // Invoke existing loader config function.
    systemConfigFunc(cfg); 
  };

  // jshint evil:true
  eval(source.toString());

  // Assign back to System.config the original saved function.
  System.config = systemConfigFunc;
}

Builder.prototype.loadConfig = function(configFile, saveForReset, ignoreBaseURL) {
  return asp(fs.readFile)(configFile)
  .then(executeConfigFile.bind(this, saveForReset, ignoreBaseURL));
};

Builder.prototype.loadConfigSync = function(configFile, saveForReset, ignoreBaseURL) {
  var source = fs.readFileSync(configFile);
  executeConfigFile.call(this, saveForReset, ignoreBaseURL, source);
};

// note ignore argument is part of API
Builder.prototype.config = function(config, ignoreBaseURL) {
  var cfg = {};
  for (var p in config) {
    if (ignoreBaseURL && p == 'baseURL' || p == 'bundles' || p == 'depCache')
      continue;
    cfg[p] = config[p];
  }
  this.loader.config(cfg);
};

/*
 * Builder Operations
 */
function processTraceOpts(options, defaults) {
  var opts = {    
    // conditional tracing options
    browser: undefined,
    node: undefined,
    traceAllConditionals: true,
    conditions: {},
    traceConditionsOnly: false
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
    normalize: true,
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
    format: 'global',
    globalDeps: {},
    globalName: null,
    // conditionalResolutions: {}, 
    // can add a special object here that matches condition predicates to direct module names to use for sfx

    // this shouldn't strictly be a compile option,
    // but the cjs compiler needs it to do NODE_ENV optimization
    minify: false
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
      return self.tracer.getLoadRecord(getCanonicalName(self.loader, moduleName));  
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

  // override the fetch function if given
  if (opts && opts.fetch)
    this.fetch = opts.fetch;

  return Promise.resolve()
  .then(function() {
    if (expressionOrTree instanceof Array)
      expressionOrTree = '[' + expressionOrTree.join('] [') + ']';

    if (typeof expressionOrTree != 'string')
      return expressionOrTree;

    return traceExpression(self, expressionOrTree, processTraceOpts(opts));
  })
  .then(function(tree) {
    return compileTree(self.loader, tree, processCompileOpts(opts), outputOpts, self.cache.compile)
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
  var traceOpts = processTraceOpts(opts);
  var compileOpts = processCompileOpts(opts, { static: true });
  
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
    return self.tracer.inlineConditions(tree, traceOpts.conditions)
    .then(function(inlinedTree) {
      return compileTree(self.loader, inlinedTree, compileOpts, outputOpts, self.cache.compile);
    })
    .then(function(compiled) {
      return writeOutputs(compiled.outputs, self.loader.baseURL, outputOpts)
      .then(function(output) {
        output.assetList = compiled.assetList;
        output.modules = Object.keys(tree).filter(function(moduleName) {
          return tree[moduleName];
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
    if (load && load.deps.length)
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
