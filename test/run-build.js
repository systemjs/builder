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

builder.trace('tree/first').then(function(traceTree) {
  console.log(JSON.stringify(traceTree, null, 2));
});
