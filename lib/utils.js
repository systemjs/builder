var path = require('path');
var url = require('url');
var profile = require('./profile');

exports.extend = extend;
function extend(a, b) {
  for (var p in b)
    a[p] = b[p];
  return a;
}

exports.dextend = dextend;
function dextend(a, b) {
  for (var p in b) {
    if (!b.hasOwnProperty(p))
      continue;
    var val = b[p];
    if (typeof val === 'object')
      dextend(a[p] = typeof a[p] === 'object' ? a[p] : {}, val);
    else
      a[p] = val;
  }
  return a;
}


var isWin = process.platform.match(/^win/);

exports.fromFileURL = fromFileURL;
function fromFileURL(url) {
  return url.substr(7 + !!isWin).replace(/\//g, path.sep);
}

exports.toFileURL = toFileURL;
function toFileURL(path) {
  return 'file://' + (isWin ? '/' : '') + path.replace(/\\/g, '/');
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

exports.getCanonicalName = getCanonicalName;
function getCanonicalName(loader, normalized, isPlugin) {
  var evt = profile.event('canonicalization', normalized + (isPlugin ? ' (plugin)' : ''));

  var canonical;

  var index, conditionalMatch;

  // 1. Boolean conditional
  if ((index = normalized.lastIndexOf('#?')) != -1) {
    var booleanModule = normalized.substr(index + 2);
    var negate = booleanModule[0] == '~';
    if (negate)
      booleanModule = booleanModule.substr(1);
    canonical = getCanonicalName(loader, normalized.substr(0, index)) + '#?' + (negate ? '~' : '') + canonicalizeCondition(loader, booleanModule);
  }

  // 2. Plugins
  else if ((index = loader.pluginFirst ? normalized.indexOf('!') : normalized.lastIndexOf('!')) != -1) {
    canonical = getCanonicalName(loader, normalized.substr(0, index), !loader.pluginFirst) + '!' + getCanonicalName(loader, normalized.substr(index + 1), loader.pluginFirst);
  }

  // 3. Package environment map
  else if ((index = normalized.indexOf('#:')) != -1) {
    canonical = getCanonicalName(loader, normalized.substr(0, index), isPlugin) + normalized.substr(index);
  }

  // Finally get canonical plain
  else {
    canonical = getCanonicalNamePlain(loader, normalized, isPlugin);
    
    // 4. Canonicalize conditional interpolation
    if (conditionalMatch = canonical.match(interpolationRegEx))
      canonical = getCanonicalNamePlain(loader, normalized, isPlugin).replace(interpolationRegEx, '#{' + canonicalizeCondition(loader, conditionalMatch[0].substr(2, conditionalMatch[0].length - 3)) + '}');
  }

  evt.done();
  return canonical;
}

// calculate the canonical name of the normalized module
// unwraps loader syntaxes to derive component parts
var interpolationRegEx = /#\{[^\}]+\}/;
function canonicalizeCondition(loader, conditionModule) {
  var conditionExport;
  var exportIndex = conditionModule.lastIndexOf('|');
  if (exportIndex != -1) {
    conditionExport = conditionModule.substr(exportIndex + 1)
    conditionModule = conditionModule.substr(0, exportIndex) || '@system-env';
  }
  return getCanonicalName(loader, conditionModule) + (conditionExport ? '|' + conditionExport : '');
}

// syntax-free getCanonicalName
// just reverse-applies paths and defulatJSExtension to determine the canonical
function getCanonicalNamePlain(loader, normalized, isPlugin) {
  // now just reverse apply paths rules to get canonical name
  var pathMatch;

  // if we are in a package, remove the basePath
  var pkgName = getPackage(loader.packages, normalized);
  if (pkgName) {
    var pkg = loader.packages[pkgName];

    // sanitize basePath
    var basePath = pkg.basePath && pkg.basePath != '.' ? pkg.basePath : '';
    if (basePath) {
      if (basePath.substr(0, 2) == './')
        basePath = basePath.substr(2);
      if (basePath[basePath.length - 1] != '/')
        basePath += '/';

      if (normalized.substr(pkgName.length + 1, basePath.length) == basePath)
        normalized = pkgName + normalized.substr(pkgName.length + basePath.length);
    }
  }

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
      throw new Error('Unable to calculate canonical name to bundle ' + normalized);
    else
      pathMatch = normalized;
  }

  return pathMatch;
}

exports.getPackage = getPackage;
function getPackage(packages, name) {
  // use most specific package
  var curPkg, curPkgLen = 0, pkgLen;
  for (var p in packages) {
    if (name.substr(0, p.length) === p && (name.length === p.length || name[p.length] === '/')) {
      pkgLen = p.split('/').length;
      if (pkgLen > curPkgLen) {
        curPkg = p;
        curPkgLen = pkgLen;
      }
    }
  }
  return curPkg;
}

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




