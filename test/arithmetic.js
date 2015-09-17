var Builder = require('../index');
var builder = new Builder();

builder.loadConfigSync('./test/fixtures/test-tree.config.js');

builder.config({ transpiler: 'babel' });

suite('Bundle Expressions', function() {
  test('Addition', function(done) {
    builder.trace('amd.js + amd-2.js')
    .then(function(tree) {
      assert.deepEqual(Object.keys(tree).sort(), 
          ['amd-2.js', 'amd.js', 'global.js', 'jquery.js', 'some.js!plugin.js', 'text.txt!text-plugin.js']);
    })
    .then(done, done);
  });

  test('Single module subtraction', function(done) {
    builder.trace('amd.js + amd-2.js - [amd-1.js]')
    .then(function(tree) {
      assert.deepEqual(Object.keys(tree).sort(), 
          ['amd-2.js', 'amd.js', 'global.js', 'jquery.js', 'some.js!plugin.js', 'text.txt!text-plugin.js']);
    })
    .then(done, done);
  });

  test('Commonality operator', function(done) {
    builder.trace('amd-5b.js & second.js')
    .then(function(tree) {
      assert.deepEqual(Object.keys(tree).sort(), ['cjs.js', 'second.js', 'third.js']);
    })
    .then(done, done);
  });

  test('Wildcard bundling', function(done) {
    builder.trace('*.js - [amd-*] - [sfx-format-*]')
    .then(function(tree) {
      assert.deepEqual(Object.keys(tree).sort(), [
          'Buffer.js', 'amd.js', 'babel', 'cjs-globals.js', 'cjs.js', 'component.jsx!jsx.js', 'first.js', 
          'global-inner.js', 'global-outer.js', 'global.js', 'jquery-cdn', 'jquery.js', 'jsx.js', 'plugin.js', 'runtime.js', 
          'second.js', 'some.js!plugin.js', 'text-plugin.js', 'text.txt!text-plugin.js', 'third.js', 'umd.js']);
    })
    .then(done, done);
  });

  test('Wildcard plugin', function(done) {
    builder.trace('*.jsx!jsx.js - [component.jsx!jsx.js]')
    .then(function(tree) {
      assert.deepEqual(Object.keys(tree).sort(), []);
    })
    .then(done, done);
  });
});