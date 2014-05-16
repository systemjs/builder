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

  loader.config(config);
  pluginLoader.config(config);

  var concatOutput = ['"format register";\n'];

  var System = loader.global.System;
  loader.global.System = loader;

  return loader.import(moduleName).then(function() {
    // we now have the full tree at loader.loads
    return visitLoadTree(moduleName, function(load) {
      if (load.metadata.format == 'es6') {
        var result = traceur.compile(load.source, {
          moduleName: load.name,
          modules: 'instantiate'
        });
        concatOutput.push(result.js);
      }
      else if (load.metadata.format == 'register') {
        return registerCompiler.compile(load).then(function(result) {
          concatOutput.push(result.source);
        });
      }
      else if (load.metadata.format == 'amd') {
        return amdCompiler.compile(load).then(function(result) {
          concatOutput.push(result.source);
        });
      }
      else if (load.metadata.format == 'cjs') {
        return cjsCompiler.compile(load).then(function(result) {
          concatOutput.push(result.source);
        });
      }
      else if (load.metadata.format == 'global') {
        return globalCompiler.compile(load).then(function(result) {
          concatOutput.push(result.source);
        });
      }
      else {
        console.log(load);
        throw "unknown format " + load.metadata.format;
      }
    })
  })
  .then(function() {
    loader.global.System = System;
    return asp(fs.writeFile)(outFile, concatOutput.join('\n'));
  })
  .catch(function(e) {
    loader.global.System = System;
    setTimeout(function() {
      throw e;
    })
  });
}

exports.createTraceTree = function(moduleName, config) {
  if (config)
    loader.config(config);
  return loader.import(moduleName).then(function() {
    var traceTree = {};
    return visitLoadTree(moduleName, function(load) {
      traceTree[load.name] = load.dependencies.map(function(dep) { return dep.value; });
    })
    .then(function() {
      return traceTree;
    });
  });
}

function visitLoadTree(moduleName, visit, seen) {
  seen = seen || [];

  if (seen.indexOf(moduleName) != -1)
    return;

  seen.push(moduleName);

  var load = loader.loads[moduleName];

  // visit the deps first
  return Promise.all(load.dependencies.map(function(dep) {
    return Promise.resolve(visitLoadTree(dep.value, visit, seen));
  })).then(function() {
    // if we are the bottom of the tree, visit
    return visit(load);
  });
}
