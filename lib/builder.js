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

  loaderConfig = loader.config;
  loader.config = function(cfg) {
    loaderConfig.call(loader, cfg);
    loader.pluginLoader.config(cfg);
  };

  loader.builder = true;
  
  this.getCanonicalName = getCanonicalName.bind(null, this.loader);
  this.loader.getCanonicalName = this.getCanonicalName;

  attachCompilers(loader);
  global.System = loader;

  // add a local fetch cache to the loader
  // useful for plugin duplications of hooks
  var fetchCache = {};
  var loaderFetch = loader.fetch;
  loader.fetch = pluginLoader.fetch = function(load) {
    if (fetchCache[load.name])
      return fetchCache[load.name];

    return Promise.resolve(loaderFetch.call(this, load)).then(function(source) {
      fetchCache[load.name] = source;
      return source;
    });
  };

  if (this.resetConfig)
    loader.config(this.resetConfig);

  // clear the cache
  this.setCache({});
};

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

function executeConfigFile(source, saveForReset, ignoreBaseURL) {
  var builder = this;
  var curSystem = global.System;
  var configSystem = global.System = {
    config: function(cfg) {
      builder.config(cfg, ignoreBaseURL);
    }
  };
  // jshint evil:true
  new Function(source.toString()).call(global);
  global.System = curSystem;
}

Builder.prototype.loadConfig = function(configFile, saveForReset, ignoreBaseURL) {
  return asp(fs.readFile)(configFile)
  .then(executeConfigFile.bind(this, saveForReset, ignoreBaseURL));
};

Builder.prototype.loadConfigSync = function(configFile, saveForReset, ignoreBaseURL) {
  var source = fs.readFileSync(configFile);
  executeConfigFile.call(this, source, saveForReset, ignoreBaseURL);
};

Builder.prototype.config = function(config, saveForReset, ignoreBaseURL) {
  var cfg = {};
  for (var p in config) {
    if (ignoreBaseURL && p == 'baseURL' || p == 'bundles' || p == 'depCache')
      continue;
    cfg[p] = config[p];
  }
  if (saveForReset)
    this.resetConfig = cfg;
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

  extend(opts, defaults)
  extend(opts, options);

  // conditional tracing defaults
  if (typeof opts.browser == 'boolean' || typeof opts.node == 'boolean') {
    var sysEnv = opts.conditions['@system-env'] = opts.conditions['@system-env'] || {};

    if (typeof opts.browser == 'boolean' && typeof opts.node != 'boolean')
      opts.node = !opts.browser;
    if (typeof opts.node == 'boolean' && typeof opts.browser != 'boolean')
      opts.browser = !opts.node;
    
    sysEnv['browser'] = opts.browser;
    sysEnv['~browser'] = !opts.browser;
    sysEnv['node'] = opts.node;
    sysEnv['~node'] = !opts.node;
  }

  return opts;
}

Builder.prototype.trace = function(expression, opts) {
  if (opts && opts.config)
    this.config(opts.config);

  return traceExpression(this, expression, processTraceOpts(opts));
};

function processCompileOpts(options, defaults) {
  var opts = {
    normalize: true,
    anonymous: false,

    systemGlobal: 'System',
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
    if (opts.runtime !== false)
      opts.runtime = true;

    // static builds have a System closure with a dummy name
    opts.systemGlobal = '$__System';
  }

  return opts;
}

Builder.prototype.compile = function(moduleName, outFile, opts) {
  if (outFile && typeof outFile == 'object') {
    opts = outFile;
    outFile = undefined;
  }

  if (opts && opts.config)
    this.config(opts.config);

  var self = this;

  return Promise.resolve(self.loader.normalize(moduleName))
  .then(function(moduleName) {
    return self.tracer.getLoadRecord(getCanonicalName(self.loader, moduleName));
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

  return Promise.resolve()
  .then(function() {
    if (typeof expressionOrTree != 'string')
      return expressionOrTree;

    return traceExpression(self, expressionOrTree, processTraceOpts(opts));
  })
  .then(function(tree) {
    return compileTree(self.loader, tree, processCompileOpts(opts), outputOpts, self.cache.compile)
    .then(function(outputs) {
      return writeOutputs(outputs, self.loader.baseURL, outputOpts);
    })
    .then(function(output) {
      output.modules = Object.keys(tree).filter(function(moduleName) {
        return tree[moduleName];
      });
      return output;
    });
  });
};

// build into an optimized static module
Builder.prototype.build = function(expressionOrTree, outFile, opts) {
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
    if (typeof expressionOrTree != 'string')
      return expressionOrTree;

    return traceExpression(self, expressionOrTree, traceOpts);
  })
  .then(function(tree) {
    // inline conditionals of the trace
    return self.tracer.inlineConditions(tree, traceOpts.conditions)
    .then(function(inlinedTree) {
      return compileTree(self.loader, inlinedTree, compileOpts, outputOpts, self.cache.compile)
    })
    .then(function(outputs) {
      return writeOutputs(outputs, self.loader.baseURL, outputOpts);
    })
    .then(function(output) {
      output.modules = Object.keys(tree).filter(function(moduleName) {
        return tree[moduleName];
      });
      return output;
    });
  });
};

Builder.prototype.buildSFX = function() {
  throw new TypeError('builder.buildSFX is now called builder.build, while builder.build has been renamed to builder.bundle.');
};
Builder.prototype.buildTree = function() {
  throw new TypeError('builder.buildTree has been combined into builder.build and builder.bundle, which will now both take expressions or tree objects.');
};

// expose useful tree statics on the builder instance for ease-of-use
Builder.prototype.intersectTrees = require('./arithmetic').intersectTrees;
Builder.prototype.addTrees = require('./arithmetic').addTrees;
Builder.prototype.subtractTrees = require('./arithmetic').subtractTrees;

module.exports = Builder;
