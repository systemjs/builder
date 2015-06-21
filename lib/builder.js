var Promise = require('rsvp').Promise;
var System = require('systemjs');

var asp = require('rsvp').denodeify;
var fs = require('fs');
var path = require('path');
var url = require('url');

var toFileURL = require('./utils').toFileURL;

exports.getCanonicalName = getCanonicalName;

var attachCompilers = require('./compile').attachCompilers;
var compileOutputs = require('./compile').compileOutputs;
var writeOutputs = require('./output').writeOutputs;

var traceExpression = require('./arithmetic').traceExpression;

var absURLRegEx = /^[^\/]+:\/\//;

function processOpts(opts_, outFile) {
  var opts = {
    config: {},
    outFile: outFile,
    normalize: true,

    runtime: false,
    minify: false,
    mangle: true,

    sfxFormat: 'global',

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

Builder.prototype.reset = function(baseLoader) {
  baseLoader = baseLoader || this.loader || System;

  var loader = this.loader = new baseLoader.constructor();
  loader.constructor = baseLoader.constructor;

  var pluginLoader = new baseLoader.constructor();
  pluginLoader.constructor = baseLoader.constructor;

  pluginLoader.trace = true;
  pluginLoader._nodeRequire = baseLoader._nodeRequire;

  loader.baseURL = pluginLoader.baseURL = baseLoader.baseURL;

  // override plugin loader instantiate to first
  // always correct any clobbering of the System global
  // eg by loading Traceur or Traceur Runtime
  var pluginFetch = pluginLoader.fetch;
  pluginLoader.fetch = function(load) {
    if (this.defined[load.name])
      delete this.defined[load.name];
    return pluginFetch.call(this, load);
  };
  var pluginInstantiate = pluginLoader.instantiate;
  pluginLoader.instantiate = function(load) {
    return Promise.resolve(pluginInstantiate.call(this, load))
    .then(function(instantiateResult) {
      if (global.System !== loader)
        global.System = loader;
      return instantiateResult;
    });
  };

  // build = false hooks
  var loaderFetch = loader.fetch;
  loader.fetch = function(load) {
    if (load.metadata.build === false || load.metadata.loaderModule && load.metadata.loaderModule.build === false)
      return '';
    return loaderFetch.call(this, load);
  };
  var loaderInstantiate = loader.instantiate;
  loader.instantiate = function(load) {
    if (load.metadata.loaderModule && load.metadata.loaderModule.build === false || load.metadata.build === false) {
      load.metadata.format = 'defined';
      if (load.metadata.loader)
        load.metadata.deps.push(load.metadata.loader);
      load.metadata.execute = function() {
        return {};
      };
    }
    return loaderInstantiate.call(this, load);
  };

  loader.trace = true;
  loader.execute = false;
  loader.pluginLoader = pluginLoader;

  attachCompilers(loader);
  global.System = loader;
};

// reverse mapping from globbed address
function getCanonicalName(loader, normalized) {
  // remove the plugin part first
  var pluginIndex = normalized.indexOf('!');
  var plugin;
  if (pluginIndex != -1) {
    plugin = normalized.substr(pluginIndex + 1);
    normalized = normalized.substr(0, pluginIndex);
  }

  // now just reverse apply paths rules to get canonical name
  var pathMatch, pathMatchLength = 0;
  var curMatchlength;
  for (var p in loader.paths) {
    // normalize the output path
    var curPath
    if (loader.paths[p][0] == '.')
      curPath = url.resolve(toFileURL(process.cwd()) + '/', loader.paths[p]);
    else
      curPath = url.resolve(loader.baseURL, loader.paths[p]);

    // do reverse match
    var wIndex = curPath.indexOf('*');
    if (wIndex === -1) {
      if (normalized === curPath) {
        curMatchLength = curPath.split('/').length;
        if (curMatchLength > pathMatchLength) {
          pathMatch = p;
          pathMatchLength = curMatchLength;
        }
      }
    }
    else {
      if (normalized.substr(0, wIndex) === curPath.substr(0, wIndex)
        && normalized.substr(normalized.length - curPath.length + wIndex + 1) === curPath.substr(wIndex + 1)) {
        curMatchLength = curPath.split('/').length;
        if (curMatchLength > pathMatchLength) {
          pathMatch = p.replace('*', normalized.substr(wIndex, normalized.length - curPath.length + 1));
          pathMatchLength = curMatchLength;
        }
      }
    }
  }

  // when no path was matched, act like the standard rule is *: baseURL/*
  if (!pathMatch) {
    if (normalized.substr(0, loader.baseURL.length) == loader.baseURL)
      pathMatch = normalized.substr(loader.baseURL.length);
    else if (normalized.match(absURLRegEx))
      throw 'Unable to calculate canonical name to bundle ' + normalized;
    else
      pathMatch = normalized;
  }

  if (plugin)
    pathMatch += '!' + getCanonicalName(loader, plugin);

  return pathMatch;
}

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
  var pluginLoader = loader.pluginLoader;

  var cfg = {};
  for (var p in config) {
    if (p != 'bundles')
      cfg[p] = config[p];
  }
  loader.config(cfg);
  pluginLoader.config(cfg);
};

/**
 * @param {Object} [cache] - Optional cache for storing/reusing compiled modules from other calls to build/buildTree/buildSFX. The cache is populated with an entry for each `load` and is keyed on `load.name`.
 */
Builder.prototype.build = function(expression, outFile, opts, cache) {
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
    return self.buildTree(tree, outFile, opts, cache);
  });
};

function addExtraOutputs(output, tree, opts) {
  output.modules = Object.keys(tree).filter(function(moduleName) {
    return tree[moduleName].metadata.build !== false;
  });
}

/**
 * @param {Object} [cache] - Optional cache for storing/reusing compiled modules, see also `build` method.
 */
Builder.prototype.buildTree = function(tree, outFile, opts, cache) {
  var loader = this.loader;
  var self = this;

  // Allow passing opts as second argument.
  if (outFile && typeof outFile === 'object') {
    opts = outFile;
    outFile = undefined;
  }

  opts = processOpts(opts, outFile);

  return compileOutputs(loader, tree, opts, false, cache)
  .then(function(outputs) {
    return writeOutputs(opts, outputs, loader.baseURL);
  })
  .then(function(output) {
    addExtraOutputs.call(self, output, tree, opts, loader);
    return output;
  });
};

/**
 * @param {Object} [cache] - Optional cache for storing/reusing compiled modules, see also `build` method.
 */
Builder.prototype.buildSFX = function(expression, outFile, opts, cache) {
  var loader = this.loader;
  var self = this;

  // Allow passing opts as second argument.
  if (outFile && typeof outFile === 'object') {
    opts = outFile;
    outFile = undefined;
  }

  opts = opts || {};
  opts.normalize = true;

  // include runtime by default if needed
  if (opts.runtime !== false)
    opts.runtime = true;

  opts = processOpts(opts, outFile);
  var tree;

  if (opts.config)
    this.config(opts.config);

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

var namedRegisterRegEx = /(System\.register\(|define\()('[^']+'|"[^"]+")/g;

Builder.prototype.traceModule = function(moduleName) {
  var loader = this.loader;
  var pluginLoader = loader.pluginLoader;

  var System = loader.global.System;
  loader.global.System = loader;

  var traceTree = {};

  return loader.import(moduleName)
  .then(function() {
    return loader.normalize(moduleName);
  })
  .then(function(_moduleName) {
    moduleName = _moduleName;
    loader.global.System = System;

    // if it is a bundle, we just use a regex to extract the list of loads
    // as null records for subtraction arithmetic use only
    var thisLoad = loader.loads[moduleName];
    if (thisLoad.metadata.bundle) {
      namedRegisterRegEx.lastIndex = 0;
      var curMatch;
      while ((curMatch = namedRegisterRegEx.exec(thisLoad.source)))
        traceTree[curMatch[2].substr(1, curMatch[2].length - 2)] = null;
    }
    else {
      return visitTree(loader.loads, moduleName, pluginLoader, function(load) {
        // copy and canonicalize the load record
        var canonicalLoad = {};
        canonicalLoad.name = getCanonicalName(loader, load.name)

        // use address for source maps
        if (load.name.indexOf('!') == -1) {
          canonicalLoad.address = load.name;
        }
        else {
          // canonicalize plugin if necessary
          canonicalLoad.address = load.name.substr(0, load.name.indexOf('!'));
        }

        // renormalize the load record dependency map for bundling
        canonicalLoad.depMap = {};
        for (var d in load.depMap)
          canonicalLoad.depMap[d] = getCanonicalName(loader, load.depMap[d]);

        canonicalLoad.deps = load.deps;
        canonicalLoad.metadata = load.metadata;
        canonicalLoad.source = load.source;

        traceTree[canonicalLoad.name] = canonicalLoad;
      });
    }
  })
  .then(function() {
    return {
      moduleName: getCanonicalName(loader, moduleName),
      tree: traceTree
    };
  })
  .catch(function(e) {
    loader.global.System = System;
    throw e;
  });
};

function visitTree(tree, moduleName, pluginLoader, visit, seen) {
  seen = seen || [];

  if (seen.indexOf(moduleName) != -1)
    return;

  seen.push(moduleName);

  var load = tree[moduleName];

  if (!load)
    return Promise.resolve();

  // visit the deps first
  return Promise.all(load.deps.map(function(dep) {
    if (load.metadata.loader == dep)
      return;
    return visitTree(tree, load.depMap[dep], pluginLoader, visit, seen);
  })).then(function() {
    if (load.metadata.loader && load.metadata.build === false)
      return visitTree(pluginLoader.loads, load.metadata.loader, pluginLoader, visit, seen);
  })
  .then(function() {
    // if we are the bottom of the tree, visit
    return visit(load);
  });
}

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

// copies a subtree out of the tree
Builder.prototype.extractTree = function(tree, moduleName) {
  var outTree = {};
  return visitTree(tree, moduleName, null, function(load) {
    outTree[load.name] = load;
  })
  .then(function() {
    return outTree;
  });
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
