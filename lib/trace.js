var getCanonicalName = require('./utils').getCanonicalName;
var glob = require('glob');
var toFileURL = require('./utils').toFileURL;
var fromFileURL = require('./utils').fromFileURL;
var asp = require('rsvp').denodeify;
var fs = require('fs');
var Graph = require('algorithms/data_structures/graph');
var depthFirst = require('algorithms/graph').depthFirstSearch;
var path = require('path');
var extend = require('./utils').extend;

module.exports = Trace;

function Trace(loader, traceCache) {
  this.loader = loader;
  // stored traced load records
  this.loads = traceCache || {};
  // in progress traces
  this.tracing = {};
}

/*
 * High-level functions
 */
var namedRegisterRegEx = /(System\.register(Dynamic)?|define)\(('[^']+'|"[^"]+")/g;
Trace.prototype.traceModule = function(moduleName, traceAllConditionals, conditionalEnv, conditionsOnly) {
  var loader = this.loader;

  var self = this;
  
  return Promise.resolve(loader.normalize(moduleName))
  .then(function(_moduleName) {
    moduleName = getCanonicalName(loader, _moduleName);
    if (!conditionsOnly)
      return self.getAllLoadRecords(moduleName, traceAllConditionals, conditionalEnv);
    else
      return self.getConditionLoadRecords(moduleName, conditionalEnv);
  })
  .then(function(loads) {
    // if it is a bundle, we just use a regex to extract the list of loads
    // as "true" records for subtraction arithmetic use only
    var thisLoad = loads[moduleName];

    if (thisLoad && !thisLoad.conditional && thisLoad.metadata.bundle) {
      namedRegisterRegEx.lastIndex = 0;
      var curMatch;
      while ((curMatch = namedRegisterRegEx.exec(thisLoad.source)))
        loads[curMatch[3].substr(1, curMatch[3].length - 2)] = true;
    }

    return {
      moduleName: moduleName,
      tree: loads
    };
  });
};

/*
 * Low-level functions
 */
// runs the pipeline hooks, returning the load record for a module
Trace.prototype.getLoadRecord = function(canonical) {
  var loader = this.loader;
  var loads = this.loads;

  // modules starting with "@" are assumed system modules
  if (canonical.substr(0, 1) == '@')
    return Promise.resolve(false);

  if (loads[canonical])
    return Promise.resolve(loads[canonical]);

  if (this.tracing[canonical])
    return this.tracing[canonical];

  var self = this;
  var isPackageConditional = canonical.indexOf('#:') != -1;
  return this.tracing[canonical] = Promise.resolve(loader.normalize(canonical))
  .then(function(normalized) {
    // package conditional fallback normalization
    if (!isPackageConditional)
      normalized = normalized.replace('#:', '/');
    // -- conditional load record creation: sourceless intermediate load record --

    // boolean conditional
    var booleanIndex = canonical.lastIndexOf('#?');
    if (booleanIndex != -1) {
      var condition = canonical.substr(booleanIndex + 2)
      if (condition.indexOf('|') == -1)
        condition += '|default';
      return {
        name: canonical,
        conditional: {
          condition: condition,
          branch: canonical.substr(0, booleanIndex)
        }
      };
    }

    // package environment conditional
    var pkgEnvIndex = canonical.indexOf('#:');
    if (pkgEnvIndex != -1) {
      // NB handle a package plugin load here too
      if (canonical.indexOf('!') != -1)
        throw new Error('Unable to trace ' + canonical + ' - building package environment mappings of plugins is not currently supported.');

      var pkgName = canonical.substr(0, pkgEnvIndex);
      var subPath = canonical.substr(pkgEnvIndex + 2);

      var normalizedPkgName = loader.normalizeSync(pkgName + '/');
      normalizedPkgName = normalizedPkgName.substr(0, normalizedPkgName.length - 1);

      var pkg = loader.packages[normalizedPkgName];


      // effective analog of the same function in SystemJS packages.js
      // to work out the path with defaultExtension added.
      // we cheat here and use normalizeSync to apply the right checks, while 
      // skipping any map entry by temporarily removing it.
      function toPackagePath(subPath) {
        var pkgMap = pkg.map;
        pkg.map = {};
        var normalized = loader.normalizeSync(pkgName + '/' + subPath);
        pkg.map = pkgMap;
        return normalized;
      }

      var envMap = pkg.map['./' + subPath];
      var metadata = {};
      var fallback;
      
      // resolve the fallback
      return Promise.resolve()
      .then(function() {
        return loader.locate({ name: toPackagePath(subPath), metadata: metadata })
      })
      .then(function(address) {
        // allow build: false trace opt-out
        if (metadata.build === false)
          return false;

        fallback = getCanonicalName(loader, address);

        // check if the fallback exists
        return new Promise(function(resolve) {
          fs.exists(fromFileURL(address), resolve);
        })
        .then(function(fallbackExists) {
          if (!fallbackExists)
            fallback = null;
        });
      })
      .then(function() {
        // environment trace
        return loader.normalize(pkg.map['@env'] || '@system-env')
        .then(function(normalizedCondition) {
          var conditionModule = getCanonicalName(loader, normalizedCondition);

          return Promise.all(Object.keys(envMap).map(function(envCondition) {
            var mapping = envMap[envCondition];
            var negate = envCondition[0] == '~';

            return Promise.resolve()
            .then(function() {
              if (mapping == '.')
                return normalizedPkgName;
              else if (mapping.substr(0, 2) == './')
                return toPackagePath(mapping.substr(2))
              else
                return loader.normalize(mapping);
            })
            .then(function(normalizedMapping) {
              return {
                condition: (negate ? '~' : '') + conditionModule + '|' + (negate ? envCondition.substr(1) : envCondition),
                branch: getCanonicalName(loader, normalizedMapping)
              };
            });
          }));
        })
        .then(function(envs) {
          return {
            name: canonical,
            conditional: {
              envs: envs,
              fallback: fallback
            }
          };
        });
      });
    }

    // conditional interpolation
    var interpolationRegEx = /#\{[^\}]+\}/;
    var interpolationMatch = canonical.match(interpolationRegEx);
    if (interpolationMatch) {
      var condition = interpolationMatch[0].substr(2, interpolationMatch[0].length - 3);

      if (condition.indexOf('|') == -1)
        condition += '|default';

      var metadata = {};
      return Promise.resolve(loader.locate({ name: normalized.replace(interpolationRegEx, '*'), metadata: metadata }))
      .then(function(address) {
        // allow build: false trace opt-out
        if (metadata.build === false)
          return false;

        // glob the conditional interpolation variations from the filesystem
        if (address.substr(0, 8) != 'file:///')
          throw new Error('Error tracing ' + canonical + '. It is only possible to trace conditional interpolation for modules resolving to local file:/// URLs during the build.');

        var globIndex = address.indexOf('*');
        return asp(glob)(fromFileURL(address), { dot: true, nobrace: true, noglobstar: true, noext: true, nodir: true })
        .then(function(paths) {
          var branches = {};
          paths.forEach(function(path) {
            path = toFileURL(path);

            var pathCanonical = getCanonicalName(loader, path);
            var interpolate = pathCanonical.substr(interpolationMatch.index, path.length - address.length + 1);

            if (metadata.plugin) {
              if (loader.pluginFirst)
                pathCanonical = metadata.plugin + '!' + pathCanonical;
              else
                pathCanonical = pathCanonical + '!' + metadata.plugin;
            }
            branches[interpolate] = pathCanonical;
          });

          return {
            name: canonical,
            conditional: {
              condition: condition,
              branches: branches
            }
          };
        });
      });
    }

    // -- trace loader hooks --
    var load = {
      name: canonical,
      // baseURL-relative path to address
      path: null,
      metadata: null,
      deps: null,
      depMap: null,
      source: null,

      // represents a build: false plugin that will not be built out for production
      runtimePlugin: null
    };
    var curHook = 'locate';
    return Promise.resolve(loader.locate({ name: normalized, metadata: load.metadata = {}}))
    .then(function(address) {
      curHook = '';

      // build: false build config - null load record
      if (load.metadata.build === false)
        return false;

      // build: false plugins - runtime plugins
      if (load.metadata.loaderModule && load.metadata.loaderModule.build === false)
        return Promise.resolve(loader.normalize(load.metadata.loader, normalized))
        .then(function(pluginNormalized) {
          load.runtimePlugin = getCanonicalName(loader, pluginNormalized);
          return load;
        });

      load.path = path.relative(fromFileURL(loader.baseURL), fromFileURL(address));

      var originalSource;

      curHook = 'fetch';
      return Promise.resolve(loader.fetch({ name: normalized, metadata: load.metadata, address: address }))
      .then(function(source) {
        originalSource = source;
        curHook = 'translate';
        return loader.translate({ name: normalized, metadata: load.metadata, address: address, source: source });
      })
      .then(function(source) {
        load.source = source;
        curHook = 'instantiate';
        return loader.instantiate({ name: normalized, metadata: load.metadata, address: address, source: source });
      })
      .then(function(result) {
        curHook = '';
        if (!result)
          throw new TypeError('Native ES Module builds not supported. Ensure transpilation is included in the loader pipeline.');

        load.deps = result.deps;

        // es modules currently translate to get the source, so we need to revert for re-compilation
        // this will go away with transpilers as plugins
        if (load.metadata.format == 'esm')
          load.source = originalSource;

        // normalize dependencies to populate depMap
        load.depMap = {};
        return Promise.all(result.deps.map(function(dep) {
          return loader.normalize(dep, normalized, address)
          .then(function(normalized) {
            load.depMap[dep] = getCanonicalName(loader, normalized);
          });
        }));
      })
      .catch(function(err) {
        var msg = (curHook ? ('Error on ' + curHook + ' for ') : 'Error tracing ') + canonical + ' at ' + normalized;

        // rethrow loader hook errors with the hook information
        var newErr;
        if (err instanceof Error) {
          var newErr = new Error(err.message, err.fileName, err.lineNumber);
          // node errors only look correct with the stack modified
          newErr.message = err.message;
          newErr.stack = msg + '\n\t' + err.stack + '\n\t';
        }
        else {
          newErr = err + '\n\t' + msg;
        }

        throw newErr;
      })
      .then(function() {
        // remove unnecessary metadata for trace
        delete load.metadata.entry;
        delete load.metadata.builderExecute;
        delete load.metadata.parseTree;

        return load;
      });
    });
  })
  .then(function(load) {
    return loads[canonical] = load;
  });
};

/*
 * Returns the full trace tree of a module
 * 
 * - traceAllConditionals indicates if conditional boundaries should be traversed during the trace.
 * - conditionalEnv represents the conditional tracing environment module values to impose on the trace
 *   forcing traces for traceAllConditionals false, and skipping traces for traceAllConditionals true.
 * 
 * conditionalEnv provides canonical condition tracing rules of the form:
 * 
 *  {
 *    'some/interpolation|value': true, // include ALL variations
 *    'another/interpolation|value': false, // include NONE
 *    'custom/interpolation|value': ['specific', 'values']
 *
 *    // default BOOLEAN entry::
 *    '@system-env|browser': false,
 *    '~@system-env|browser': false
 *
 *    // custom boolean entry
 *    // boolean only checks weak truthiness to allow overlaps
 *    '~@system-env|node': true
 *  }
 *
 */
Trace.prototype.getAllLoadRecords = function(canonical, traceAllConditionals, conditionalEnv, curLoads) {
  var loader = this.loader;

  curLoads = curLoads || {};

  if (canonical in curLoads)
    return curLoads;

  var self = this;
  return this.getLoadRecord(canonical)
  .then(function(load) {
    // conditionals, build: false and system modules are falsy loads in the trace trees
    // (that is, part of depcache, but not built)
    // we skip system modules starting with @ though
    if (canonical[0] != '@')
      curLoads[canonical] = load;

    if (load)
      return Promise.all(Trace.getLoadDependencies(load, traceAllConditionals, conditionalEnv).map(function(dep) {
        return self.getAllLoadRecords(dep, traceAllConditionals, conditionalEnv, curLoads);
      }));
  })
  .then(function() {
    return curLoads;
  });
};

// helper function -> returns the "condition" build of a tree
// that is the modules needed to determine the exact conditional solution of the tree
Trace.prototype.getConditionLoadRecords = function(canonical, conditionalEnv, inConditionTree, curLoads) {
  var loader = this.loader;

  curLoads = curLoads || {};

  if (canonical in curLoads)
    return curLoads;

  var self = this;
  return this.getLoadRecord(canonical)
  .then(function(load) {
    if (inConditionTree && canonical[0] != '@')
      curLoads[canonical] = load;

    if (load)
      // trace into the conditions themselves
      return Promise.all(Trace.getLoadDependencies(load, true, conditionalEnv, true).map(function(dep) {
        return self.getConditionLoadRecords(dep, conditionalEnv, true, curLoads);
      }))
      .then(function() {
        // trace non-conditions
        return Promise.all(Trace.getLoadDependencies(load, true, conditionalEnv).map(function(dep) {
          return self.getConditionLoadRecords(dep, conditionalEnv, inConditionTree, curLoads);
        }));
      });
  })
  .then(function() {
    return curLoads;
  });
}

function conditionalComplement(condition) {
  var negative = condition[0] == '~';
  return (negative ? '' : '~') + condition.substr(negative);
}

/*
 * to support static conditional builds, we use the conditional tracing options
 * to inline resolved conditions for the trace
 * basically rewriting the tree without any conditionals
 * where conditions are still present or conflicting we throw an error
 */
Trace.prototype.inlineConditions = function(tree, conditionalEnv) {
  var inconsistencyErrorMsg = 'For static condition inlining only an exact environment resolution can be built, pending https://github.com/systemjs/builder/issues/311.';
  
  // ensure we have no condition conflicts
  for (var c in conditionalEnv) {
    var val = conditionalEnv[c];
    if (typeof val == 'string')
      continue;
    var complement = conditionalComplement(c);
    if (val instanceof Array || complement in conditionalEnv && conditionalEnv[complement] != !conditionalEnv[c])
      throw new TypeError('Error building condition ' + c + '. ' + inconsistencyErrorMsg);
  }

  var conditionalResolutions = {};

  var self = this;

  // for each conditional in the tree, work out its substitution
  Object.keys(tree)
  .filter(function(m) {
    return tree[m] && tree[m].conditional;
  })
  .forEach(function(c) {
    var resolution = Trace.getConditionalResolutions(tree[c].conditional, false, conditionalEnv);

    var branches = resolution.branches;
    if (branches.length > 1)
      throw new TypeError('Error building condition ' + c + '. ' + inconsistencyErrorMsg);
    if (branches.length == 0)
      throw new TypeError('No resolution found at all for condition ' + c + '.');

    conditionalResolutions[c] = branches[0];
  });

  // finally we do a deep clone of the tree, applying the conditional resolutions as we go
  var inlinedTree = {};
  Object.keys(tree).forEach(function(m) {
    var load = tree[m];

    if (typeof load == 'boolean') {
      inlinedTree[m] = load;
      return;
    }

    if (load.conditional)
      return;

    var clonedLoad = extend({}, load);
    clonedLoad.depMap = {};
    Object.keys(load.depMap).forEach(function(d) {
      var normalizedDep = load.depMap[d];
      clonedLoad.depMap[d] = conditionalResolutions[normalizedDep] || normalizedDep;
    });

    inlinedTree[m] = clonedLoad;
  });

  return inlinedTree;
};

Trace.getConditionalResolutions = function(conditional, traceAllConditionals, conditionalEnv) {
  if (traceAllConditionals !== false)
    traceAllConditionals = true;
  conditionalEnv = conditionalEnv || {};

  // flattens all condition objects into a resolution object
  // with the condition module and possible branches given the environment segment
  var resolution = { condition: null, branches: [] };

  function envTrace(condition) {
    // trace the condition modules as dependencies themselves
    var negate = condition[0] == '~';
    resolution.condition = condition.substr(negate, condition.lastIndexOf('|') - negate);

    // return the environment trace info
    var envTrace = conditionalEnv[condition];
    return envTrace === undefined ? traceAllConditionals : envTrace;
  }

  var deps = [];

  // { condition, branch } boolean conditional
  if (conditional.branch) {
    if (envTrace(conditional.condition))
      resolution.branches.push(conditional.branch);
    else
      resolution.branches.push('@empty');
  }

  // { envs: [{condition, branch},...], fallback } package environment map
  else if (conditional.envs) {
    var doFallback = conditional.envs.some(function(env) {
      if (envTrace(env.condition))
        resolution.branches.push(env.branch);

      // if we're specifically not tracing the negative of this condition
      // then we stop the fall-through
      return envTrace(conditionalComplement(env.condition));
    });
    var resolutionCondition = resolution.condition;
    if (doFallback && conditional.fallback)
      resolution.branches.push(conditional.fallback);
  }

  // { condition, branches } conditional interpolation
  else if (conditional.branches) {
    var et = envTrace(conditional.condition);
    if (et !== undefined && et !== false) {
      Object.keys(conditional.branches).forEach(function(branch) {
        var dep = conditional.branches[branch];
        if (et === true)
          resolution.branches.push(dep);
        else if (et.indexOf(branch) != -1)
          resolution.branches.push(dep);
      });
    }
  }

  return resolution;
};

// Returns the ordered immediate dependency array from the trace of a module
Trace.getLoadDependencies = function(load, traceAllConditionals, conditionalEnv, conditionsOnly) {
  if (traceAllConditionals !== false)
    traceAllConditionals = true;
  conditionalEnv = conditionalEnv || {};

  if (!load.conditional && conditionsOnly)
    return [];

  // conditional load records have their branches all included in the trace
  if (load.conditional) {
    var resolution = Trace.getConditionalResolutions(load.conditional, traceAllConditionals, conditionalEnv);
    if (conditionsOnly)
      return [resolution.condition];
    else
      return [resolution.condition].concat(resolution.branches);
  }

  // if this record uses a runtime plugin (build: false), trace the plugin
  if (load.runtimePlugin)
    return [load.runtimePlugin];

  // standard dep trace
  return load.deps.map(function(dep) {
    return load.depMap[dep];
  });
};

function getGraphEntryPoints(graph, entryPoints) {
  entryPoints = [].concat(entryPoints || []);

  var modules = Object.keys(graph.adjList);
  var discarded = {};

  modules.forEach(function (moduleName) {
    Object.keys(graph.adjList[moduleName]).forEach(function (depName) {
      discarded[depName] = true;
    });
  });

  modules.filter(function (moduleName) {
    return !discarded[moduleName];
  }).sort().forEach(function (moduleName) {
    if (entryPoints.indexOf(moduleName) === -1) {
      entryPoints.push(moduleName);
    }
  });
  return entryPoints;
}

Trace.getTreeModulesPostOrder = function getTreeModulesPostOrder(tree, entryPoints) {
  // Post order traversal sorted module list
  var postOrder = [];
  var graph = new Graph(true);

  // Seed graph with all relations
  Object.keys(tree).forEach(function (moduleName) {
    var load = tree[moduleName];

    if (!load)
      return;

    if (!graph.adjList[moduleName]) {
      graph.addVertex(moduleName);
    }

    Trace.getLoadDependencies(load).forEach(function (depName) {
      graph.addEdge(moduleName, depName);
    });
  });

  // Post order traversal of graph, one per entryPoint
  entryPoints = getGraphEntryPoints(graph, entryPoints);
  entryPoints.forEach(function (entryPoint) {
    depthFirst(graph, entryPoint, {
      leaveVertex: function (moduleName) {
        // Avoid duplicates and modules that have been skipped by tracer
        if (postOrder.indexOf(moduleName) === -1 && moduleName in tree) {
          postOrder.push(moduleName);
        }
      }
    });
  });

  return {
    modules: postOrder,
    entryPoints: entryPoints
  };
};
