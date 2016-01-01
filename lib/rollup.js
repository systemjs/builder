var rollup = require('rollup');
var traverseTree = require('./arithmetic').traverseTree;
var getConditionModule = require('./trace').getConditionModule;
var extend = require('./utils').extend;

exports.rollupTree = function(tree, entryPoints, compileOpts) {
  /* 
   * 1. Determine the tree entry points and optimization points
   *
   * eg for the tree:
   * 
   * A -> B -> C
   * D -> C
   * 
   * A and D are the entry points.
   * Optimization points are ES module entry points to be optimized
   *
   */

  entryPoints = entryPoints.concat([]);

  var optimizationPoints = [];

  var entryMap = {};

  function isESM(moduleName) {
    return tree[moduleName] && tree[moduleName].metadata && tree[moduleName].metadata.format == 'esm' && !tree[moduleName].metadata.originalSource;
  }

  // for each module in the tree, we traverse the whole tree
  // we then relate each module in the tree to the first traced entry point
  Object.keys(tree).forEach(function(entryPoint) {
    traverseTree(tree, entryPoint, function(depName, parentName) {
      // esm from a non-esm parent means this is an optimization entry point from the linking alogorithm perspective
      if (parentName && isESM(depName) && !isESM(parentName) && optimizationPoints.indexOf(depName) == -1)
        optimizationPoints.push(depName);

      // if we have a entryMap for the given module, then stop
      if (entryMap[depName])
        return false;

      if (parentName)
        entryMap[depName] = entryPoint;
    });
  });

  // the entry points are then the modules not represented in entryMap
  Object.keys(tree).forEach(function(entryPoint) {
    if (!entryMap[entryPoint] && entryPoints.indexOf(entryPoint) == -1)
      entryPoints.push(entryPoint);
  });

  // optimization points are es module entry points
  entryPoints.forEach(function(entryPoint) {
    if (isESM(entryPoint) && optimizationPoints.indexOf(entryPoint) == -1)
      optimizationPoints.push(entryPoint);
  })

  /* 
   * 2. Determine unoptimizable modules, splitting them out into their own optimization points
   *
   * eg for the tree:
   *   A -> B -> C -> D
   *   E -> C -> D
   *
   * A, E are top-level entry points detected by the previous step
   *   (and hence optimization points if they are es modules)
   * C is not optimizable because it has two unique parent entry points
   *   (which is what this step looks for)
   * So C becomes its own optimization point
   * Leading to D inlining into C and B inlining into A
   *
   */

  // for each module in the tree, we track its parent optimization point
  // as soon as a module has two parent entry points, it is not optimizable
  // and we set it to undefined here. It then becomes its own optimizationPoint.
  var optimizationParentMap = {};

  // build up the parent entry point map as above
  // we use for over forEach because this list will grow as we go
  for (var i = 0; i < optimizationPoints.length; i++) {
    var entryPoint = optimizationPoints[i];
    traverseTree(tree, entryPoint, function(depName, parentName) {

      // we only traverse ES module tree subgraphs
      if (!isESM(depName))
        return false;

      if (depName == entryPoint)
        return;

      // dont traverse through other entry points
      if (optimizationPoints.indexOf(depName) != -1)
        return false;

      if (!optimizationParentMap[depName]) {
        optimizationParentMap[depName] = entryPoint;
        return;
      }

      // module in two separate entry point graphs -> it becomes its own optimization entry point
      if (optimizationParentMap[depName] != entryPoint) {
        optimizationParentMap[depName] = undefined;

        // this new optimization point will then be traversed in turn as part of this loop later
        optimizationPoints.push(depName);
      }
    });
  }

  /*
   * 3. Given complete optimization points, populate subgraph externals
   *
   * eg for the graph
   *    A -> B -> C
   *  
   * Where A is the optimization point, and C is not ESM, another optimization point,
   * or not contained in our build tree, then we mark 'C' as an external.
   *
   * That is, optimizationGraphExternals[A] = [C]
   *
   * This externals input is used in the Rollup API.
   * This way we just optimize B into A, retaining an explicit dependency on C.
   */

  var inlinedModules = [];
  var optimizationGraphExternals = {};

  optimizationPoints.forEach(function(entryPoint) {
    // the subgraph object is the list of modules in the subgraph
    // and the list of modules that are "external" boundaries of the subgraph
    var externals = [];

    // never create an optimization from a single module
    var hasInlinableDeps = false;

    traverseTree(tree, entryPoint, function(depName, parentName) {
      if (depName == entryPoint)
        return;

      // anything not ESM, not in the tree, or an optimization point, is external
      if (!isESM(depName) || optimizationPoints.indexOf(depName) != -1) {
        externals.push(depName);
        return false;
      }

      inlinedModules.push(depName);
      hasInlinableDeps = true;
    });

    if (hasInlinableDeps)
      optimizationGraphExternals[entryPoint] = externals;
  });

  // finally we rollup each optimization graph
  var rolledUpTree = {};
  Object.keys(tree).forEach(function(moduleName) {
    if (inlinedModules.indexOf(moduleName) == -1)
      rolledUpTree[moduleName] = tree[moduleName];
  });

  return Promise.all(Object.keys(optimizationGraphExternals).map(function(entryPoint) {
    var externals = optimizationGraphExternals[entryPoint];

    return rollup.rollup({
      entry: entryPoint,
      external: externals,
      plugins: [{    
        resolveId: function(id, importer, options) {
          var resolved = importer ? tree[importer].depMap[id] : id;
          // false return indicates not part of optimization tree in Rollup
          if (externals.indexOf(resolved) != -1)
            return false;
          return resolved;
        },
        load: function(id, options) {
          return tree[id].metadata.originalSource || tree[id].source;
        }
      }],
      onwarn: function(message) {}
    })
    .then(function(bundle) {
      var entryPointLoad = tree[entryPoint];

      var output = bundle.generate({
        sourceMap: compileOpts.sourceMaps,
        sourceMapFile: entryPointLoad.path
      });

      // replace the entry point module itself with the inlined subgraph module
      rolledUpTree[entryPoint] = extend(extend({}, entryPointLoad), {
        deps: entryPointLoad.deps.filter(function(dep) {
          return externals.indexOf(entryPointLoad.depMap[dep]) != -1;
        }),
        metadata: extend(extend({}, entryPointLoad.metadata), {
          originalSource: undefined,
          sourceMap: output.map
        }),
        source: output.code
      });
    });
  }))
  .then(function() {
    var inlineMap = {};
    inlinedModules.forEach(function(moduleName) {
      var optimizationParent = optimizationParentMap[moduleName];
      (inlineMap[optimizationParent] = inlineMap[optimizationParent] || []).push(moduleName);
    });

    return {
      tree: rolledUpTree,
      inlineMap: inlineMap
    };
  });
};