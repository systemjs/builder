var path = require('path');
var url = require('url');
var traceur = require('traceur');
var ParseTreeTransformer = traceur.get('codegeneration/ParseTreeTransformer.js').ParseTreeTransformer;
var Script = traceur.get('syntax/trees/ParseTrees.js').Script;
var parseStatements = traceur.get('codegeneration/PlaceholderParser.js').parseStatements;
var parseExpression = traceur.get('codegeneration/PlaceholderParser.js').parseExpression;
var STRING = traceur.get('syntax/TokenType.js').STRING;
var LiteralExpression = traceur.get('syntax/trees/ParseTrees.js').LiteralExpression;
var LiteralToken = traceur.get('syntax/LiteralToken.js').LiteralToken;
var IdentifierExpression = traceur.get('syntax/trees/ParseTrees.js').IdentifierExpression;
var IdentifierToken = traceur.get('syntax/IdentifierToken.js').IdentifierToken;
var BindingIdentifier = traceur.get('syntax/trees/ParseTrees.js').BindingIdentifier;
var createUseStrictDirective = traceur.get('codegeneration/ParseTreeFactory.js').createUseStrictDirective;

function hasRemoveUseStrict(list) {
  for (var i = 0; i < list.length; i++) {
    if (!list[i].isDirectivePrologue())
      return false;
    if (list[i].isUseStrictDirective()) {
      list.splice(i, 1);
      return true;
    }
  }
  return false;
}

// remap require() statements
function CJSRequireTransformer(requireName, map, mappedRequireName) {
  this.requireName = requireName;
  this.mappedRequireName = mappedRequireName || requireName;
  this.map = map;
  this.requires = [];
  return ParseTreeTransformer.call(this);
}
CJSRequireTransformer.prototype = Object.create(ParseTreeTransformer.prototype);
CJSRequireTransformer.prototype.transformCallExpression = function(tree) {
  // found a require
  if (tree.operand.identifierToken && tree.operand.identifierToken.value == this.requireName
      && tree.args.args.length && tree.args.args[0].type == 'LITERAL_EXPRESSION' && tree.args.args.length == 1) {  
    var requireModule = tree.args.args[0].literalToken.processedValue;
    var requireModuleMapped = this.map && this.map(requireModule) || requireModule;

    this.requires.push(requireModule);

    var mappedCallExpression = parseExpression([this.mappedRequireName + "('" + requireModuleMapped + "')"], []);

    return ParseTreeTransformer.prototype.transformCallExpression.call(this, mappedCallExpression);
  }

  return ParseTreeTransformer.prototype.transformCallExpression.call(this, tree);
};

CJSRequireTransformer.prototype.transformBindingIdentifier = function(tree) {
  if (tree.identifierToken.value == this.requireName)
    tree = new BindingIdentifier(tree.location, new IdentifierToken(tree.identifierToken.location, this.mappedRequireName));
  return ParseTreeTransformer.prototype.transformBindingIdentifier.call(this, tree);
};

CJSRequireTransformer.prototype.transformIdentifierExpression = function(tree) {
  if (tree.identifierToken.value == this.requireName)
    tree = new IdentifierExpression(tree.location, new IdentifierToken(tree.identifierToken.location, this.mappedRequireName));
  return ParseTreeTransformer.prototype.transformIdentifierExpression.call(this, tree);
};
exports.CJSRequireTransformer = CJSRequireTransformer;


// convert CommonJS into System.registerDynamic
function CJSRegisterTransformer(name, deps, address, optimize, globals, systemGlobal) {
  this.name = name;
  this.deps = deps;
  this.address = address;
  this.usesFilePaths = false;
  this.optimize = optimize;
  this.globals = globals;
  this.systemGlobal = systemGlobal;
  return ParseTreeTransformer.call(this);
}

CJSRegisterTransformer.prototype = Object.create(ParseTreeTransformer.prototype);

CJSRegisterTransformer.prototype.transformMemberExpression = function(tree) {
  if (this.optimize && tree.operand.operand && tree.operand.operand.identifierToken && 
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
  var nl = '\n    ';

  if (this.usesFilePaths)
    scriptItemList = parseStatements([
      "var __filename = module.id, __dirname = module.id.split('/').splice(0, module.id.split('/').length - 1).join('/');"
    ]).concat(scriptItemList);

  var globalExpression = '';
  if (this.globals) {
    globalExpression = 'var ';
    var first = true;
    for (var g in this.globals) {
      globalExpression += (first ? '' : ', ') + g + '= $__require("' + this.globals[g] + '")';
      first = false;
    }
    if (first == true)
      globalExpression = '';
    globalExpression += ';';
  }

  var useStrict = hasRemoveUseStrict(scriptItemList) && [createUseStrictDirective()] || [];

  scriptItemList = useStrict.concat(parseStatements([
    globalExpression + nl
    + 'var global = this, __define = global.define;' + nl + 'global.define = undefined;'
  ])).concat(scriptItemList).concat(parseStatements([
    'global.define = __define;' + nl
    + 'return module.exports;'
  ]));

  // wrap everything in System.register
  return new Script(tree.location, parseStatements([
    this.systemGlobal + '.registerDynamic(' + (this.name ? '"' + this.name + '", ' : '') + JSON.stringify(this.deps) + ', true, function($__require, exports, module) {\n',
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
  var tree = compiler.parse(load.source, load.path);

  var transformer;

  if (opts.normalize) {
    transformer = new CJSRequireTransformer('require', function(dep) { return load.depMap[dep]; }, '$__require');
    tree = transformer.transformAny(tree);
  }

  var deps = opts.normalize ? load.deps.map(function(dep) { return load.depMap[dep]; }) : load.deps;

  var globals = {};
  for (var g in load.metadata.globals) {
    globals[g] = load.depMap[load.metadata.globals[g]] || load.metadata.globals[g];
  }
  transformer = new CJSRegisterTransformer(!opts.anonymous && load.name, deps, load.path, opts.minify, globals, opts.systemGlobal);
  tree = transformer.transformAny(tree);

  var output = compiler.write(tree, load.path);

  if (opts.systemGlobal != 'System')
    output = output.replace(/(^|[^_])System\._nodeRequire/g, function(match, startArg) {
      return startArg + opts.systemGlobal + '._nodeRequire';
    });

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
