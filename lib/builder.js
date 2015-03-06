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

/**
 * Optimizes a set of entry points
 * @param {String[]|Object} entryPoints Array of entry points or Object of entry points with entry point names as keys. Entry points can be Strings or String[]s to group multiple entry points in a single output bundle.
 * @param {Function({String[]|Object} entryPoints, {Object} trace, {Object} optimizationOptions) => {{String} name, {String[]|Object} entryPoints, {Object[]} modules}[]} optimizationFunction A function to perform the optimization, with the signature
 * @param  {{Function: optimizationFunction, {name: String[]}: entryPoints, Object: optimizationOptions, String: [outPath], Boolean: sourceMaps=true, Boolean: minify=true, Boolean: uglify=true}} opts Options defining how optimization works.
 * @return {Thenable} Promise resolved with an Array of bundles
 * @example <caption>Example use of builder.optimizeBuild</caption>
 * // For more information, especially on the optimizationFunction, please see the readme docs.
 * builder.optimizeBuild({
 *   // entryPoints can also be an Array if you don't care about the names of the bundles
 *   other: ['src/stuff', 'src/otherStuff'],
 *   help: 'src/help',
 *   main: ['src/main', 'src/secondary', 'src/tertiary']
 * },
 * require('custom-optimizer'),
 * {
 *   outPath: 'out/folder', // optional, if not set returns source as memory compilation
 *   sourceMaps: true, // optional, defaults to true
 *   minify: true, // optional, defaults to true
 *   uglify: true, // optional, defaults to true
 *   // this option is specific to the optimisation function and may vary between implementations
 *   entryPointPriorities: {
 *     main: 0,
 *     help: 1,
 *     other: 2
 *   },
 * });
 */
Builder.prototype.optimizeBuild = function(entryPoints, optimizationFunction, opts) {
  if(!entryPoints) {
    throw "Entry points are required";
  }

  if(!optimizationFunction) {
    throw "Optimization Function is required";
  }

  var deferred = new Promise();
  var traces = {};

  return Promise.all(Object.keys(entryPoints).map(function(bundleNameKey) {
    var bundleName = (typeof entryPoints === 'array') ? 'bundle'+bundleNameKey : bundleNameKey,
        entryPointCollection = (typeof entryPoints[bundleNameKey] === 'array') ? entryPoints[bundleNameKey] : [entryPoints[bundleNameKey]];

      return Promise.all(entryPointCollection.map(function(entryPoint) {
        return exports.trace(entryPoint);
      }));
  })).
  then(function(traces) {
    return optimizationFunction(entryPoints, traces, optimizationOptions);
  }).
  then(function(bundles) {
    var output = [];

    return Promise.all(Object.keys(bundles).map(function(bundleName) {
      var outputBundle = {
        name: bundleName,
        entryPoints: bundles[bundleName].entryPoints,
        modules: bundles[bundleName].modules
      };

      if(opts.outPath) {
        var outPath = path.resolve(outPath);
      }
      else {
        outputBundle.source = bundles[bundleName].source;
      }

      output.push(outputBundle);

      return exports.buildTree(bundles[bundleName].tree, outPath+path.sep+bundleName, {
        minify: opts.minify === undefined ? true : !!opts.minify,
        sourceMaps: opts.sourceMaps === undefined ? true : !!opts.sourceMaps,
        mangle: opts.mangle === undefined ? true : !!opts.mangle
      }).
      then(function() {
        // write config TODO

      }).
      then(function() {
        // return bundle info
        return output;
      });
    }));

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

// takes 2-N arguments (tree1, tree2, treeN), returns a new tree containing tree1 n tree2 n treeN
exports.intersectTrees = function() {
  var tree1 = arguments[0],
      tree2 = arguments[1],
      intersectTree = {};

  var tree1Names = [];
  for (var name in tree1)
    tree1Names.push(name);

  for (var name in tree2) {
    if (tree1Names.indexOf(name) == -1)
      continue;

    intersectTree[name] = tree1[name];
  }

  if(arguments.length > 2) {
    var updatedArgs = arguments
    updatedArgs.splice(0, 2, intersectTree);
    return exports.intersectTrees.apply(exports, updatedArgs);
  }

  return intersectTree;
};

// takes 2-N arguments (tree1, tree2, treeN), returns a new tree containing tree1 + tree2 + treeN
exports.addTrees = function() {
  var tree1 = arguments[0],
      tree2 = arguments[1],
      unionTree = {};

  for (var name in tree2)
    unionTree[name] = tree2[name];

  for (var name in tree1)
    unionTree[name] = tree1[name];

  if(arguments.length > 2) {
    var updatedArgs = arguments
    updatedArgs.splice(0, 2, unionTree);
    return exports.addTrees.apply(exports, updatedArgs);
  }

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
