var fs = require('fs');
var Builder = require('../index');

// OH DEAR!
return;

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
  (new Builder()).loadConfig(configFile)
    .then(function(builder) {
      builder.buildSFX('first', 'test/output/output.js', buildOpts);
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

var toJSON = function(map) {
  return JSON.parse(map.toString());
};

var getSources = function(map) {
  return toJSON(map).sources;
};

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

    test('are relative to outFile', function(done) {
      var builder = new Builder(configFile);
      builder.buildSFX('first', 'dist/output.js', buildOpts)
      .then(function(outputs) {
        var sources = getSources(outputs.sourceMap);
        assert.deepEqual(sources,
        [ '../test/fixtures/test-tree/third.js',
          '../test/fixtures/test-tree/cjs.js',
          '../test/fixtures/test-tree/jquery.js',
          '../test/fixtures/test-tree/some',
          '../test/fixtures/test-tree/text.txt',
          '../test/fixtures/test-tree/component.jsx',
          '../test/fixtures/test-tree/global.js',
          '../test/fixtures/test-tree/amd.js',
          '../test/fixtures/test-tree/second.js',
          '../test/fixtures/test-tree/first.js' ]);
      })
      .then(done)
      .catch(err);
    });

    test('are relative to baseURL, if no outFile', function(done) {
      var builder = new Builder(configFile);
      var opts = { sourceMaps: true, config: { baseURL: 'test/fixtures/test-tree' } };
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
          'global.js',
          'amd.js',
          'second.js',
          'first.js' ]);
      })
      .then(done)
      .catch(err);
    });
  });

  suite('Option: sourceMapContents', function() {
    suite('includes all file contents', function(done) {
      var builder = new Builder(configFile);
      var opts = { sourceMaps: true, sourceMapContents: true };
      builder.buildSFX('first', null, opts)
      .then(function(outputs) {
        var map = toJSON(outputs.sourceMap);
        var sources = map.sources;
        var contents = map.sourcesContent;
        assert.equal(sources.length, contents.length);
        for (var i=0; i<contents.length; i++) {
          var content = contents[i];
          assert(content && content.length > 0);
          assert.equal(content, fs.readFileSync('test/fixtures/test-tree/' + sources[i]).toString());
        }
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
        if (process.env.UPDATE_EXPECTATIONS)
          writeSourceMaps(module, transpiler, source);
        var expected = readExpectation(source);
        compareSourceMaps(module, expected, done, transpiler);
      });

      /* test('handles multiple compilation targets correctly', function(done) {
        var module = 'first';
        var source = 'traceur.tree.multi.json';
        if (process.env.UPDATE_EXPECTATIONS)
          writeSourceMaps(module, transpiler, source);
        var expected = readExpectation(source);
        compareSourceMaps(module, expected, done, transpiler);
      }); */
    });
  });

  suite('babel', function() {
    var transpiler = 'babel';

    suite('without input source maps', function() {
      test('handles single compilation targets correctly', function(done) {
        var module = 'amd-2';
        var source = 'babel.tree.single.json';
        if (process.env.UPDATE_EXPECTATIONS)
          writeSourceMaps(module, transpiler, source);
        var expected = readExpectation(source);
        compareSourceMaps(module, expected, done, transpiler);
      });

      /* test('handles multiple compilation targets correctly', function(done) {
        var module = 'first';
        var source = 'babel.tree.multi.json';
        if (process.env.UPDATE_EXPECTATIONS)
          writeSourceMaps(module, transpiler, source);
        var expected = readExpectation(source);
        compareSourceMaps(module, expected, done, transpiler);
      }); */
    });
  });
});
