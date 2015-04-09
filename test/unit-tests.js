var fs = require('fs');
var Builder = require('../index');
var chai = require('chai');
var assert = chai.assert;
var extend = require('util')._extend;
var sinon = require('sinon');
var path = require('path');
var Promise = require('rsvp').Promise;

chai.use(require('chai-fs'));
sinon.assert.expose(assert, { prefix: "" });


function atob(str) {
  return new Buffer(str, 'base64').toString('binary');
}

var err = function(e) {
  setTimeout(function() {
    throw e;
  });
};

var buildOpts = { sourceMaps: true };

var compareSourceMaps = function(filename, expectation, done, transpiler) {
  var instance = new Builder('./test/cfg.js');
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
  buildOpts.config = buildOpts.config || {};
  buildOpts.config.transpiler = transpiler || 'traceur';
  instance.build(moduleName, null, buildOpts)
  .then(function(output) {
    fs.writeFile('test/expectations/' + sourceMapFile, output.sourceMap.toString());
  })
  .catch(err);
}

writeTestOutput();

describe('Source Maps', function() {

  it('can render inline', function(done) {
    var module = 'tree/amd-2';
    var filename = 'inline-source-map.js';

    var instance = new Builder('./test/cfg.js');
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
      assert.equal('tree/amd-2.js', decoded.sources[0]);
      done();
    });
  });

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

  describe('babel', function() {
    var transpiler = 'babel';

    describe('without input source maps', function() {
      it('handles single compilation targets correctly', function(done) {
        var module = 'tree/amd-2';
        var source = 'babel.tree.single.json';
        //writeSourceMaps(module, transpiler, source);
        var expected = readExpectation(source);
        compareSourceMaps(module, expected, done, transpiler);
      });

      it('handles multiple compilation targets correctly', function(done) {
        var module = 'tree/first';
        var source = 'babel.tree.multi.json';
        //writeSourceMaps(module, transpiler, source);
        var expected = readExpectation(source);
        compareSourceMaps(module, expected, done, transpiler);
      });
    });

    describe('with input source maps', function() {
      it('handles single compilation targets correctly', function(done) {
        var module = 'chain/second';
        var source = 'babel.chain.single.json';
        //writeSourceMaps(module, transpiler, source);
        var expected = readExpectation(source);
        compareSourceMaps(module, expected, done, transpiler);
      });

      it('handles multipl compilation targets correctly', function(done) {
        var module = 'chain/first';
        var source = 'babel.chain.multi.json';
        //writeSourceMaps(module, transpiler, source);
        var expected = readExpectation(source);
        compareSourceMaps(module, expected, done, transpiler);
      });
    });
  });
});

describe('Builder', function() {

  describe('#optimizeBuild', function() {

    var entryPoints, entryPointsArray, o11Function, options, instance,
        modulePath = 'optimization'+path.sep,
        outputPath = modulePath+'output'+path.sep,
        configFilename = 'config.js',
        defaultEntryPoints = {
          ep1:'optimization/ep1',
          ep2:'optimization/ep2',
          ep3:'optimization/ep3',
          ep4:'optimization/ep4'
        },
        defaultEntryPointsArray = ['optimization/ep1','optimization/ep2','optimization/ep3','optimization/ep4'],
        defaultO11Function = function(entryPoints, traces, optimizationOptions) {
          // This test function just does a trace on each entry point and returns that.
          // Highly inefficient but easy to test.

          var depCache={}, configBundles={}, bundles=[];

          Object.keys(traces).map(function(name) {
            var trace = traces[name],
                tree = trace.tree,
                entryPoint = (entryPoints instanceof Array) ? entryPoints[optimizationOptions.bundleNameMap[name]] : entryPoints[name];

            configBundles[name] = Object.keys(tree);

            bundles.push({
              name: name,
              entryPoint: entryPoint,
              modules: configBundles[name],
              tree: tree
            });


            Object.keys(tree).map(function(file) {
              depCache[entryPoint] = tree[file].deps.map(function(fileDep) {
                return tree[file].depMap[fileDep];
              });
            });

          });

          return {
            bundles: bundles,
            config: {
              depCache: depCache,
              bundles: configBundles
            }
          };
        },
        defaultOptions = {
          // outPath: 'out/folder', -- easiest not to write files for tests
          sourceMaps: false,
          uglify: false,
          minify: false,
        },
        dependencyMap = {
          ep1: ['ep1','dep1','dep2'],
          ep2: ['ep2','dep2','dep3'],
          ep3: ['ep3','dep4','dep5','dep2'],
          ep4: ['ep4','dep6'],
        };

    beforeEach(function() {
      entryPoints = extend({},defaultEntryPoints);
      entryPointsArray = defaultEntryPointsArray.map(function(ep) { return ep; });
      o11Function = defaultO11Function;
      options = extend({},defaultOptions);
      instance = new Builder('./test/cfg.js');
    });

    it('should throw if passed bad entryPoints', function() {
      assert.throws(instance.optimizeBuild.bind(instance, 'string', o11Function, options));
      assert.throws(instance.optimizeBuild.bind(instance, 123, o11Function, options));
      assert.throws(instance.optimizeBuild.bind(instance, function(){}, o11Function, options));
      assert.doesNotThrow(instance.optimizeBuild.bind(instance, [], o11Function, options));
      assert.doesNotThrow(instance.optimizeBuild.bind(instance, {}, o11Function, options));
    });

    it('should throw if passed a bad optimizationFunction', function() {
      assert.throws(instance.optimizeBuild.bind(instance, entryPoints, 'string', options));
      assert.throws(instance.optimizeBuild.bind(instance, entryPoints, 123, options));
      assert.throws(instance.optimizeBuild.bind(instance, entryPoints, [], options));
      assert.throws(instance.optimizeBuild.bind(instance, entryPoints, {}, options));
      assert.doesNotThrow(instance.optimizeBuild.bind(instance, entryPoints, function() {}, options));
    });

    it('should call the optimizationFunction once', function(done) {
      var spy = sinon.spy(o11Function);
      instance.optimizeBuild(entryPoints, spy, options).
      then(function() {
        assert.calledOnce(spy);
        done();
      });
    });

    it('should pass the optimizationFunction the entry points', function(done) {
      var spy = sinon.spy(o11Function);
      instance.optimizeBuild(entryPoints, spy, options).
      then(function() {
        assert.equal(entryPoints, spy.args[0][0]);
        done();
      });
    });

    it('should pass the optimizationFunction a trace object representing the traced entry points', function(done) {
      var spy = sinon.spy(o11Function);
      instance.optimizeBuild(entryPoints, spy, options).
      then(function() {
        var traces = spy.args[0][1];
        assert.equal(Object.keys(entryPoints).length, Object.keys(traces).length, 'There should be as many traces as there are entry points');
        Object.keys(entryPoints).map(function(entryPoint) {
          assert.isTrue(traces.hasOwnProperty(entryPoint), 'Traces should contain a `'+entryPoint+'` property');
          assert.equal(traces[entryPoint].moduleName, modulePath+entryPoint, 'traces.'+entryPoint+' should contain a correct `moduleName` property');
          dependencyMap[entryPoint].map(function(dependency) {
            var treeKeys = Object.keys(traces[entryPoint].tree);
            assert.include(treeKeys, modulePath+dependency, 'traces.'+entryPoint+'.tree should have a property named "'+modulePath+dependency+'"');
          });
        });
        // We could analyse the whole traces but this seems like a good place to draw the line
        done();
      });
    });

    it('should pass on the properties of the options object to the optimizationFunction', function(done) {
      var spy = sinon.spy(o11Function);
      instance.optimizeBuild(entryPoints, spy, options).
      then(function() {
        Object.keys(options).map(function(optionsKey) {
          assert.deepEqual(options[optionsKey], spy.args[0][2][optionsKey]);
        });
        done();
      });
    });

    it('should pass an options object with a bundleNameMap property to the optimization function if entryPoints is an Array', function(done) {
      var spy = sinon.spy(o11Function);
      instance.optimizeBuild(entryPointsArray, spy, options).
      then(function() {
        assert.isTrue(spy.args[0][2].hasOwnProperty('bundleNameMap'));
        done();
      });
    });

    it('should pass an options object with a bundleNameMap property to the optimization function if entryPoints is NOT an Array', function(done) {
      var spy = sinon.spy(o11Function);
      instance.optimizeBuild(entryPoints, spy, options).
      then(function() {
        assert.isTrue(spy.args[0][2].hasOwnProperty('bundleNameMap'));
        done();
      });
    });

    it('should name the traces based on the entryPoints keys', function(done) {
      var spy = sinon.spy(o11Function);
      instance.optimizeBuild(entryPoints, spy, options).
      then(function() {
        Object.keys(entryPoints).map(function(entryPointsKey) {
          assert.isTrue(spy.args[0][1].hasOwnProperty(entryPointsKey));
        });
        done();
      });
    });

    it('should give the traces default names if entryPoints is an Array', function(done) {
      var spy = sinon.spy(o11Function);
      instance.optimizeBuild(entryPointsArray, spy, options).
      then(function() {
        Object.keys(entryPointsArray).map(function(entryPointsArrayKey) {
          assert.isTrue(spy.args[0][1].hasOwnProperty('bundle'+entryPointsArrayKey));
        });
        done();
      });
    });

    it('should write the bundle files if an outPath is given in the options', function(done) {
      options.outPath = outputPath;
      var outputFile = outputPath+'ep4.js',
          outputConfigFile = outputPath+configFilename;

      instance.optimizeBuild({ep4:'optimization/ep4'}, o11Function, options).
      then(function() {
        assert.pathExists(outputFile);
        fs.unlink(outputFile);
        fs.unlink(outputConfigFile);
        done();
      });
    });

    it('should include the source for the bundle files in the returned object if no outPath is given', function(done) {
      instance.optimizeBuild(entryPoints, o11Function, options).
      then(function(output) {
        output.bundles.map(function(bundle){
          assert.isTrue(bundle.hasOwnProperty('source'));
        });
        done();
      });
    });

    it('should write the config.js if an outPath is given in the options', function(done) {
      options.outPath = outputPath;
      var outputFile = outputPath+'ep4.js',
          outputConfigFile = outputPath+configFilename;

      instance.optimizeBuild({ep4:'optimization/ep4'}, o11Function, options).
      then(function() {
        assert.pathExists(outputConfigFile);
        fs.unlink(outputFile);
        fs.unlink(outputConfigFile);
        done();
      });
    });

    it('should resolve its promise with an object containing information about the optimized bundles', function(done) {
      instance.optimizeBuild(entryPoints, o11Function, options).
      then(function(output) {
        assert.isTrue(output.hasOwnProperty('bundles'));
        output.bundles.map(function(bundle) {
          assert.isTrue(bundle.hasOwnProperty('name'));
          assert.isTrue(bundle.hasOwnProperty('modules'));
        });
        done();
      });
    });

    it('should resolve its promise with an object containing information that would allow configuration of System.js to use the bundles', function(done) {
      instance.optimizeBuild(entryPoints, o11Function, options).
      then(function(output) {
        assert.isTrue(output.hasOwnProperty('config'));
        assert.isTrue(output.config.hasOwnProperty('depCache'));
        assert.isTrue(output.config.hasOwnProperty('bundles'));
        done();
      });
    });

  });

  describe('#validateOptimizedBundleData', function() {

    var goodConfigBundles = {
          'key': ['array/element']
        },
        goodConfigDepCache = {
          'key': ['array/element']
        },
        goodConfig = {
          bundles: goodConfigBundles,
          depCache: goodConfigDepCache
        },
        goodBundles = [
          {
            name: 'name',
            modules: ['some/module']
          }
        ];

    it('should throw if there is a problem with the structure/type of the bundle data', function() {
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,[]), null, null, 'an array should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,'asdf'), null, null, 'a string should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,1234), null, null, 'a number should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,function(){}), null, null, 'a function should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{}), null, null, 'an empty object should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{config:{}}), null, null, 'an object with no bundles property should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:'asdf',config:{}}), null, null, 'an object with bundles as a string should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:1234,config:{}}), null, null, 'an object with bundles as a number should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:function(){},config:{}}), null, null, 'an object with bundles as a function should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:{},config:{}}), null, null, 'an object with bundles as an object should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:[]}), null, null, 'an object with no config object should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:[],config:'asdf'}), null, null, 'an object with config as a string should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:[],config:1234}), null, null, 'an object with config as a number should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:[],config:function(){}}), null, null, 'an object with config as a function should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:[],config:[]}), null, null, 'an object with config as an array should be identified as invalid');
    });

    it('should throw if there is a problem with the structure/type of the bundle data bundles property', function() {
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:['asdf'],config:goodConfig}), null, null, 'a bundles array containing a string should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:[1234],config:goodConfig}), null, null, 'a bundles array containing a number should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:[function(){}],config:goodConfig}), null, null, 'a bundles array containing a function should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:[[]],config:goodConfig}), null, null, 'a bundles array containing an array should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:[{name:1234,modules:['some/module']}],config:goodConfig}), null, null, 'a bundle where name is a number should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:[{name:function(){},modules:['some/module']}],config:goodConfig}), null, null, 'a bundle where name is a function should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:[{name:[],modules:['some/module']}],config:goodConfig}), null, null, 'a bundle where name is an array should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:[{name:{},modules:['some/module']}],config:goodConfig}), null, null, 'a bundle where name is an object should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:[{name:'name',modules:'asdf'}],config:goodConfig}), null, null, 'a bundle where modules is a string should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:[{name:'name',modules:1234}],config:goodConfig}), null, null, 'a bundle where modules is a number should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:[{name:'name',modules:function(){}}],config:goodConfig}), null, null, 'a bundle where modules is a function should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:[{name:'name',modules:{}}],config:goodConfig}), null, null, 'a bundle where modules is an object should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:[{name:'name',modules:[1234]}],config:goodConfig}), null, null, 'a modules array containing a number should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:[{name:'name',modules:[function(){}]}],config:goodConfig}), null, null, 'a modules array containing a function should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:[{name:'name',modules:[{}]}],config:goodConfig}), null, null, 'a modules array containing an object should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:[{name:'name',modules:[[]]}],config:goodConfig}), null, null, 'a modules array containing an array should be identified as invalid');
    });

    it('should throw if there is a problem with the structure/type of the bundle data config property', function() {
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:goodBundles,config:{depCache:goodConfigDepCache}}), null, null, 'a config with no bundles should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:goodBundles,config:{bundles:'asdf',depCache:goodConfigDepCache}}), null, null, 'a config with bundles as a string should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:goodBundles,config:{bundles:1234,depCache:goodConfigDepCache}}), null, null, 'a config with bundles as a number should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:goodBundles,config:{bundles:function(){},depCache:goodConfigDepCache}}), null, null, 'a config with bundles as a function should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:goodBundles,config:{bundles:[],depCache:goodConfigDepCache}}), null, null, 'a config with bundles as an array should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:goodBundles,config:{bundles:{key:'asdf'},depCache:goodConfigDepCache}}), null, null, 'a config bundles with a property that is a string should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:goodBundles,config:{bundles:{key:1234},depCache:goodConfigDepCache}}), null, null, 'a config bundles with a property that is a number should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:goodBundles,config:{bundles:{key:function(){}},depCache:goodConfigDepCache}}), null, null, 'a config bundles with a property that is a function should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:goodBundles,config:{bundles:{key:{}},depCache:goodConfigDepCache}}), null, null, 'a config bundles with a property that is an object should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:goodBundles,config:{bundles:{key:[1234]},depCache:goodConfigDepCache}}), null, null, 'a config bundles with an array that contains a number should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:goodBundles,config:{bundles:{key:[function(){}]},depCache:goodConfigDepCache}}), null, null, 'a config bundles with an array that contains a function should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:goodBundles,config:{bundles:{key:[[]]},depCache:goodConfigDepCache}}), null, null, 'a config bundles with an array that contains an array should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:goodBundles,config:{bundles:{key:[{}]},depCache:goodConfigDepCache}}), null, null, 'a config bundles with an array that contains an object should be identified as invalid');

      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:goodBundles,config:{bundles:goodConfigBundles}}), null, null, 'a config with no depcache should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:goodBundles,config:{bundles:goodConfigBundles,depCache:'asdf'}}), null, null, 'a config with depcache as a string should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:goodBundles,config:{bundles:goodConfigBundles,depCache:1234}}), null, null, 'a config with depcache as a number should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:goodBundles,config:{bundles:goodConfigBundles,depCache:function(){}}}), null, null, 'a config with depcache as a function should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:goodBundles,config:{bundles:goodConfigBundles,depCache:[]}}), null, null, 'a config with depcache as an array should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:goodBundles,config:{bundles:goodConfigBundles,depCache:{key:'asdf'}}}), null, null, 'a config depcache with a property that is a string should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:goodBundles,config:{bundles:goodConfigBundles,depCache:{key:1234}}}), null, null, 'a config depcache with a property that is a number should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:goodBundles,config:{bundles:goodConfigBundles,depCache:{key:function(){}}}}), null, null, 'a config depcache with a property that is a function should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:goodBundles,config:{bundles:goodConfigBundles,depCache:{key:{}}}}), null, null, 'a config depcache with a property that is an object should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:goodBundles,config:{bundles:goodConfigBundles,depCache:{key:[1234]}}}), null, null, 'a config depcache with an array that contains a number should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:goodBundles,config:{bundles:goodConfigBundles,depCache:{key:[function(){}]}}}), null, null, 'a config depcache with an array that contains a function should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:goodBundles,config:{bundles:goodConfigBundles,depCache:{key:[[]]}}}), null, null, 'a config depcache with an array that contains an array should be identified as invalid');
      assert.throws(Builder.validateOptimizedBundleData.bind(Builder,{bundles:goodBundles,config:{bundles:goodConfigBundles,depCache:{key:[{}]}}}), null, null, 'a config depcache with an array that contains an object should be identified as invalid');
    });

    it('should not throw if the structure/type of the bundle data is OK', function() {
      assert.doesNotThrow(Builder.validateOptimizedBundleData.bind(Builder,{bundles:goodBundles,config:goodConfig}));
    });

    it('should allow additional properties to be included in the bundle data', function() {
      assert.doesNotThrow(Builder.validateOptimizedBundleData.bind(Builder,{bundles:goodBundles,config:goodConfig,otherData:{foo:'bar',hoo:'har'}}));
    });

  });
});


describe('optimization/prioritized', function() {
  var builder, entryPoints, traces, options,
      prioritized = require('../optimizers/prioritized'),
      modulePath = 'optimization'+path.sep,
      defaultEntryPoints = {
        ep1:'optimization/ep1',
        ep2:'optimization/ep2',
        ep3:'optimization/ep3',
        ep4:'optimization/ep4'
      },
      defaultOptions = {
        sourceMaps: false,
        uglify: false,
        minify: false,
        outputBundles: 5,
        analyze: false,
        entrypointPriorities: ['ep1','ep2','ep3','ep4']
      },
      dependencyMap = {
        ep1: ['ep1','dep1','dep2'],
        ep2: ['ep2','dep2','dep3'],
        ep3: ['ep3','dep4','dep5','dep2'],
        ep4: ['ep4','dep6'],
      };

  beforeEach(function(done) {
    builder = new Builder('./test/cfg.js');
    entryPoints = extend({},defaultEntryPoints);
    options = extend({},defaultOptions);
    var traced = {};
    Promise.all(Object.keys(entryPoints).map(function(entryPointIndex) {
      var entryPoint = entryPoints[entryPointIndex];
      return builder.trace(entryPoint).then(function(trace) {
        traced[entryPointIndex] = trace;
      });
    })).
    then(function() {
      traces = traced;
      done();
    });
  });

//   // Generic optimization function tests
//   it('should return a promise', function() {
//     assert.fail("Requires implementation");
//   });

//   describe('should resolve the promise returned with an object which', function() {

//     it('should contain the properties `bundles` and `config`', function() {
//       assert.fail("Requires implementation");
//     });

//     it('should have a `bundles` Array where each bundle is an object with the properties `name`, `modules`, `tree` and an optional `entryPoint`', function() {
//       assert.fail("Requires implementation");
//     });

//     it('should have a `config` Object which has the Object properties `depCache` and `bundles` describing the output bundles', function (){
//       // this is pretty open ended and could be split out
//       assert.fail("Requires implementation");
//     });

//   });



//   // Specific tests for _Prioritized_ optimization function
//   it('should throw if entry points provided are not an Array or an Object', function() {
//     assert.fail("Requires implementation");
//   });

//   it('should throw if entry points is an empty Array or Object', function() {
//     assert.fail("Requires implementation");
//   });

//   it('should throw if the number of output bundles is not a positive integer', function() {
//     assert.fail("Requires implementation");
//   });

//   it('should throw if the entry point priorities are not provided', function() {
//     assert.fail("Requires implementation");
//   });

//   it('should throw if "common" is used as an entry point name (as it is reserved)', function() {
//     assert.fail("Requires implementation");
//   });

//   it('should use options._builder as the builder instance if it is provided, but not fail if it isn\'t', function() {
//     assert.fail("Requires implementation");
//   });

//   describe('should identify any modules common to the dependency tree in all entry points and', function() {

//     it('should bundle them separately if the number of output bundles is more than 2', function() {
//       assert.fail("Requires implementation");
//     });

//     it('should roll them into the top priority bundle if there are 2 or fewer output bundles', function() {
//       assert.fail("Requires implementation");
//     });

//   });

//   it('should not create the highest priority bundle with its given name if it consists entirely of common modules, instead naming it "common"', function() {
//     assert.fail("Requires implementation");
//   });

//   it('should create no more than the specified number of output bundles (including the common bundle) even if there are more entry points', function() {
//     assert.fail("Requires implementation");
//   });

//   it('should create fewer than the specified number of bundles if number of entry points plus common is less than that number', function() {
//     assert.fail("Requires implementation");
//   });

//   it('should include any remaining entry points in a single bundle after the top priority entry points have had their own bundle created', function() {
//     assert.fail("Requires implementation");
//   });

//   it('should not include any one module more than once across all output bundles', function() {
//     assert.fail("Requires implementation");
//   });

//   it('should be able to write an extra bundle if there is no common bundle able to be created and there are more entry points than output bundles', function() {
//     assert.fail("Requires implementation");
//   });

//   it('should resolve the returned promise with an Object containing an `analysis` Object', function() {
//     assert.fail("Requires implementation");
//   });

//   it('should populate the `analysis` object with the expected properties (listed in test body)', function() {
//     // Properties are:
//     // - hasCommonBundle(Bool)
//     // - totalEntryPoints(Number)
//     // - totalBundles(Number)
//     // - sumOfBytesForIndividualEntryPoints(Number)
//     // - sumOfBytesForIndividualEntryPointsWithCommonBundle(Number)
//     // - sumOfBytesForBundlesWithOverlappingDeps(Number)
//     // - sumOfBytesForBundlesMinified(Number)
//     // - efficiency(Object)
//     assert.fail("Requires implementation");
//   });

//   it('should create accurate statistics for the `hasCommonBundle` property', function() {
//     assert.fail("Requires implementation");
//   });

//   it('should create accurate statistics for the `totalEntryPoints` property', function() {
//     assert.fail("Requires implementation");
//   });

//   it('should create accurate statistics for the `totalBundles` property', function() {
//     assert.fail("Requires implementation");
//   });

//   it('should create accurate statistics for the `sumOfBytesForIndividualEntryPoints` property', function() {
//     assert.fail("Requires implementation");
//   });

//   it('should create accurate statistics for the `sumOfBytesForIndividualEntryPointsWithCommonBundle` property', function() {
//     assert.fail("Requires implementation");
//   });

//   it('should create accurate statistics for the `sumOfBytesForBundlesWithOverlappingDeps` property', function() {
//     assert.fail("Requires implementation");
//   });

//   it('should create accurate statistics for the `sumOfBytesForBundlesMinified` property', function() {
//     assert.fail("Requires implementation");
//   });

//   it('should create properties named after each entry point name in the `efficiency` Object', function() {
//     assert.fail("Requires implementation");
//   });

//   it('should create accurate statistics for the `efficiency` values', function() {
//     assert.fail("Requires implementation");
//   });

  it('should output the analysis to the console if options.analyse is set to true', function(done) {
    var oldConsoleLog = console.log,
        loggedLines = [];

    console.log = function() {
      loggedLines.push(arguments);
    };
    options.analyse = true;

    prioritized(entryPoints, traces, options).
    then(function() {
      assert.isTrue(loggedLines.length > 0, 'there should be some lines loggged to the console');
      console.log = oldConsoleLog;
      done();
    });
  });

  it('should NOT output the analysis to the console if options.analyse is set to false', function(done) {
    var oldConsoleLog = console.log,
        loggedLines = [];

    console.log = function() {
      loggedLines.push(arguments);
    };
    options.analyse = false;

    prioritized(entryPoints, traces, options).
    then(function() {
      assert.equal(0, loggedLines, 'there should be no lines loggged to the console');
      console.log = oldConsoleLog;
      done();
    });
  });

});
