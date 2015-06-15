var path = require('path');
var url = require('url');
var traceur = require('traceur');
var ParseTreeTransformer = traceur.get('codegeneration/ParseTreeTransformer.js').ParseTreeTransformer;
var Script = traceur.get('syntax/trees/ParseTrees.js').Script;
var parseStatements = traceur.get('codegeneration/PlaceholderParser.js').parseStatements;
var STRING = traceur.get('syntax/TokenType.js').STRING;
var LiteralExpression = traceur.get('syntax/trees/ParseTrees.js').LiteralExpression;
var LiteralToken = traceur.get('syntax/LiteralToken.js').LiteralToken;

// remap require() statements
function CJSRequireTransformer(requireName, map) {
  this.requireName = requireName;
  this.map = map;
  this.requires = [];
  return ParseTreeTransformer.call(this);
}
CJSRequireTransformer.prototype = Object.create(ParseTreeTransformer.prototype);
CJSRequireTransformer.prototype.transformCallExpression = function(tree) {
  if (!tree.operand.identifierToken || tree.operand.identifierToken.value != this.requireName)
    return ParseTreeTransformer.prototype.transformCallExpression.call(this, tree);

  // found a require
  var args = tree.args.args;
  if (args.length && args[0].type == 'LITERAL_EXPRESSION' && args.length == 1) {
    if (this.map)
      args[0].literalToken.value = '"' + this.map(args[0].literalToken.processedValue) + '"';

    this.requires.push(args[0].literalToken.processedValue);
  }

  return ParseTreeTransformer.prototype.transformCallExpression.call(this, tree);
}
exports.CJSRequireTransformer = CJSRequireTransformer;


// convert CommonJS into System.registerDynamic
function CJSRegisterTransformer(name, deps, address) {
  this.name = name;
  this.deps = deps;
  this.address = address;
  this.usesFilePaths = false;
  return ParseTreeTransformer.call(this);
}

CJSRegisterTransformer.prototype = Object.create(ParseTreeTransformer.prototype);

CJSRegisterTransformer.prototype.transformMemberExpression = function(tree) {
  if (tree.operand.operand && tree.operand.operand.identifierToken && 
      tree.operand.operand.identifierToken.value == 'process' && 
      tree.operand.memberName == 'env' && tree.memberName.value == 'NODE_ENV') {
    return new LiteralExpression(tree.location, new LiteralToken(STRING, '"production"', tree.location));
  }
  return tree;
};
CJSRegisterTransformer.prototype.transformIdentifierExpression = function(tree) {
  var value = tree.identifierToken.value;
  if (!this.usesFilePaths && value == '__filename' || value == '__dirname')
    this.usesFilePaths = true;
  return ParseTreeTransformer.prototype.transformIdentifierExpression.call(this, tree);
};

CJSRegisterTransformer.prototype.transformScript = function(tree) {
  tree = ParseTreeTransformer.prototype.transformScript.call(this, tree);

  var scriptItemList = tree.scriptItemList;

  if (this.usesFilePaths)
    scriptItemList = parseStatements([
      "var __filename = module.id, __dirname = module.id.split('/').splice(0, module.id.split('/').length - 1).join('/');"
    ]).concat(scriptItemList);

  scriptItemList = parseStatements([
    'var global = this, __define = global.define;\n'
    + 'global.define = undefined;'
  ]).concat(scriptItemList).concat(parseStatements([
    'global.define = __define;\n'
    +  'return module.exports;'
  ]));

  // wrap everything in System.register
  return new Script(tree.location, parseStatements([
    'System.registerDynamic("' + this.name + '", ' + JSON.stringify(this.deps) + ', true, function(require, exports, module) {\n',
    '});'], scriptItemList));
};
exports.CJSRegisterTransformer = CJSRequireTransformer;

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

  var transformer;

  if (opts.normalize) {
    transformer = new CJSRequireTransformer('require', function(dep) { return load.depMap[dep]; });
    tree = transformer.transformAny(tree);
  }

  var deps = opts.normalize ? load.metadata.deps.map(function(dep) { return load.depMap[dep]; }) : load.metadata.deps;

  transformer = new CJSRegisterTransformer(load.name, deps, load.address);
  tree = transformer.transformAny(tree);

  var output = compiler.write(tree, load.address);

  return Promise.resolve({
    source: output,
    sourceMap: compiler.getSourceMap()
  });
};

function remap(source, map, fileName) {
  var options = {script: true};
  var compiler = new traceur.Compiler(options);
  var tree = compiler.parse(source, fileName);

  var transformer = new CJSRequireTransformer('require', map);
  tree = transformer.transformAny(tree);

  var output = compiler.write(tree, fileName);
  return Promise.resolve({
    source: output
  });
}
exports.remap = remap;
