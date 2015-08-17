var Promise = require('rsvp').Promise;
var System = require('systemjs');

var asp = require('rsvp').denodeify;
var fs = require('fs');
var path = require('path');

var toFileURL = require('./utils').toFileURL;

var attachCompilers = require('./compile').attachCompilers;
var compileOutputs = require('./compile').compileOutputs;
var compileLoad = require('./compile').compileLoad;

var writeOutputs = require('./output').writeOutputs;

var traceExpression = require('./arithmetic').traceExpression;

var Trace = require('./trace');

var getCanonicalName = require('./utils').getCanonicalName;

function processOpts(opts_, outFile) {
  var opts = {
    config: {},
    outFile: outFile,
    normalize: true,
    anonymous: false,

    runtime: false,
    minify: false,
    mangle: true,

    sfx: false,
    sfxFormat: 'global',
    sfxEncoding: true,
    sfxGlobals: {},
    sfxGlobalName: null,

    sourceMaps: false,
    sourceMapContents: opts_ && opts_.sourceMaps == 'inline',
    lowResSourceMaps: false
  };
  for (var key in opts_)
    opts[key] = opts_[key];
  return opts;
}


function Builder(baseURL, cfg) {
  if (typeof baseURL == 'object') {
    cfg = baseURL;
    baseURL = null;
  }

  this.loader = null;
  this.reset();

  if (baseURL)
    this.config({ baseURL: baseURL });

  if (typeof cfg == 'object')
    this.config(cfg);
  else if (typeof cfg == 'string')
    this.loadConfigSync(cfg);
}

// reverse mapping from globbed address
Builder.prototype.getCanonicalName = function(normalized) {
  return getCanonicalName(this.loader, normalized);
};

Builder.prototype.reset = function(baseLoader) {
  baseLoader = baseLoader || this.loader || System;

  var loader = this.loader = new baseLoader.constructor();
  loader.constructor = baseLoader.constructor;
  loader.baseURL = baseLoader.baseURL;

  loader.normalize = baseLoader.normalize;
  loader.normalizeSync = baseLoader.normalizeSync;
  loader.locate = baseLoader.locate;
  loader.fetch = baseLoader.fetch;
  loader.translate = baseLoader.translate;
  loader.instantiate = baseLoader.instantiate;

  loader.builder = true;

  attachCompilers(loader);
  global.System = loader;

  // clear the cache
  this.setCache({});
};

Builder.prototype.setCache = function(cacheObj) {
  this.cache = {
    compile: cacheObj.compile || {},
    trace: cacheObj.trace || {}
  };
  this.tracer = new Trace(this.loader, this.cache.trace);
};

Builder.prototype.getCache = function() {
  return this.cache;
};

function executeConfigFile(source) {
  var self = this;
  var curSystem = global.System;
  var configSystem = global.System = {
    config: function(cfg) {
      self.config(cfg);
    }
  };
  // jshint evil:true
  new Function(source.toString()).call(global);
  global.System = curSystem;
}

Builder.prototype.loadConfig = function(configFile) {
  return asp(fs.readFile)(configFile)
  .then(executeConfigFile.bind(this));
};

Builder.prototype.loadConfigSync = function(configFile) {
  var source = fs.readFileSync(configFile);
  executeConfigFile.call(this, source);
};

Builder.prototype.config = function(config) {
  var loader = this.loader;

  var cfg = {};
  for (var p in config) {
    if (p != 'bundles')
      cfg[p] = config[p];
  }
  loader.config(cfg);
};

Builder.prototype.compile = function(moduleName, outFile, opts) {
  if (outFile && typeof outFile == 'object') {
    opts = outFile;
    outFile = undefined;
  }

  opts = processOpts(opts, outFile);

  opts.anonymous = true;
  
  var self = this;
  return this.tracer.getLoadRecord(moduleName)
  .then(function(load) {
    return compileLoad(self.loader, load, opts);
  })
  .then(function(output) {
    return writeOutputs(opts, [output], self.loader.baseURL);
  });
};

Builder.prototype.build = function(expression, outFile, opts) {
  var self = this;

  // Allow passing opts as second argument.
  if (outFile && typeof outFile === 'object') {
    opts = outFile;
    outFile = undefined;
  }

  opts = opts || {};

  if (opts.config)
    this.config(opts.config);

  return this.trace(expression)
  .then(function(tree) {
    return self.buildTree(tree, outFile, opts);
  });
};

function addExtraOutputs(output, tree, opts) {
  output.modules = Object.keys(tree).filter(function(moduleName) {
    return tree[moduleName].metadata.build !== false;
  });
}

Builder.prototype.buildTree = function(tree, outFile, opts) {
  var loader = this.loader;
  var self = this;

  // Allow passing opts as second argument.
  if (outFile && typeof outFile === 'object') {
    opts = outFile;
    outFile = undefined;
  }

  opts = processOpts(opts, outFile);

  var cache = this.cache.compile;

  return compileOutputs(loader, tree, opts, false, cache)
  .then(function(outputs) {
    return writeOutputs(opts, outputs, loader.baseURL);
  })
  .then(function(output) {
    addExtraOutputs.call(self, output, tree, opts, loader);
    return output;
  });
};

Builder.prototype.buildSFX = function(expression, outFile, opts) {
  var loader = this.loader;
  var self = this;

  // Allow passing opts as second argument.
  if (outFile && typeof outFile === 'object') {
    opts = outFile;
    outFile = undefined;
  }

  opts = opts || {};
  opts.normalize = true;
  opts.sfx = true;

  // include runtime by default if needed
  if (opts.runtime !== false)
    opts.runtime = true;

  opts = processOpts(opts, outFile);
  var tree;

  if (opts.config)
    this.config(opts.config);

  var cache = this.cache.compile;

  return traceExpression(this, expression, true)
  .then(function(trace) {
    tree = trace.tree;
    return compileOutputs(loader, tree, opts, trace.entryPoints, cache);
  })
  .then(function(outputs) {
    return writeOutputs(opts, outputs, loader.baseURL);
  })
  .then(function(output) {
    addExtraOutputs.call(self, output, tree, opts, loader);
    return output;
  });
};

Builder.prototype.trace = function(expression) {
  return traceExpression(this, expression);
};

var namedRegisterRegEx = /(System\.register(Dynamic)?|define)\(('[^']+'|"[^"]+")/g;

Builder.prototype.traceModule = function(moduleName) {

  var loader = this.loader;

  var self = this;

  var System = loader.global.System;
  loader.global.System = loader;
  
  return Promise.resolve(loader.normalize(moduleName))
  .then(function(_moduleName) {
    moduleName = getCanonicalName(loader, _moduleName);
    return self.tracer.getAllLoadRecords(moduleName);
  })
  .then(function(loads) {
    loader.global.System = System;

    if (moduleName == '@empty')
      return {
        moduleName: moduleName,
        tree: loads
      };

    // if it is a bundle, we just use a regex to extract the list of loads
    // as null records for subtraction arithmetic use only
    var thisLoad = loads[moduleName];
    if (thisLoad.metadata.bundle) {
      namedRegisterRegEx.lastIndex = 0;
      var curMatch;
      while ((curMatch = namedRegisterRegEx.exec(thisLoad.source)))
        loads[curMatch[3].substr(1, curMatch[3].length - 2)] = null;
    }

    return {
      moduleName: moduleName,
      tree: loads
    };
  })
  .catch(function(e) {
    loader.global.System = System;
    throw e;
  });
};

// returns a new tree containing tree1 n tree2
Builder.prototype.intersectTrees = function(tree1, tree2) {
  var name;
  var intersectTree = {};

  var tree1Names = [];
  for (name in tree1)
    tree1Names.push(name);

  for (name in tree2) {
    if (tree1Names.indexOf(name) == -1)
      continue;

    intersectTree[name] = tree1[name] || tree2[name] || null;
  }

  return intersectTree;
};

// returns a new tree containing tree1 + tree2
Builder.prototype.addTrees = function(tree1, tree2) {
  var name;
  var unionTree = {};

  for (name in tree2)
    unionTree[name] = tree2[name] || tree1[name] || null;

  for (name in tree1)
    unionTree[name] = tree1[name] || tree2[name] || null;

  return unionTree;
};

// returns a new tree containing tree1 - tree2
Builder.prototype.subtractTrees = function(tree1, tree2) {
  var name;
  var subtractTree = {};

  for (name in tree1)
    subtractTree[name] = tree1[name];

  for (name in tree2)
    delete subtractTree[name];

  return subtractTree;
};

// given a tree, creates a depCache for it
Builder.prototype.getDepCache = function(tree) {
  var depCache = {};
  Object.keys(tree).forEach(function(moduleName) {
    var load = tree[moduleName];
    if (load.deps.length)
      depCache[moduleName] = load.deps.map(function(dep) {
        return load.depMap[dep];
      });
  });
  return depCache;
};

module.exports = Builder;
