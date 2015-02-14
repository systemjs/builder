var fs = require('fs');
var Builder = require('../index');
var assert = require('chai').assert;

var err = function(e) {
  setTimeout(function() {
    throw e;
  });
};

var buildOpts = { sourceMaps: true };

var compareSourceMaps = function(filename, expectation, done, transpiler) {
  var instance = new Builder('./test/cfg.js');
  buildOpts.transpiler = transpiler || 'traceur';
  instance.build(filename, null, buildOpts)
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
  (new Builder()).loadConfig('./test/cfg.js')
    .then(function(builder) {
      builder.buildSFX('tree/first', 'test/output.js', buildOpts);
    })
  .catch(err);
}

function writeSourceMaps(moduleName, transpiler, sourceMapFile) {
  var instance = new Builder('./test/cfg.js');
  instance.loader.transpiler = transpiler || 'traceur';
  instance.build(moduleName, null, buildOpts)
  .then(function(output) {
    fs.writeFile('test/expectations/' + sourceMapFile, output.sourceMap.toString());
  })
  .catch(err);
}

writeTestOutput();

describe('Source Maps', function() {

  describe('sources paths', function() {

    var getSources = function(map) {
      return JSON.parse(map.toString()).sources;
    };

    it('are relative to outFile', function(done) {
      var builder = new Builder('./test/cfg.js');
      builder.buildSFX('tree/first', 'dist/output.js', buildOpts)
      .then(function(outputs) {
        var sources = getSources(outputs.sourceMap);
        assert.deepEqual(sources,
        [ '../test/tree/third.js',
          '../test/tree/cjs.js',
          '../test/tree/jquery.js',
          '../test/tree/some',
          '../test/tree/text.txt',
          '../test/tree/component.jsx',
          '../test/tree/second.js',
          '../test/tree/global.js',
          '../test/tree/amd.js',
          '../test/tree/first.js' ]);
      })
      .then(done)
      .catch(err);
    });

    it('are relative to baseURL, if no outFile', function(done) {
      var builder = new Builder('./test/cfg.js');
      var opts = { sourceMaps: true, config: { baseURL: 'test/tree' } };
      builder.buildSFX('first', null, opts)
      .then(function(outputs) {
        var sources = getSources(outputs.sourceMap);
        assert.deepEqual(sources,
        [ 'third.js',
          'cjs.js',
          'jquery.js',
          'some',
          'text.txt',
          'component.jsx',
          'second.js',
          'global.js',
          'amd.js',
          'first.js' ]);
      })
      .then(done)
      .catch(err);
    });
  });

  describe('Traceur', function() {
    var transpiler = 'traceur';

    describe('without input source maps', function() {
      it('handles single compilation targets correctly', function(done) {
        var module = 'tree/amd-2';
        var source = 'traceur.tree.single.json';
        //writeSourceMaps(module, transpiler, source);
        var expected = readExpectation(source);
        compareSourceMaps(module, expected, done, transpiler);
      });

      it('handles multiple compilation targets correctly', function(done) {
        var module = 'tree/first';
        var source = 'traceur.tree.multi.json';
        //writeSourceMaps(module, transpiler, source);
        var expected = readExpectation(source);
        compareSourceMaps(module, expected, done, transpiler);
      });
    });

    describe('with input source maps', function() {
      it('handles single compilation targets correctly', function(done) {
        var module = 'chain/second';
        var source = 'traceur.chain.single.json';
        //writeSourceMaps(module, transpiler, source);
        var expected = readExpectation(source);
        compareSourceMaps(module, expected, done, transpiler);
      });

      it('handles multiple compilation targets correctly', function(done) {
        var module = 'chain/first';
        var source = 'traceur.chain.multi.json';
        //writeSourceMaps(module, transpiler, source);
        var expected = readExpectation(source);
        compareSourceMaps(module, expected, done, transpiler);
      });
    });
  });

  describe('6to5', function() {
    var transpiler = '6to5';

    describe('without input source maps', function() {
      it('handles single compilation targets correctly', function(done) {
        var module = 'tree/amd-2';
        var source = '6to5.tree.single.json';
        //writeSourceMaps(module, transpiler, source);
        var expected = readExpectation(source);
        compareSourceMaps(module, expected, done, transpiler);
      });

      it('handles multiple compilation targets correctly', function(done) {
        var module = 'tree/first';
        var source = '6to5.tree.multi.json';
        //writeSourceMaps(module, transpiler, source);
        var expected = readExpectation(source);
        compareSourceMaps(module, expected, done, transpiler);
      });
    });

    describe('with input source maps', function() {
      it('handles single compilation targets correctly', function(done) {
        var module = 'chain/second';
        var source = '6to5.chain.single.json';
        //writeSourceMaps(module, transpiler, source);
        var expected = readExpectation(source);
        compareSourceMaps(module, expected, done, transpiler);
      });

      it('handles multipl compilation targets correctly', function(done) {
        var module = 'chain/first';
        var source = '6to5.chain.multi.json';
        //writeSourceMaps(module, transpiler, source);
        var expected = readExpectation(source);
        compareSourceMaps(module, expected, done, transpiler);
      });
    });
  });
});
