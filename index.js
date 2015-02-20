var Promise = require('rsvp').Promise;

var System = require('systemjs');
var fs = require('fs');

var asp = require('rsvp').denodeify;

var es6Compiler = require('./compilers/es6');
var registerCompiler = require('./compilers/register');
var amdCompiler = require('./compilers/amd');
var cjsCompiler = require('./compilers/cjs');
var globalCompiler = require('./compilers/global');
var builder = require('./lib/builder');

var path = require('path');

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
  this.System = System;
  this.loader = null;
  this.reset();
  if (typeof cfg == "string")
    this.loadConfigSync(cfg);
  else if (typeof cfg == "object")
    this.config(cfg);
}

Builder.prototype.reset = function() {
  var loader = this.loader = new Loader(System);
  loader.baseURL = System.baseURL;
  loader.paths = { '*': '*.js' };
  loader.config = System.config;

  var pluginLoader = new Loader(System);
  pluginLoader.baseURL = System.baseURL;
  pluginLoader.paths = { '*': '*.js' };
  pluginLoader.config = System.config;
  pluginLoader.trace = true;
  pluginLoader.import = loader.import = System.import;

  pluginLoader._nodeRequire = loader._nodeRequire = require;

  loader.trace = true;
  loader.execute = false;
  loader.pluginLoader = pluginLoader;

  loader.set('@empty', loader.newModule({}));
  pluginLoader.set('@empty', loader.newModule({}));

  amdCompiler.attach(loader);
  amdCompiler.attach(pluginLoader);
};

Builder.prototype.build = function(moduleName, outFile, opts) {
  var self = this;
  opts = opts || {};

  return this.trace(moduleName, opts.config)
  .then(function(trace) {
    return self.buildTree(trace.tree, outFile, opts);
  });
};

Builder.parseExpression = function(expressionString) {
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

Builder.prototype.lookupOperatorFn = function(symbol) {
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
    expression = Builder.parseExpression(expression);

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
          var operatorFn = builder.lookupOperatorFn(op.operator);
          return operatorFn.call(builder, curTree, nextTrace.tree);
        });
      });
    };

    // chain the operations, applying them with the trace of the next module
    return operations.reduce(applyOperation, Promise.resolve(trace.tree));
  });
};


var compilerMap = {
  'amd':      amdCompiler,
  'cjs':      cjsCompiler,
  'es6':      es6Compiler,
  'global':   globalCompiler,
  'register': registerCompiler
};

function compileLoad(loader, load, opts, compilers) {
  return Promise.resolve()
  .then(function() {
    // note which compilers we used
    compilers = compilers || {};
    var format = load.metadata.format;
    if (load.metadata.build === false) {
      return {};
    }
    else if (format in compilerMap) {
      compilers[format] = true;
      return compilerMap[format].compile(load, opts, loader);
    }
    else if (format == 'defined') {
      return {source: ''};
    }
    else {
      throw "unknown format " + format;
    }
  });
}

function buildOutputs(loader, tree, opts, sfxCompilers) {
  var names = Object.keys(tree);
  // store plugins with a bundle hook to allow post-processing
  var plugins = {};
  var outputs = [];

  return Promise.all(names.map(function(name) {
    var load = tree[name];

    if (sfxCompilers && load.metadata.plugin && (load.metadata.build === false || load.metadata.plugin.build === false))
      outputs.push('System.register("' + load.name + '", [], false, function() { console.log("SystemJS Builder - Plugin for ' + load.name + ' does not support sfx builds"); });\n');

    // support plugin "bundle" reduction hook
    var plugin = load.metadata.plugin;
    if (plugin && load.metadata.build !== false) {
      var entry = plugins[load.metadata.pluginName] = plugins[load.metadata.pluginName] || {
        loads: [],
        bundle: plugin.bundle
      };
      entry.loads.push(load);
    }

    return Promise.resolve(compileLoad(loader, load, opts, sfxCompilers))
    .then(outputs.push.bind(outputs));
  }))
  .then(function() {
    // apply plugin "bundle" hook
    return Promise.all(Object.keys(plugins).map(function(pluginName) {
      var entry = plugins[pluginName];
      if (entry.bundle)
      return Promise.resolve(entry.bundle.call(loader.pluginLoader, entry.loads, opts))
      .then(outputs.push.bind(outputs));
    }));
  })
  .then(function() {
    return outputs;
  });
}

Builder.prototype.buildTree = function(tree, outFile, opts) {
  var loader = this.loader;
  opts = processOpts(opts, outFile);

  return buildOutputs(loader, tree, opts, false)
  .then(function(outputs) {
    outputs.unshift('"format register";\n');
    return builder.writeOutput(opts, outputs, loader.baseURL);
  });
};

Builder.prototype.buildSFX = function(moduleName, outFile, opts) {
  var loader = this.loader;
  opts = processOpts(opts, outFile);
  opts.normalize = true;

  var outputs;
  var compilers = {};
  return this.trace(moduleName, opts.config)
  .then(function(trace) {
    moduleName = trace.moduleName;
    return buildOutputs(loader, trace.tree, opts, compilers);
  })
  .then(function(_outputs) {
    outputs = _outputs;
  })
  // next add sfx headers for formats at the beginning
  .then(function() {
    Object.keys(compilers).forEach(function(format) {
      compiler = compilerMap[format];
      if (compiler.sfx)  {
        var sfx = compiler.sfx(loader);
        if (sfx) outputs.push(sfx);
      }
    });
  })
  // next wrap with the core code
  .then(function() {
    return asp(fs.readFile)(path.resolve(__dirname, './sfx/sfx-core.js'));
  })
  .then(function(sfxcore) {
    outputs.unshift("('" + moduleName + "', function(System) {\n");
    outputs.unshift(sfxcore.toString());
  })
  .then(function() {
    outputs.push("});");
  })
  .then(function() {
    return builder.writeOutput(opts, outputs, loader.baseURL);
  });
};

function executeConfigFile(loader, source) {
  var curSystem = global.System;
  global.System = {
    config: function(cfg) {
      loader.config(cfg);
      loader.pluginLoader.config(cfg);
    }
  };
  // jshint evil:true
  new Function(source.toString()).call(global);
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

Builder.prototype.trace = function(moduleName, config, includePlugins) {
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
    return visitTree(loader.loads, moduleName, includePlugins && pluginLoader, function(load) {
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
    if (!pluginLoader)
      return;

    var pluginName = load.metadata.pluginName;
    if (pluginName) {
      return visitTree(pluginLoader.loads, pluginName, pluginLoader, visit, seen);
    }
  })
  .then(function() {
    // if we are the bottom of the tree, visit
    return visit(load);
  });
}

Builder.legacy = new Builder();

module.exports = Builder;
