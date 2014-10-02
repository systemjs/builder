var traceur = require('traceur');

var ParseTreeTransformer = traceur.get('codegeneration/ParseTreeTransformer').ParseTreeTransformer;

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

function remap(source, map, fileName) {
  var compiler = new traceur.Compiler();

  var tree = compiler.parse(source, fileName);
  
  tree = new ModuleImportNormalizeTransformer(map).transformAny(tree);

  return Promise.resolve({
    source: compiler.write(tree)
  });
}
exports.remap = remap;

// converts anonymous AMDs into named AMD for the module
exports.compile = function(load) {

  var compiler = new traceur.Compiler({
    moduleName: load.name,
    modules: 'instantiate'
  });

  var tree = compiler.parse(load.source, load.address);
  
  var transformer = new ModuleImportNormalizeTransformer(function(dep) {
    return load.depMap[dep];
  });

  tree = compiler.transform(transformer.transformAny(tree));

  return Promise.resolve({
    source: compiler.write(tree)
  });
}