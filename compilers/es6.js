var traceur = require('traceur');

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

exports.TraceurImportNormalizeTransformer = TraceurImportNormalizeTransformer;


function remap(source, map, fileName) {
  var compiler = new traceur.Compiler();

  var tree = compiler.parse(source, fileName);

  tree = new TraceurImportNormalizeTransformer(map).transformAny(tree);

  return Promise.resolve({
    source: compiler.write(tree)
  });
}
exports.remap = remap;

// load the transpiler module with the plugin loader
exports.attach = function(loader) {
  // NB for better performance, we should just parse and 
  // cache the AST and store on the metadata, returning the deps only
  var loaderTranspile = loader.transpile;
  loader.transpile = function(load) {
    return loaderTranspile.call(this.pluginLoader || this, load);
  }
}

exports.compile = function(load, opts, loader) {
  var normalize = opts.normalize;
  var options;

  var source = load.source;

  return loader.pluginLoader.import(loader.transpiler).then(function(transpiler) {
    if (transpiler.__useDefault)
      transpiler = transpiler['default'];

    if (transpiler.Compiler) {
      options = loader.traceurOptions || {};
      options.modules = 'instantiate';
      options.script = false;
      options.sourceRoot = true;
      options.moduleName = true;

      if (opts.sourceMaps)
        options.sourceMaps = 'memory';
      if (opts.lowResSourceMaps)
        options.lowResolutionSourceMap = true;

      if (load.metadata.sourceMap)
        options.inputSourceMap = load.metadata.sourceMap;

      var compiler = new transpiler.Compiler(options);

      var tree = compiler.parse(source, load.address);

      var transformer = new TraceurImportNormalizeTransformer(function(dep) {
        return normalize ? load.depMap[dep] : dep;
      });

      tree = transformer.transformAny(tree);

      tree = compiler.transform(tree, load.name);

      var outputSource = compiler.write(tree, load.address);

      if (outputSource.match(/\$traceurRuntime/))
        load.metadata.usesTraceurRuntimeGlobal = true;

      return Promise.resolve({
        source: outputSource,
        sourceMap: compiler.getSourceMap()
      });
    }
    else {
      options = loader.babelOptions || {};
      options.modules = 'system';
      if (opts.sourceMaps)
        options.sourceMap = true;
      if (load.metadata.sourceMap)
        options.inputSourceMap = load.metadata.sourceMap;
      options.filename = load.address;
      options.filenameRelative = load.name;
      options.sourceFileName = load.address;
      options.keepModuleIdExtensions = true;
      options.code = true;
      options.ast = false;
      options.moduleIds = true;
      options.externalHelpers = true;
      options.metadataUsedHelpers = true;

      if (normalize)
        options.resolveModuleSource = function(dep) {
          return load.depMap[dep];
        };

      var output = transpiler.transform(source, options);

      if ((!options.optional || options.optional.indexOf('runtime') == -1) && output.usedHelpers.length)
        load.metadata.usesBabelHelpersGlobal = true;

      // pending Babel v5, we need to manually map the helpers
      if (options.optional && options.optional.indexOf('runtime') != -1)
        load.deps.forEach(function(dep) {
          if (dep.match(/^babel-runtime/))
            output.code = output.code.replace(dep, load.depMap[dep]);
        });

      return Promise.resolve({
        source: output.code,
        sourceMap: output.map
      });
    }
  });
};
