// converts anonymous System.register([] into named System.register('name', [], ...

exports.compile = function(load) {

  var anonRegisterRegEx = /System\.register\(\[/g;

  // NB need to add that if no anon, last named must define this module
  // also this should be rewritten with a proper parser!

  return Promise.resolve({
    source: load.source.replace(anonRegisterRegEx, 'System.register("' + load.name + '", [') + '\n'
  });
};
