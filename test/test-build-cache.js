var Builder = require('../index');
var expect = require('chai').expect;
var toFileURL = require('../lib/utils.js').toFileURL;

suite('Test compiler cache', function() {
  var builder = new Builder('test/fixtures/test-cache-tree');
  builder.config({ transpiler: 'babel' });

  test('Use compile cache entry when available', function() {
    var loadName = 'simple.js';
    var outputPath = 'test/output/cached.js';
    var cacheObj;
    var tree;

    return builder.trace(loadName).then(function(_tree) {
      tree = _tree;
      return builder.buildTree(tree);
    })
    .then(function() {
      var cacheEntry = builder.getCache();

      expect(cacheEntry).to.be.an('object');

      cacheObj = cacheEntry.compile['simple.js'];
      
      expect(cacheObj).to.be.an('object');
      expect(cacheObj.sourceHash).to.be.a('string');
      expect(cacheObj.output).to.be.an('object');

      // poison cache
      cacheObj.output.source = cacheObj.output.source.replace('hate', 'love');

      return builder.buildTree(tree);
    })
    .then(function(output) {
      // verify buildTree use poisoned cache rather than recompiling
      var outputSource = output.source;
      expect(outputSource).not.to.contain('hate caches');
      expect(outputSource).to.contain('love caches');

      // invalidate poisoned cache entry and rebuild
      cacheObj.sourceHash = 'out of date';
      return builder.buildTree(tree);
    })
    .then(function(output) {
      // verify original source is used once more
      var outputSource = output.source;
      expect(outputSource).to.contain('hate caches');
      expect(outputSource).not.to.contain('love caches');
    });
  });

  test('Use trace cache when available', function() {
    // construct the load record for the cache
    var fileName = toFileURL(__dirname + '/fixtures/test-cache-tree/simple.js');
    var cacheObj = {
      trace: {
        'simple.js': { 
          name: 'simple.js',
          normalized: fileName,
          address: fileName,
          metadata: {
            deps: [],
            format: 'amd',
            isAnon: true
          },
          deps: [],
          depMap: {},
          source: 'define([], function(module) {\n  console.log(\'fake cache\');\n});\n',
          originalSource: 'define([], function(module) {\n  console.log(\'fake cache\');\n});\n'
        }
      }
    };

    builder.reset();
    builder.setCache(cacheObj);

    return builder.build('simple.js').then(function(output) {
      expect(output.source).to.contain('fake cache');
    });

  });
});
