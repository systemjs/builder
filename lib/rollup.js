var rollup = require('rollup');
var traverseTree = require('./arithmetic').traverseTree;
var extend = require('./utils').extend;

exports.rollupTree = function(tree, entryPoints, compileOpts) {
  // analyze the tree to determine es module subgraphs that can be rolled-up
  // entry points are protected from inlining

  // determine all the tree entry points
  var entryMap = {};
  // at the same time build up tree externals list
  var externals = [];

  // for each module in the tree, we traverse the whole tree
  // we then relate each module in the tree to the first traced entry point
  Object.keys(tree).forEach(function(entryPoint) {
    traverseTree(tree, entryPoint, function(depName, parentName) {
      // if we have a entryMap for the given module, then stop
      if (entryMap[depName])
        return false;

      if (!tree[depName] || tree[depName] === true)
        externals.push(depName);

      if (parentName)
        entryMap[depName] = entryPoint;
    });
  });

  // the entry points are then the modules not represented in entryMap
  Object.keys(tree).forEach(function(entryPoint) {
    if (!entryMap[entryPoint] && entryPoints.indexOf(entryPoint) == -1)
      entryPoints.push(entryPoint);
  });
  
  // the key property is that no one of these subgraph entry point is contained within the rollup optimization of another
  var subGraphEntryPoints = {};

  // initially all es modules are considered candidates
  Object.keys(tree).forEach(function(moduleName) {
    if (tree[moduleName].metadata.format != 'esm')
      return;

    subGraphEntryPoints[moduleName] = {
      externals: []
    };
  })

  // apply filtering to ensure key property above
  // traverse down from each entry module to form its esm subgraph
  Object.keys(subGraphEntryPoints).forEach(function(entryPoint) {
    var entryPointSubGraph = subGraphEntryPoints[entryPoint];

    if (!entryPointSubGraph)
      return;

    traverseTree(tree, entryPoint, function(moduleName, parent) {

      // dep outside of tree -> add to externals list
      if (!tree[moduleName]) {
        entryPointSubGraph.externals.push(moduleName);
        return false;
      }

      // if it is not inlinable, mark as an external and stop traversal
      if (tree[moduleName].metadata.format != 'esm' || parent && entryPoints.indexOf(moduleName) != -1) {
        entryPointSubGraph.externals.push(moduleName);
        return false;
      }
      
      // if we have an inlinable dependency that is an entry point
      // then note that it is no longer an entry point
      // and assume its externals and modules
      if (moduleName != entryPoint && subGraphEntryPoints[moduleName]) {
        subGraphEntryPoints[moduleName].externals.forEach(function(moduleName) {
          entryPointSubGraph.externals.push(moduleName);
        });
        subGraphEntryPoints[moduleName] = undefined;
        return false;
      }

    }, false);
  });

  var rolledUpTree = {};
  Object.keys(tree).forEach(function(moduleName) {
    rolledUpTree[moduleName] = tree[moduleName];
  });

  // now that we have the full filtered list of entry points
  // run rollup against each subgraph
  return Promise.all(Object.keys(subGraphEntryPoints).map(function(entryPoint) {
    if (!subGraphEntryPoints[entryPoint])
      return;

    if (entryPoint.indexOf('first.js') != -1)
      throw externals;

    return rollup.rollup({
      entry: entryPoint,
      external: externals.concat(subGraphEntryPoints[entryPoint].externals),
      plugins: [{    
        resolveId: function(id, importer, options) {
          return importer ? tree[importer].depMap[id] : id;
        },
        load: function(path, options) {
          return tree[path].metadata.originalSource || tree[path].source;
        }
      }]
    })
    .then(function(bundle) {
      var output = bundle.generate({
        sourceMap: compileOpts.sourceMaps
      });

      var entryPointLoad = tree[entryPoint];

      // filter deps to just non-inlined
      var deps = entryPointLoad.deps.filter(function(dep) {
        var moduleName = entryPointLoad.depMap[dep];
        return tree[moduleName].metadata.format != 'esm' || entryPoints.indexOf(moduleName) != -1;
      });

      // replace the entry point module itself with the inlined subgraph module
      rolledUpTree[entryPoint] = extend(extend({}, entryPointLoad), {
        deps: deps,
        metadata: extend(extend({}, entryPointLoad.metadata), {
          originalSource: undefined,
          sourceMap: output.map
        }),
        source: output.code
      });
    });
  }))
  .then(function() {
    var seenModules = [];
    // traverse the whole graph to determine modules orphaned by the inlining operations
    entryPoints.forEach(function(entryPoint) {
      traverseTree(rolledUpTree, entryPoint, function(moduleName, parent) {
        if (seenModules.indexOf(moduleName) != -1)
          return false;
        seenModules.push(moduleName);
      });
    });

    // remove orphaned loads
    Object.keys(rolledUpTree).forEach(function(moduleName) {
      if (seenModules.indexOf(moduleName) == -1)
        delete rolledUpTree[moduleName];
    });

    return rolledUpTree;
  });
};