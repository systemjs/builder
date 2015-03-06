var Promise = require('rsvp').Promise;
var System = require('systemjs');

var asp = require('rsvp').denodeify;
var fs = require('fs');
var path = require('path');

var attachCompilers = require('./compile').attachCompilers;
var compileOutputs = require('./compile').compileOutputs;
var writeOutputs = require('./output').writeOutputs;


function processOpts(opts_, outFile) {
  var opts = {
    config: {},
    lowResSourceMaps: false,
    minify: false,
    normalize: false,
    outFile: outFile,
    runtime: false,
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

Builder.prototype.build = function(moduleName, outFile, opts) {
  var self = this;
  opts = opts || {};

  return this.trace(moduleName, opts.config)
  .then(function(trace) {
    return self.buildTree(trace.tree, outFile, opts);
  });
};

function parseExpression(expressionString) {
  var args = expressionString.split(' ');

  var firstModule = args[0];

  var operations = [];

  for (var i = 1; i < args.length - 1; i = i + 2) {
    var operator = args[i];
    var moduleName = args[i + 1];

    operations.push({
      operator: operator,
      moduleName: moduleName
    });
  }

  return {firstModule: firstModule, operations: operations};
};

function lookupOperatorFn(symbol) {
  if (symbol == '+')
    return this.addTrees;
  else if (symbol == '-')
    return this.subtractTrees;
  else
    throw 'Unknown operator ' + op.operator;
};

Builder.prototype.buildExpression = function(expression, cfg) {
  var builder = this;

  if (typeof expression == 'string')
    expression = parseExpression(expression);

  var firstModule = expression.firstModule;
  var operations = expression.operations;

  return Promise.resolve(builder.trace(firstModule, cfg))
  .then(function(trace) {
    // if there are no other operations, then we have the final tree
    if (!operations.length)
      return trace.tree;

    var applyOperation = function(promise, op) {
      return promise.then(function(curTree) {
        return builder.trace(op.moduleName)
        .then(function(nextTrace) {
          var operatorFn = lookupOperatorFn(op.operator);
          return operatorFn.call(builder, curTree, nextTrace.tree);
        });
      });
    };

    // chain the operations, applying them with the trace of the next module
    return operations.reduce(applyOperation, Promise.resolve(trace.tree));
  });
};

Builder.prototype.buildTree = function(tree, outFile, opts) {
  var loader = this.loader;
  opts = processOpts(opts, outFile);

  return compileOutputs(loader, tree, opts, false)
  .then(function(outputs) {
    return writeOutputs(opts, outputs, loader.baseURL);
  });
};

Builder.prototype.buildSFX = function(moduleName, outFile, opts) {
  var loader = this.loader;
  opts = processOpts(opts, outFile);
  opts.normalize = true;

  return this.trace(moduleName, opts.config)
  .then(function(trace) {
    return compileOutputs(loader, trace.tree, opts, trace.moduleName);
  })
  .then(function(outputs) {
    return writeOutputs(opts, outputs, loader.baseURL);
  });
};

Builder.prototype.trace = function(moduleName, config) {
  var loader = this.loader;
  var pluginLoader = loader.pluginLoader;

  if (config) {
    this.config(config);
  }

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
    return visitTree(tree, load.depMap[dep], pluginLoader, visit, seen);
  })).then(function() {
    var pluginName = load.metadata.pluginName;
    
    if (pluginName && pluginLoader.get(pluginName).build !== false)
      return visitTree(pluginLoader.loads, pluginName, pluginLoader, visit, seen);
  })
  .then(function() {
    // if we are the bottom of the tree, visit
    return visit(load);
  });
}

// returns a new tree containing tree1 n tree2
Builder.intersectTrees = function(tree1, tree2) {
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
Builder.addTrees = function(tree1, tree2) {
  var name;
  var unionTree = {};

  for (name in tree2)
    unionTree[name] = tree2[name];

  for (name in tree1)
    unionTree[name] = tree1[name];

  return unionTree;
};

// returns a new tree containing tree1 - tree2
Builder.subtractTrees = function(tree1, tree2) {
  var name;
  var subtractTree = {};

  for (name in tree1)
    subtractTree[name] = tree1[name];

  for (name in tree2)
    delete subtractTree[name];

  return subtractTree;
};

// copies a subtree out of the tree
Builder.extractTree = function(tree, moduleName) {
  var outTree = {};
  return visitTree(tree, moduleName, null, function(load) {
    outTree[load.name] = load;
  })
  .then(function() {
    return outTree;
  });
};

module.exports = Builder;
