var path = require('path');
var url = require('url');

var Graph = require('algorithms/data_structures/graph');
var depthFirst = require('algorithms/graph').depthFirstSearch;

function fromFileURL(url) {
  return url.substr(7 + !!process.platform.match(/^win/)).replace(/\//g, path.sep);
}
exports.fromFileURL = fromFileURL;

function toFileURL(path) {
  return 'file://' + (process.platform.match(/^win/) ? '/' : '') + path.replace(/\\/g, '/');
}
exports.toFileURL = toFileURL;

function isFileURL(url) {
  return url.substr(0, 5) === 'file:';
}
exports.isFileURL = isFileURL;

/* Remove scheme prefix from file URLs, so that they are paths. */
function filePath(url) {
  if (isFileURL(url))
    return url.replace(/^file:\/+/, '/');
}
exports.filePath = filePath;

/* Coerce URLs to paths, assuming they are file URLs */
function coercePath(url) {
  if (isFileURL(url))
    return url.replace(/^file:\/+/, '/');
  else
    // assume relative
    return path.resolve(process.cwd(), url);
}
exports.coercePath = coercePath;

var absURLRegEx = /^[^\/]+:\/\//;

function normalizePath(loader, path, isPlugin) {
  var curPath;
  if (loader.paths[path][0] == '.')
    curPath = decodeURI(url.resolve(toFileURL(process.cwd()) + '/', loader.paths[path]));
  else
    curPath = decodeURI(url.resolve(loader.baseURL, loader.paths[path]));
  if (loader.defaultJSExtensions && !isPlugin && curPath.substr(curPath.length - 3, 3) != '.js')
    curPath += '.js';
  return curPath;
}

// syntax-free getCanonicalName
// just reverse-applies paths and defulatJSExtension to determine the canonical
function getCanonicalNamePlain(loader, normalized, isPlugin) {
  // now just reverse apply paths rules to get canonical name
  var pathMatch;

  // first check exact path matches
  for (var p in loader.paths) {
    if (loader.paths[p].indexOf('*') != -1)
      continue;

    var curPath = normalizePath(loader, p, isPlugin);

    if (normalized === curPath) {
      // always stop on first exact match
      pathMatch = p;
      break;
    }
  }

  // then wildcard matches
  var pathMatchLength = 0;
  var curMatchlength;
  if (!pathMatch)
    for (var p in loader.paths) {
      if (loader.paths[p].indexOf('*') == -1)
        continue;

      // normalize the output path
      var curPath = normalizePath(loader, p, isPlugin);

      // do reverse match
      var wIndex = curPath.indexOf('*');
      if (normalized.substr(0, wIndex) === curPath.substr(0, wIndex)
        && normalized.substr(normalized.length - curPath.length + wIndex + 1) === curPath.substr(wIndex + 1)) {
        curMatchLength = curPath.split('/').length;
        if (curMatchLength >= pathMatchLength) {
          pathMatch = p.replace('*', normalized.substr(wIndex, normalized.length - curPath.length + 1));
          pathMatchLength = curMatchLength;
        }
      }
    }

  // when no path was matched, act like the standard rule is *: baseURL/*
  if (!pathMatch) {
    if (normalized.substr(0, loader.baseURL.length) == loader.baseURL)
      pathMatch = normalized.substr(loader.baseURL.length);
    else if (normalized.match(absURLRegEx))
      throw 'Unable to calculate canonical name to bundle ' + normalized;
    else
      pathMatch = normalized;
  }

  return pathMatch;
}

exports.getCanonicalName = getCanonicalName;

// calculate the canonical name of the normalized module
// unwraps loader syntaxes to derive component parts
var interpolationRegEx = /#\{[^\}]+\}/;
function canonicalizeCondition(loader, conditionModule) {
  var conditionExport;
  var exportIndex = conditionModule.lastIndexOf('|');
  if (exportIndex != -1) {
    conditionExport = conditionModule.substr(exportIndex + 1)
    conditionModule = conditionModule.substr(0, exportIndex);
  }
  return getCanonicalName(loader, conditionModule) + (conditionExport ? '|' + conditionExport : '');
}

function getCanonicalName(loader, normalized, isPlugin) {
  // 1. Boolean conditional
  var booleanIndex = normalized.lastIndexOf('#?');
  if (booleanIndex != -1) {
    var booleanModule = normalized.substr(booleanIndex + 2);
    var negate = booleanModule[0] == '~';
    if (negate)
      booleanModule = booleanModule.substr(1);
    return getCanonicalName(loader, normalized.substr(0, booleanIndex)) + '#?' + (negate ? '~' : '') + canonicalizeCondition(loader, booleanModule);
  }

  // 2. Plugins
  var pluginIndex = loader.pluginFirst ? normalized.indexOf('!') : normalized.lastIndexOf('!');
  if (pluginIndex != -1)
    return getCanonicalName(loader, normalized.substr(0, pluginIndex), !loader.pluginFirst) + '!' + getCanonicalName(loader, normalized.substr(pluginIndex + 1), loader.pluginFirst);

  // 3. Package environment map
  var pkgEnvIndex = normalized.indexOf('#:');
  if (pkgEnvIndex != -1)
    return getCanonicalName(loader, normalized.substr(0, pkgEnvIndex), isPlugin) + normalized.substr(pkgEnvIndex);

  // Finally get canonical plain
  var canonical = getCanonicalNamePlain(loader, normalized, isPlugin);

  // 4. Canonicalize conditional interpolation
  var conditionalMatch = canonical.match(interpolationRegEx);
  if (conditionalMatch)
    return getCanonicalNamePlain(loader, normalized, isPlugin).replace(interpolationRegEx, '#{' + canonicalizeCondition(loader, conditionalMatch[0].substr(2, conditionalMatch[0].length - 3)) + '}');

  return canonical;
}

exports.getAlias = getAlias
function getAlias(loader, canonicalName) {
  var bestAlias;

  function getBestAlias(mapped) {
    return canonicalName.substr(0, mapped.length) == mapped
        && (canonicalName.length == mapped.length || canonicalName[mapped.length + 1] == '/');
  }

  Object.keys(loader.map).forEach(function(alias) {
    if (getBestAlias(loader.map[alias]))
      bestAlias = alias;
  });

  if (bestAlias)
    return bestAlias;

  Object.keys(loader.packages).forEach(function(pkg) {
    Object.keys(loader.packages[pkg].map || {}).forEach(function(alias) {
      if (getBestAlias(loader.packages[pkg].map[alias]))
        bestAlias = alias;
    });
  });

  return bestAlias || canonicalName;
}

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

exports.getTreeModulesPostOrder = function getTreeModulesPostOrder(tree, entryPoints) {
  entryPoints = entryPoints || [];

  // Post order traversal sorted module list
  var postOrder = [];
  var graph = new Graph(true);

  // Seed graph with all relations
  Object.keys(tree).forEach(function (moduleName) {
    var load = tree[moduleName];

    if (!graph.adjList[moduleName]) {
      graph.addVertex(moduleName);
    }

    load.deps.forEach(function (depName) {
      graph.addEdge(moduleName, load.depMap[depName]);
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
