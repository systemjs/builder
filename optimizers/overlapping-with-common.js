var path = require("path");
var Builder = require('systemjs-builder');
var q = require('q');
var fs = require('fs');
var util = require('util');
var Promise = require('rsvp').Promise;


/**
 * Bundles all the entry points into [outputBundles] bundles
 * Options are:
 *     options.outputBundles: {Number} (required) The number of bundles to output. NB there will always be 1 core bundle so long as there is some intersection between entry points so bear that in mind.
 *     options.priorities: {String[]} (required) Array of keys matching those found in entryPoints and traces in priority order.
 *     options.analyse: {Boolean} (defaults to false) Whether or not to print an analysis of space saving / efficiency
 *     options.bundleRequirePath: {String} Path where bundles will be required from
 *
 * @param  {[String]} entryPoints   An array of entry point strings
 * @param  {Object} traces Full traces for entryPoints with the same keys
 * @param {{analyse: bool, bundleRequirePath: String, outputBundles: Number}} options Options affecting the optimization function
 * @return {Thenable}               Thenable resolved once the bundling has finished
 */
exports = function(entryPoints, traces, options) {
    if(!(entryPoints instanceof Array) || !entryPoints.length) {
        throw 'overlapping-with-common: entryPoints must be an array containing at least one entry point.';
    }
    if(!options.outputBundles || typeof options.outputBundles !== 'number') {
        throw 'overlapping-with-common: options.outputBundles must be a positive integer.';
    }
    if(!options.priorities || typeof options.priorities !== 'array') {
        throw 'overlapping-with-common: options.priorities must be an array of keys for entryPoints in priority order.';
    }

    var builder = options._builder || new Builder();

    var output = {}, commonModules,
        bundleTreesToWrite = optimiseTrees(trace, options.outputBundles, options.priorities),
        numberOfBundleTreesToWrite = Object.keys(bundleTreesToWrite),
        includedCommonModules = false;

    // see if there are any common modules
    commonModules = builder.intersectTrees.apply(builder, (function(trace){
        var trees = [];
        if(typeof trace === 'array') {
            trace.map(function(traceArrayItem){
                trees.push(traceArrayItem.tree);
            });
        }
        else {
            trees.push(trace.tree);
        }
        return trees;
    }).bind(null, trace));

    if(treePaths(commonModules).length) {
        if(numberOfBundleTreesToWrite < options.outputBundles) { // since there's space, definitely write a common modules bundle
            // only subtract the common modules from the top priority bundle as they should only appear here.
            bundleTreesToWrite[options.priorities[0]] = builder.subtractTrees(bundleTreesToWrite[options.priorities[0]], commonModules);
            bundleTreesToWrite.common = commonModules;
            includedCommonModules = true;
        }
        else if(options.outputBundles > 2) { // limited since there's no point in merging all entry point bundles to create a common module bundle!
            // only subtract the common modules from the top priority bundle as they should only appear here.
            bundleTreesToWrite[options.priorities[0]] = builder.subtractTrees(bundleTreesToWrite[options.priorities[0]], commonModules);
            bundleTreesToWrite[options.priorities[numberOfBundleTreesToWrite-2]] = builder.addTrees(bundleTreesToWrite[options.priorities[numberOfBundleTreesToWrite-2]], bundleTreesToWrite[options.priorities[numberOfBundleTreesToWrite-1]]);
            delete bundleTreesToWrite[options.priorities[numberOfBundleTreesToWrite-1]];
            bundleTreesToWrite.common = commonModules;
            includedCommonModules = true;
        }
    }

    output.bundles = bundleTreesToWrite.map(function(bundle, key) {
        return {
            name: key,
            entryPoints: entryPoints[key],
            modules: bundle.modules,
            source: bundle.source
        };
    });
    output.config = generateSystemConfig(bundlesToWrite, builder);
    output.analysis = analyse(entryPoints, fullBundleTrees, bundleTreesToWrite, options.priorities, includedCommonModules);

    if(options.analyse) {
        printAnalysis(output.analysis);
    }

    return output;
}


/**
 * Optimises an array of trees into bundles ensuring no repetition, limited in number by outputBundles
 * @param  {String[]} fullBundleTrees   An array of trees
 * @param  {Number} outputBundles The number of bundles to output.
 * @param  {String[]} priorities Array of strings mapping to keys of the fullBundleTrees object. Array is in priority order.
 * @return {Thenable}               Thenable resolved once the traces have completed with 2 values:
 *                                           1. Array of Trees describing individual finalised bundles which will all be written in one go.
 */
function optimiseTrees(fullBundleTrees, outputBundles, priorities) {
    // [Tree] - An array of Trees describing individual finalised bundles which will all be written in one go.
    var bundlesToWrite = {},
    // Tree - A tree containing all packages bundled so far in the process
        alreadyBundled = {},
    // Tree - tree generated in each loop while processing the fullBundleTrees array
        thisBundleTree,
    // Number of items processed so far
        processed = 0;

    priorities.map(function(tree, i) {
        thisBundleTree = {};
        if(!fullBundleTrees[i]) {
            continue;
        }

        if(outputBundles === processed+1){ // one bundle left to be created
            thisBundleTree = builder.addTrees(fullBundleTrees.slice(i));
        }
        else {
            thisBundleTree = tree;
        }

        // subtract already bundled packages from bundle tree
        thisBundleTree = builder.subtractTrees(thisBundleTree, alreadyBundled);

        if(treePaths(thisBundleTree).length) {
            bundlesToWrite[i] = thisBundleTree;
            alreadyBundled = builder.addTrees(alreadyBundled, thisBundleTree);
        }

        processed++;

        if(processed === bundlesToWrite.length) { // bundles limit reached
            break;
        }
    });

    return bundlesToWrite;
}


/**
 * Gets the paths contained within a tree
 * @param  {Tree} tree The tree to operate on
 * @return {[String]}      Array of paths referenced within the tree
 */
function treePaths(tree) {
    var names = [];
    for (var name in tree) {
        names.push(name);
    }

    return names;
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

    bundles.map(function(bundle) {
        var filenames = [];

        bundle.tree.map(function(tree, key) {
            if(!(builder.loader.meta && builder.loader.meta[key] && builder.loader.meta[key].build === false)) {
                filenames.push(key);
            }

            var deps = tree[key].deps.map(function(dep) {
                return tree[key].depMap[dep];
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
        output.bundles[bundle.name] = filenames;
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
 * @param  {Boolean}  commonModules  Boolean indicating whether or not the writtenBundles include a common modules bundle
 * @return {Object} Analysis object. Please see {@link printAnalysis} for an example of what this would look like
 */
function analyse(entryPoints, fullBundleTrees, writtenBundles, commonModules) {
    var output = {
            hasCommonBundle: commonModules,
            totalEntryPoints: fullBundleTrees.length,
            totalBundles: writtenBundles.length,
            sumOfBytesForIndividualEntryPoints: 0,
            sumOfBytesForIndividualEntryPointsWithCommonBundle: 0,
            sumOfBytesForBundlesWithOverlappingDeps: 0,
            sumOfBytesForBundlesMinified: 0,
            efficiency = {}
        },
        analysisTemp = '__builderAnalysisTemp.js',
        commonTree = commonModules ? writtenBundles[writtenBundles.length-1] : {},
        promiseQueue = [],
        thisEntryPointTreeMinusCommon;

    fullBundleTrees.map(function(fullBundleTree, i) {
        // individual entry points, no common module
        output.sumOfBytesForIndividualEntryPoints += getSourceLengthForTree(fullBundleTree);

        thisEntryPointTreeMinusCommon = builder.subtractTrees(fullBundleTree, commonTree);
        // individual entry points, common module
        if(commonModules) {
            output.sumOfBytesForIndividualEntryPointsWithCommonBundle += getSourceLengthForTree(thisEntryPointTreeMinusCommon);
        }

        // efficiency
        var intersection, commonFiles, unnecessaryFiles,
            totalUnnecessaryFiles = 0,
            totalFiles = Object.keys(fullBundleTree).length;

        for(var j=i-1; j>=0; j--) {
            intersection = builder.intersectTrees(fullBundleTree, fullBundleTrees[j]);
            commonFiles = Object.keys(intersection).length;
            unnecessaryFiles = Object.keys(fullBundleTrees[j]).length - commonFiles;
            if(commonFiles) {
                totalUnnecessaryFiles += unnecessaryFiles;
                totalFiles += Object.keys(fullBundleTrees[j]).length;
            }
        }

        output.efficiency[entryPoints[i]] = ((totalFiles - totalUnnecessaryFiles)/totalFiles)*100;
        efficiencyScoreSum += output.efficiency[entryPoints[i]];
    });

    return q.all(writtenBundles.map(function(bundle, key) {
        var thisAnalysisFile = analysisTemp+entryPoints[key];
        // limited bundles, with repetition
        output.sumOfBytesForBundlesWithOverlappingDeps += getSourceLengthForTree(bundle);
        // minification
        return builder.buildTree(bundle, thisAnalysisFile, {minify: true}).then(function() {
            output.sumOfBytesForBundlesMinified += fs.statSync(thisAnalysisFile)['size'];
            fs.unlink(thisAnalysisFile, function(err) {
                if(err) {
                    console.log('Error deleting temp file '+thisAnalysisFile, err);
                }
            });
        });
    })).
    then(function() {
        return output;
    },
    function(err) {
        console.log('Error creating analysis.', err);
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
    var previousBytes, efficiencySum=0;

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
    analysis.efficiency.map(function(efficiency, entryPoint) {
        output.push(util.format('%s: %d%%', entryPoint, Math.ceil(efficiency)));
        efficiencySum += efficiency;
    });
    output.push('');
    output.push(util.format('Average efficiency: %d%%', Math.ceil(efficiencySum/analysis.efficiency.length)));
    output.push('');

    console.log(output.join("\n"));
}
