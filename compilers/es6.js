var traceur = require('traceur');
var compiler = new traceur.Compiler();

var ParseTreeTransformer = traceur.System.get('traceur@0.0.56/src/codegeneration/ParseTreeTransformer').ParseTreeTransformer;

function ModuleImportNormalizeTransformer(map) {
  this.map = map;
  return ParseTreeTransformer.apply(this, arguments);
}
ModuleImportNormalizeTransformer.prototype = Object.create(ParseTreeTransformer.prototype);
ModuleImportNormalizeTransformer.prototype.transformImportDeclaration = function(tree) {

  var depName = this.map(tree.moduleSpecifier.token.processedValue);

  tree.moduleSpecifier.token.value = "'" + depName + "'";
  return tree;
}

function remap(source, map) {
  var output = compiler.stringToTree({content: source});

  if (output.errors.length)
    return Promise.reject(output.errors[0]);
  
  var transformer = new ModuleImportNormalizeTransformer(map);
  output.tree = transformer.transformAny(output.tree);

  output = compiler.treeToString(output);

  if (output.errors.length)
    return Promise.reject(output.errors[0]);

  return Promise.resolve({
    source: output.js
  });
}
exports.remap = remap;

// converts anonymous AMDs into named AMD for the module
exports.compile = function(load) {
  var output = compiler.stringToTree({
    content: load.source, 
    options: {
      filename: load.address,
      moduleName: load.name,
      modules: 'instantiate'
    }
  });

  if (output.errors.length)
    return Promise.reject(output.errors[0]);
  
  var transformer = new ModuleImportNormalizeTransformer(function(dep) {
    return load.depMap[dep];
  });
  
  output.tree = transformer.transformAny(output.tree);

  if (output.errors.length)
    return Promise.reject(output.errors[0]);
  
  output = compiler.treeToTree(output);

  if (output.errors.length)
    return Promise.reject(output.errors[0]);

  output = compiler.treeToString(output);

  if (output.errors.length)
    return Promise.reject(output.errors[0]);

  return Promise.resolve({
    source: output.js
  });
}