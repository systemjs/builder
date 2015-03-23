var path = require('path');
var mkdirp = require('mkdirp');
var fs = require('fs');
var Promise = require('rsvp').Promise;
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
function processOutputs(outputs) {
  var saucy = require('./sourcemaps');

  var offset = 0;

  var outputObj = {};

  var sources = outputObj.sources = [];
  var sourceMapsWithOffsets = outputObj.sourceMapsWithOffsets = [];

  if (!outputs)
    return outputObj;

  outputs.forEach(function(output) {
    var source;
    if (typeof output == 'object') {
      source = output.source || '';
      var offset_ = output.sourceMapOffset || 0;
      var map = output.sourceMap;
      if (map) {
        sourceMapsWithOffsets.push([offset + offset_, map]);
      }
    }
    // NB perhaps we should enforce output is always an object down the chain?
    else if (typeof output == 'string') {
      source = output;
    }
    else {
      throw "Unexpected output format: " + output.toString();
    }
    source = saucy.removeSourceMaps(source || '');
    offset += countLines(source);
    sources.push(source);
  });

  return outputObj;
}

function createOutput(outputs, outFile, baseURL, opts) {
  // process output
  var saucy = require('./sourcemaps');
  var sourceMap;

  var outputObj = processOutputs(outputs);

  if (opts.sourceMaps && outputObj.sourceMapsWithOffsets.length) {
    var sourceRoot = outFile ? path.dirname(baseURL + outFile) + path.sep : baseURL;
    var mapsWithOffsets = outputObj.sourceMapsWithOffsets;
    sourceMap = saucy.concatenateSourceMaps(outFile, mapsWithOffsets, sourceRoot, opts.sourceMapContents);
  }

  var output = outputObj.sources.join('\n');

  return {
    source: output,
    sourceMap: sourceMap
  };
}

function minify(output, fileName, mangle, globalDefs) {
  var uglify = require('uglify-js');
  var ast = uglify.parse(output.source, { filename: fileName });
  ast.figure_out_scope();
  ast = ast.transform(uglify.Compressor({
    dead_code: true,
    global_defs: globalDefs,
    warnings: false 
  }));
  ast.figure_out_scope();
  ast.compute_char_frequency();
  if (mangle !== false) {
    ast.mangle_names({
      except: ['require']
    });
  }

  var sourceMap;
  if (output.sourceMap)
    sourceMap = uglify.SourceMap({
      file: fileName,
      orig: output.sourceMap
    });

  output.source = ast.print_to_string({
    // for some reason non-ascii broke esprima.... this does break unicode though
    ascii_only: true,
    // keep first comment
    comments: function(node, comment) {
      return comment.line === 1 && comment.col === 0;
    },
    source_map: sourceMap
  });
  output.sourceMap = sourceMap;

  return output;
}

function writeOutputFile(opts, output, basePath) {
  var sourceMapFile;
  if (opts.sourceMaps && output.sourceMap) {
    sourceMapFile = path.basename(opts.outFile) + '.map';
    output.source += '\n//# sourceMappingURL=' + sourceMapFile;
  }

  return asp(mkdirp)(path.dirname(path.resolve(basePath, opts.outFile)))
  .then(function() {
    if (!output.sourceMap || !opts.sourceMaps) return;
    var sourceMapPath = path.resolve(basePath, path.dirname(opts.outFile), sourceMapFile);
    return asp(fs.writeFile)(sourceMapPath, output.sourceMap);
  })
  .then(function() {
    var sourcePath = path.resolve(basePath, opts.outFile);
    return asp(fs.writeFile)(sourcePath, output.source);
  });
}

exports.inlineSourceMap = inlineSourceMap;
function inlineSourceMap (output) {
  return output.source +
    '\n//# sourceMappingURL=data:application/json;base64,' +
    new Buffer(output.sourceMap.toString()).toString('base64');
}

exports.writeOutputs = function(opts, outputs, baseURL) {
  // remove 'file:' part
  var basePath = baseURL.substr(5);

  if (opts.outFile)
    opts.outFile = path.relative(basePath, path.resolve(opts.outFile));

  var output = createOutput(outputs, opts.outFile, baseURL, opts);

  if (opts.minify)
    output = minify(output, opts.outFile, opts.mangle, opts.globalDefs);

  if (opts.sourceMaps == 'inline') {
    output.source = inlineSourceMap(output);
    output.sourceMap = undefined;
  }

  if (opts.outFile)
    return writeOutputFile(opts, output, basePath).then(function() { return output; });
  else
    return Promise.resolve(output);
};
