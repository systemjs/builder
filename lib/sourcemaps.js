var sourceMap = require('source-map');
var traceur = require('traceur');
var path = require('path');
var fs = require('fs');
var filePath = require('./utils').filePath;
var isFileURL = require('./utils').isFileURL;

var wrapSourceMap = function(map) {
  return new sourceMap.SourceMapConsumer(map);
};

var sourceMapRegEx = /\/\/[@#] ?(sourceURL|sourceMappingURL)=([^\n'"]+)/;
exports.removeSourceMaps = function(source) {
  return source.replace(sourceMapRegEx, '');
};

function getMapObject(map) {
  if (typeof map != 'string')
    return map;

  try {
    return JSON.parse(map);
  }
  catch(error) {
    throw new Error('Invalid JSON: ' + map);
  }
}

exports.concatenateSourceMaps = function(sourceFilename, mapsWithOffsets, sourceRoot, includeSourcesContent) {
  var contentsBySource = includeSourcesContent ? {} : null;
  var generated = new sourceMap.SourceMapGenerator({
    file: sourceFilename
  });

  mapsWithOffsets.forEach(function(pair) {
    var offset = pair[0];
    var map = getMapObject(pair[1]);

    if (includeSourcesContent && map.sourcesContent) {
      for (var i=0; i<map.sources.length; i++) {
        var source = (map.sourceRoot || '') + map.sources[i];
        if (!source.match(/\/@traceur/)) {
          if (!contentsBySource[source]) {
            contentsBySource[source] = map.sourcesContent[i];
          } else {
            if (contentsBySource[source] != map.sourcesContent[i]) {
              throw "Mismatched sourcesContent for: " + source;
            }
          }
        }
      }
    }

    wrapSourceMap(map).eachMapping(function(mapping) {
      if (mapping.source.match(/(\/|^)@traceur/))
        return;

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
    });
  });

  // convert from library internals format to canonical
  var normalized = JSON.parse(JSON.stringify(generated));
  var sourcePath;

  if (includeSourcesContent) {
    normalized.sourcesContent = normalized.sources.map(function(source) {
    //if (contentsBySource[source])
      //return contentsBySource[source];

    sourcePath = filePath(source);
    if (sourcePath)
      try { return fs.readFileSync(sourcePath).toString(); } catch (e) {}

    // remove this is optimistic return is reliable
    return contentsBySource[source];
    });
  }

  var rootIsPath = isFileURL(sourceRoot);
  normalized.sources = normalized.sources.map(function(source) {
    if (rootIsPath && isFileURL(source))
      return path.relative(sourceRoot, source).replace(/\\/g, '/');
    else
      return source;
  });

  return JSON.stringify(normalized);
};
