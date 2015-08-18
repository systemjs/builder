var Promise = require('rsvp').Promise;
var asp = require('rsvp').denodeify;
var fs = require('fs');
var path = require('path');
var url = require('url');
var createHash = require('crypto').createHash;
var template = require('es6-template-strings');
var getAlias = require('./utils').getAlias;

var compilerMap = {
  'amd': '../compilers/amd',
  'cjs': '../compilers/cjs',
  'esm': '../compilers/esm',
  'global': '../compilers/global',
  'register': '../compilers/register'
};

function hashString(source) {
  return createHash('md5').update(source).digest('hex');
}

function retrieveCachedOutput(cache, load) {
  if (!cache)
    return;

  var entry = cache[load.name];
  if (!entry)
    return;

  return hashString(JSON.stringify(load)) === entry.sourceHash && entry.output;
}

function updateCacheEntry(cache, load, output) {
  if (!cache)
    return;

  cache[load.name] = {
    sourceHash: hashString(JSON.stringify(load)),
    output: output
  };
}

exports.compileLoad = compileLoad;
function compileLoad(loader, load, opts) {
  var format = load.metadata.format;

  if (format in compilerMap)
    return require(compilerMap[format]).compile(load, opts, loader);
  else if (format == 'defined')
    return { source: '' };
  else
    throw new Error("Unknown module format " + format);
}

function sfxEncoding(moduleName, encodings) {
  if (moduleName == '@empty')
    return moduleName;
  return encodings[moduleName] || (encodings[moduleName] = Object.keys(encodings).length.toString(16));
}

// compiledTree is load tree with "source" and "output" set
exports.compileOutputs = compileOutputs;
function compileOutputs(loader, tree, opts, sfxEntryPoints, cache) {
  var modules = Object.keys(tree);

  // if doing an sfx build, obscure module names first
  if (sfxEntryPoints && opts.sfxEncoding !== false) {
    var encodings = {};

    sfxEntryPoints = sfxEntryPoints.map(function(name) {
      return sfxEncoding(name, encodings);
    });
    modules = modules.map(function(module) {
      var encoded = sfxEncoding(module, encodings);
      var load = tree[module];
      delete tree[module];
      tree[encoded] = load;
      load.name = encoded;
      load.originalDepMap = load.depMap;
      load.depMap = {};
      Object.keys(load.originalDepMap).forEach(function(dep) {
        load.depMap[dep] = sfxEncoding(load.originalDepMap[dep], encodings);
      });
      return encoded;
    });
  }

  // store plugins with a bundle hook to allow post-processing
  var pluginLoads = {};
  var compilers = {};

  // output array to create
  var outputs = [];

  return Promise.resolve()

  // pre-processing
  .then(function() {

    modules.forEach(function(name) {
      var load = tree[name];

      if (load === null)
        throw new TypeError('"' + name + '" was defined via a bundle, so can only be used for subtraction or union operations.');

      // group plugin loads by plugin for bundle hook
      var plugin = load.metadata.loaderModule;
      if (plugin) {
        if (load.metadata.loaderModule.build === false && sfxEntryPoints)
          throw new TypeError("Plugin '" + load.metadata.loader + '" does not support SFX builds.');

        if (plugin.bundle && load.metadata.build !== false) {
          var loads = pluginLoads[load.metadata.loader] = pluginLoads[load.metadata.loader] || [];
          loads.push(load);
        }
      }
    });
  })

  // create load output objects
  .then(function() {
    return Promise.all(modules.map(function(name) {
      var load = tree[name];

      if (load.metadata.loaderModule && load.metadata.loaderModule.bundle)
        return;

      var output = retrieveCachedOutput(cache, load);
      if (output) {
        outputs.push(output);
        return;
      }

      return Promise.resolve(compileLoad(loader, load, opts))
      .then(function(output) {
        updateCacheEntry(cache, load, output);
        outputs.push(output);
      });
    }));
  })

  // create bundle plugin outputs
  .then(function() {
    return Promise.all(Object.keys(pluginLoads).map(function(pluginName) {
      var loads = pluginLoads[pluginName];
      var bundle = loads[0].metadata.loaderModule.bundle;

      return Promise.resolve(bundle.call(loader, loads, opts))
      .then(function(output) {
        function scopeSystem(output) {
          if (!opts.sfx)
            return output;
          if (typeof output == 'object')
            output.source = scopeSystem(output.source);
          output = output.replace(/System\.register/g, '$__System.register');
          return output;
        }

        if (output instanceof Array) {
          output = output.map(scopeSystem);
          outputs = outputs.concat(output);
        }
        else {
          outputs.push(scopeSystem(output));
        }
      });
    }));
  })

  // if any module in the bundle is AMD, add a "bundle" meta to the bundle
  // this can be deprecated if https://github.com/systemjs/builder/issues/264 lands
  .then(function() {
    var hasAMD = modules.some(function(name) {
      return tree[name].metadata.format == 'amd';
    });

    if (hasAMD) 
      outputs.unshift('"bundle";');
  })

  .then(function() {
    if (sfxEntryPoints)
      return wrapSFXOutputs(loader, tree, outputs, sfxEntryPoints, opts);
    else
      return outputs;
  });
}

exports.wrapSFXOutputs = wrapSFXOutputs;
function wrapSFXOutputs(loader, tree, outputs, sfxEntryPoints, opts) {
  var compilers = {};

  // NB deprecate
  if (opts.sfxFormat == 'es6')
    opts.sfxFormat = 'esm';

  var modules = Object.keys(tree);

  // determine compilers used
  modules.forEach(function(name) {
    var load = tree[name];
    if (load.metadata.build !== false) {
      var format = load.metadata.format;
      if (format == 'defined')
        return;
      // NB to be deprecated with SystemJS 0.19
      if (format == 'es6')
        format = 'esm';
      if (!(load.metadata.format in compilerMap))
        throw new Error(name + ' has format set to "' + load.metadata.format + '", which is not valid. Must be one of "esm", "amd", "cjs", "global" or "register".');

      compilers[load.metadata.format] = true;
    }
  });

  // determine if the SFX bundle has any external dependencies it relies on
  var externalDeps = [];
  var externalDepIds = [];
  var sfxGlobals = [];
  modules.forEach(function(name) {
    var load = tree[name];

    // check all deps are present
    load.deps.forEach(function(dep) {
      var key = load.depMap[dep];
      var originalKey = (load.originalDepMap || load.depMap)[dep];
      if (modules.indexOf(key) == -1 && key != '@empty') {
        if (opts.sfxFormat == 'esm')
          throw new TypeError('External SFX dependencies not yet supported for ES module SFX bundles. See https://github.com/systemjs/builder/issues/259.')

        var alias = getAlias(loader, originalKey);

        if (opts.sfxFormat == 'global') {
          if (!opts.sfxGlobals[alias])
            throw new TypeError('Global SFX bundle dependency "' + alias + '" (' + originalKey + ') must be configured to an environment global via the sfxGlobals option.');
          sfxGlobals.push(opts.sfxGlobals[alias]);
        }

        externalDeps.push(alias);
        externalDepIds.push(key);
      }
    });
  });

  // include compiler helpers at the beginning of outputs
  Object.keys(compilers).forEach(function(format) {
    compiler = require(compilerMap[format]);
    if (compiler.sfx)  {
      var sfx = compiler.sfx(loader);
      if (sfx)
        outputs.unshift(sfx);
    }
  });

  // next wrap with the core code
  return asp(fs.readFile)(path.resolve(__dirname, '../templates/sfx-core.js'))
  .then(function(sfxcore) {
    outputs.unshift(sfxcore.toString(), "(['" + sfxEntryPoints.join('\', \'') + "'], " + JSON.stringify(externalDepIds) + ", function($__System) {\n");

    outputs.push("})");
    return asp(fs.readFile)(path.resolve(__dirname, '../templates/sfx-' + opts.sfxFormat + '.js'))
  })
  // then include the sfx module format wrapper
  .then(function(formatWrapper) {
    outputs.push(template(formatWrapper.toString(), {
      deps: externalDeps,
      sfxGlobals: sfxGlobals,
      sfxGlobalName: opts.sfxGlobalName
    }));
  })
  // then wrap with the runtime
  .then(function() {
    var usesBabelHelpersGlobal = modules.some(function(name) {
      return tree[name].metadata.usesBabelHelpersGlobal;
    });
    if (opts.runtime && usesBabelHelpersGlobal)
      return getModuleSource(loader, 'babel/external-helpers')
      .then(function(source) {
        outputs.unshift(source);
      });
  })
  .then(function() {
    var usesTraceurRuntimeGlobal = modules.some(function(name) {
      return tree[name].metadata.usesTraceurRuntimeGlobal;
    });
    if (opts.runtime && usesTraceurRuntimeGlobal)
      return getModuleSource(loader, 'traceur-runtime')
      .then(function(source) {
        // protect System global clobbering
        outputs.unshift("(function(){ var curSystem = typeof System != 'undefined' ? System : undefined;\n" + source + "\nSystem = curSystem; })();");
      });
  })
  // for AMD, CommonJS and global SFX outputs, add a "format " meta to support SystemJS loading
  .then(function() {
    if (opts.sfxGlobalName)
      outputs.unshift('"exports ' + opts.sfxGlobalName + '";');
    
    if (opts.sfxFormat == 'global') {
      for (var g in opts.sfxGlobals)
        outputs.unshift('"globals.' + opts.sfxGlobals[g] + ' ' + g + '";');
    }

    if (opts.sfxFormat == 'amd' || opts.sfxFormat == 'cjs' || opts.sfxFormat == 'global')
      outputs.unshift('"format ' + opts.sfxFormat + '";');
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
