exports.compile = function(load) {

  // Todo AMD naming just like System.register

  var anonRegisterRegEx = /System\.register\(\[/g;

  return Promise.resolve({
    source: load.source.replace(anonRegisterRegEx, 'System.register("' + load.name + '", [')
  });
}