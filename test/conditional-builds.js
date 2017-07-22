var Builder = require('../index');

var builder = new Builder('test/fixtures/conditional-tree');

builder.loadConfigSync('test/fixtures/conditional-tree.config.js');

suite('Conditional Builds', function() {  
  test('Package environment traces all conditional variations', function() {
    return builder.trace('pkg/env-condition')
    .then(function(tree) {
      assert.deepEqual(Object.keys(tree).sort(), ['pkg/#:./env-condition', 'pkg/env-condition-browser.js', 'pkg/env-condition.js'].sort());
    });
  });

  test('Conditional interpolation traces all conditional variations', function() {
    return builder.trace('interpolated-#{conditions.js|test}.js')
    .then(function(tree) {
      assert.deepEqual(Object.keys(tree).sort(), ['interpolated-#{conditions.js|test}.js', 'conditions.js', 'interpolated-1.js', 'interpolate-1-dep.js', 'interpolated-2.js'].sort());
    });
  });

  test('Boolean conditional', function() {
    // This can be updated to just #?browser
    return builder.trace('interpolated-1.js#?|browser')
    .then(function(tree) {
      assert.deepEqual(Object.keys(tree).sort(), ['interpolated-1.js#?@system-env|browser', 'interpolated-1.js', 'interpolate-1-dep.js'].sort());
    });
  });

  test('Boolean conditional exclusion', function() {
    return builder.trace('interpolated-1.js#?|browser', { node: true })
    .then(function(tree) {
      assert.deepEqual(Object.keys(tree), ['interpolated-1.js#?@system-env|browser']);
    })
  });

  test('More conditions', function() {
    return builder.trace('pkg/env-condition + interpolated-#{conditions.js|test}.js')
    .then(function(tree) {
      assert.deepEqual(Object.keys(tree).sort(), ['conditions.js', 'interpolate-1-dep.js', 'interpolated-1.js', 'interpolated-2.js', 'pkg/env-condition-browser.js', 'pkg/env-condition.js', 'interpolated-#{conditions.js|test}.js', 'pkg/#:./env-condition'].sort());
    });
  });

  test('Browser:false tracing', function() {
    return builder.trace('pkg/env-condition + interpolated-#{conditions.js|test}.js', { browser: false })
    .then(function(tree) {
      assert.deepEqual(Object.keys(tree).sort(), ['pkg/#:./env-condition', 'pkg/env-condition.js', 'interpolated-#{conditions.js|test}.js', 'conditions.js', 'interpolated-1.js', 'interpolate-1-dep.js', 'interpolated-2.js'].sort())
    });
  });

  test('Custom conditions trace', function() {
    return builder.trace('interpolated-#{conditions.js|test}.js', { conditions: { 'conditions.js|test': '1' } })
    .then(function(tree) {
      assert.deepEqual(Object.keys(tree).sort(), ['interpolated-#{conditions.js|test}.js', 'conditions.js', 'interpolated-1.js', 'interpolate-1-dep.js'].sort());
    });
  });

  test('Environment tracing', function() {
    return builder.traceConditionalEnv('pkg/env-condition + interpolated-#{conditions.js|test}.js')
    .then(function(conditions) {
      assert.deepEqual(conditions, { 'conditions.js|test': ['1', '2'], '@system-env|browser': [true, false] });
    });
  });

  test('Custom condition build', function() {
    builder.config({
      map: {
        'ENV': 'ENV.js'
      }
    });
    return builder.trace('custom-conditions.js', { conditions: { 'ENV|mock': false, 'ENV|environment': ['dev'], 'ENV|optimize': true } })
    .then(function(tree) {
      assert.deepEqual(Object.keys(tree).sort(), ['ENV.js', 'config.#{ENV.js|environment}.js', 'config.dev.js', 'custom-conditions.js', 'mock.js#?ENV.js|mock']);
    });
  });

  test('Build including all conditional variations', function() {
    return builder.bundle('pkg/env-condition + interpolated-#{conditions.js|test}.js', 'test/output/conditional-build.js', { sourceMaps: true })
    .then(function(output) {
      assert(output.source.indexOf('"interpolated-2.js"') != -1);
      assert(output.source);
    });
  });

  test('Bundle conditional inlining', function() {
    return builder.bundle('interpolated-#{conditions.js|test}.js', {
      inlineConditions: true,
      conditions: {
        'conditions.js|test': '2'
      }
    })
    .then(function(output) {
      assert(output.source.indexOf('interpolated-#{') == -1);
      assert(output.source.indexOf('"interpolated-2.js"') != -1);
      assert(output.source);
    });
  });

  test('Selective conditional inlining', function() {
    return builder.bundle('custom-conditions.js + interpolated-#{conditions.js|test}.js', {
      inlineConditions: {
        'conditions.js|test': '2'
      }
    })
    .then(function(output) {
      assert(output.modules.indexOf('conditions.js') == -1);
      assert(output.modules.indexOf('ENV.js') != -1);
      assert(output.source.indexOf('interpolated-#{') == -1);
      assert(output.source.indexOf('"interpolated-2.js"') != -1);
      assert(output.source);
    });
  });
});
