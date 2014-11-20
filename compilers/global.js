// Converts globals into a form that will define the module onto the loader

// Todo:
// - support "init" as argument to retrieveGlobal
// - do a global scope rewriting on the source so "var" declarations assign to global

var saucy = require('../lib/sourcemaps');

// RATHER than prepare and retrieve, detect the globals written and treat as exports
// this is a really hard problem though as we need to cater to global IIFE detection
// init can be inlined


function globalOutput(name, deps, exportName, init, source) {
  return 'System.register("' + name + '", ' + JSON.stringify(deps) + ', false, function(__require, __exports, __module) {\n'
    + '  System.get("@@global-helpers").prepareGlobal(__module.id, ' + JSON.stringify(deps) + ');\n'
    + '  (function() {\n'
    //+ '  ' + source.replace(/\n/g, '\n      ') + '\n'
    + source + '\n'
    + (exportName ? '  this["' + exportName + '"] = ' + exportName + ';\n' : '')
    + '  }).call(System.global);'
    + '  return System.get("@@global-helpers").retrieveGlobal(__module.id, ' + (exportName ? '"' + exportName + '"' : 'false') + (init ? ', ' + init.toString().replace(/\n/g, '\n      ') : '') + ');\n'
    + '});\n';
}

exports.compile = function(load, normalize) {
  var deps = normalize ? load.metadata.deps.map(function(dep) { return load.depMap[dep]; }) :
                         load.metadata.deps;

  var output = globalOutput(load.name, deps, load.metadata.exports, load.metadata.init, load.source);

  return Promise.resolve({
    source: output,
    sourceMap: saucy.buildIdentitySourceMap(output, load.address),
    sourceMapOffset: 3
  });
};

exports.sfx = function(loader) {

  return '(function() {\n'
  + '  var loader = System;\n'
  + '  var hasOwnProperty = loader.global.hasOwnProperty;\n'
  + '  var moduleGlobals = {};\n'
  + '  var curGlobalObj;\n'
  + '  var ignoredGlobalProps;\n'
  + '  if (typeof indexOf == \'undefined\')\n'
  + '    indexOf = Array.prototype.indexOf;\n'
  + '  System.set("@@global-helpers", System.newModule({\n'
  + '    prepareGlobal: function(moduleName, deps) {\n'
  + '      for (var i = 0; i < deps.length; i++) {\n'
  + '        var moduleGlobal = moduleGlobals[deps[i]];\n'
  + '        if (moduleGlobal)\n'
  + '          for (var m in moduleGlobal)\n'
  + '            loader.global[m] = moduleGlobal[m];\n'
  + '      }\n'
  + '      curGlobalObj = {};\n'
  + '      ignoredGlobalProps = ["indexedDB", "sessionStorage", "localStorage", "clipboardData", "frames", "webkitStorageInfo"];\n'
  + '      for (var g in loader.global) {\n'
  + '        if (indexOf.call(ignoredGlobalProps, g) != -1) { continue; }\n'
  + '        if (!hasOwnProperty || loader.global.hasOwnProperty(g)) {\n'
  + '          try {\n'
  + '            curGlobalObj[g] = loader.global[g];\n'
  + '          } catch (e) {\n'
  + '            ignoredGlobalProps.push(g);\n'
  + '          }\n'
  + '        }\n'
  + '      }\n'
  + '    },\n'
  + '    retrieveGlobal: function(moduleName, exportName, init) {\n'
  + '      var singleGlobal;\n'
  + '      var multipleExports;\n'
  + '      var exports = {};\n'
  + '      if (init) {\n'
  + '        var depModules = [];\n'
  + '        for (var i = 0; i < deps.length; i++)\n'
  + '          depModules.push(require(deps[i]));\n'
  + '        singleGlobal = init.apply(loader.global, depModules);\n'
  + '      }\n'
  + '      else if (exportName) {\n'
  + '        var firstPart = exportName.split(".")[0];\n'
  + '        singleGlobal = eval.call(loader.global, exportName);\n'
  + '        exports[firstPart] = loader.global[firstPart];\n'
  + '      }\n'
  + '      else {\n'
  + '        for (var g in loader.global) {\n'
  + '          if (indexOf.call(ignoredGlobalProps, g) != -1)\n'
  + '            continue;\n'
  + '          if ((!hasOwnProperty || loader.global.hasOwnProperty(g)) && g != loader.global && curGlobalObj[g] != loader.global[g]) {\n'
  + '            exports[g] = loader.global[g];\n'
  + '            if (singleGlobal) {\n'
  + '              if (singleGlobal !== loader.global[g])\n'
  + '                multipleExports = true;\n'
  + '            }\n'
  + '            else if (singleGlobal !== false) {\n'
  + '              singleGlobal = loader.global[g];\n'
  + '            }\n'
  + '          }\n'
  + '        }\n'
  + '      }\n'
  + '      moduleGlobals[moduleName] = exports;\n'
  + '      return multipleExports ? exports : singleGlobal;\n'
  + '    }\n'
  + '  }));\n'
  + '})();\n'
}
