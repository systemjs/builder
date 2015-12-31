exports.compile = function(load, opts, loader) {
  try {
    var jsonString = JSON.stringify(JSON.parse(load.source), null, 2);
  }
  catch(e) {
    throw new Error('Unable to parse JSON module ' + load.name + ' contents as JSON.');
  }

  return Promise.resolve({
    source: 'System.registerDynamic(' + (opts.anonymous ? '' : '"' + load.name + '", ') + '[], false, function() {\n' +
            '  return ' + jsonString + ';\n' + 
            '});\n'
  });
};