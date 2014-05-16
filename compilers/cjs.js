var path = require('path');

// converts CJS into something that will define itself onto the loader

function cjsOutput(name, deps, address, source) {
  var dirname = path.dirname(address);

  return 'System.defined["' + name + '"] = {\n'
    + '  deps: ' + JSON.stringify(deps) + ',\n'
    + '  executingRequire: true,\n'
    + '  execute: function(require, exports, __moduleName) {\n'
    + '    var global = System.global;\n'
    + '    var __define = global.define;\n'
    + '    global.define = undefined;\n'
    + '    var module = { exports: exports };\n'
    + '    var process = System.get("@@nodeProcess");\n'
    // + '    var __filename = "' + address + '";\n'
    // + '    var __dirname = "' + dirname + '";\n'
    + '    ' + source.replace(/\n/g, '\n    ') + '\n'
    + '    global.define = __define;\n'
    + '    return module.exports;\n'
    + '  }\n'
    + '};\n'
}

exports.compile = function(load) {
  return Promise.resolve({
    source: cjsOutput(load.name, load.metadata.deps, load.address, load.source)
  });
}
