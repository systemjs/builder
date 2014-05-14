var builder = require('../index');

console.log('Running a multi-format build...');
builder.build('tree/first', '.', 'tree-build.js')
.then(function() {
  console.log('Done');
})
.catch(function(e) {
  console.log(e);
});

builder.createTraceTree('tree/first').then(function(traceTree) {
  console.log(JSON.stringify(traceTree, null, 2));
});
