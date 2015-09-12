var Builder = require('../index');

var builder = new Builder('test/fixtures/conditional-tree');

builder.loadConfigSync('test/fixtures/conditional-tree.config.js');

suite('Conditional Builds', function() {  
  test('Package environment traces all conditional variations', function() {
    return builder.trace('pkg/env-condition')
    .then(function(tree) {
      assert.deepEqual(Object.keys(tree).sort(), ['pkg#:env-condition', 'pkg/env-condition-browser.js', 'pkg/env-condition.js'].sort());
    });
  });

  test('Conditional interpolation traces all conditional variations', function() {
    return builder.trace('interpolated-#{conditions.js|test}.js')
    .then(function(tree) {
      assert.deepEqual(Object.keys(tree).sort(), [ 'interpolated-#{conditions.js|test}.js', 'conditions.js', 'interpolated-1.js', 'interpolated-2.js' ].sort());
    });
  });

  test('Environment tracing', function() {

  });

  test('Build by default includes all conditional variations', function() {
  });

  test('Build with browser: true option includes only browser variations', function() {
  });
});
