// NB move these CommonJS layers out into a static operation on the CommonJS module rather?

var path = require('path');
var traceur = require('traceur');
var saucy = require('../sourcemaps');
var compiler = new traceur.Compiler();
var ParseTreeTransformer = traceur.get('codegeneration/ParseTreeTransformer').ParseTreeTransformer;

function CJSRequireTransformer(requireName, map) {
  this.requireName = requireName;
  this.map = map;
  this.requires = [];
  return ParseTreeTransformer.call(this, requireName);
}
CJSRequireTransformer.prototype = Object.create(ParseTreeTransformer.prototype);
CJSRequireTransformer.prototype.transformCallExpression = function(tree) {
  if (!tree.operand.identifierToken || tree.operand.identifierToken.value != this.requireName)
    return ParseTreeTransformer.prototype.transformCallExpression.call(this, tree);

  // found a require
  var args = tree.args.args;
  if (args.length && args[0].type == 'LITERAL_EXPRESSION') {
    if (this.map)
      args[0].literalToken.value = '"' + this.map(args[0].literalToken.processedValue) + '"';

    this.requires.push(args[0].literalToken.processedValue);
  }

  return ParseTreeTransformer.prototype.transformCallExpression.call(this, tree);
}
exports.CJSRequireTransformer = CJSRequireTransformer;

function cjsOutput(name, deps, address, source, baseURL) {
  // TODO: handle transitive compile if normalized (remap)
  if (typeof source == 'object') {
    source = source.source;
  }
  var filename = path.relative(baseURL, address).replace(/\\/g, "/");
  var dirname = path.dirname(filename);
  var output = 'System.register("' + name + '", ' + JSON.stringify(deps) + ', true, function(require, exports, module) {\n'
    + '  var global = System.global;\n'
    + '  var __define = global.define;\n'
    + '  global.define = undefined;\n'
    + '  var __filename = "' + filename + '";\n'
    + '  var __dirname = "' + dirname + '";\n'
    //+ '  ' + source.toString().replace(/\n/g, '\n  ') + '\n'
    + source.toString() + '\n'
    + '  global.define = __define;\n'
    + '  return module.exports;\n'
    + '});\n'
  return output;
}

exports.compile = function(load, normalize, loader) {
  var deps = normalize ? load.metadata.deps.map(function(dep) { return load.depMap[dep]; }) :
                         load.metadata.deps;

  return Promise.resolve(load.source)
  .then(function(source) {
    if (normalize) {
      return remap(source, function(dep) {
        return load.depMap[dep];
      }, load.address)
      .then(function(output) {
        return output;
      });
    }
    return source;
  })
  .then(function(source) {
    var output = cjsOutput(load.name, deps, load.address, source, loader.baseURL);
    return {
      source: output,
      sourceMap: saucy.buildIdentitySourceMap(output, load.address),
      sourceMapOffset: 6
    };
  });
};

function remap(source, map, fileName) {
  // NB can remove after Traceur 0.0.77
  if (!source) source = ' ';
  var options = {script: true, sourceMaps: 'memory'};
  var compiler = new traceur.Compiler(options);
  var tree = compiler.parse(source, fileName);

  var transformer = new CJSRequireTransformer('require', map);
  tree = transformer.transformAny(tree);

  var output = compiler.write(tree, fileName);
  return Promise.resolve({
    source: output,
    sourceMap: compiler.getSourceMap()
  });
}
exports.remap = remap;
