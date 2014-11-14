var traceur = require('traceur');
var ParseTreeTransformer = traceur.get('codegeneration/ParseTreeTransformer').ParseTreeTransformer;

function ModuleImportNormalizeTransformer(map) {
  this.map = map;
  return ParseTreeTransformer.apply(this, arguments);
}
ModuleImportNormalizeTransformer.prototype = Object.create(ParseTreeTransformer.prototype);
ModuleImportNormalizeTransformer.prototype.transformModuleSpecifier = function(tree) {
  // shouldn't really mutate, should create a new specifier
  var depName = this.map(tree.token.processedValue) || tree.token.processedValue;
  tree.token.value = "'" + depName + "'";
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

exports.compile = function(load, normalize) {

  var compiler = new traceur.Compiler({
    moduleName: load.name,
    modules: 'instantiate',
    script: false
  });

  var tree = compiler.parse(load.source, load.address);
  
  var transformer = new ModuleImportNormalizeTransformer(function(dep) {
    return normalize ? load.depMap[dep] : dep;
  });

  tree = compiler.transform(transformer.transformAny(tree), load.name);

  return Promise.resolve({
    source: compiler.write(tree)
  });
}