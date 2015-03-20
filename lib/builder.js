var Promise = require('rsvp').Promise;
var System = require('systemjs');

var asp = require('rsvp').denodeify;
var fs = require('fs');
var path = require('path');

var attachCompilers = require('./compile').attachCompilers;
var compileOutputs = require('./compile').compileOutputs;
var writeOutputs = require('./output').writeOutputs;

var traceExpression = require('./arithmetic').traceExpression;

function processOpts(opts_, outFile) {
  var opts = {
    config: {},
    lowResSourceMaps: false,
    minify: false,
    mangle: true,
    normalize: true,
    runtime: false,
    outFile: outFile,
    sourceMaps: false,
    sourceMapContents: opts_ && opts_.sourceMaps == 'inline'
  };
  for (var key in opts_) {
    if (key in opts)
      opts[key] = opts_[key];
  }
  return opts;
}

function Builder(cfg) {
  this.loader = null;
  this.reset();
  if (typeof cfg == 'string')
    this.loadConfigSync(cfg);
  else if (typeof cfg == 'object')
    this.config(cfg);
}

Builder.prototype.reset = function() {
  var loader = this.loader = System.clone();
  loader.baseURL = System.baseURL;

  var pluginLoader = System.clone();
  pluginLoader.baseURL = System.baseURL;
  pluginLoader.trace = true;
  pluginLoader._nodeRequire = System._nodeRequire;

  // override plugin loader instantiate to first
  // always correct any clobbering of the System global
  // eg by loading Traceur or Traceur Runtime
  var pluginInstantiate = pluginLoader.instantiate;
  pluginLoader.instantiate = function(load) {
    return pluginInstantiate.call(this, load)
    .then(function(instantiateResult) {
      if (global.System !== loader)
        global.System = loader;
      return instantiateResult;
    });
  };

  loader.trace = true;
  loader.execute = false;
  loader.pluginLoader = pluginLoader;

  attachCompilers(loader);
};

function executeConfigFile(loader, source) {
  var curSystem = global.System;
  var configSystem = global.System = {
    config: function(cfg) {
      for (var c in cfg) {
        var v = cfg[c];
        if (typeof v == 'object' && !(v instanceof Array)) {
          this[c] = this[c] || {};
          for (var p in v)
            this[c][p] = v[p];
        }
        else
          this[c] = v;
      }
    }
  };
  // jshint evil:true
  new Function(source.toString()).call(global);
  delete configSystem.config;
  loader.config(configSystem);
  loader.pluginLoader.config(configSystem);
  global.System = curSystem;
}

var resolvePath = path.resolve.bind(path, process.cwd());

Builder.prototype.loadConfig = function(configFile) {
  var self = this;
  return asp(fs.readFile)(resolvePath(configFile))
    .then(executeConfigFile.bind(null, this.loader))
    .then(function() { return self; });
};

Builder.prototype.loadConfigSync = function(configFile) {
  var source = fs.readFileSync(resolvePath(configFile));
  executeConfigFile(this.loader, source);
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

Builder.prototype.build = function(expression, outFile, opts) {
  var self = this;
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
  opts = processOpts(opts, outFile);

  return compileOutputs(loader, tree, opts, false)
  .then(function(outputs) {
    return writeOutputs(opts, outputs, loader.baseURL);
  })
  .then(function(output) {
    addExtraOutputs.call(self, output, tree, opts, loader);
    return output;
  })
};

Builder.prototype.buildSFX = function(moduleName, outFile, opts) {
  var loader = this.loader;
  var self = this;
  opts = opts || {};
  opts.normalize = true;
  opts = processOpts(opts, outFile);  
  var tree;

  // include runtime by default if needed
  if (opts.runtime !== false)
    opts.runtime = true;

  if (opts.config)
    this.config(opts.config);

  return this.traceModule(moduleName)
  .then(function(trace) {
    tree = trace.tree;
    return compileOutputs(loader, tree, opts, trace.moduleName);
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
    return visitTree(loader.loads, moduleName, pluginLoader, function(load) {
      traceTree[load.name] = load;
    });
  })
  .then(function() {
    return {
      moduleName: moduleName,
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
    if (load.metadata.pluginName == dep)
      return;
    return visitTree(tree, load.depMap[dep], pluginLoader, visit, seen);
  })).then(function() {
    if (load.metadata.plugin && load.metadata.plugin.build === false)
      return visitTree(pluginLoader.loads, load.metadata.pluginName, pluginLoader, visit, seen);
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

    intersectTree[name] = tree1[name];
  }

  return intersectTree;
};

// returns a new tree containing tree1 + tree2
Builder.prototype.addTrees = function(tree1, tree2) {
  var name;
  var unionTree = {};

  for (name in tree2)
    unionTree[name] = tree2[name];

  for (name in tree1)
    unionTree[name] = tree1[name];

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
}

module.exports = Builder;
