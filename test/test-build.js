var Builder = require('../index');
var inline = require('../lib/output').inlineSourceMap;
var fs = require('fs');
global.ts = require('typescript');

var minify = true;

var err = function(e) {
  setTimeout(function() {
    throw e;
  });
};

var builder = new Builder();
var cfg = {
  transpiler: process.argv[2] == 'babel' || process.argv[2] == 'typescript' ? process.argv[2] : 'traceur',
  paths: {
    '*': 'fixtures/test-tree/*',
    'jquery-cdn': 'https://code.jquery.com/jquery-2.1.1.min.js',
    'babel': '../node_modules/babel-core/browser.js',
    'babel-helpers': '../node_modules/babel-core/external-helpers.js',
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
builder.config(cfg);

builder.build('first.js', null, { sourceMaps: true, minify: minify })
.then(function(output) {
  fs.writeFile('output/memory-test.js', inline(output));
  console.log('Wrote in-memory build to ./memory-test');
})
.catch(err);

console.log('Running a multi-format build...');

builder.config(cfg);

builder.build('first.js', 'output/tree-build.js', { sourceMaps: true, minify: minify, globalDefs: { DEBUG: false } })
.then(function() {
  console.log('Done');
})
.catch(err);

var treeFirst;
Promise.all(['first.js', 'amd.js'].map(builder.trace.bind(builder)))
.then(function(trees) {
  treeFirst = trees[0];
  return builder.buildTree(builder.subtractTrees(trees[0], trees[1]), 'output/excluded.js');
})

.then(function() {
  return builder.trace('global-inner.js').then(function(tree) {
    return builder.buildTree(tree, 'output/global-inner.js');
  });
})

.then(function() {
  return builder.trace('global-outer.js').then(function(tree) {
    return builder.buildTree(tree, 'output/global-outer.js');
  });
})

.then(function() {
  return builder.trace('amd-1.js').then(function(tree) {
    return builder.buildTree(builder.subtractTrees(tree, treeFirst), 'output/amd-1.js');
  });
})

.then(function() {
  return builder.trace('amd-2.js').then(function(tree) {
    return builder.buildTree(builder.subtractTrees(tree, treeFirst), 'output/amd-2.js');
  });
})

.then(function() {
  return builder.trace('amd-3.js').then(function(tree) {
    return builder.buildTree(builder.subtractTrees(tree, treeFirst), 'output/amd-3.js');
  });
})

.then(function() {
  return builder.trace('amd-4.js').then(function(tree) {
    return builder.buildTree(builder.subtractTrees(tree, treeFirst), 'output/amd-4.js');
  });
})

.then(function() {
  return builder.trace('amd-5a.js').then(function(tree) {
    return builder.buildTree(builder.subtractTrees(tree, treeFirst), 'output/amd-5a.js');
  });
})

.then(function() {
  return builder.trace('amd-5b.js').then(function(tree) {
    return builder.buildTree(builder.subtractTrees(tree, treeFirst), 'output/amd-5b.js');
  });
})

.then(function() {
  return builder.trace('amd-6a.js').then(function(tree) {
    return builder.buildTree(builder.subtractTrees(tree, treeFirst), 'output/amd-6a.js');
  });
})

.then(function() {
  return builder.trace('amd-6b.js').then(function(tree) {
    return builder.buildTree(builder.subtractTrees(tree, treeFirst), 'output/amd-6b.js');
  });
})

.then(function() {
  return builder.trace('umd.js').then(function(tree) {
    return builder.buildTree(builder.subtractTrees(tree, treeFirst), 'output/umd.js');
  });
})

.then(function() {
  return builder.build('amd-7.js', 'output/amd-7.js');
})

.then(function() {
  builder.reset();
  builder.config(cfg);
  builder.config({ 
    map: { 
    'jquery-cdn': '@empty',
    'toamd1': 'amd-1.js'
    }
  });
  return builder.buildSFX('toamd1', 'output/sfx.js', { runtime: true, minify: minify, globalDefs: { DEBUG: false } });
})

.catch(err);

