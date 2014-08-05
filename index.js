var Promise = require('rsvp').Promise;

var traceur = require('traceur');
var System = exports.System = require('systemjs');
var fs = require('fs');

var asp = require('rsvp').denodeify;

var registerCompiler = require('./compilers/register');
var amdCompiler = require('./compilers/amd');
var cjsCompiler = require('./compilers/cjs');
var globalCompiler = require('./compilers/global');

var path = require('path');

// TODO source maps
var loader = new Loader(System);
loader.baseURL = System.baseURL;
loader.paths = { '*': '*.js' };
loader.config = System.config;

var pluginLoader = new Loader(System);
pluginLoader.baseURL = System.baseURL;
pluginLoader.paths = { '*': '*.js' };
pluginLoader.config = System.config;

loader.trace = true;
loader.execute = false;
loader.pluginLoader = pluginLoader;


exports.build = function(moduleName, config, outFile) {

  return exports.trace(moduleName, config)
  .then(function(trace) {
    return exports.buildTree(trace.tree, outFile)
  });
}

function compileLoad(load, sfx) {
  if (load.metadata.build == false) {
    return;
  }
  else if (load.metadata.format == 'es6') {
    var result = traceur.compile(load.source, {
      moduleName: load.name,
      modules: 'instantiate'
    });
    return result.js;
  }
  else if (load.metadata.format == 'register') {
    return registerCompiler.compile(load, sfx, loader).then(function(result) {
      return result.source;
    });
  }
  else if (load.metadata.format == 'amd') {
    return amdCompiler.compile(load, sfx, loader).then(function(result) {
      return result.source;
    });
  }
  else if (load.metadata.format == 'cjs') {
    return cjsCompiler.compile(load, sfx, loader).then(function(result) {
      return result.source;
    });
  }
  else if (load.metadata.format == 'global') {
    return globalCompiler.compile(load, sfx, loader).then(function(result) {
      return result.source;
    });
  }
  else {
    throw "unknown format " + load.metadata.format;
  }
}

exports.buildTree = function(tree, outFile) {
  var concatOutput = ['"format register";\n'];

  return Promise.all(Object.keys(tree).map(function(name) {
    var load = tree[name];

    return Promise.resolve(compileLoad(load))
    .then(concatOutput.push.bind(concatOutput));
  }))
  .then(function() {
    return asp(fs.writeFile)(outFile, concatOutput.join('\n'));  
  });
}

exports.buildSFX = function(moduleName, config, outFile) {
  var concatOutput = [];
  return exports.trace(moduleName, config)
  .then(function(trace) {
    var tree = trace.tree;
    moduleName = trace.moduleName;
    return Promise.all(Object.keys(tree).map(function(name) {
      var load = tree[name];

      return compileLoad(load, true)
      .then(concatOutput.push.bind(concatOutput));
    }));
  })
  .then(function() {
    return asp(fs.readFile)(path.resolve(__dirname, './sfx/sfx-core.js'));
  })
  // add the core at the beginning
  .then(function(sfxcore) {
    concatOutput.unshift("('" + moduleName + "', function(System) {\n");
    concatOutput.unshift(sfxcore);
    if (registerCompiler.sfx)
      return registerCompiler.sfx(loader);
  })
  .then(function(result) {
    concatOutput.push(result || '');
    if (amdCompiler.sfx)
      return amdCompiler.sfx(loader);
  })
  .then(function(result) {
    concatOutput.push(result || '');
    if (cjsCompiler.sfx)
      return cjsCompiler.sfx(loader);
  })
  .then(function(result) {
    concatOutput.push(result || '');
    if (globalCompiler.sfx)
      return globalCompiler.sfx(loader);
  })
  .then(function(result) {
    concatOutput.push(result || '');
    concatOutput.push("});");
  })
  .then(function() {
    return asp(fs.writeFile)(outFile, concatOutput.join('\n'));  
  });
}

exports.config = function(config) {
  loader.config(config);
  pluginLoader.config(config);
}

// returns a new tree containing tree1 n tree2
exports.intersectTrees = function(tree1, tree2) {
  var intersectTree = {};

  var tree1Names = [];
  for (var name in tree1)
    tree1Names.push(name);

  for (var name in tree2) {
    if (tree1Names.indexOf(name) == -1)
      continue;
    
    intersectTree[name] = tree1[name];
  }

  return intersectTree;
}

// returns a new tree containing tree1 + tree2
exports.addTrees = function(tree1, tree2) {
  var unionTree = {};

  for (var name in tree2)
    unionTree[name] = tree2[name];

  for (var name in tree1)
    unionTree[name] = tree1[name];

  return unionTree;
}

// returns a new tree containing tree1 - tree2
exports.subtractTrees = function(tree1, tree2) {
  var subtractTree = {};

  for (var name in tree1)
    subtractTree[name] = tree1[name];

  for (var name in tree2)
    delete subtractTree[name];

  return subtractTree;
}

// copies a subtree out of the tree
exports.extractTree = function(tree, moduleName) {
  var outTree = {};
  return visitTree(tree, moduleName, function(load) {
    outTree[load.name] = load;
  })
  .then(function() {
    return outTree;
  });
}

exports.trace = function(moduleName, config) {
  if (config) {
    loader.config(config);
    pluginLoader.config(config);
  }

  var System = loader.global.System;
  loader.global.System = loader;

  var traceTree = {};

  return loader.import(moduleName)
  .then(function() {
    return loader.normalize(moduleName);
  })
  .then(function(_moduleName) {
    moduleName = _moduleName;
    loader.global.System = System;
    return visitTree(loader.loads, moduleName, function(load) {
      traceTree[load.name] = load;
    });
  })
  .then(function() {
    return {
      moduleName: moduleName,
      tree: traceTree
    };
  })
  .catch(function(e) {
    loader.global.System = System;
    throw e;
  });
}

function visitTree(tree, moduleName, visit, seen) {
  seen = seen || [];

  if (seen.indexOf(moduleName) != -1)
    return;

  seen.push(moduleName);

  var load = tree[moduleName];

  if (!load)
    return Promise.resolve()

  // visit the deps first
  return Promise.all(load.deps.map(function(dep) {
    return Promise.resolve(visitTree(tree, load.depMap[dep], visit, seen));
  })).then(function() {
    // if we are the bottom of the tree, visit
    return visit(load);
  });
}
