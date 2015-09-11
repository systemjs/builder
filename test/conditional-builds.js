var Builder = require('../index');

var builder = new Builder('test/fixtures/conditional-tree');

builder.loadConfigSync('test/fixtures/conditional-tree.config.js');

suite('Conditional Builds', function() {  
  test('Package environment traces all conditional variations', function() {
    return builder.trace('pkg/env-condition')
    .then(function(trace) {
      assert.deepEqual(Object.keys(trace).sort(), ['pkg#:env-condition', 'pkg/env-condition-browser.js', 'pkg/env-condition.js'].sort());
    });
  });

  test('Conditional interpolation traces all conditional variations', function() {
    return builder.trace('interpolated-#{conditions.js|test}.js')
    .then(function(trace) {
      assert.deepEqual(Object.keys(trace).sort(), [ 'interpolated-#{conditions.js|test}.js', 'conditions.js', 'interpolated-1.js', 'interpolated-2.js' ].sort());
    });
  });
});
