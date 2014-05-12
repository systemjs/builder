var builder = require('../index');

builder.build('tree/first', 'test-build.js')
.then(function() {
  console.log('Done');
})
.catch(function(e) {
  console.log(e);
})

