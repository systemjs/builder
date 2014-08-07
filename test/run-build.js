var builder = require('../index');

builder.build('tree/amd-1', { baseURL: '.' }, 'amd-1.js').then(function() {
  console.log('amd1 done');
}).catch(console.error.bind(console));
builder.build('tree/amd-2', { baseURL: '.' }, 'amd-2.js').then(function() {
  console.log('amd2 done');
}).catch(console.error.bind(console));
builder.build('tree/amd-3', { baseURL: '.' }, 'amd-3.js').then(function() {
  console.log('amd3 done');
}).catch(console.error.bind(console));
builder.build('tree/amd-4', { baseURL: '.' }, 'amd-4.js').then(function() {
  console.log('amd4 done');
}).catch(console.error.bind(console));
builder.build('tree/amd-5a', { baseURL: '.' }, 'amd-5.js').then(function() {
  console.log('amd5a done');
}).catch(console.error.bind(console));
builder.build('tree/amd-5b', { baseURL: '.' }, 'amd-5a.js').then(function() {
  console.log('amd5b done');
}).catch(console.error.bind(console));

console.log('Running a multi-format build...');
builder.build('tree/first', {
  baseURL: '.'
}, 'tree-build.js')
.then(function() {
  console.log('Done');
})
.catch(function(e) {
  setTimeout(function() {
    throw e;
  });
});

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
  return builder.buildTree(
    builder.subtractTrees(treeFirst, traceTree.tree), 'excluded.js'
  );
})
.catch(function(e) {
  setTimeout(function() {
    throw e;
  });
});