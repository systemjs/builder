var compiler = require('./compiler');

var traceurGet = require('../lib/utils').traceurGet;
var ParseTreeTransformer = traceurGet('codegeneration/ParseTreeTransformer.js').ParseTreeTransformer;
var parseExpression = traceurGet('codegeneration/PlaceholderParser.js').parseExpression;
var LiteralToken = traceurGet('syntax/LiteralToken.js').LiteralToken;
var IdentifierExpression = traceurGet('syntax/trees/ParseTrees.js').IdentifierExpression;
var IdentifierToken = traceurGet('syntax/IdentifierToken.js').IdentifierToken;
var BindingIdentifier = traceurGet('syntax/trees/ParseTrees.js').BindingIdentifier;

// remap require() statements
function CJSRequireTransformer(requireName, map, mappedRequireName) {
  this.requireName = requireName;
  this.mappedRequireName = mappedRequireName || requireName;
  this.map = map;
  this.requires = [];
  return ParseTreeTransformer.call(this);
}
CJSRequireTransformer.prototype = Object.create(ParseTreeTransformer.prototype);
CJSRequireTransformer.prototype.transformCallExpression = function (tree) {
  // found a require
  if (tree.operand.identifierToken && tree.operand.identifierToken.value == this.requireName
    && tree.args.args.length && tree.args.args.length == 1) {

    var arg = tree.args.args[0];
    var mappedCallExpression;

    // require('x');
    if (arg.literalToken) {
      var requireModule = tree.args.args[0].literalToken.processedValue;

      // mirror behaviour at https://github.com/systemjs/systemjs/blob/0.19.8/lib/cjs.js#L50 to remove trailing slash
      if (requireModule[requireModule.length - 1] == '/')
        requireModule = requireModule.substr(0, requireModule.length - 1);

      var requireModuleMapped = this.map && this.map(requireModule) || requireModule;

      this.requires.push(requireModule);

      mappedCallExpression = parseExpression([this.mappedRequireName + "('" + requireModuleMapped + "')"], []);
    }
    // require(expr)
    else {
      mappedCallExpression = parseExpression([this.mappedRequireName + '(', ')'], [arg]);
    }

    return ParseTreeTransformer.prototype.transformCallExpression.call(this, mappedCallExpression);
  }

  return ParseTreeTransformer.prototype.transformCallExpression.call(this, tree);
};

CJSRequireTransformer.prototype.transformBindingIdentifier = function (tree) {
  if (tree.identifierToken.value == this.requireName)
    tree = new BindingIdentifier(tree.location, new IdentifierToken(tree.identifierToken.location, this.mappedRequireName));
  return ParseTreeTransformer.prototype.transformBindingIdentifier.call(this, tree);
};

CJSRequireTransformer.prototype.transformIdentifierExpression = function (tree) {
  if (tree.identifierToken.value == this.requireName)
    tree = new IdentifierExpression(tree.location, new IdentifierToken(tree.identifierToken.location, this.mappedRequireName));
  return ParseTreeTransformer.prototype.transformIdentifierExpression.call(this, tree);
};
exports.CJSRequireTransformer = CJSRequireTransformer;

exports.compile = function (load, opts, loader) {

  opts.moduleId = !opts.anonymous && load.name;

  var deps = opts.normalize ? load.deps.map(function (dep) { return load.depMap[dep]; }) : load.deps;

  // send normalized globals into the transformer
  var normalizedGlobals;
  if (load.metadata.globals) {
    normalizedGlobals = {};
    for (var g in load.metadata.globals)
      normalizedGlobals[g] = opts.normalize ? load.depMap[load.metadata.globals[g]] : load.metadata.globals[g];
  }

  // remove loader base url from path
  var path;
  if (opts.static) {
    path = load.path;
    if (path.substr(0, loader.baseURL.length) == loader.baseURL)
      path = path.substr(loader.baseURL.length);
  }

  return compiler.compile(load, opts, [require('babel-plugin-transform-cjs-system-wrapper').default, {
    deps: deps,
    globals: normalizedGlobals,
    optimize: opts.production,
    map: function(dep) {
      return opts.normalize ? load.depMap[dep] : dep;
    },
    path: path,
    static: opts.static,
    systemGlobal: opts.systemGlobal
  }]);
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