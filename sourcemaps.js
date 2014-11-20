var sourceMap = require('source-map');
var traceur = require('traceur');
var path = require('path');

var wrapSourceMap = function(map) {
  return new sourceMap.SourceMapConsumer(map);
};

exports.buildIdentitySourceMap = function(contents, filepath) {
  var options = {sourceMaps: 'memory'};
  var compiler = new traceur.Compiler(options);
  var tree = compiler.parse(contents, filepath);
  compiler.write(tree, filepath);
  var map = JSON.parse(compiler.getSourceMap());

  // this is odd, but map path is getting doubled-up
  //map.sources[0] = path.relative(map.sourceRoot, map.sources[0]);
  map.sourceRoot = '';

  return JSON.stringify(map);
};

exports.concatenateSourceMaps = function(sourceFilename, mapsWithOffsets, outPath) {
  var generated = new sourceMap.SourceMapGenerator({
    file: sourceFilename
  });

  mapsWithOffsets.forEach(function(pair) {
    var offset = pair[0];
    var mapSource = pair[1];
    var map;
    try {
      map = JSON.parse(mapSource);
    } catch (error) {
      throw new Error(mapSource + ": Invalid JSON");
    }

    // this is odd, sourceRoot is redundant (and causes doubling)
    map.sourceRoot = '';

    wrapSourceMap(map).eachMapping(function(mapping) {
      if (mapping.source.match(/^@traceur/)) {
        return;
      }
      generated.addMapping({
        generated: {
          line: offset + mapping.generatedLine,
          column: mapping.generatedColumn
        },
        original: {
          line: mapping.originalLine,
          column: mapping.originalColumn
        },
        source: mapping.source
      });

      originalLastLine = mapping.generatedLine;
    });
  });

  if (outPath) {
    // convert from library internals format to canonical
    var normalized = JSON.parse(JSON.stringify(generated));
    // convert paths to relative
    normalized.sources = normalized.sources.map(function(source) {
      return path.relative(outPath, source);
    });
    return JSON.stringify(normalized);
  }

  return generated.toString();
};
