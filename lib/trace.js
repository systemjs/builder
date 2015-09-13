var getCanonicalName = require('./utils').getCanonicalName;
var glob = require('glob');
var toFileURL = require('./utils').toFileURL;
var fromFileURL = require('./utils').fromFileURL;
var asp = require('rsvp').denodeify;
var fs = require('fs');
var Graph = require('algorithms/data_structures/graph');
var depthFirst = require('algorithms/graph').depthFirstSearch;
var path = require('path');

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

    if (thisLoad && thisLoad.metadata.bundle) {
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

  return this.tracing[canonical] = Promise.resolve(loader.normalize(canonical))
  .then(function(normalized) {

    var load = {
      name: canonical,
      // baseURL-relative path to address
      path: null,
      metadata: null,
      deps: null,
      depMap: null,
      source: null,
      originalSource: null,

      // represents a build: false plugin that will not be built out for production
      runtimePlugin: null,
      
      // represents a conditional load record (sourceless)
      conditional: null
    };
    
    // -- conditional load record creation: sourceless intermediate load record --

    // boolean conditional
    var booleanIndex = canonical.lastIndexOf('#?');
    if (booleanIndex != -1) {
      var condition = canonical.substr(booleanIndex + 2)
      if (condition.indexOf('|') == -1)
        condition += '|default';
      load.conditional = {
        condition: condition,
        branch: canonical.substr(0, booleanIndex)
      };
      return load;
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
      var envMap = pkg.map['./' + subPath];

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

      var metadata = {};
      var fallback;
      return loader.locate({ name: toPackagePath(subPath), metadata: metadata })
      .then(function(address) {
        if (metadata.build === false)
          return;

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
        // allow build: false trace opt-out
        if (metadata.build === false)
          return false;
      
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
          load.conditional = {
            envs: envs,
            fallback: fallback
          };
          return load;
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

          load.conditional = {
            condition: condition,
            branches: branches
          };
          return load;
        });
      });
    } 

    // -- trace loader hooks --
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

      curHook = 'fetch';
      return Promise.resolve(loader.fetch({ name: normalized, metadata: load.metadata, address: address }))
      .then(function(source) {
        load.originalSource = source;
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
        if (!curHook)
          return;

        var msg = 'Error on ' + curHook + ' for ' + canonical + ' at ' + normalized;

        // rethrow loader hook errors with the hook information
        var newErr;
        if (err instanceof Error) {
          var newErr = new Error(err.message, err.fileName, err.lineNumber);
          // node errors only look correct with the stack modified
          newErr.message = err.message;
          newErr.stack = err.stack + '\n\t' + msg;
        }
        else {
          newErr = err + '\n\t' + msg;
        }

        throw newErr;
      })
      .then(function() {
        // remove unnecessary metadata for trace
        delete load.metadata.execute;
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
    // conditionals, build: false and system modules are false loads in the trace trees
    // (that is, part of depcache, but not built)
    // we skip system modules starting with @ though
    if (canonical[0] != '@')
      curLoads[canonical] = load && load.conditional ? false : load;

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
      curLoads[canonical] = load && load.conditional ? false : load;

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

// Returns the ordered immediate dependency array from the trace of a module
Trace.getLoadDependencies = function(load, traceAllConditionals, conditionalEnv, conditionsOnly) {
  if (traceAllConditionals !== false)
    traceAllConditionals = true;
  conditionalEnv = conditionalEnv || {};

  var deps = [];

  function envTrace(condition) {
    // trace the condition modules as dependencies themselves
    var exportIndex = condition.lastIndexOf('|');
    if (exportIndex == -1) {
      condition += '|default';
      exportIndex = condition.length;
    }

    var negate = condition[0] == '~';
    var conditionModule = condition.substr(negate, exportIndex - negate) || '@system-env';
    var conditionExport = (negate ? '~' : '') + condition.substr(exportIndex + 1);

    deps.push(conditionModule);

    // return the environment trace info
    var envTrace = conditionalEnv[conditionModule] && conditionalEnv[conditionModule][conditionExport];
    return !conditionsOnly && (envTrace === undefined ? traceAllConditionals : envTrace);
  }

  // conditional load records have their branches all included in the trace
  var conditional = load.conditional;
  if (conditional) {
    // { condition, branch } boolean conditional
    if (conditional.branch) {
      if (envTrace(conditional.condition))
        deps.push(conditional.branch);
    }

    // { envs: [{condition, branch},...], fallback } package environment map
    else if (conditional.envs) {
      conditional.envs.forEach(function(env) {
        if (envTrace(env.condition))
          deps.push(env.branch);
      });
      if (conditional.fallback && !conditionsOnly)
        deps.push(conditional.fallback);
    }

    // { condition, branches } conditional interpolation
    else if (conditional.branches) {
      var et = envTrace(conditional.condition);
      if (et !== undefined && et !== false) {
        Object.keys(conditional.branches).forEach(function(branch) {
          var dep = conditional.branches[branch];
          if (et === true)
            deps.push(dep);
          else if (et.indexOf(branch) != -1)
            deps.push(dep);
        });
      }
    }

    // run the conditional trace
    return deps;
  }

  if (conditionsOnly)
    return deps;

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
  entryPoints = entryPoints || [];

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
  getGraphEntryPoints(graph, entryPoints).forEach(function (entryPoint) {
    depthFirst(graph, entryPoint, {
      leaveVertex: function (moduleName) {
        // Avoid duplicates and modules that have been skipped by tracer
        if (postOrder.indexOf(moduleName) === -1 && moduleName in tree) {
          postOrder.push(moduleName);
        }
      }
    });
  });

  return postOrder;
};
