var saucy = require('./sourcemaps');
var path = require('path');
var mkdirp = require('mkdirp');
var fs = require('fs');
var asp = require('rsvp').denodeify;

function countLines(str) {
  return str.split(/\r\n|\r|\n/).length;
}

// Process compiler outputs, gathering:
//
//   concatOutputs:         list of source strings to concatenate
//   sourceMapsWithOffsets: list of [absolute offset,
//                                   source map string] pairs
//
//  Takes lists as empty references and populates via push.
function processOutputs(outputs, concatOutput, sourceMapsWithOffsets) {
  var offset = 0;

  if (!outputs) return;

  outputs.forEach(function(output) {
    var source;
    if (typeof output == "object") {
      source = output.source || '';
      var offset_ = output.sourceMapOffset || 0;
      var map = output.sourceMap;
      if (map) {
        sourceMapsWithOffsets.push([offset + offset_, map]);
      }
    } else if (typeof output == "string") {
      source = output;
    } else {
      throw "Unexpected output format: " + output.toString();
    }
    offset += countLines(source);
    concatOutput.push(source);
  });
}

exports.writeOutputFile = function(outFile, outputs) {
  var concatOutput = [];
  var sourceMapsWithOffsets = [];

  processOutputs(outputs, concatOutput, sourceMapsWithOffsets);

  var outPath = path.dirname(outFile);
  return asp(mkdirp)(outPath).then(function() {
    if (sourceMapsWithOffsets.length > 0) {
      var sourceOutFile = outFile + '.map';
      var combinedSourceMap = saucy.concatenateSourceMaps(
        outFile,
        sourceMapsWithOffsets,
        'file:' + path.resolve(outPath)
        );
      concatOutput.push('//# sourceMappingURL=' + sourceOutFile);
      return asp(fs.writeFile)(sourceOutFile, combinedSourceMap);
    }
  }).then(function () {
    return asp(fs.writeFile)(outFile, concatOutput.join('\n'));
  });
};
