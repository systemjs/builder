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

var compareSourceMaps = function(filename, expectation, done) {
  builder.reset();
  builder.loadConfig('./test/cfg.js')
    .then(function() {
      return builder.build(filename, null, buildOpts);
    })
  .then(function(output) {
    assert.equal(expectation, output.sourceMap.toString());
  })
  .then(done)
  .catch(err);
};

var buildOutput = function(filename) {
  builder.reset();
  builder.loadConfig('./test/cfg.js')
    .then(function() {
      return builder.buildSFX(filename, './test/output.js', buildOpts);
    })
  .catch(err);
};

var readExpectation = function(filename) {
  return fs.readFileSync(filename).toString().replace(/\n$/, '');
};

// buildOutput('test/tree/first');

describe('Source Maps', function() {
  describe('Traceur', function() {
    builder.loader.transpiler = 'traceur';

    describe('without input source maps', function() {
      var single = readExpectation('expectations/singleTraceur.json');
      var multiple = readExpectation('expectations/multipleTraceur.json');
      it('handles single compilation targets correctly', function(done) {
        compareSourceMaps('tree/amd-2', single, done);
      });

      it('handles multiple compilation targets correctly', function(done) {
        compareSourceMaps('tree/first', multiple, done);
      });
    });

    describe('with input source maps', function() {
      var single= readExpectation('expectations/singleChainTraceur.json');
      var multiple= readExpectation('expectations/multipleChainTraceur.json');
      it('handles single compilation targets correctly', function(done) {
        compareSourceMaps('chain/second', single, done);
      });

      it('handles multiple compilation targets correctly', function(done) {
        compareSourceMaps('chain/first', multiple, done);
      });
    });
  });

  describe('6to5', function() {
    builder.loader.transpiler = '6to5';

    describe('without input source maps', function() {
      var single = readExpectation('expectations/single6to5.json');
      var multiple = readExpectation('expectations/multiple6to5.json');
      it('handles single compilation targets correctly', function(done) {
        compareSourceMaps('tree/amd-2', single, done);
      });

      it('handles multiple compilation targets correctly', function(done) {
        compareSourceMaps('tree/first', multiple, done);
      });
    });

    describe('with input source maps', function() {
      var single= readExpectation('expectations/singleChain6to5.json');
      var multiple= readExpectation('expectations/multipleChain6to5.json');
      it('handles single compilation targets correctly', function(done) {
        compareSourceMaps('chain/second', single, done);
      });

      it('handles multipl compilation targets correctly', function(done) {
        compareSourceMaps('chain/first', multiple, done);
      });
    });
  });
});


