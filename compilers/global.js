var traceur = require('traceur');
var ParseTreeTransformer = traceur.get('codegeneration/ParseTreeTransformer.js').ParseTreeTransformer;
var parseStatements = traceur.get('codegeneration/PlaceholderParser.js').parseStatements;
var parseStatement = traceur.get('codegeneration/PlaceholderParser.js').parseStatement;
var parseExpression = traceur.get('codegeneration/PlaceholderParser.js').parseExpression;
var Script = traceur.get('syntax/trees/ParseTrees.js').Script;
var FunctionBody = traceur.get('syntax/trees/ParseTrees.js').FunctionBody;

// wraps global scripts
function GlobalTransformer(name, deps, exportName, globals) {
  this.name = name;
  this.deps = deps;
  this.exportName = exportName;
  this.varGlobals = [];
  this.fnGlobals = [];
  this.globals = globals;
  this.inOuterScope = true;
  return ParseTreeTransformer.call(this);
}

GlobalTransformer.prototype = Object.create(ParseTreeTransformer.prototype);

GlobalTransformer.prototype.transformVariableDeclarationList = function(tree) {
  this.isVarDeclaration = tree.declarationType == 'var';
  return ParseTreeTransformer.prototype.transformVariableDeclarationList.call(this, tree);
}

GlobalTransformer.prototype.transformVariableDeclaration = function(tree) {
  tree = ParseTreeTransformer.prototype.transformVariableDeclaration.call(this, tree);

  if (!this.inOuterScope || !this.isVarDeclaration)
    return tree;

  var varName = tree.lvalue.identifierToken.value;
  if (this.varGlobals.indexOf(varName) == -1)
    this.varGlobals.push(varName);

  return tree;
}
GlobalTransformer.prototype.enterScope = function() {
  var revert = this.inOuterScope;
  this.inOuterScope = false;
  return revert;
}
GlobalTransformer.prototype.exitScope = function(revert) {
  if (revert)
    this.inOuterScope = true;
}

GlobalTransformer.prototype.transformFunctionDeclaration = function(tree) {
  // named functions in outer scope are globals
  if (this.inOuterScope && tree.name)
    this.fnGlobals.push(tree.name.identifierToken.value);
  var revert = this.enterScope();
  tree = ParseTreeTransformer.prototype.transformFunctionDeclaration.call(this, tree);
  this.exitScope(revert);
  return tree;
}

GlobalTransformer.prototype.transformFunctionExpression = function(tree) {
  var revert = this.enterScope();
  tree = ParseTreeTransformer.prototype.transformFunctionExpression.call(this, tree);
  this.exitScope(revert);
  return tree;
}

GlobalTransformer.prototype.transformScript = function(tree) {
  tree = ParseTreeTransformer.prototype.transformScript.call(this, tree);

  // hoist function declaration assignments to the global
  var scriptItemList = this.fnGlobals.map(function(g) {
    return parseStatement(['this["' + g + '"] = ' + g + ';']);
  })
  // for globals defined as "var x = 5;" in outer scope, add "this.x = x;" at end
  .concat(this.varGlobals.map(function(g) {
    return parseStatement(['var ' + g + ' = this["' + g + '"];']);
  }))
  .concat(tree.scriptItemList).concat(this.varGlobals.map(function(g) {
    return parseStatement(['this["' + g + '"] = ' + g + ';']);
  }));

  var wrapperFunction = parseExpression(['function() {}'])
  wrapperFunction.location = null;
  wrapperFunction.body = new FunctionBody(null, scriptItemList);

  var globalExpression;
  if (this.globals) {
    var nl = '\n    ';
    globalExpression = '{';
    var first = true;
    for (var g in this.globals) {
      globalExpression += (first ? '' : ',') + nl + '"' + g + '": __require("' + this.globals[g] + '"),';
      first = false;
    }
    globalExpression += nl + '}';
  }

  return new Script(tree.location, parseStatements([
      'System.registerDynamic("' + this.name + '", ' + JSON.stringify(this.deps) + ', false, function(__require, __exports, __module) {\n'
      + 'var _retrieveGlobal = System.get("@@global-helpers").prepareGlobal(__module.id, '
      + (this.exportName ? '"' + this.exportName + '"' : 'null') + ', ' + (globalExpression ? globalExpression : 'null') + ');\n'
      + '  (',
      ')();\n'
      + '  return _retrieveGlobal();\n'
      + '});'], wrapperFunction));
}
exports.GlobalTransformer = GlobalTransformer;

exports.compile = function(load, opts, loader) {
  var options = { script: true, sourceRoot: true };

  if (opts.sourceMaps)
    options.sourceMaps = 'memory';
  if (opts.lowResSourceMaps)
    options.lowResolutionSourceMap = true;

  if (load.metadata.sourceMap)
    options.inputSourceMap = load.metadata.sourceMap;

  var compiler = new traceur.Compiler(options);
  var tree = compiler.parse(load.source, load.address);

  var deps = opts.normalize ? load.metadata.deps.map(function(dep) { return load.depMap[dep]; }) : load.metadata.deps;

  // send normalized globals into the transformer
  var normalizedGlobals
  if (load.metadata.globals) {
    normalizedGlobals = {};
    for (var g in load.metadata.globals)
      normalizedGlobals[g] = opts.normalize ? load.depMap[load.metadata.globals[g]] : load.metadata.globals[g];
  }

  var transformer = new GlobalTransformer(load.name, deps, load.metadata.exports, normalizedGlobals);
  tree = transformer.transformAny(tree);

  var output = compiler.write(tree, load.address);

  return Promise.resolve({
    source: output,
    sourceMap: compiler.getSourceMap()
  });
};


exports.sfx = function(loader) {
  return require('fs').readFileSync(require('path').resolve(__dirname, '../templates/global-helpers.js')).toString();
};
