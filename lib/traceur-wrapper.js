var traceur = require('traceur');

exports.ArgumentList = traceur.get('syntax/trees/ParseTrees.js').ArgumentList;
exports.ParseTreeTransformer = traceur.get('codegeneration/ParseTreeTransformer.js').ParseTreeTransformer;
exports.CallExpression = traceur.get('syntax/trees/ParseTrees.js').CallExpression;
exports.createStringLiteral = traceur.get('codegeneration/ParseTreeFactory.js').createStringLiteral;
exports.ScopeTransformer = traceur.get('codegeneration/ScopeTransformer.js').ScopeTransformer;
exports.Script = traceur.get('syntax/trees/ParseTrees.js').Script;
exports.parseExpression = traceur.get('codegeneration/PlaceholderParser.js').parseExpression;
exports.parseStatements = traceur.get('codegeneration/PlaceholderParser.js').parseStatements;
exports.parseStatement = traceur.get('codegeneration/PlaceholderParser.js').parseStatement;

exports.createCompiler = function(options) {
  options = options || {};
  options.sourceRoot = true;
  return new traceur.Compiler(options);
};
