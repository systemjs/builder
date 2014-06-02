var builder = require('../index');

console.log('Running a multi-format build...');
builder.build('tree/first', {
  baseURL: '.'
}, 'tree-build.js')
.then(function() {
  console.log('Done');
})
.catch(function(e) {
  console.log(e);
});

var treeFirst;
builder.trace('tree/first').then(function(traceTree) {
  treeFirst = traceTree.tree;
  console.log(JSON.stringify(traceTree, null, 2));
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
  console.log(e);
});