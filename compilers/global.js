// Converts globals into a form that will define the module onto the loader

// Todo:
// - support "init" as argument to retrieveGlobal
// - do a global scope rewriting on the source so "var" declarations assign to global


function globalOutput(name, deps, exportName, init, source) {
  return 'System.defined["' + name + '"] = {\n'
    + '  deps: ' + JSON.stringify(deps) + ',\n'
    + '  execute: function(__require, __exports, __moduleName) {\n'
    + '    System.get("@@global-helpers").prepareGlobal(__moduleName, ' + JSON.stringify(deps) + ');\n'
    + '    ' + source.replace(/\n/g, '\n    ') + '\n'
    + (exportName ? '    this["' + exportName + '"] = ' + exportName + ';\n' : '')
    + '    return System.get("@@global-helpers").retrieveGlobal(__moduleName, ' + (exportName ? '"' + exportName + '"' : 'false') + (init ? ', ' + init.toString().replace(/\n/g, '\n      ') : '') + ');\n'
    + '  }\n'
    + '};\n';
}

exports.compile = function(load) {
  return Promise.resolve({
    source: globalOutput(load.name, load.metadata.deps, load.metadata.exports, load.metadata.init, load.source)
  });
}
