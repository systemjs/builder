var profile = require('../lib/profile');

var Builder = require('../index');
var builder = new Builder('test/fixtures/test-tree', 'test/fixtures/test-tree.config.js');

var buildEvt;

// First warm up the cache
builder.bundle('first.js')
.then(function() {
  var cache = builder.getCache();

  // now do the bundle operation again against the cache
  profile.enable();
  buildEvt = profile.event('cached-tree-build');
  builder.reset();
  builder.setCache(cache);
  return builder.bundle('first.js')
})
.then(function() {
  buildEvt.done();
  profile.logSummary(['canonicalization', 'startup']);
});