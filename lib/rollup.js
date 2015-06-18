var rollup = require('rollup');
var fromFileURL = require('./utils').fromFileURL;
var toFileURL = require('./utils').toFileURL;

function getLoad(tree, path) {
  var address = toFileURL(path);
  var load;
  Object.keys(tree).some(function(name) {
    if (tree[name].address == address || tree[name].name == path) {
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

  var entryName = entryPoints[0]

  // whole tree is ES, we can use rollup to optimize for SFX!
  return rollup.rollup({
    entry: fromFileURL(tree[entryPoints[0]].address),
    resolvePath: function(id, importer, options) {
      return getLoad(tree, importer).depMap[id];
    },
    resolveExternal: function(id, importer, options) {
      return getLoad(tree, importer).depMap[id];
    },
    load: function(path, options) {
      return getLoad(tree, path).metadata.originalSource;
    }
  })
  .then(function(bundle) {
    var output = bundle.generate({
      format: opts.sfxFormat === 'global' ? 'iife' : opts.sfxFormat,
      exports: 'auto',

      // we dont have this option in builder, as its assumed the user assigns to the global from within the ES6 module
      // its probably worth introducing this option
      moduleName: 'test'
    });

    return [{
      source: output.code,
      sourceMap: output.map
    }];
  });
};