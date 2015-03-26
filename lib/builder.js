var Promise = require('rsvp').Promise;
var System = require('systemjs');

var asp = require('rsvp').denodeify;
var fs = require('fs');
var path = require('path');
var extend = require('util')._extend;

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
 * @param {String[]|Object} entryPoints Array of entry points or Object of entry points with entry point names as keys. Entry points are Strings.
 * @param {Function({String[]|Object} entryPoints, {Object} trace, {Object} optimizationOptions) => {{String} name, {String[]|Object} entryPoints, {Object[]} modules}[]} optimizationFunction A function to perform the optimization
 * @param  {{String: [outPath], Boolean: sourceMaps=true, Boolean: minify=true, Boolean: uglify=true}} opts Options defining how optimization works. Additional parameters specific to optimizationFunction can be added to this object.
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
  opts = opts || {};
  opts._builder = opts._builder || this;

  if(!entryPoints || typeof entryPoints !== 'object') {
    throw "entryPoints is required and must be an Array, or an object with entry points as values of properties.";
  }

  if(typeof optimizationFunction !== 'function') {
    throw "optimizationFunction must be a function.";
  }

  var self = this,
      bundleNames = [],
      bundleNameMap = {};

  return Promise.all(Object.keys(entryPoints).map(function(bundleNameKey, bundleNameKeyIndex) {
    // This block traces each entry point and ensures it has a name, even if default
    bundleNames[bundleNameKeyIndex] = (entryPoints instanceof Array) ? 'bundle'+bundleNameKey : bundleNameKey;
    bundleNameMap[bundleNames[bundleNameKeyIndex]] = bundleNameKey; // bundleNameMap helps map the (possible generated) bundle name back to the entryPoints index
    return self.trace(entryPoints[bundleNameKey], opts.config);
  })).
  then(function(traces) {
    // Take the traces and places them in an object indexed by bundle names
    var namedTraces = traces.reduce(function(previous, current, index) {
      previous[bundleNames[index]] = current;
      return previous;
    }, {});

    opts = extend({ bundleNameMap: bundleNameMap }, opts);

    return optimizationFunction(entryPoints, namedTraces, opts); // run custom optimization function
  }).
  then(function(bundleData) {
    var output = [],
        outPath;

    // Super-specific validation on returned data as that user-provided function could do anything!
    Builder.validateOptimizedBundleData(bundleData);

    if(opts.outPath) {
      outPath = path.resolve(opts.outPath);
    }

    return Promise.all(Object.keys(bundleData.bundles).map(function(bundleIndex) {
      // For each bundle returned from the optimization function...
      // ...create an object to represent it in the response from optimizeBuild
      var bundleName = bundleData.bundles[bundleIndex].name,
          outputBundle = {
            name: bundleName,
            entryPoints: bundleData.bundles[bundleIndex].entryPoints,
            modules: bundleData.bundles[bundleIndex].modules
          };

      output.push(outputBundle);

      // ...build the code and either write the file (automatically as part of buildTree)...
      return self.buildTree(bundleData.bundles[bundleIndex].tree, outPath ? outPath+path.sep+bundleName : null, {
        minify: opts.minify === undefined ? true : !!opts.minify,
        sourceMaps: opts.sourceMaps === undefined ? true : !!opts.sourceMaps,
        mangle: opts.mangle === undefined ? true : !!opts.mangle
      },
      function(err) {
        throw "optimizeBuild: error creating bundle `"+bundleName+"`: "+err;
      }).
      then(function(result) {
        // ...or save the built-tree source as a property on the bundle representation.
        if(!outPath) {
          outputBundle.source = result;
        }
      });
    })).
    then(function() {
      var promise = new Promise(function(resolve, reject) {
        if(outPath) {
          // write system.config if applicable
          var outputFilename = outPath+'/config.js',
              configOutput = [];

          // TODO update this to append this config to the correct config.js file
          for(var depCacheIndex in bundleData.config.depCache) {
              var depCache = bundleData.config.depCache[depCacheIndex];
              configOutput.push("System.depCache['"+depCacheIndex+"'] = "+JSON.stringify(depCache)+";")
          }
          for(var bundlesIndex in bundleData.config.bundles) {
              var bundle = bundleData.config.bundles[bundlesIndex];
              configOutput.push("System.bundles['"+bundlesIndex+"'] = "+JSON.stringify(bundle)+";")
          }

          fs.writeFile(outputFilename, configOutput.join("\n"), function(err) {
              if(err) {
                  reject(err);
              } else {
                  resolve(true);
              }
          });
        }
        else {
          resolve();
        }
      });

      return promise;
    }).
    then(function() {
        // Finally, return bundle info
        return output;
    });

  });
};


/**
 * Validates data returned from custom optimization function for consistency.
 * For internal use only, this is not part of the public API. Please do not rely on it.
 * @param  {Object} bundleData Returned data from optimization function
 * @throws {Error} If there is an issue with the bundleData
 */
Builder.validateOptimizedBundleData = function(bundleData) { // This publicly available only for testing purposes
  if(typeof bundleData !== 'object') {
    throw 'Optimized bundle data should be an Object';
  }
  if(!bundleData.bundles || !(bundleData.bundles instanceof Array)) {
    throw 'Optimized bundle data should should have a `bundles` property which is an Array';
  }
  for(var i in bundleData.bundles) {
    if(typeof bundleData.bundles[i].name !== 'string') {
      throw 'Optimized bundle data `bundles['+i+'] should should have a `name` property which is a String';
    }
    if(!(bundleData.bundles[i].modules instanceof Array)) {
      throw 'Optimized bundle data `bundles['+i+'] should should have a `modules` property which is an Array';
    }
    for(var j in bundleData.bundles[i].modules) {
      if(typeof bundleData.bundles[i].modules[j] !== 'string') {
        throw 'Optimized bundle data `bundles['+i+'].modules['+j+']` should be a string';
      }
    }
  }
  if(!bundleData.config) {
    throw 'Optimized bundle data should should have a `config` property';
  }
  if(!bundleData.config.depCache) {
    throw 'Optimized bundle data should should have a `config.depCache` property';
  }
  if(!bundleData.config.bundles) {
    throw 'Optimized bundle data should should have a `config.bundles` property';
  }
  for(var i in bundleData.config.depCache) {
    if(!(bundleData.config.depCache[i] instanceof Array)) {
      throw 'Optimized bundle data `config.depCache['+i+']` should be an Array';
    }
    for(var j in bundleData.config.depCache[i]) {
      if(typeof bundleData.config.depCache[i][j] !== 'string') {
        throw 'Optimized bundle data `config.depCache['+i+']['+j+']` should be a string';
      }
    }
  }
  for(var i in bundleData.config.bundles) {
    if(!(bundleData.config.bundles[i] instanceof Array)) {
      throw 'Optimized bundle data `config.bundles['+i+']` should be an Array';
    }
    for(var j in bundleData.config.bundles[i]) {
      if(typeof bundleData.config.bundles[i][j] !== 'string') {
        throw 'Optimized bundle data `config.bundles['+i+']['+j+']` should be a string';
      }
    }
  }
}

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
Builder.intersectTrees = function() {
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
    return this.intersectTrees.apply(this, updatedArgs);
  }

  return intersectTree;
};

// takes 2-N arguments (tree1, tree2, treeN), returns a new tree containing tree1 + tree2 + treeN
Builder.addTrees = function() {
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
    return this.addTrees.apply(this, updatedArgs);
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
