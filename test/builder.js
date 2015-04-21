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

describe('Builder', function() {

  describe('#optimizeBuild', function() {

    var entryPoints, entryPointsArray, o11Function, options, instance,
        outputPath = path.resolve(['optimization','output'].join(path.sep))+path.sep,
        configFilename = 'config.js',
        defaultEntryPoints = {
          ep1:'ep1',
          ep2:'ep2',
          ep3:'ep3',
          ep4:'ep4'
        },
        defaultEntryPointsArray = ['ep1','ep2','ep3','ep4'],
        defaultO11Function = function(entryPoints, traces, optimizationOptions) {
          // This test function just does a trace on each entry point and returns that.
          // Highly inefficient but easy to test.

          var depCache={}, configBundles={}, bundles=[];

          Object.keys(traces).map(function(name) {
            var trace = traces[name],
                tree = trace,
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
      instance = new Builder('./test/fixtures/optimization.config.js');
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
          dependencyMap[entryPoint].map(function(dependency) {
            var treeKeys = Object.keys(traces[entryPoint]);
            assert.include(treeKeys, dependency, 'traces.'+entryPoint+' should have a property named "'+dependency+'"');
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

      instance.optimizeBuild({ep4:'ep4'}, o11Function, options).
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

      instance.optimizeBuild({ep4:'ep4'}, o11Function, options).
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