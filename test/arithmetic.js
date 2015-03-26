var Builder = require('../index');
var builder = new Builder('./test/fixtures/test-tree.config.js');

builder.config({ transpiler: 'babel' });

suite('Bundle Expressions', function() {
  test('Addition', function(done) {
    builder.trace('amd + amd-2')
    .then(function(tree) {
      assert.deepEqual(Object.keys(tree), 
          ['amd-2', 'jquery', 'some!plugin', 'text.txt!text-plugin', 'global', 'amd']);
    })
    .then(done, done);
  });

  test('Single module subtraction', function(done) {
    builder.trace('amd + amd-2 - [amd-1]')
    .then(function(tree) {
      assert.deepEqual(Object.keys(tree), 
          ['amd-2', 'jquery', 'some!plugin', 'text.txt!text-plugin', 'global', 'amd']);
    })
    .then(done, done);
  });

  test('Commonality operator', function(done) {
    builder.trace('amd-5b & second')
    .then(function(tree) {
      assert.deepEqual(Object.keys(tree), ['third', 'cjs', 'second']);
    })
    .then(done, done);
  });

  test('Wildcard bundling', function(done) {
    builder.trace('* - [amd-*]')
    .then(function(tree) {
      assert.deepEqual(Object.keys(tree), [
          'cjs', 'umd', 'second', 'third', 'text-plugin', 'plugin', 'babel',
          'jsx', 'jquery', 'global', 'global-outer', 'global-inner', 'some!plugin', 
          'text.txt!text-plugin', 'component.jsx!jsx', 'amd', 'first']);
    })
    .then(done, done);
  });

  test('Wildcard plugin', function(done) {
    builder.trace('*.jsx! - [component.jsx!]')
    .then(function(tree) {
      assert.deepEqual(Object.keys(tree), []);
    })
    .then(done, done);
  });
});