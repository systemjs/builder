var traceur = require('traceur');
var ParseTreeTransformer = traceur.get('codegeneration/ParseTreeTransformer.js').ParseTreeTransformer;
var CallExpression = traceur.get('syntax/trees/ParseTrees.js').CallExpression;
var ArgumentList = traceur.get('syntax/trees/ParseTrees.js').ArgumentList;
var ArrayLiteral = traceur.get('syntax/trees/ParseTrees.js').ArrayLiteral;
var createStringLiteral = traceur.get('codegeneration/ParseTreeFactory.js').createStringLiteral;

// converts anonymous System.register([] into named System.register('name', [], ...
// NB need to add that if no anon, last named must define this module
// also this should be rewritten with a proper parser!
function RegisterTransformer(moduleName, map) {
  this.name = moduleName;
  this.hasAnonRegister = false;
  this.map = map;
  return ParseTreeTransformer.call(this);
}

RegisterTransformer.prototype = Object.create(ParseTreeTransformer.prototype);
RegisterTransformer.prototype.transformCallExpression = function(tree) {
  tree = ParseTreeTransformer.prototype.transformCallExpression.call(this, tree);

  if (tree.operand.type == 'MEMBER_EXPRESSION'
      && tree.operand.memberName.value == 'register'
      && tree.operand.operand.type == 'IDENTIFIER_EXPRESSION'
      && tree.operand.operand.identifierToken.value == 'System') {

    var firstArg = tree.args.args[0];

    if (firstArg.type == 'ARRAY_LITERAL') {
      if (this.hasAnonRegister) {
        throw 'Source ' + this.name + ' has multiple anonymous System.register calls.';
      }

      // normalize dependencies in array
      var map = this.map;
      var normalizedDepArray = new ArrayLiteral(firstArg.location, firstArg.elements.map(function(el) {
        var str = el.literalToken.value.toString();
        return createStringLiteral(map(str.substr(1, str.length - 2)));
      }));

      this.hasAnonRegister = true;

      var newArgs = this.name ? [createStringLiteral(this.name), normalizedDepArray] : [normalizedDepArray];

      return new CallExpression(tree.location, tree.operand, 
          new ArgumentList(tree.args.location, newArgs.concat(tree.args.args.splice(1))));
    }
  }

  return tree;
}

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

  var transformer = new RegisterTransformer(!opts.anonymous && load.name, function(dep) { return opts.normalize ? load.depMap[dep] : dep; });
  tree = transformer.transformAny(tree);

  // if the transformer didn't find an anonymous System.register
  // then this is a bundle itself
  // so we need to reconstruct files with load.metadata.execute etc
  // if this comes up, we can tackle it or work around it
  if (!transformer.hasAnonRegister)
    throw new TypeError('Source ' + load.path + ' is already a bundle file, so can\'t be built as a module.');

  var output = compiler.write(tree, load.path);

  if (opts.systemGlobal != 'System')
    output = output.replace(/System\.register\(/, opts.systemGlobal + '.register(');

  return Promise.resolve({
    source: output,
    sourceMap: compiler.getSourceMap()
  });
};
