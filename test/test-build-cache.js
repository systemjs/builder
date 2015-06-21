var Builder = require('../index');
var expect = require('chai').expect;

suite('Test compiler cache', function() {
  var builder = new Builder('test/fixtures/test-cache-tree');
  builder.config({ transpiler: 'babel' });

  test('Use cache entry when available', function() {
    var loadName = 'simple.js';
    var outputPath = 'test/output/cached.js';
    var cache = {};
    var tree;

    return builder.trace(loadName).then(function(_tree) {
      tree = _tree;
      return builder.buildTree(tree, null, {}, cache);
    })
    .then(function(output) {
      var cacheEntry = cache[loadName];
      expect(cacheEntry).to.be.an('object');
      expect(cacheEntry.sourceHash).to.be.a('string');
      var cacheOutput = cacheEntry.output;
      expect(cacheOutput).to.be.an('object');

      // poison cache
      cacheOutput.source = cacheOutput.source.replace('hate', 'love');

      return builder.buildTree(tree, null, {}, cache);
    })
    .then(function(output) {
      // verify buildTree use poisoned cache rather than recompiling
      var outputSource = output.source;
      expect(outputSource).not.to.contain('hate caches');
      expect(outputSource).to.contain('love caches');

      // invalidate poisoned cache entry and rebuild
      cache[loadName].sourceHash = 'out of date';
      return builder.buildTree(tree, null, {}, cache);
    })
    .then(function(output) {
      // verify original source is used once more
      var outputSource = output.source;
      expect(outputSource).to.contain('hate caches');
      expect(outputSource).not.to.contain('love caches');
    });
  });
});
