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

  // it('should output the analysis to the console if options.analyse is set to true', function(done) {
  //   var oldConsoleLog = console.log,
  //       loggedLines = [];

  //   console.log = function() {
  //     loggedLines.push(arguments);
  //   };
  //   options.analyse = true;

  //   prioritized(entryPoints, traces, options).
  //   then(function() {
  //     assert.isTrue(loggedLines.length > 0, 'there should be some lines loggged to the console');
  //     console.log = oldConsoleLog;
  //     done();
  //   });
  // });

  // it('should NOT output the analysis to the console if options.analyse is set to false', function(done) {
  //   var oldConsoleLog = console.log,
  //       loggedLines = [];

  //   console.log = function() {
  //     loggedLines.push(arguments);
  //   };
  //   options.analyse = false;

  //   prioritized(entryPoints, traces, options).
  //   then(function() {
  //     assert.equal(0, loggedLines, 'there should be no lines loggged to the console');
  //     console.log = oldConsoleLog;
  //     done();
  //   });
  // });

});
