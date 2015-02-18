var traceur = require('traceur');
var babel = require('babel-core');

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

  if (loader.transpiler == 'babel') {
    options = loader.babelOptions || {};
    options.modules = 'system';
    if (opts.sourceMaps)
      options.sourceMap = true;
    options.filename = load.address;
    options.filenameRelative = load.name;
    options.sourceFileName = load.address;
    options.keepModuleIdExtensions = true;
    options.code = true;
    options.ast = false;
    options.moduleIds = true;

    if (normalize)
      options.resolveModuleSource = function(dep) {
        return load.depMap[dep];
      };

    /* if (opts.runtime) {
      options.optional = options.optional || [];
      if (options.optional.indexOf('selfContained') == -1)
        options.optional.push('selfContained')
    } */
    var output = babel.transform(source, options);

    return Promise.resolve({
      source: output.code,
      sourceMap: output.map
    });
  }
  else {
    options = loader.traceurOptions || {};
    options.modules = 'instantiate';
    options.script = false;
    options.moduleName = load.name;

    if (opts.sourceMaps)
      options.sourceMaps = 'memory';
    if (opts.lowResSourceMaps)
      options.lowResolutionSourceMap = true;

    if (load.metadata.sourceMap)
      options.inputSourceMap = load.metadata.sourceMap;

    var compiler = new traceur.Compiler(options);

    var tree = compiler.parse(source, load.address);

    var transformer = new TraceurImportNormalizeTransformer(function(dep) {
      return normalize ? load.depMap[dep] : dep;
    });

    tree = transformer.transformAny(tree);

    if (loader.transpiler == 'traceur')
      tree = compiler.transform(tree, load.name);

    var outputSource = compiler.write(tree, load.address);

    return Promise.resolve({
      source: outputSource,
      sourceMap: compiler.getSourceMap()
    });
  }
};
