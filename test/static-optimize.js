var Builder = require('../index');
var builder = new Builder();

var minify = false;

builder.loadConfigSync('./test/fixtures/test-tree.config.js');

builder.config({
  transpiler: 'babel',
  paths: {
    '*': './test/fixtures/es-tree/*'
  }
});

suite('SFX Optimizations', function() {
  test('All ES6 rollup optimization', function(done) {
    builder.buildSFX('a.js', 'test/output/es-sfx.js', { runtime: false, minify: minify })
    .then(function(output) {
      // TODO actually test
      console.log(output);
      done();
    }, done)
  });
});