exports.compile = function(load) {

  // NB need to add an Esprima parse, to detect global variable writes
  //    and convert them into the output
  // Also need to support meta.init

  // Todo meta.exports

  var defineStart =
    'System.defined["' + load.name + '"] = {\n' +
    '  deps: ' + JSON.stringify(load.metadata.deps) + ',\n' + 
    '  execute: function() {\n' + 
    '    '
    '  }\n' +
    '}\n';


  return Promise.resolve({
    source: 'System.defined["' + load.name + '"] = {\n'+
            load.source.replace(anonRegisterRegEx, 'System.register("' + load.name + '", [')
  });
}