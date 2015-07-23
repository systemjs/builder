var rollup = require('rollup');
var fromFileURL = require('./utils').fromFileURL;
var toFileURL = require('./utils').toFileURL;

function getLoad(tree, path) {
  var address = toFileURL(path);
  var load;
  Object.keys(tree).some(function(name) {
    if (tree[name].normalized == address) {
      load = tree[name];
      return true;
    }
  });
  return load;
}

exports.optimizeSFXTree = function(tree, entryPoints, opts) {
  var allES = !Object.keys(tree).some(function(name) {
    return tree[name].metadata.format !== 'esm';
  });

  if (!allES || entryPoints.length > 1)
    return;

  var entryName = entryPoints[0];

  // whole tree is ES, we can use rollup to optimize for SFX!
  return rollup.rollup({
    entry: fromFileURL(tree[entryPoints[0]].address),
    resolveId: function(id, importer, options) {
      if (importer) {
        var parentLoad = getLoad(tree, importer);

        if (parentLoad)
          return parentLoad.depMap[id] && fromFileURL(tree[parentLoad.depMap[id]].normalized);
      }
      return id;
    },
    load: function(path, options) {
      return getLoad(tree, path).originalSource;
    }
  })
  .then(function(bundle) {
    var output = bundle.generate({
      format: opts.sfxFormat === 'global' ? 'iife' : opts.sfxFormat,
      exports: 'auto',

      // we dont have this option in builder, as its assumed the user assigns to the global from within the ES6 module
      // its probably worth introducing this option
      moduleName: '__sfx'
    });

    return [{
      source: output.code,
      sourceMap: output.map
    }];
  });
};