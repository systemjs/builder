var Builder = require('../index');
var builder = new Builder();

var minify = false;

builder.loadConfigSync('./test/fixtures/test-tree.config.js');

builder.config({
  transpiler: false,
  meta: {
    'a.js': {
      format: 'esm'
    },
    'b.js': {
      format: 'esm'
    }
  },
  paths: {
    '*': './test/fixtures/es-tree/*'
  }
});

suite('SFX Optimizations', function() {
  test('All ES6 rollup optimization', function(done) {
    builder.buildStatic('a.js', 'test/output/es-sfx.js', { runtime: false, minify: minify, format: 'esm' })
    .then(function(output) {
      assert(output.source, 'var b = \'b\';\n\nvar a = \'a\';\n\nexport { a, b };');
      done();
    }, done)
  });
});