var Builder = require('../index');
var builder = new Builder();

builder.loadConfigSync('./test/fixtures/test-tree.config.js');

builder.config({ transpiler: 'babel' });

suite('Bundle Expressions', function() {
  test('Addition', function(done) {
    builder.trace('amd.js + amd-2.js')
    .then(function(tree) {
      assert.deepEqual(Object.keys(tree), 
          ['amd-2.js', 'jquery.js', 'some.js!plugin.js', 'text.txt!text-plugin.js', 'global.js', 'amd.js']);
    })
    .then(done, done);
  });

  test('Single module subtraction', function(done) {
    builder.trace('amd.js + amd-2.js - [amd-1.js]')
    .then(function(tree) {
      assert.deepEqual(Object.keys(tree), 
          ['amd-2.js', 'jquery.js', 'some.js!plugin.js', 'text.txt!text-plugin.js', 'global.js', 'amd.js']);
    })
    .then(done, done);
  });

  test('Commonality operator', function(done) {
    builder.trace('amd-5b.js & second.js')
    .then(function(tree) {
      assert.deepEqual(Object.keys(tree), ['third.js', 'cjs.js', 'second.js']);
    })
    .then(done, done);
  });

  test('Wildcard bundling', function(done) {
    builder.trace('*.js - [amd-*] - [sfx-format-*]')
    .then(function(tree) {
      assert.deepEqual(Object.keys(tree), [
          'cjs.js', 'umd.js', 'second.js', 'third.js', 'text-plugin.js', 'component.jsx!jsx.js', 'plugin.js', 'babel',
          'jsx.js', 'jquery.js', 'global.js', 'global-outer.js', 'global-inner.js', 'some.js!plugin.js', 
          'text.txt!text-plugin.js', 'amd.js', 'first.js']);
    })
    .then(done, done);
  });

  test('Wildcard plugin', function(done) {
    builder.trace('*.jsx!jsx.js - [component.jsx!jsx.js]')
    .then(function(tree) {
      assert.deepEqual(Object.keys(tree), []);
    })
    .then(done, done);
  });
});