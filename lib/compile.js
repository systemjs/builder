var Promise = require('rsvp').Promise;
var asp = require('rsvp').denodeify;
var fs = require('fs');
var path = require('path');
var url = require('url');
var createHash = require('crypto').createHash;
var template = require('es6-template-strings');
var getAlias = require('./utils').getAlias;
var getTreeModulesPostOrder = require('./trace').getTreeModulesPostOrder;
var extend = require('./utils').extend;
var dextend = require('./utils').dextend;
var getPackage = require('./utils').getPackage;

var compilerMap = {
  'amd': '../compilers/amd',
  'cjs': '../compilers/cjs',
  'esm': '../compilers/esm',
  'global': '../compilers/global',
  'register': '../compilers/register'
};

// create a compile hash based on path + source + metadata + compileOpts
// one implication here is that plugins shouldn't rely on System.x checks
// as these will not be cache-invalidated but within the bundle hook is fine
function getCompileHash(load, compileOpts) {
  return createHash('md5')
  .update(JSON.stringify({
    source: load.source,
    metadata: load.metadata,
    path: compileOpts.sourceMaps && load.path,

    normalize: compileOpts.normalize,
    anonymous: compileOpts.anonymous,
    systemGlobal: compileOpts.systemGlobal,
    static: compileOpts.static,
    encodeNames: compileOpts.encodeNames,
    sourceMaps: compileOpts.sourceMaps,
    lowResSourceMaps: compileOpts.lowResSourceMaps
  }))
  .digest('hex');
}

function getEncoding(canonical, encodings) {
  // dont encode system modules
  if (canonical[0] == '@')
    return canonical;

  // return existing encoding if present
  if (encodings[canonical])
    return encodings[canonical];

  // search for the first available key
  var highestEncoding = 0;
  Object.keys(encodings).forEach(function(canonical) {
    var encoding = encodings[canonical];
    highestEncoding = Math.max(parseInt(encoding, '16'), highestEncoding);
  });

  highestEncoding++;

  return encodings[canonical] = highestEncoding.toString(16);
}

exports.compileLoad = compileLoad;
function compileLoad(loader, load, compileOpts, cache) {

  // use cached if we have it
  var cached = cache.loads[load.name];
  if (cached && cached.hash == getCompileHash(load, compileOpts))
    return Promise.resolve(cached.output);

  // create a new load record with any necessary final mappings
  function remapLoadRecord(load, mapFunction) {
    load = extend({}, load);
    load.name = mapFunction(load.name, load.name);
    var depMap = {};
    Object.keys(load.depMap).forEach(function(dep) {
      depMap[dep] = mapFunction(load.depMap[dep], dep);
    });
    load.depMap = depMap;
    return load;
  }
  var mappedLoad = remapLoadRecord(load, function(name, original) {
    // do SFX encodings
    if (compileOpts.encodeNames)
      return getEncoding(name, cache.encodings);

    // strip package conditional syntax at compile time
    return name.replace('#:', '/');
  });

  var format = load.metadata.format;

  if (format == 'defined')
    return Promise.resolve({ source:  compileOpts.systemGlobal + '.register("' + mappedLoad.name + '", [], function() { return { setters: [], execute: function() {} } });\n' });

  if (format in compilerMap)
    return Promise.resolve(require(compilerMap[format]).compile(mappedLoad, compileOpts, loader))
    .then(function(output) {
      // store compiled output in cache
      cache.loads[load.name] = {
        hash: getCompileHash(load, compileOpts),
        output: output
      };

      return output;
    });

  return Promise.reject(new TypeError('Unknown module format ' + format));
}

exports.compileTree = compileTree;
function compileTree(loader, tree, compileOpts, outputOpts, cache) {
  // sort in graph order, filter modules to actually built loads (excluding conditionals, build: false)
  var ordered = getTreeModulesPostOrder(tree);
  // get entrypoints from graph algorithm
  var entryPoints = ordered.entryPoints;
  var modules = ordered.modules.filter(function(moduleName) {
    return tree[moduleName] && !tree[moduleName].conditional;
  });

  if (compileOpts.encodeNames)
    entryPoints = entryPoints.map(function(name) {
      return getEncoding(name, cache.encodings)
    });

  var outputs = [];

  // store plugins with a bundle hook to allow post-processing
  var pluginLoads = {};
  var compilers = {};

  // create load output objects
  return Promise.all(modules.map(function(name) {
    return Promise.resolve()
    .then(function() {
      var load = tree[name];

      if (load === true)
        throw new TypeError(name + ' was defined via a bundle, so can only be used for subtraction or union operations.');

      if (compileOpts.static && load.runtimePlugin)
        throw new TypeError('Plugin ' + load.runtimePlugin + ' does not support static builds, compiling ' + load.name + '.');

      // store plugin loads for bundle hook
      if (load.metadata.loader && load.metadata.loaderModule.bundle) {
        var pluginLoad = extend({}, load);
        pluginLoad.address = System.baseURL + load.path;
        (pluginLoads[load.metadata.loader] = pluginLoads[load.metadata.loader] || []).push(pluginLoad);
      }

      return compileLoad(loader, tree[name], compileOpts, cache);
    })
    .then(function(output) {
      outputs.push(output);
    });
  }))

  // run plugin bundle hook
  .then(function() {
    return Promise.all(Object.keys(pluginLoads).map(function(pluginName) {
      var loads = pluginLoads[pluginName];
      var bundle = loads[0].metadata.loaderModule.bundle;

      // NB deprecate the 2 argument form
      return Promise.resolve(bundle.length < 3 
          ? bundle.call(loader.pluginLoader, loads, extend(extend({}, compileOpts), outputOpts)) 
          : bundle.call(loader.pluginLoader, loads, compileOpts, outputOpts))
      .then(function(output) {
        if (output instanceof Array)
          outputs = outputs.concat(output);
        else
          outputs.push(output);
      });
    }));
  })
  .then(function() {

    // if any module in the bundle is AMD, add a "bundle" meta to the bundle
    // this can be deprecated if https://github.com/systemjs/builder/issues/264 lands
    if (modules.some(function(name) {
          return tree[name].metadata.format == 'amd';
        }))
      outputs.unshift('"bundle";');

    // static bundle wraps with a self-executing loader
    if (compileOpts.static)
      return wrapSFXOutputs(loader, tree, outputs, entryPoints, compileOpts);
    else
      return addPackageConfig(loader, tree, outputs, entryPoints, compileOpts);
  })
  .then(function(outputs) {
    // NB also include all aliases of all entryPoints along with entryPoints
    return {
      outputs: outputs,
      entryPoints: entryPoints
    };
  });
}

function addPackageConfig(loader, tree, outputs, entryPoints, compileOpts) {
  if (!compileOpts.buildConfig)
    return outputs;

  var bundleConfig;

  // given a package and subpath, return the config used by the subpath resolution
  var normalizedPkgMains = {};
  function getConfigFor(pkgName, subPath) {
    var pkg = loader.packages[pkgName];

    var cfg;

    // if this subPath is the normalized package main, include the main in the config
    if (pkg.main) {
      var main = normalizedPkgMains[pkgName] = normalizedPkgMains[pkgName] || loader.normalizeSync(pkgName).substr(pkgName.length + 1);
      if (main == subPath)
        (cfg = cfg || {}).main = pkg.main;
    }

    // meta for 'file.js' informs us that if the default extension is 'ts', then import "file.js" must not import "file.js.ts"
    // this is important to include here
    // NB meta building here
    // wildcard meta
    /* var wildcardIndex;
    for (var module in pkg.meta) {
      // allow meta to start with ./ for flexibility
      var dotRel = module.substr(0, 2) == './' ? './' : '';
      if (dotRel)
        module = module.substr(2);

      wildcardIndex = module.indexOf('*');
      if (wildcardIndex === -1)
        continue;

      if (module.substr(0, wildcardIndex) == subPath.substr(0, wildcardIndex)
          && module.substr(wildcardIndex + 1) == subPath.substr(subPath.length - module.length + wildcardIndex + 1)) {
        cfg = cfg || {};
        cfg.meta = cfg.meta || {};
        for (var m in pkg.meta[module])
          cfg.meta[m] = true;
      }
    }
    // exact meta
    var exactMeta = pkgMeta[subPath] || pkgMeta['./' + subPath];
    if (exactMeta)
      matchFn(exactMeta, exactMeta, 0); */

    // reverse-apply map configs to see which ones could result in this subPath
    // adding any that apply
    var target;
    for (var p in pkg.map) {
      if (typeof pkg.map[p] != 'object') {
        if (pkg.map[p].substr(0, 2) != './')
          continue;

        target = pkg.map[p].substr(2);
        if (subPath.substr(0, target.length) == target && (subPath.length == target.length || subPath[target.length] == '/'))
          ((cfg = cfg || {}).map = cfg.map || {})[p] = pkg.map[p];
        continue;
      }

      for (var q in pkg.map[p]) {
        if (pkg.map[p][q].substr(0, 2) != './')
          continue;

        target = pkg.map[p][q].substr(2);
        if (subPath.substr(0, target.length) == target && (subPath.length == target.length || subPath[target.length] == '/'))
          (((cfg = cfg || {}).map = cfg.map || {})[p] = cfg.map[p] || {})[q] = pkg.map[p][q];
      }
    }

    return cfg;
  }

  Object.keys(tree).forEach(function(m) {
    // ensure we include conditional package configs
    m = m.replace('#:', '/');
    // check if this module is in a package
    var normalized = loader.normalizeSync(m);
    var packageName = getPackage(loader.packages, normalized);
    if (packageName) {
      canonicalPackageName = m.substr(0, m.length - (normalized.length - packageName.length));
      bundleConfig = bundleConfig || { packages: {} };
      bundleConfig.packages[canonicalPackageName] = bundleConfig.packages[canonicalPackageName] || {};
      dextend(bundleConfig.packages[canonicalPackageName], getConfigFor(packageName, normalized.substr(packageName.length + 1)));
    }
  });

  if (bundleConfig)
    outputs.push(compileOpts.systemGlobal + '.config(' + JSON.stringify(bundleConfig, null, 2) + ');');

  return outputs;
}

exports.wrapSFXOutputs = wrapSFXOutputs;
function wrapSFXOutputs(loader, tree, outputs, entryPoints, compileOpts) {
  var compilers = {};

  // NB deprecate
  if (compileOpts.format == 'es6')
    compileOpts.format = 'esm';

  var modules = Object.keys(tree).filter(function(module) {
    return tree[module] && !tree[module].conditional;
  });

  // determine compilers used
  modules.forEach(function(name) {
    compilers[tree[name].metadata.format] = true;
  });

  // include compiler helpers at the beginning of outputs
  Object.keys(compilerMap).forEach(function(format) {
    if (!compilers[format])
      return;
    var compiler = require(compilerMap[format]);
    if (compiler.sfx)
      outputs.unshift(compiler.sfx(loader));
  });

  // determine if the SFX bundle has any external dependencies it relies on
  var externalDeps = [];
  var externalDepIds = [];
  var globalDeps = [];
  modules.forEach(function(name) {
    var load = tree[name];

    // check all deps are present
    load.deps.forEach(function(dep) {
      var key = load.depMap[dep];
      if (!(key in tree) && key[0] != '@') {
        if (compileOpts.format == 'esm')
          throw new TypeError('External SFX dependencies not yet supported for ES module SFX bundles. See https://github.com/systemjs/builder/issues/259.')

        var alias = getAlias(loader, key);

        if (compileOpts.format == 'global') {
          if (!compileOpts.globalDeps[alias])
            throw new TypeError('Global SFX bundle dependency "' + alias + '" (' + key + ') must be configured to an environment global via the globalDeps option.');
          globalDeps.push(compileOpts.globalDeps[alias]);
        }

        externalDeps.push(alias);
        externalDepIds.push(key);
      }
    });
  });

  // next wrap with the core code
  return asp(fs.readFile)(path.resolve(__dirname, '../templates/sfx-core.js'))
  .then(function(sfxcore) {
    outputs.unshift(sfxcore.toString(), "(['" + entryPoints.join('\', \'') + "'], " + JSON.stringify(externalDepIds) + ", function(" + compileOpts.systemGlobal + ") {\n");

    outputs.push("})");
    return asp(fs.readFile)(path.resolve(__dirname, '../templates/sfx-' + compileOpts.format + '.js'))
  })
  // then include the sfx module format wrapper
  .then(function(formatWrapper) {
    outputs.push(template(formatWrapper.toString(), {
      deps: externalDeps,
      globalDeps: globalDeps,
      globalName: compileOpts.globalName
    }));
  })
  // then wrap with the runtime
  .then(function() {
    var usesBabelHelpersGlobal = modules.some(function(name) {
      return tree[name].metadata.usesBabelHelpersGlobal;
    });
    if (compileOpts.runtime && usesBabelHelpersGlobal)
      return getModuleSource(loader, 'babel/external-helpers')
      .then(function(source) {
        outputs.unshift(source);
      });
  })
  .then(function() {
    var usesTraceurRuntimeGlobal = modules.some(function(name) {
      return tree[name].metadata.usesTraceurRuntimeGlobal;
    });
    if (compileOpts.runtime && usesTraceurRuntimeGlobal)
      return getModuleSource(loader, 'traceur-runtime')
      .then(function(source) {
        // protect System global clobbering
        outputs.unshift("(function(){ var curSystem = typeof System != 'undefined' ? System : undefined;\n" + source + "\nSystem = curSystem; })();");
      });
  })
  // for AMD, CommonJS and global SFX outputs, add a "format " meta to support SystemJS loading
  .then(function() {
    if (compileOpts.globalName)
      outputs.unshift('"exports ' + compileOpts.globalName + '";');

    if (compileOpts.format == 'global') {
      for (var g in compileOpts.globalDeps)
        outputs.unshift('"globals.' + compileOpts.globalDeps[g] + ' ' + g + '";');
    }

    if (compileOpts.format == 'amd' || compileOpts.format == 'cjs' || compileOpts.format == 'global')
      outputs.unshift('"format ' + compileOpts.format + '";');
  })
  .then(function() {
    return outputs;
  });
}

exports.attachCompilers = function(loader) {
  Object.keys(compilerMap).forEach(function(compiler) {
    var attach = require(compilerMap[compiler]).attach;
    if (attach)
      attach(loader);
  });
};

function getModuleSource(loader, module) {
  return loader.normalize(module)
  .then(function(normalized) {
    return loader.locate({ name: normalized, metadata: {} });
  })
  .then(function(address) {
    return loader.fetch({ address: address, metadata: {} });
  })
  .then(function(fetched) {
    // allow to be a redirection module
    var redirection = fetched.toString().match(/^\s*module\.exports = require\(\"([^\"]+)\"\);\s*$/);
    if (redirection)
      return getModuleSource(loader, redirection[1]);
    return fetched;
  })
  .catch(function(err) {
    console.log('Unable to find helper module "' + module + '". Make sure it is configured in the builder.');
    throw err;
  });
}
