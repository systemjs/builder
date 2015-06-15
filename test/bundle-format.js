var Builder = require('../index');
var builder = new Builder('test/fixtures/test-tree');
var spawn = require('child_process').spawn;

suite('Bundle Format', function() {
  test('Test bundle formats', function(done) {
    builder.buildSFX('sfx-format-01.js', 'test/output/sfx-amd.js', { sfxFormat: 'amd' })
    .then(function () {
      spawn('node_modules/.bin/mocha-phantomjs', ['test/test-sfx-amd.html'])
      .on('close', function (code) {
        assert.deepEqual(code, 0);
        done();
      })
      .on('error', done);
    })
    .catch(done);
  });
});