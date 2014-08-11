// NB move these CommonJS layers out into a static operation on the CommonJS module rather

var path = require('path');
var traceur = require('traceur');
var compiler = new traceur.Compiler();
var ScopeTransformer = traceur.System.get('traceur@0.0.56/src/codegeneration/ScopeTransformer').ScopeTransformer;

function CJSRequireTransformer(requireName, map) {
  this.requireName = requireName;
  this.map = map;
  this.requires = [];
  return ScopeTransformer.call(this, requireName);
}
CJSRequireTransformer.prototype = Object.create(ScopeTransformer.prototype);
CJSRequireTransformer.prototype.transformCallExpression = function(tree) {
  if (!tree.operand.identifierToken || tree.operand.identifierToken.value != this.requireName)
    return ScopeTransformer.prototype.transformCallExpression.call(this, tree);

  // found a require
  var args = tree.args.args;
  if (args.length && args[0].type == 'LITERAL_EXPRESSION') {
    if (this.map)
      args[0].literalToken.value = '"' + this.map(args[0].literalToken.processedValue) + '"';

    this.requires.push(args[0].literalToken.processedValue);

    return ScopeTransformer.prototype.transformCallExpression.call(this, tree);
  }
}
exports.CJSRequireTransformer = CJSRequireTransformer;

function cjsOutput(name, deps, address, source, baseURL) {
  var filename = path.relative(baseURL, address);
  var dirname = path.dirname(filename);
  var output = 'System.register("' + name + '", ' + JSON.stringify(deps) + ', true, function(require, exports, module) {\n'
    + '  var global = System.global;\n'
    + '  var __define = global.define;\n'
    + '  global.define = undefined;\n'
    + '  var __filename = "' + filename + '";\n'
    + '  var __dirname = "' + dirname + '";\n'
    + '  ' + source.toString().replace(/\n/g, '\n  ') + '\n'
    + '  global.define = __define;\n'
    + '  return module.exports;\n'
    + '});\n'
  return output;
}

exports.compile = function(load, normalize, loader) {
  var deps = normalize ? load.metadata.deps.map(function(dep) { return load.depMap[dep]; }) : load.metadata.deps;

  return Promise.resolve(load.source)
  .then(function(source) {
    if (normalize) {
      return remap(source, function(dep) {
        return load.depMap[dep];
      })
      .then(function(output) {
        return output.source;
      });
    }
    return source;
  })
  .then(function(source) {
    //console.log(source);
    return { source: cjsOutput(load.name, deps, load.address, source, loader.baseURL) };
  });
}

function remap(source, map, fileName) {
  var output = compiler.stringToTree({content: source, options:{filename:fileName}});

  if (output.errors.length)
    return Promise.reject(output.errors[0]);
  
  var transformer = new CJSRequireTransformer('require', map);
  output.tree = transformer.transformAny(output.tree);

  if (output.errors.length)
    return Promise.reject(output.errors[0]);

  output = compiler.treeToString(output);

  if (output.errors.length)
    return Promise.reject(output.errors[0]);

  return Promise.resolve({
    source: output.js
  });
}
exports.remap = remap;