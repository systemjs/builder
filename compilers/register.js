exports.compile = function(load) {

  var anonRegisterRegEx = /System\.register\(\[/g;

  // NB need to add that if no anon, last named must define this module

  return Promise.resolve({
    source: load.source.replace(anonRegisterRegEx, 'System.register("' + load.name + '", [')
  });
}