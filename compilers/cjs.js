exports.compile = function(load) {

  // TODO environment variable creation for define wrapper as in extension
  // THEN we are there

  var anonRegisterRegEx = /System\.register\(\[/g;

  return Promise.resolve({
    source: load.source.replace(anonRegisterRegEx, 'System.register("' + load.name + '", [')
  });
}