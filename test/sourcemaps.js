var fs = require('fs');
var Builder = require('../index');

function atob(str) {
  return new Buffer(str, 'base64').toString('binary');
}

var err = function(e) {
  setTimeout(function() {
    throw e;
  });
};

var buildOpts = { sourceMaps: true };
var configFile = './test/fixtures/test-tree.config.js';

var compareSourceMaps = function(filename, expectation, done, transpiler) {
  // NB need to change baseURL depending on if using "test-tree" or "chain"
  // perhaps better to have lower baseURL? I don't know.
  var instance = new Builder(configFile);
  buildOpts.config = buildOpts.config || {};
  buildOpts.config.transpiler = transpiler || 'traceur';
  instance.build(filename, null, buildOpts)
  .then(function(output) {
    assert.equal(expectation, output.sourceMap.toString());
  })
  .then(done)
  .catch(err);
};

var readExpectation = function(filename) {
  return fs.readFileSync('test/fixtures/sourcemaps-expectations/' + filename).toString().replace(/\n$/, '');
};

function writeTestOutput() {
  (new Builder()).loadConfig('./test/cfg.js')
    .then(function(builder) {
      builder.buildSFX('first', 'test/output.js', buildOpts);
    })
  .catch(err);
}

function writeSourceMaps(moduleName, transpiler, sourceMapFile) {
  var instance = new Builder(configFile);
  buildOpts.config = buildOpts.config || {};
  buildOpts.config.transpiler = transpiler || 'traceur';
  instance.build(moduleName, null, buildOpts)
  .then(function(output) {
    fs.writeFile('test/fixtures/sourcemaps-expectations/' + sourceMapFile, output.sourceMap.toString());
  })
  .catch(err);
}

writeTestOutput();

suite('Source Maps', function() {

  test('can render inline', function(done) {
    var module = 'amd-2';
    var filename = 'inline-source-map.js';

    var instance = new Builder(configFile);
    instance.build(module, null, { sourceMaps: 'inline' })
    .then(function(output) {
      assert.equal(undefined, output.sourceMap);
      var source = output.source;
      assert.equal(1, source.match(/sourceMappingURL=/g).length);
      var lines = output.source.split("\n");
      var lastLine = lines[lines.length - 1];
      var commentPrefix = /^\/\/# sourceMappingURL=data:application\/json;base64,/;
      assert(lastLine.match(commentPrefix));
      var encoding = lastLine.replace(commentPrefix, "");
      var decoded = JSON.parse(atob(encoding));
      // not a regular array so tedious
      assert.equal(1, decoded.sources.length);
      assert.equal('amd-2.js', decoded.sources[0]);
      done();
    });
  });

  suite('sources paths', function() {

    var getSources = function(map) {
      return JSON.parse(map.toString()).sources;
    };

    test('are relative to outFile', function(done) {
      var builder = new Builder(configFile);
      builder.buildSFX('first', 'dist/output.js', buildOpts)
      .then(function(outputs) {
        var sources = getSources(outputs.sourceMap);
        assert.deepEqual(sources,
        [ '../test/third.js',
          '../test/cjs.js',
          '../test/jquery.js',
          '../test/some',
          '../test/text.txt',
          '../test/component.jsx',
          '../test/second.js',
          '../test/global.js',
          '../test/amd.js',
          '../test/first.js' ]);
      })
      .then(done)
      .catch(err);
    });

    test('are relative to baseURL, if no outFile', function(done) {
      var builder = new Builder(configFile);
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

  suite('Traceur', function() {
    var transpiler = 'traceur';

    suite('without input source maps', function() {
      test('handles single compilation targets correctly', function(done) {
        var module = 'amd-2';
        var source = 'traceur.tree.single.json';
        //writeSourceMaps(module, transpiler, source);
        var expected = readExpectation(source);
        compareSourceMaps(module, expected, done, transpiler);
      });

      test('handles multiple compilation targets correctly', function(done) {
        var module = 'first';
        var source = 'traceur.tree.multi.json';
        //writeSourceMaps(module, transpiler, source);
        var expected = readExpectation(source);
        compareSourceMaps(module, expected, done, transpiler);
      });
    });

    suite('with input source maps', function() {
      test('handles single compilation targets correctly', function(done) {
        var module = 'chain/second';
        var source = 'traceur.chain.single.json';
        //writeSourceMaps(module, transpiler, source);
        var expected = readExpectation(source);
        compareSourceMaps(module, expected, done, transpiler);
      });

      test('handles multiple compilation targets correctly', function(done) {
        var module = 'chain/first';
        var source = 'traceur.chain.multi.json';
        //writeSourceMaps(module, transpiler, source);
        var expected = readExpectation(source);
        compareSourceMaps(module, expected, done, transpiler);
      });
    });
  });

  suite('babel', function() {
    var transpiler = 'babel';

    suite('without input source maps', function() {
      test('handles single compilation targets correctly', function(done) {
        var module = 'amd-2';
        var source = 'babel.tree.single.json';
        //writeSourceMaps(module, transpiler, source);
        var expected = readExpectation(source);
        compareSourceMaps(module, expected, done, transpiler);
      });

      test('handles multiple compilation targets correctly', function(done) {
        var module = 'first';
        var source = 'babel.tree.multi.json';
        //writeSourceMaps(module, transpiler, source);
        var expected = readExpectation(source);
        compareSourceMaps(module, expected, done, transpiler);
      });
    });

    suite('with input source maps', function() {
      test('handles single compilation targets correctly', function(done) {
        var module = 'chain/second';
        var source = 'babel.chain.single.json';
        //writeSourceMaps(module, transpiler, source);
        var expected = readExpectation(source);
        compareSourceMaps(module, expected, done, transpiler);
      });

      test('handles multipl compilation targets correctly', function(done) {
        var module = 'chain/first';
        var source = 'babel.chain.multi.json';
        //writeSourceMaps(module, transpiler, source);
        var expected = readExpectation(source);
        compareSourceMaps(module, expected, done, transpiler);
      });
    });
  });
});
