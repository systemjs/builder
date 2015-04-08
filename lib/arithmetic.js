var asp = require('rsvp').denodeify;
var Promise = require('rsvp').Promise;
var glob = require('glob');
var path = require('path');
var url = require('url');

function parseExpression(expressionString) {
  var args = ('+ ' + expressionString).split(' ');

  var operations = [];

  for (var i = 0; i < args.length; i += 2) {
    var operator = args[i];
    var moduleName = args[i + 1];

    if (operator !== '+' && operator !== '-' && operator !== '&')
      throw 'Expected operator before ' + operator;
    if (!moduleName)
      throw 'A module name is needed after ' + operator;

    // detect [moduleName] syntax for individual modules not trees
    var singleModule = moduleName.substr(0, 1) == '[' && moduleName.substr(moduleName.length - 1, 1) == ']';
    if (singleModule)
      moduleName = moduleName.substr(1, moduleName.length - 2);

    operations.push({
      operator: operator,
      moduleName: moduleName,
      singleModule: singleModule
    });
  }

  return operations;
}

function getTreeOperation(builder, symbol) {
  if (symbol == '+')
    return builder.addTrees;
  else if (symbol == '-')
    return builder.subtractTrees;
  else if (symbol == '&')
    return builder.intersectTrees;
  else
    throw 'Unknown operator ' + symbol;
}

function getTreeModuleOperation(builder, symbol) {
  if (symbol == '+')
    return function(tree, module) {
      var addedTree = {};
      for (var p in tree)
        addedTree[p] = tree[p];

      return builder.traceModule(module).then(function(trace) {
        addedTree[trace.moduleName] = trace.tree[trace.moduleName];
        return addedTree;
      });
    };
  else if (symbol == '-')
    return function(tree, module) {
      return Promise.resolve(builder.loader.normalize(module))
      .then(function(normalized) {
        var subtractedTree = {};
        for (var p in tree) {
          if (p != normalized)
            subtractedTree[p] = tree[p];
        }
        return subtractedTree;
      });
    };
  else if (symbol == '&')
    throw 'Single modules cannot be intersected.';
  else
    throw 'Unknown operator ' + symbol;
}

// reverse mapping from globbed address
function getModuleName(loader, address, pluginName) {
  // normalize address to ".js" if another extension plugin load
  if (pluginName) {
    var extension = address.split('/').pop();
    extension = extension.substr(extension.lastIndexOf('.'));
    if (extension != address && extension != '.js')
      address = address.substr(0, address.length - extension.length) + '.js';
  }

  // now just reverse apply paths rules to get canonical name
  var pathMatch, pathMatchLength = 0;
  var curMatchlength;
  for (var p in loader.paths) {


    var curPath = decodeURI(url.resolve(encodeURI(loader.baseURL), loader.paths[p].replace(/\\/g, '/')));
    var wIndex = curPath.indexOf('*');
    if (wIndex === -1) {
      if (address === curPath) {
        curMatchLength = curPath.split('/').length;
        if (curMatchLength > pathMatchLength) {
          pathMatch = p;
          pathMatchLength = curMatchLength;
        }
      }
    }
    else {
      if (address.substr(0, wIndex) === curPath.substr(0, wIndex)
        && address.substr(address.length - curPath.length + wIndex + 1) === curPath.substr(wIndex + 1)) {
        curMatchLength = curPath.split('/').length;
        if (curMatchLength > pathMatchLength) {
          pathMatch = p.replace('*', address.substr(wIndex, address.length - curPath.length + 1));
          pathMatchLength = curMatchLength;
        }
      }
    }
  }
  
  if (!pathMatch)
    throw "Unable to calculate path for " + address;
  
  if (pluginName)
    pathMatch += extension + '!' + (pluginName == extension ? '' : pluginName);
  
  return pathMatch;
}

function expandGlob(builder, operation) {
  if (operation.moduleName.indexOf('*') == -1)
    return [operation];

  var loader = builder.loader;
  var metadata = {};
  return loader.normalize(operation.moduleName)
  .then(function(normalized) {
    return loader.locate({ name: normalized, metadata: metadata });
  })
  .then(function(address) {
    // now we have a file path to glob -> glob the pattern
    return asp(glob)(address.substr(5), {
      nobrace: true,
      noext: true,
      nodir: true
    });
  }).then(function(addresses) {
    return addresses.map(function(file) {
      return {
        operator: operation.operator,
        moduleName: getModuleName(builder.loader, 'file:' + file, metadata.pluginName),
        singleModule: operation.singleModule
      };
    })
  });
}

exports.traceExpression = function(builder, expression, sfx) {
  var operations = parseExpression(expression);
  var expandedOperations = [];

  if (sfx)
    operations.forEach(function(operation) {
      if (operation.operator !== '+' || operation.singleModule === true)
        throw "SFX Bundles can only use addition and wildcard arithmetic.";
    });

  // expand any globbing operations in the expression
  var expandPromise = Promise.resolve();
  operations.forEach(function(operation) {
    expandPromise = expandPromise.then(function() {
      return Promise.resolve(expandGlob(builder, operation))
      .then(function(expanded) {
        expandedOperations = expandedOperations.concat(expanded);
      });
    });
  });

  return expandPromise.then(function() {
    // chain the operations, applying them with the trace of the next module
    return expandedOperations.reduce(function(p, op) {
      return p.then(function(curTree) {
        // tree . module
        if (op.singleModule)
          return getTreeModuleOperation(builder, op.operator)(curTree, op.moduleName);

        // tree . tree
        return builder.traceModule(op.moduleName)
        .then(function(nextTrace) {
          return getTreeOperation(builder, op.operator)(curTree, nextTrace.tree);
        });
      });
    }, Promise.resolve({}));
  })
  .then(function(tree) {
    if (!sfx)
      return tree;

    // normalize entry points
    return Promise.all(expandedOperations.map(function(op) {
      return builder.loader.normalize(op.moduleName);
    }))
    .then(function(normalizedEntryPoints) {
      return { 
        tree: tree, 
        entryPoints: normalizedEntryPoints
      };
    });
  });
};
