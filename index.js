var Promise = require('rsvp').Promise;
var System = exports.System = require('systemjs/dist/system-tracer');
var fs = require('fs');
var traceur = require('traceur');

var asp = require('rsvp').denodeify;

var registerCompiler = require('./compilers/register');
var amdCompiler = require('./compilers/amd');
var cjsCompiler = require('./compilers/cjs');
var globalCompiler = require('./compilers/global');

exports.build = function(moduleName, outFile) {
  var concatOutput = [];
  return System.import(moduleName).then(function() {
    // we now have the full tree at System.loads
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
      else
        throw "unknown format " + load.metadata.format;
    })
  })
  .then(function() {
    return asp(fs.writeFile)(outFile, concatOutput.join(''));
  })
  .catch(function(e) {
    setTimeout(function() {
      throw e;
    })
  });
}

function visitLoadTree(moduleName, visit, seen) {
  seen = seen || [];

  if (seen.indexOf(moduleName) != -1)
    return;

  seen.push(moduleName);

  var load = System.loads[moduleName];

  // visit the deps first
  return Promise.all(load.dependencies.map(function(dep) {
    return Promise.resolve(visitLoadTree(dep.value, visit, seen));
  })).then(function() {
    // if we are the bottom of the tree, visit
    return visit(load);
  });
}