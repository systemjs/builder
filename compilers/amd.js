var System = require('systemjs');
var traceur = require('traceur');
var vm = require('vm');

var ParseTreeTransformer = traceur.get('codegeneration/ParseTreeTransformer.js').ParseTreeTransformer;
var parseExpression = traceur.get('codegeneration/PlaceholderParser.js').parseExpression;

var CJSRequireTransformer = require('./cjs').CJSRequireTransformer;

// First of two-pass transform
// lists number of define statements, the named module it defines (if any), and deps
// second pass will do rewriting based on this info
// we set this.isAnon, which is true if there is one named define, or one anonymous define
// if there are more than one anonymous defines, it is invalid
function AMDDependenciesTransformer(map) {
  // optional mapping function
  this.map = map;
  this.anonDefine = false;
  this.defineBundle = false;
  this.deps = [];
  this.defineRedefined = false;
  return ParseTreeTransformer.call(this);
}
AMDDependenciesTransformer.prototype = Object.create(ParseTreeTransformer.prototype);
AMDDependenciesTransformer.prototype.filterAMDDeps = function(deps) {
  var newDeps = [];
  deps.forEach(function(dep) {
    if (['require', 'exports', 'module'].indexOf(dep) != -1)
      return;
    newDeps.push(dep);
  });
  return newDeps;
};
// NB we should really extend this to any scope change
AMDDependenciesTransformer.prototype.transformFunctionDeclaration = function(tree) {
  var defineRedefined = this.defineRedefined;
  tree = ParseTreeTransformer.prototype.transformFunctionDeclaration.call(this, tree);
  if (defineRedefined === false)
    this.defineRedefined = false;
  return tree;
};
AMDDependenciesTransformer.prototype.transformVariableDeclaration = function(tree) {
  if (tree.lvalue.identifierToken.value == 'define')
    this.defineRedefined = true;
  return tree;
};
AMDDependenciesTransformer.prototype.transformCallExpression = function(tree) {
  if (this.defineRedefined || !tree.operand.identifierToken || tree.operand.identifierToken.value != 'define')
    return ParseTreeTransformer.prototype.transformCallExpression.call(this, tree);

  var args = tree.args.args;
  var name = args[0].type === 'LITERAL_EXPRESSION' && args[0].literalToken.processedValue;

  // anonymous define
  if (!name) {
    this.anonDefine = true;
  }
  // named define
  else {
    // if we don't have any other defines,
    // then let this be an anonymous define
    if (!this.anonDefine && !this.defineBundle)
      this.anonDefine = true;

    // otherwise its a bundle only
    else {
      this.anonDefine = false;
      this.deps = [];
    }

    // the above is just to support single modules of the form:
    // define('jquery')
    // still loading anonymously
    // because it is done widely enough to be useful

    // note this is now a bundle
    this.defineBundle = true;
  }

  // only continue to extracting dependencies if we're anonymous
  if (!this.anonDefine)
    return tree;

  var depArg;

  if (args[0].type === 'ARRAY_LITERAL')
    depArg = 0;
  else if (args[1] && args[1].type == 'ARRAY_LITERAL')
    depArg = 1;

  if (typeof depArg == 'number') {
    var deps = args[depArg].elements.map(function(dep) {
      return dep.literalToken.processedValue;
    });

    // apply the map
    var depMap = this.map;
    if (depMap)
      deps = deps.map(function(dep) {
        if (['require', 'exports', 'module'].indexOf(dep) != -1)
          return dep;
        return depMap(dep);
      });

    // store dependencies for trace
    this.deps = this.filterAMDDeps(deps);

    // this is ONLY a mutation for remap which will be deprecated
    args[depArg] = parseExpression([JSON.stringify(deps)]);

    return tree;
  }

  var cjsFactory;

  if (args[0].type == 'FUNCTION_EXPRESSION')
    cjsFactory = args[0];
  else if (args[0].type == 'LITERAL_EXPRESSION' && args[1] && args[1].type == 'FUNCTION_EXPRESSION')
    cjsFactory = args[1];
  /* else if (args[0].type == 'IDENTIFIER_EXPRESSION')
    this.globalCJSRequires = true; */

  if (cjsFactory) {
    // now we need to do a scope transformer for the require function at this position
    var fnParameters = cjsFactory.parameterList.parameters;
    var reqName = fnParameters[0] && fnParameters[0].parameter.binding.identifierToken.value;

    // now we create a new scope transformer and apply it to this function to find every call of
    // the function reqName, noting the require
    var cjsRequires = new CJSRequireTransformer(reqName);
    cjsFactory.body = cjsRequires.transformAny(cjsFactory.body);
    this.deps = this.filterAMDDeps(cjsRequires.requires);
  }

  this.defineRedefined = true;

  return tree;
};
exports.AMDDependenciesTransformer = AMDDependenciesTransformer;

// AMD System.registerDynamic transpiler
// This is the second of the two pass transform
function AMDDefineRegisterTransformer(moduleName, load, isAnon, depMap) {
  this.name = moduleName;
  this.load = load;
  this.isAnon = isAnon;
  this.depMap = depMap;
  this.defineRedefined = false;
  return ParseTreeTransformer.call(this);
}
AMDDefineRegisterTransformer.prototype = Object.create(ParseTreeTransformer.prototype);
AMDDefineRegisterTransformer.prototype.transformVariableDeclaration = AMDDependenciesTransformer.prototype.transformVariableDeclaration;
AMDDefineRegisterTransformer.prototype.transformFunctionDeclaration = AMDDependenciesTransformer.prototype.transformFunctionDeclaration;
AMDDefineRegisterTransformer.prototype.transformCallExpression = function(tree) {
  if (this.defineRedefined || !tree.operand.identifierToken || tree.operand.identifierToken.value != 'define')
    return ParseTreeTransformer.prototype.transformCallExpression.call(this, tree);

  var self = this;
  var args = tree.args.args;
  var name = this.name;

  // check for named modules
  if (args[0].type === 'LITERAL_EXPRESSION') {
    if (!this.isAnon)
      name = args[0].literalToken.processedValue;
    args = args.splice(1);
  }

  if (!args[0])
    return;

  var deps;
  var factoryTree;

  if (args[0].type === 'ARRAY_LITERAL') {
    deps = args[0].elements.map(function(dep) {
      return dep.literalToken.processedValue;
    });

    factoryTree = args[1];
  }
  else if (args[0].type == 'OBJECT_LITERAL' || args[0].type == 'IDENTIFIER_EXPRESSION') {
    factoryTree = args[0];
  }
  else if (args[0].type == 'FUNCTION_EXPRESSION') {
    // deps already parsed on trace
    deps = ['require', 'exports', 'module'].splice(0, args[0].parameterList.parameters.length).concat(this.load.deps);
    factoryTree = args[0];
  }
  else {
    // not valid define
    return ParseTreeTransformer.prototype.transformCallExpression.call(this, tree);
  }

  deps = deps || [];

  // normalize existing dep array
  deps = deps.map(function(dep) {
    if (['require', 'exports', 'module'].indexOf(dep) != -1)
      return dep;
    return self.load.depMap[dep] || dep;
  });

  // normalize CommonJS-style requires in body
  var requireIndex = deps.indexOf('require');
  if (requireIndex != -1 && factoryTree.type == 'FUNCTION_EXPRESSION') {
    var fnParameters = factoryTree.parameterList.parameters;
    var reqName = fnParameters[requireIndex] && fnParameters[requireIndex].parameter.binding.identifierToken.value;
    var cjsRequireTransformer = new CJSRequireTransformer(reqName, function(v) { return self.depMap[v] || v });
    factoryTree.body = cjsRequireTransformer.transformAny(factoryTree.body);
  }

  // ammend deps with extra dependencies from metadata or CJS trace
  deps = deps.concat(this.load.deps.map(function(dep) {
    return self.load.depMap[dep] || dep;
  }).filter(function(dep) {
    return deps.indexOf(dep) == -1;
  }));

  this.defineRedefined = true;

  return parseExpression(['define(' + (name ? '"' + name + '", ' : '') + (deps ? JSON.stringify(deps) + ', ' : ''), ');'], factoryTree);
};
exports.AMDDefineRegisterTransformer = AMDDefineRegisterTransformer;

function dedupe(deps) {
  var newDeps = [];
  for (var i = 0, l = deps.length; i < l; i++)
    if (newDeps.indexOf(deps[i]) == -1)
      newDeps.push(deps[i])
  return newDeps;
}

function group(deps) {
  var names = [];
  var indices = [];
  for (var i = 0, l = deps.length; i < l; i++) {
    var index = names.indexOf(deps[i]);
    if (index === -1) {
      names.push(deps[i]);
      indices.push([i]);
    }
    else {
      indices[index].push(i);
    }
  }
  return { names: names, indices: indices };
}

// override System instantiate to handle AMD dependencies
exports.attach = function(loader) {
  var systemInstantiate = loader.instantiate;
  loader.instantiate = function(load) {
    var loader = this;

    return systemInstantiate.call(this, load).then(function(result) {
      if (load.metadata.format == 'amd') {
        // extract AMD dependencies using tree parsing
        // NB can remove after Traceur 0.0.77
        if (!load.source) load.source = ' ';
        var compiler = new traceur.Compiler({ script: true, sourceRoot: true });
        load.metadata.parseTree = compiler.parse(load.source, load.path);
        var depTransformer = new AMDDependenciesTransformer();
        depTransformer.transformAny(load.metadata.parseTree);

        // we store the results as meta
        load.metadata.isAnon = depTransformer.anonDefine;
        // load.metadata.globalCJSRequires = depTransformer.globalCJSRequires;

        /* if (depTransformer.globalCJSRequires) {
          var cjsRequires = new CJSRequireTransformer('require');
          cjsRequires.transformAny(load.metadata.parseTree);
          depTransformer.deps = depTransformer.filterAMDDeps(cjsRequires.requires);
        } */

        var entry = loader.defined[load.name];
        entry.deps = dedupe(depTransformer.deps.concat(load.metadata.deps));

        load.metadata.builderExecute = function(require, exports, module) {
          var removeDefine = loader.get('@@amd-helpers').createDefine(loader);

          // NB source maps, System overwriting skipped here
          vm.runInThisContext(load.source);

          removeDefine(loader);

          var lastModule = loader.get('@@amd-helpers').lastModule;

          if (!lastModule.anonDefine && !lastModule.isBundle)
            throw new TypeError('AMD module ' + load.name + ' did not define');

          if (lastModule.anonDefine)
            return lastModule.anonDefine.execute.apply(this, arguments);

          lastModule.isBundle = false;
          lastModule.anonDefine = null;
        };

        // first, normalize all dependencies
        var normalizePromises = [];
        for (var i = 0, l = entry.deps.length; i < l; i++)
          normalizePromises.push(Promise.resolve(loader.normalize(entry.deps[i], load.name)));

        return Promise.all(normalizePromises).then(function(normalizedDeps) {
          entry.normalizedDeps = normalizedDeps;
          entry.originalIndices = group(entry.deps);

          return {
            deps: entry.deps,
            execute: result.execute
          };
        });
      }

      return result;
    });
  };
};

exports.remap = function(source, map, fileName) {
  var options = { script: true, sourceRoot: true };
  var compiler = new traceur.Compiler(options);
  var tree = compiler.parse(source, fileName || '');
  var transformer = new AMDDependenciesTransformer(map);
  tree = transformer.transformAny(tree);

  /* if (transformer.globalCJSRequires) {
    var cjsRequires = new CJSRequireTransformer('require', function(v) { return map[v] || v; });
    tree = cjsRequires.transformAny(tree);
  } */

  var output = compiler.write(tree);
  return Promise.resolve(output);
};


// converts anonymous AMDs into named AMD for the module
exports.compile = function(load, opts, loader) {
  var normalize = opts.normalize;
  var options = { sourceRoot: true, script: true };
  if (opts.sourceMaps)
    options.sourceMaps = 'memory';
  if (opts.lowResSourceMaps)
    options.lowResolutionSourceMap = true;

  if (load.metadata.sourceMap)
    options.inputSourceMap = load.metadata.sourceMap;

  var compiler = new traceur.Compiler(options);

  var tree = load.metadata.parseTree || compiler.parse(load.source, load.path);
  var transformer = new AMDDefineRegisterTransformer(!opts.anonymous && load.name, load, load.metadata.isAnon, normalize ? load.depMap : {});
  tree = transformer.transformAny(tree);

  // normalize cjs requires
  /* if (load.metadata.globalCJSRequires) {
    var cjsRequires = new CJSRequireTransformer('require', normalize && function(v) { return load.depMap[v] || v; });
    tree = cjsRequires.transformAny(tree);
  } */

  var output = compiler.write(tree, load.path);

  // because we've blindly replaced the define statement from AMD with a System.registerDynamic call
  // we have to ensure we still trigger any AMD guard statements in the code by creating a dummy define which isn't called
  return Promise.resolve({
    source: '(function() {\nvar _removeDefine = ' + opts.systemGlobal + '.get("@@amd-helpers").createDefine();\n' + output + '\n_removeDefine();\n})();',
    sourceMap: compiler.getSourceMap(),
    sourceMapOffset: 2
  });
};

exports.sfx = function(loader) {
  return require('fs').readFileSync(require('path').resolve(__dirname, '../templates/amd-helpers.js')).toString();
};
