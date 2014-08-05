// Converts globals into a form that will define the module onto the loader

// Todo:
// - support "init" as argument to retrieveGlobal
// - do a global scope rewriting on the source so "var" declarations assign to global


// RATHER than prepare and retrieve, detect the globals written and treat as exports
// init can be inlined


function globalOutput(name, deps, exportName, init, source) {
  return 'System.register("' + name + '", ' + JSON.stringify(deps) + ', false, function(__require, __exports, __module) {\n'
    + '  System.get("@@global-helpers").prepareGlobal(__module.id, ' + JSON.stringify(deps) + ');\n'
    + '  ' + source.replace(/\n/g, '\n    ') + '\n'
    + (exportName ? '  this["' + exportName + '"] = ' + exportName + ';\n' : '')
    + '  return System.get("@@global-helpers").retrieveGlobal(__module.id, ' + (exportName ? '"' + exportName + '"' : 'false') + (init ? ', ' + init.toString().replace(/\n/g, '\n      ') : '') + ');\n'
    + '});\n';
}

exports.compile = function(load, normalize) {
  var deps = normalize ? load.metadata.deps.map(function(dep) { return load.depMap[dep]; }) : load.metadata.deps;

  load.source

  return Promise.resolve({
    source: globalOutput(load.name, deps, load.metadata.exports, load.metadata.init, load.source)
  });
}

exports.sfx = function(loader) {
  // NB fill in
}