var sourceMap = require('source-map');
var traceur = require('traceur');
var path = require('path');

var isWin = process.platform.match(/^win/);

var wrapSourceMap = function(map) {
  return new sourceMap.SourceMapConsumer(map);
};

var sourceMapRegEx = /\/\/[@#] ?(sourceURL|sourceMappingURL)=([^\n'"]+)/;
exports.removeSourceMaps = function(source) {
  return source.replace(sourceMapRegEx, '');
};

exports.buildIdentitySourceMap = function(old_source, filepath) {
  // TODO: support transitive source maps
  if (typeof old_source == "object") {
    old_source = old_source.source;
  }
  var options = {sourceMaps: 'memory'};
  var compiler = new traceur.Compiler(options);
  var tree = compiler.parse(old_source, filepath);
  var source = compiler.write(tree, filepath);
  var sourceMap = compiler.getSourceMap();

  // this is odd, but map path is getting doubled-up
  var map = JSON.parse(sourceMap);
  //map.sources[0] = path.relative(map.sourceRoot, map.sources[0]);
  map.sourceRoot = '';
  sourceMap = JSON.stringify(map);

  return {source: source, sourceMap: sourceMap};
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
      if (isWin)
        return path.relative(outPath, source).replace(/\\/g, '/');
      else
        return path.relative(outPath, source);
    });
    return JSON.stringify(normalized);
  }

  return generated.toString();
};
