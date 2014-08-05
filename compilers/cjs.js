var path = require('path');
var remap = require('../utils/dep-remap');

// NB move these CommonJS layers out into a static operation on the CommonJS module rather

// converts CJS into something that will define itself onto the loader

var cjsRequireRegEx = /(?:^\s*|[}{\(\);,\n=:\?\&]\s*)require\s*\(\s*("([^"]+)"|'([^']+)')\s*\)/g;

function cjsOutput(name, deps, address, source, baseURL) {
  var filename = path.relative(baseURL, address);
  var dirname = path.dirname(filename);

  return 'System.register("' + name + '", ' + JSON.stringify(deps) + ', true, function(require, exports, module) {\n'
    + '  var global = System.global;\n'
    + '  var __define = global.define;\n'
    + '  global.define = undefined;\n'
    + '  var process = System.get("@@nodeProcess")["default"];\n'
    + '    var __filename = "' + filename + '";\n'
    + '    var __dirname = "' + dirname + '";\n'
    + '  ' + source.replace(/\n/g, '\n  ') + '\n'
    + '  global.define = __define;\n'
    + '  return module.exports;\n'
    + '});\n'
}

exports.compile = function(load, normalize, loader) {
  
  var deps = normalize ? load.metadata.deps.map(function(dep) { return load.depMap[dep]; }) : load.metadata.deps;

  var source = normalize ? remap.cjs(load.source, load.depMap) : load.source;

  return Promise.resolve({
    source: cjsOutput(load.name, deps, load.address, source, loader.baseURL)
  });
}

exports.sfx = function() {
  return 'System.register("@@nodeProcess", [], true, function(require, exports, module) {\n'
  + '  function noop() {}\n'
  + '  return {\n'
  + '    nextTick: function(f) {\n'
  + '      setTimeout(f, 7);\n'
  + '    },\n'
  + '    browser: typeof window != \'undefined\',\n'
  + '    env: {},\n'
  + '    argv: [],\n'
  + '    on: noop,\n'
  + '    once: noop,\n'
  + '    off: noop,\n'
  + '    emit: noop,\n'
  + '    cwd: function() { return \'/\' }\n'
  + '  };\n'
  + '});\n'
}