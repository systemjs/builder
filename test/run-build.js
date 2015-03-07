var Builder = require('../index');
var inline = require('../lib/output').inlineSourceMap;
var fs = require('fs');

var err = function(e) {
  setTimeout(function() {
    throw e;
  });
};

var builder = new Builder();
var cfg = {
  baseURL: '',
  paths: {
    'jquery-cdn': 'https://code.jquery.com/jquery-2.1.1.min.js',
    'babel': '../node_modules/babel-core/browser.js',
    'babel-runtime': '../node_modules/babel-core/external-helpers.js',
    'traceur': '../node_modules/traceur/bin/traceur.js',
    'traceur-runtime': '../node_modules/traceur/bin/traceur-runtime.js'
  },
  meta: {
    'jquery-cdn': {
      build: false
    }
  }
};

console.log('Running in-memory build...');
builder.config(cfg)

builder.build('tree/first', null, { sourceMaps: true, minify: true })
.then(function(output) {
  fs.writeFile('memory-test', inline(output));
  console.log('Wrote in-memory build to ./memory-test');
})
.catch(err);

console.log('Running a multi-format build...');

builder.config(cfg);

if (process.argv[2] == 'babel')
  builder.loader.transpiler = 'babel';

builder.build('tree/first', 'output/tree-build.js', { sourceMaps: true })
.then(function() {
  console.log('Done');
})
.catch(err);

var treeFirst;
builder.trace('tree/first').then(function(traceTree) {
  treeFirst = traceTree.tree;
  // console.log(JSON.stringify(traceTree, null, 2));
})
.then(function() {
  console.log('Build exclusion');
  return builder.trace('tree/amd');
})
.then(function(traceTree) {
  depTree = traceTree;
  return builder.buildTree(
    Builder.subtractTrees(treeFirst, traceTree.tree), 'output/excluded.js'
  );
})

.then(function() {
  return builder.trace('tree/global-inner').then(function(trace) {
    return builder.buildTree(trace.tree, 'output/global-inner.js');
  });
})

.then(function() {
  return builder.trace('tree/global-outer').then(function(trace) {
    return builder.buildTree(trace.tree, 'output/global-outer.js');
  });
})

.then(function() {
  return builder.trace('tree/amd-1').then(function(trace) {
    return builder.buildTree(Builder.subtractTrees(trace.tree, treeFirst), 'output/amd-1.js');
  });
})

.then(function() {
  return builder.trace('tree/amd-2').then(function(trace) {
    return builder.buildTree(Builder.subtractTrees(trace.tree, treeFirst), 'output/amd-2.js');
  });
})

.then(function() {
  return builder.trace('tree/amd-3').then(function(trace) {
    return builder.buildTree(Builder.subtractTrees(trace.tree, treeFirst), 'output/amd-3.js');
  });
})

.then(function() {
  return builder.trace('tree/amd-4').then(function(trace) {
    return builder.buildTree(Builder.subtractTrees(trace.tree, treeFirst), 'output/amd-4.js');
  });
})

.then(function() {
  return builder.trace('tree/amd-5a').then(function(trace) {
    return builder.buildTree(Builder.subtractTrees(trace.tree, treeFirst), 'output/amd-5a.js');
  });
})

.then(function() {
  return builder.trace('tree/amd-5b').then(function(trace) {
    return builder.buildTree(Builder.subtractTrees(trace.tree, treeFirst), 'output/amd-5b.js');
  });
})

.then(function() {
  return builder.trace('tree/amd-6a').then(function(trace) {
    return builder.buildTree(Builder.subtractTrees(trace.tree, treeFirst), 'output/amd-6a.js');
  });
})

.then(function() {
  return builder.trace('tree/amd-6b').then(function(trace) {
    return builder.buildTree(Builder.subtractTrees(trace.tree, treeFirst), 'output/amd-6b.js');
  });
})

.then(function() {
  return builder.trace('tree/umd').then(function(trace) {
    return builder.buildTree(Builder.subtractTrees(trace.tree, treeFirst), 'output/umd.js');
  });
})

.then(function() {
  return builder.build('tree/amd-7', 'output/amd-7.js');
})

.then(function() {
  builder.reset();
  builder.config(cfg);
  builder.config({ map: { 'jquery-cdn': '@empty' }, transpiler: 'babel' });
  return builder.buildSFX('tree/amd-1', 'output/sfx.js');
})

.catch(err);

