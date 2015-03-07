var Promise = require('rsvp').Promise;
var asp = require('rsvp').denodeify;
var fs = require('fs');
var path = require('path');

var compilerMap = {
  'amd':      require('../compilers/amd'),
  'cjs':      require('../compilers/cjs'),
  'es6':      require('../compilers/es6'),
  'global':   require('../compilers/global'),
  'register': require('../compilers/register')
};

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
      return compilerMap[format].compile(load, opts, loader);
    }
    else if (format == 'defined') {
      return {source: ''};
    }
    else {
      throw new Error("Unknown format " + format);
    }
  });
}
exports.compileLoad = compileLoad;

function compileOutputs(loader, tree, opts, sfxEntryPoint) {
  var names = Object.keys(tree);

  // store plugins with a bundle hook to allow post-processing
  var plugins = {};
  // store compiler list for sfx bundling
  var compilers = {};
  var outputs = [];

  return Promise.all(names.map(function(name) {
    var load = tree[name];

    if (load.metadata.build !== false && sfxEntryPoint && load.metadata.plugin && load.metadata.plugin.build === false)
      outputs.push('System.register("' + load.name + '", [], false, function() { console.log("SystemJS Builder - Plugin for ' + load.name + ' does not support sfx builds"); });\n');

    // support plugin "bundle" reduction hook
    var plugin = load.metadata.plugin;
    if (plugin && load.metadata.build !== false) {
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
    if (!sfxEntryPoint) {
      outputs.unshift('"format register";', '"deps ' + loader.transpiler + '-runtime";');
      return;
    }

    // sfx bundle
    Object.keys(compilers).forEach(function(format) {
      compiler = compilerMap[format];
      if (compiler.sfx)  {
        var sfx = compiler.sfx(loader);
        if (sfx)
          outputs.push(sfx);
      }
    });
    // next wrap with the core code
    return asp(fs.readFile)(path.resolve(__dirname, './templates/sfx-core.js'))
    .then(function(sfxcore) {
      outputs.unshift(sfxcore.toString(), "('" + sfxEntryPoint + "', function(System) {\n");
      outputs.push("});");
    })
    // then wrap with the runtime
    .then(function() {
      if (!opts.runtime)
        return;

      return loader.import(loader.transpiler + '-runtime')
      .then(function() {
        outputs.unshift(loader.loads[loader.transpiler + '-runtime'].source);
      });
    });
  })
  .then(function() {
    return outputs;
  });
}

exports.compileOutputs = compileOutputs;

exports.attachCompilers = function(loader) {
  Object.keys(compilerMap).forEach(function(compiler) {
    var attach = compilerMap[compiler].attach;
    if (attach)
      attach(loader);
  });
}
