var path = require("path");
var Builder = require('../lib/builder');
var fs = require('fs');
var util = require('util');
var Promise = require('rsvp').Promise;


/**
 * Bundles all the entry points into [outputBundles] bundles
 * Options are:
 *     options.outputBundles: {Number} (required) The number of bundles to output. NB there will always be 1 core bundle so long as there is some intersection between entry points so bear that in mind.
 *     options.entrypointPriorities: {String[]} (required) Array of keys matching those found in entryPoints and traces in priority order.
 *     options.analyse: {Boolean} (defaults to false) Whether or not to print an analysis of space saving / efficiency
 *     options.bundleRequirePath: {String} Path where bundles will be required from
 *
 * @param  {[String]|Object} entryPoints   An array of entry point strings
 * @param  {Object} traces Full traces for entryPoints with the same keys
 * @param {{analyse: bool, bundleRequirePath: String, outputBundles: Number}} options Options affecting the optimization function
 * @return {Thenable}               Thenable resolved once the bundling has finished
 */
module.exports = function(entryPoints, traces, options) {
    if(!(entryPoints instanceof Array && entryPoints.length) &&
      !(typeof entryPoints === 'object' && Object.keys(entryPoints).length)) {
        throw 'prioritized: entryPoints must be an Array or an Object containing at least one entry point.';
    }
    if(!options.outputBundles || typeof options.outputBundles !== 'number') {
        throw 'prioritized: options.outputBundles must be a positive integer.';
    }
    if(!options.entrypointPriorities || !(options.entrypointPriorities instanceof Array)) {
        throw 'prioritized: options.entrypointPriorities must be an array of keys for entryPoints in priority order.';
    }
    if(entryPoints.common !== undefined) {
        throw 'prioritized: using "common" as an entry point name is not allowed as the name is reserved.';
    }

    var builder = options._builder || new Builder();

    var output = {}, commonModules,
        bundleTreesToWrite = optimiseTrees(traces, options.outputBundles, options.entrypointPriorities),
        numberOfBundleTreesToWrite = Object.keys(bundleTreesToWrite).length,
        includedCommonModules = false;

    // see if there are any common modules
    commonModules = Builder.intersectTrees.apply(Builder, (function(traces){
        return Object.keys(traces).map(function(traceKey) {
            return traces[traceKey].tree;
        });
    }).bind(null, traces)());

    if(Object.keys(commonModules).length) {
        // only subtract the common modules from the top priority bundle as they should only appear here.
        var firstBundleWithoutCommon = Builder.subtractTrees(bundleTreesToWrite[options.entrypointPriorities[0]], commonModules);

        if(Object.keys(firstBundleWithoutCommon).length === 0) {
            // if subtracting common modules from the first bundle leaves us with nothing, it's 100% common modules.
            // Scrap the first bundle and always write the common bundle.
            delete bundleTreesToWrite[options.entrypointPriorities[0]];
            delete traces[options.entrypointPriorities[0]];
            for(var i in entryPoints) {
                if(entryPoints[i] == options.entrypointPriorities[0]) {
                    delete entryPoints[i];
                }
            }
            options.entrypointPriorities.splice(0,1);
            bundleTreesToWrite.common = commonModules;
            includedCommonModules = true;
        }
        else if(numberOfBundleTreesToWrite < options.outputBundles) { // since there's space, definitely write a common modules bundle
            bundleTreesToWrite[options.entrypointPriorities[0]] = firstBundleWithoutCommon;
            bundleTreesToWrite.common = commonModules;
            includedCommonModules = true;
        }
        else if(options.outputBundles > 2) { // limited since there's no point in merging all entry point bundles to create a common module bundle!
            bundleTreesToWrite[options.entrypointPriorities[0]] = firstBundleWithoutCommon;
            bundleTreesToWrite[options.entrypointPriorities[numberOfBundleTreesToWrite-2]] = Builder.addTrees(bundleTreesToWrite[options.entrypointPriorities[numberOfBundleTreesToWrite-2]], bundleTreesToWrite[options.entrypointPriorities[numberOfBundleTreesToWrite-1]]);
            delete bundleTreesToWrite[options.entrypointPriorities[numberOfBundleTreesToWrite-1]];
            bundleTreesToWrite.common = commonModules;
            includedCommonModules = true;
        }
    }

    output.bundles = Object.keys(bundleTreesToWrite).map(function(key) {
        var bundle = bundleTreesToWrite[key];

        return {
            name: key,
            entryPoint: options.bundleNameMap ? entryPoints[options.bundleNameMap[key]] : entryPoints[key],
            modules: Object.keys(bundle),
            tree: bundle
        };
    });

    output.config = generateSystemConfig(bundleTreesToWrite, builder);

    return analyse(entryPoints, traces, bundleTreesToWrite, includedCommonModules, options.entrypointPriorities, builder).
        then(function(analysis) {
            output.analysis = analysis;
            if(options.analyse) {
                printAnalysis(output.analysis);
            }

            return output;
        });
}


/**
 * Optimises an array of trees into bundles ensuring no repetition, limited in number by outputBundles
 * @param  {Object[]} fullBundleTrees   An array of trees
 * @param  {Number} outputBundles The number of bundles to output.
 * @param  {String[]} priorities Array of strings mapping to keys of the fullBundleTrees object. Array is in priority order.
 * @return {Object} Object containing Trees describing individual finalised bundles which will all be written in one go, indexed by bundle name.
 */
function optimiseTrees(fullBundleTrees, outputBundles, priorities) {
    // [Tree] - An array of Trees describing individual finalised bundles which will all be written in one go.
    var bundlesToWrite = {},
    // Tree - A tree containing all packages bundled so far in the process
        alreadyBundled = {},
    // Tree - tree generated in each loop while processing the fullBundleTrees array
        thisBundleTree,
        bundlesGenerated = 0,
        key;

    for(var i=0; i<priorities.length; i++) {
        key = priorities[i];
        thisBundleTree = {};
        if(outputBundles === bundlesGenerated+1){ // one bundle left to be created
            thisBundleTree = Builder.addTrees.apply(Builder, priorities.slice(i).map(function(bundleName) {
                return fullBundleTrees[bundleName].tree;
            }));
        }
        else {
            thisBundleTree = fullBundleTrees[priorities[i]].tree;
        }

        // subtract already bundled packages from bundle tree
        thisBundleTree = Builder.subtractTrees(thisBundleTree, alreadyBundled);

        if(Object.keys(thisBundleTree).length) {
            bundlesToWrite[key] = thisBundleTree;
            bundlesGenerated++;
            alreadyBundled = Builder.addTrees(alreadyBundled, thisBundleTree);
        }

        if(outputBundles === bundlesGenerated) { // bundles limit reached
            break;
        }
    }

    return bundlesToWrite;
}


/**
 * Defines how the System.js config should be written
 * @param  {Object} bundles Object containing trees
 * @param  {Builder} builder System.js builder instance
 * @return {{bundles: Object, depCache: Object}} Returns an object with bundles and depCache properties
 */
function generateSystemConfig(bundles, builder) {
    var output = {
            bundles: {},
            depCache: {}
        };

    Object.keys(bundles).map(function(bundleKey) {
        var bundle = bundles[bundleKey],
            filenames = [];

        Object.keys(bundle).map(function(key) {
            var tree = bundle[key];
            if(!(builder.loader.meta && builder.loader.meta[key] && builder.loader.meta[key].build === false)) {
                filenames.push(key);
            }

            var deps = tree.deps.map(function(dep) {
                return tree.depMap[dep];
            });

            if (deps.length) {
                if(output.depCache[key] !== undefined) {
                    throw new Error('generateSystemConfig: duplicate depCache entry for "'+key+'"');
                }
                output.depCache[key] = deps;
            }
        });

        if(output.bundles[bundle.name] !== undefined) {
            throw new Error('generateSystemConfig: duplicate bundles entry for "'+bundle.name+'"');
        }
        output.bundles[bundleKey] = filenames;
    });

    return output;
}


/**
 * Gets the length (in bytes) of the source for all modules in a Tree
 * @param  {Tree} tree The tree to analyse
 * @return {Number}      The length of the source
 */
function getSourceLengthForTree(tree) {
    var len = 0;
    for(var i in tree) {
        if(tree.hasOwnProperty(i)) {
            len += (tree[i].source && tree[i].source.length) ? tree[i].source.length : 0;
        }
    }

    return len;
}


/**
 * Analyses the bundles written and how efficient they are in terms of bytes
 * @param  {[String]} entryPoints Array of strings containing the entry points
 * @param  {[Tree]}   fullBundleTrees Array of trees for each entry point
 * @param  {[Tree]}   writtenBundles  Array of trees written as bundles
 * @param  {Boolean}  commonModulesExist  Boolean indicating whether or not the writtenBundles include a common modules bundle
 * @param  {String[]} priorities Priorities list
 * @param  {Builder} builder Builder instance
 * @return {Thenable} Promise resolved with an analysis object. Please see {@link printAnalysis} for an example of what this would look like
 */
function analyse(entryPoints, fullBundleTrees, writtenBundles, commonModulesExist, priorities, builder) {
    var output = {
            hasCommonBundle: commonModulesExist,
            totalEntryPoints: Object.keys(fullBundleTrees).length,
            totalBundles: Object.keys(writtenBundles).length,
            sumOfBytesForIndividualEntryPoints: 0,
            sumOfBytesForIndividualEntryPointsWithCommonBundle: 0,
            sumOfBytesForBundlesWithOverlappingDeps: 0,
            sumOfBytesForBundlesMinified: 0,
            efficiency: {}
        },
        analysisTemp = '__builderAnalysisTemp',
        commonTree = commonModulesExist ? writtenBundles['common'] : {},
        promiseQueue = [],
        thisEntryPointTreeMinusCommon;

    var fullBundleTreesKeys = Object.keys(fullBundleTrees);
    fullBundleTreesKeys.map(function(fullBundleTreeKey, i) {
        var fullBundleTree = fullBundleTrees[fullBundleTreeKey].tree;
        // individual entry points, no common module
        output.sumOfBytesForIndividualEntryPoints += getSourceLengthForTree(fullBundleTree);

        thisEntryPointTreeMinusCommon = Builder.subtractTrees(fullBundleTree, commonTree);

        // individual entry points, common module
        if(commonModulesExist) {
            output.sumOfBytesForIndividualEntryPointsWithCommonBundle += getSourceLengthForTree(thisEntryPointTreeMinusCommon);
        }

        // efficiency
        var intersection, commonFiles, unnecessaryFiles,
            totalUnnecessaryFiles = 0,
            totalFiles = Object.keys(fullBundleTree).length;

        for(var j=i-1; j>=0; j--) {
            intersection = Builder.intersectTrees(fullBundleTree, fullBundleTrees[fullBundleTreesKeys[j]].tree);
            commonFiles = Object.keys(intersection).length;
            unnecessaryFiles = Object.keys(fullBundleTrees[fullBundleTreesKeys[j]].tree).length - commonFiles;
            if(commonFiles) {
                totalUnnecessaryFiles += unnecessaryFiles;
                totalFiles += Object.keys(fullBundleTrees[fullBundleTreesKeys[j]].tree).length;
            }
        }

        output.efficiency[entryPoints[i]] = ((totalFiles - totalUnnecessaryFiles)/totalFiles)*100;
    });

    return Promise.all(Object.keys(writtenBundles).map(function(key) {
        var bundle = writtenBundles[key],
            thisAnalysisFile = analysisTemp+'_'+key+'.js';

        // limited bundles, with repetition
        output.sumOfBytesForBundlesWithOverlappingDeps += getSourceLengthForTree(bundle);
        // minification
        return builder.buildTree(bundle, thisAnalysisFile, {minify: true}).then(function(builtTree) {
            output.sumOfBytesForBundlesMinified += fs.statSync(thisAnalysisFile)['size'];
            fs.unlink(thisAnalysisFile, function(err) {
                if(err) {
                    console.log('Error deleting temp file '+thisAnalysisFile, err);
                }
            });
            return builtTree;
        });
    })).
    then(function() {
        return output;
    },
    function(err) {
        console.log('Error creating analysis.', err, err.stack);
    });
}


/**
 * Formats and prints to the console the analysis provided.
 * @param {Object} analysis The analysis object generated by analyse
 * @example
 * printAnaylsis({
 *     totalEntryPoints: 20,
 *     totalBundles: 4,
 *     sumOfBytesForIndividualEntryPoints: 123456,
 *     sumOfBytesForIndividualEntryPointsWithCommonBundle: 100000,
 *     sumOfBytesForBundlesWithOverlappingDeps: 80000,
 *     sumOfBytesForBundlesMinified: 20000,
 *     hasCommonBundle: true,
 *     efficiency: {
 *         'path/to/entryPoint1': 100,
 *         'path/to/entryPoint2': 76
 *         'path/to/entryPoint3': 57
 *     }
 * });
 */
function printAnalysis(analysis) {
    var previousBytes, efficiencySum=0, output=[];

    output.push('');
    output.push('Analysis');
    output.push('========');
    output.push('');
    output.push('Bytes saved');
    output.push('-----------');
    output.push('');
    output.push(util.format('%d Individual entry points bundles with repetition, total bytes: %d', analysis.totalEntryPoints, analysis.sumOfBytesForIndividualEntryPoints));

    previousBytes = analysis.sumOfBytesForIndividualEntryPoints;

    if(analysis.hasCommonBundle) {
        output.push(util.format('%d Individial entry points bundles with 1 common modules bundle, total bytes: %d (saving %d bytes over previous)', analysis.totalEntryPoints, analysis.sumOfBytesForIndividualEntryPointsWithCommonBundle, previousBytes - analysis.sumOfBytesForIndividualEntryPointsWithCommonBundle));
        previousBytes = analysis.sumOfBytesForIndividualEntryPointsWithCommonBundle;
    }

    output.push(util.format('%d entry point bundles%s, total bytes: %d (saving %d bytes over previous)', analysis.totalBundles - analysis.hasCommonBundle, analysis.hasCommonBundle ? ', 1 common bundle' : '', analysis.sumOfBytesForBundlesWithOverlappingDeps, previousBytes - analysis.sumOfBytesForBundlesWithOverlappingDeps));
    previousBytes = analysis.sumOfBytesForBundlesWithOverlappingDeps;

    output.push(util.format('Bytes saved by bundling: %d', analysis.sumOfBytesForIndividualEntryPoints - previousBytes));

    output.push('');
    output.push('Minification');
    output.push('-------------');
    output.push('');
    output.push(util.format('After minification: %d bytes (a further %d bytes saved)', analysis.sumOfBytesForBundlesMinified, previousBytes - analysis.sumOfBytesForBundlesMinified));
    output.push('');
    output.push('Efficiency');
    output.push('----------');
    output.push('');
    output.push('(in % of code loaded that was essential for that entry point)');
    output.push('');
    Object.keys(analysis.efficiency).map(function(entryPoint) {
        var efficiency = analysis.efficiency[entryPoint];
        output.push(util.format('%s: %d%%', entryPoint, Math.ceil(efficiency)));
        efficiencySum += efficiency;
    });
    output.push('');
    output.push(util.format('Average efficiency: %d%%', Math.ceil(efficiencySum/Object.keys(analysis.efficiency).length)));
    output.push('');

    console.log(output.join("\n"));
}
