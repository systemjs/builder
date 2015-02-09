var fs = require('fs');
var builder = require('../index');
var assert = require('chai').assert;

var err = function(e) {
  setTimeout(function() {
    throw e;
  });
};

var compareSourceMaps = function(filename, expectation, done) {
  builder.loadConfig('./test/cfg.js')
    .then(function() {
      return builder.build(filename, null, { sourceMaps: true });
    })
  .then(function(output) {
    assert.equal(expectation, output.sourceMap.toString());
  })
  .then(done)
  .catch(err);
};

var readExpectation = function(filename) {
  return fs.readFileSync(filename).toString().replace(/\n$/, '');
};

describe('Source Maps', function() {
  describe('Traceur', function() {
    var single = readExpectation('expectations/singleTraceur.json');
    var multiple = readExpectation('expectations/multipleTraceur.json');
    builder.loader.transpiler = 'traceur';

    it('handles single compilation targets correctly', function(done) {
      compareSourceMaps('test/tree/amd-2', single, done);
    });

    it('handles multiple compilation targets correctly', function(done) {
      compareSourceMaps('test/tree/first', multiple, done);
    });
  });

  describe('6to5', function() {
    var single = readExpectation('expectations/single6to5.json');
    var multiple = readExpectation('expectations/multiple6to5.json');
    builder.loader.transpiler = '6to5';

    it('handles single compilation targets correctly', function(done) {
      compareSourceMaps('test/tree/amd-2', single, done);
    });

    it('handles multiple compilation targets correctly', function(done) {
      compareSourceMaps('test/tree/first', multiple, done);
    });
  });
});


