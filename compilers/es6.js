var traceur = require('traceur');
var to5 = require('6to5');


var ParseTreeTransformer = traceur.get('codegeneration/ParseTreeTransformer.js').ParseTreeTransformer;
function TraceurImportNormalizeTransformer(map) {
  this.map = map;
  return ParseTreeTransformer.apply(this, arguments);
}
TraceurImportNormalizeTransformer.prototype = Object.create(ParseTreeTransformer.prototype);
TraceurImportNormalizeTransformer.prototype.transformModuleSpecifier = function(tree) {
  // shouldn't really mutate, should create a new specifier
  var depName = this.map(tree.token.processedValue) || tree.token.processedValue;
  tree.token.value = "'" + depName + "'";
  return tree;
};


function remap(source, map, fileName) {
  var compiler = new traceur.Compiler();

  var tree = compiler.parse(source, fileName);

  tree = new TraceurImportNormalizeTransformer(map).transformAny(tree);

  return Promise.resolve({
    source: compiler.write(tree)
  });
}
exports.remap = remap;

exports.compile = function(load, opts, loader) {
  var normalize = opts.normalize;
  var options;

  var source = load.source;

  if (loader.parser == '6to5') {
    options = loader.to5Options || {};
    options.modules = 'system';
    options.sourceMap = true;
    options.filename = load.address;
    options.filenameRelative = load.name;
    options.code = true;
    options.ast = false;
    options.moduleIds = true;
    /*
    if (opts.runtime) {
      options.optional = options.optional || [];
      if (options.optional.indexOf('selfContained') == -1)
        options.optional.push('selfContained') 
    }
    */
    var output = to5.transform(source, options);
    
    source = output.code;
    if (output.map)
      load.metadata.sourceMap = output.map;
  }

  // NB todo - create an inline 6to5 transformer to do import normalization
  // still need Traceur because of this
  options = loader.traceurOptions || {};
  options.modules = 'instantiate';
  options.script = false;
  options.moduleName = load.name;

  if (opts.sourceMaps)
    options.sourceMaps = 'memory';
  if (opts.lowResolutionSourceMaps)
    options.lowResolutionSourceMap = true;

  if (load.metadata.sourceMap)
    options.inputSourceMap = load.metadata.sourceMap;

  var compiler = new traceur.Compiler(options);

  var tree = compiler.parse(source, load.address);

  var transformer = new TraceurImportNormalizeTransformer(function(dep) {
    return normalize ? load.depMap[dep] : dep;
  });

  tree = transformer.transformAny(tree);

  if (loader.parser == 'traceur')
    tree = compiler.transform(tree, load.name);

  var source = compiler.write(tree, load.address);
  return Promise.resolve({
    source: source,
    sourceMap: compiler.getSourceMap()
  });
};
