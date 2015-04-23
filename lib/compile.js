var Promise = require('rsvp').Promise;
var asp = require('rsvp').denodeify;
var fs = require('fs');
var path = require('path');

var compilerMap = {
  'amd':      '../compilers/amd',
  'cjs':      '../compilers/cjs',
  'es6':      '../compilers/es6',
  'global':   '../compilers/global',
  'register': '../compilers/register'
};

exports.compileLoad = compileLoad;
function compileLoad(loader, load, opts, compilers) {
  return Promise.resolve()
  .then(function() {
    var format = load.metadata.format;
    if (load.metadata.build === false) {
      return {};
    }
    else if (format in compilerMap) {
      // note which compilers we used
      if (compilers)
        compilers[format] = true;
      return require(compilerMap[format]).compile(load, opts, loader);
    }
    else if (format == 'defined') {
      return {source: ''};
    }
    else {
      throw new Error("Unknown format " + format);
    }
  });
}

exports.compileOutputs = compileOutputs;
function compileOutputs(loader, tree, opts, sfxEntryPoints) {
  var modules = Object.keys(tree);

  // store plugins with a bundle hook to allow post-processing
  var plugins = {};
  // store compiler list for sfx bundling
  var compilers = {};
  var outputs = [];

  var usesBabelHelpersGlobal, usesTraceurRuntimeGlobal;

  return Promise.all(modules.map(function(name) {
    var load = tree[name];

    if (load === null)
      throw new TypeError('"' + name + '" was defined via a bundle, so can only be used for subtraction or union operations.');

    if (sfxEntryPoints && load.metadata.plugin && load.metadata.build === false)
      outputs.push('System.register("' + load.name + '", [], false, function() { console.log("SystemJS Builder - Plugin for ' + load.name + ' does not support sfx builds"); });\n');

    if (load.metadata.build === false)
      return;

    // support plugin "bundle" reduction hook
    var plugin = load.metadata.plugin;
    if (plugin) {
      var entry = plugins[load.metadata.pluginName] = plugins[load.metadata.pluginName] || {
        loads: [],
        bundle: plugin.bundle
      };
      entry.loads.push(load);
    }

    return Promise.resolve(compileLoad(loader, load, opts, compilers))
    .then(function(output) {
      outputs.push(output);
    });
  }))
  .then(function() {
    usesBabelHelpersGlobal = modules.some(function(name) {
      return tree[name].metadata.usesBabelHelpersGlobal;
    });
    usesTraceurRuntimeGlobal = modules.some(function(name) {
      return tree[name].metadata.usesTraceurRuntimeGlobal;
    });

    // apply plugin "bundle" hook
    return Promise.all(Object.keys(plugins).map(function(pluginName) {
      var entry = plugins[pluginName];
      if (entry.bundle)
        return Promise.resolve(entry.bundle.call(loader.pluginLoader, entry.loads, opts))
        .then(outputs.push.bind(outputs));
    }));
  })
  .then(function() {
    // normal bundle
    if (!sfxEntryPoints) {
      outputs.unshift('"format register";');
      return;
    }

    // sfx bundle
    Object.keys(compilers).forEach(function(format) {
      compiler = require(compilerMap[format]);
      if (compiler.sfx)  {
        var sfx = compiler.sfx(loader);
        if (sfx)
          outputs.push(sfx);
      }
    });
    // next wrap with the core code
    return asp(fs.readFile)(path.resolve(__dirname, './templates/sfx-core.js'))
    .then(function(sfxcore) {
      outputs.unshift(sfxcore.toString(), "(['" + sfxEntryPoints.join('\', \'') + "'], function(System) {\n");
      outputs.push("});");
    })
    // then wrap with the runtime
    .then(function() {
      if (opts.runtime && usesBabelHelpersGlobal)
        return getModuleSource(loader, 'babel', 'external-helpers')
        .then(outputs.unshift.bind(outputs));
    })
    .then(function() {
      if (opts.runtime && usesTraceurRuntimeGlobal)
        return getModuleSource(loader, 'traceur-runtime')
        .then(outputs.unshift.bind(outputs));
    })
    .then(function() {
      outputs = outputs.map(stripMeta);
    });
  })
  .then(function() {
    return outputs;
  });
}

exports.stripMeta = stripMeta;
function stripMeta(output) {
  // TODO
  // strip meta syntax from individual output objects in source-map compliant way
  // meta is any amount of comments followed by "blah";?
  // any amount of meta lines can be present
  // regular expressions at https://github.com/jspm/jspm-cli/blob/master/lib/build.js#L265
  return output;
}

exports.attachCompilers = function(loader) {
  Object.keys(compilerMap).forEach(function(compiler) {
    var attach = require(compilerMap[compiler]).attach;
    if (attach)
      attach(loader);
  });
}


function getModuleSource(loader, packageName, module) {
  return loader.normalize(packageName)
  .then(function(normalized) {
    return loader.locate({ name: normalized, metadata: {} });
  })
  .then(function(address) {
    if (module)
      address = address.replace(/[\/\\][^\/\\]+$/, path.sep + module + '.js');
    return loader.fetch({ address: address, metadata: {} });
  })
  .then(function(fetched) {
    // allow to be a redirection module
    var redirection = fetched.toString().match(/^\s*module\.exports = require\(\"([^\"]+)\"\);\s*$/);
    if (redirection) {
      var redirectPackage = redirection[1];
      if (module)
        redirectPackage = redirectPackage.replace(/\/[^\/]+$/, '');
      return getModuleSource(loader, redirectPackage, module);
    }
    return fetched;
  });
}