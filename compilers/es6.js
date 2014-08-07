var traceur = require('traceur');
var compiler = new traceur.Compiler();

var ParseTreeTransformer = traceur.System.get('traceur@0.0.56/src/codegeneration/ParseTreeTransformer').ParseTreeTransformer;

function ModuleImportNormalizeTransformer(depMap) {
  this.depMap = depMap;
  return ParseTreeTransformer.apply(this, arguments);
}
ModuleImportNormalizeTransformer.prototype = Object.create(ParseTreeTransformer.prototype);
ModuleImportNormalizeTransformer.prototype.transformImportDeclaration = function(tree) {

  var depName = tree.moduleSpecifier.token.processedValue;

  if (this.depMap[depName])
    depName = this.depMap[depName];

  tree.moduleSpecifier.token.value = "'" + depName + "'";
  return tree;

  /* if (binding === tree.binding) {
    return tree;
  }
  return new ImportedBinding(tree.location, binding);


  var bindingElement = new BindingElement(tree.location, tree.binding, null);
  var name = new LiteralPropertyName(null, createIdentifierToken('default'));
  return new ObjectPattern(null,
      [new ObjectPatternField(null, name, bindingElement)]); */
}


// converts anonymous AMDs into named AMD for the module
exports.compile = function(load) {

  var output = compiler.stringToTree({content: load.source, options: {
    moduleName: load.name,
    modules: 'instantiate'
  }});
  
  var transformer = new ModuleImportNormalizeTransformer(load.depMap);
  output.tree = transformer.transformAny(output.tree);

  output = compiler.treeToTree(output);

  output = compiler.treeToString(output);

  if (output.errors.length)
    return Promise.reject(output.errors);

  return Promise.resolve({
    source: output.js
  });
}