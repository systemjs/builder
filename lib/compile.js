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
  var format = load.metadata.format;

  if (format == 'defined')
    return Promise.resolve({ source:  compileOpts.systemGlobal + '.register("' + load.name + '", [], function() {});\n' });

  if (format in compilerMap) {
    // use cached if we have it
    var cached = cache.loads[load.name];
    if (cached && cached.hash == getCompileHash(load, compileOpts))
      return Promise.resolve(cached.output);

    // for static encoding, create a new load record
    // with the encodings included
    if (compileOpts.encodeNames) {
      load = extend({}, load);
      load.name = getEncoding(load.name, cache.encodings);
      var depMap = {};
      Object.keys(load.depMap).forEach(function(dep) {
        depMap[dep] = getEncoding(load.depMap[dep], cache.encodings);
      });
      load.depMap = depMap;
    }

    return Promise.resolve(require(compilerMap[format]).compile(load, compileOpts, loader))
    .then(function(output) {
      // store compiled output in cache
      cache.loads[load.name] = {
        hash: getCompileHash(load, compileOpts),
        output: output
      };

      return output;
    })
  }

  return Promise.reject(new TypeError('Unknown module format ' + format));
}

exports.compileTree = compileTree;
function compileTree(loader, tree, entryPoints, compileOpts, outputOpts, cache) {
  // sort in graph order, filter modules to actually built loads (excluding conditionals, build: false)
  var modules = getTreeModulesPostOrder(tree, entryPoints).filter(function(moduleName) {
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
      if (load.metadata.loader && load.metadata.loaderModule.bundle)
        (pluginLoads[load.metadata.loader] = pluginLoads[load.metadata.loader] || []).push(load);

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

      return Promise.resolve(bundle.call(loader.pluginLoader, loads, compileOpts, outputOpts))
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
      return outputs;
  });
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
      if (modules.indexOf(key) == -1 && key != '@empty') {
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
