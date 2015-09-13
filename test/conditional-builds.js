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
      assert.deepEqual(Object.keys(tree).sort(), ['interpolated-#{conditions.js|test}.js', 'conditions.js', 'interpolated-1.js', 'interpolated-2.js'].sort());
    });
  });

  test('traceAllConditionals false', function() {
    return builder.trace('pkg/env-condition + interpolated-#{conditions.js|test}.js', { traceAllConditionals: false })
    .then(function(tree) {
      assert.deepEqual(Object.keys(tree).sort(), ['interpolated-#{conditions.js|test}.js', 'pkg#:env-condition', 'conditions.js', 'pkg/env-condition.js'].sort());
    });
  });

  test('Browser:false tracing', function() {
    return builder.trace('pkg/env-condition + interpolated-#{conditions.js|test}.js', { browser: false })
    .then(function(tree) {
      assert.deepEqual(Object.keys(tree).sort(), ['pkg#:env-condition', 'pkg/env-condition.js', 'interpolated-#{conditions.js|test}.js', 'conditions.js', 'interpolated-1.js', 'interpolated-2.js'].sort())
    });
  });

  test('Custom conditions trace', function() {
    return builder.trace('interpolated-#{conditions.js|test}.js', { conditions: { 'conditions.js': { 'test': '1' } } })
    .then(function(tree) {
      assert.deepEqual(Object.keys(tree).sort(), ['interpolated-#{conditions.js|test}.js', 'conditions.js', 'interpolated-1.js'].sort());
    });
  });

  test('Environment tracing', function() {
    return builder.trace('pkg/env-condition + interpolated-#{conditions.js|test}.js', { traceConditionsOnly: true })
    .then(function(tree) {
      assert.deepEqual(Object.keys(tree), ['conditions.js']);
    });
  });

  test('Build including all conditional variations', function() {
    return builder.bundle('pkg/env-condition + interpolated-#{conditions.js|test}.js', 'test/output/conditional-build.js', { sourceMaps: true })
    .then(function(output) {
      assert(output.source);
    });
  });
});
