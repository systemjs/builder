var Promise = require('rsvp').Promise;
var System = exports.System = require('systemjs');
var fs = require('fs');
var traceur = require('traceur');

var asp = require('rsvp').denodeify;

var registerCompiler = require('./compilers/register');
var amdCompiler = require('./compilers/amd');
var cjsCompiler = require('./compilers/cjs');
var globalCompiler = require('./compilers/global');

// TODO source maps
var loader = new Loader(System);
loader.baseURL = System.baseURL;
loader.paths = { '*': '*.js' };
loader.config = System.config;

var pluginLoader = new Loader(System);
pluginLoader.baseURL = System.baseURL;
pluginLoader.paths = { '*': '*.js' };
pluginLoader.config = System.config;

loader.trace = true;
loader.execute = false;
loader.pluginLoader = pluginLoader;


exports.build = function(moduleName, config, outFile) {

  return exports.trace(moduleName, config)
  .then(function(trace) {
    return exports.buildTree(trace.tree, trace.moduleName, outFile)
  });

}

exports.buildTree = function(tree, moduleName, outFile) {
  var concatOutput = ['"format register";\n'];
  return visitTree(tree, moduleName, function(load) {
    if (load.metadata.format == 'es6') {
      var result = traceur.compile(load.source, {
        moduleName: load.name,
        modules: 'instantiate'
      });
      concatOutput.push(result.js);
    }
    else if (load.metadata.format == 'register') {
      return registerCompiler.compile(load, loader).then(function(result) {
        concatOutput.push(result.source);
      });
    }
    else if (load.metadata.format == 'amd') {
      return amdCompiler.compile(load, loader).then(function(result) {
        concatOutput.push(result.source);
      });
    }
    else if (load.metadata.format == 'cjs') {
      return cjsCompiler.compile(load, loader).then(function(result) {
        concatOutput.push(result.source);
      });
    }
    else if (load.metadata.format == 'global') {
      return globalCompiler.compile(load, loader).then(function(result) {
        concatOutput.push(result.source);
      });
    }
    else {
      throw "unknown format " + load.metadata.format;
    }
  })
  .then(function() {
    return asp(fs.writeFile)(outFile, concatOutput.join('\n'));
  });
}

exports.trace = function(moduleName, config) {
  if (config) {
    loader.config(config);
    pluginLoader.config(config);
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
    return visitTree(loader.loads, moduleName, function(load) {
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
}

function visitTree(tree, moduleName, visit, seen) {
  seen = seen || [];

  if (seen.indexOf(moduleName) != -1)
    return;

  seen.push(moduleName);

  var load = tree[moduleName];

  if (!load)
    return;

  // visit the deps first
  return Promise.all(load.deps.map(function(dep) {
    return Promise.resolve(visitTree(tree, load.depMap[dep], visit, seen));
  })).then(function() {
    // if we are the bottom of the tree, visit
    return visit(load);
  });
}
