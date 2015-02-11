var fs = require('fs');
var builder = require('../index');
var assert = require('chai').assert;

var err = function(e) {
  setTimeout(function() {
    throw e;
  });
};

var buildOpts = {
  sourceMaps: true,
  config: {baseURL: 'test', map: {"jquery-cdn": "@empty"}}
};

var compareSourceMaps = function(filename, expectation, done, transpiler) {
  var instance = new builder.Builder();
  instance.reset();
  instance.loader.transpiler = transpiler || 'traceur';
  instance.loadConfig('./test/cfg.js')
    .then(function() {
      return instance.build(filename, null, buildOpts);
    })
  .then(function(output) {
    assert.equal(expectation, output.sourceMap.toString());
  })
  .then(done)
  .catch(err);
};

var readExpectation = function(filename) {
  return fs.readFileSync('test/expectations/' + filename).toString().replace(/\n$/, '');
};

function writeTestOutput() {
  instance = new builder.Builder();
  instance.loadConfig('./test/cfg.js')
    .then(function() {
      builder.buildSFX('tree/first', 'test/output.js', buildOpts);
    })
  .catch(err);
}

// writeTestOutput();

describe('Source Maps', function() {

  describe('Traceur', function() {
    var transpiler = 'traceur';

    describe('without input source maps', function() {
      it('handles single compilation targets correctly', function(done) {
        var expected = readExpectation('traceur.tree.single.json');
        compareSourceMaps('tree/amd-2', expected, done, transpiler);
      });

      it('handles multiple compilation targets correctly', function(done) {
        var expected = readExpectation('traceur.tree.multi.json');
        compareSourceMaps('tree/first', expected, done, transpiler);
      });
    });

    describe('with input source maps', function() {
      it('handles single compilation targets correctly', function(done) {
      var single= readExpectation('traceur.chain.single.json');
        compareSourceMaps('chain/second', single, done, transpiler);
      });

      it('handles multiple compilation targets correctly', function(done) {
      var multiple= readExpectation('traceur.chain.multi.json');
        compareSourceMaps('chain/first', multiple, done, transpiler);
      });
    });
  });

  describe('6to5', function() {
    var transpiler = '6to5';

    describe('without input source maps', function() {
      it('handles single compilation targets correctly', function(done) {
        var single = readExpectation('6to5.tree.single.json');
        compareSourceMaps('tree/amd-2', single, done, transpiler);
      });

      it('handles multiple compilation targets correctly', function(done) {
        var multiple = readExpectation('6to5.tree.multi.json');
        compareSourceMaps('tree/first', multiple, done, transpiler);
      });
    });

    describe('with input source maps', function() {
      it('handles single compilation targets correctly', function(done) {
        var single= readExpectation('6to5.chain.single.json');
        compareSourceMaps('chain/second', single, done, transpiler);
      });

      it('handles multipl compilation targets correctly', function(done) {
        var multiple= readExpectation('6to5.chain.multi.json');
        compareSourceMaps('chain/first', multiple, done, transpiler);
      });
    });
  });
});
