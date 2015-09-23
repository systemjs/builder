var profile = require('../lib/profile');
profile.enable();

var buildEvt = profile.event('simple-build');

var Builder = require('../index');
var builder = new Builder('test/fixtures/test-tree', 'test/fixtures/test-tree.config.js');

builder.bundle('first.js')
.then(function() {
  buildEvt.done();
  profile.logSummary(['canonicalization']);
});