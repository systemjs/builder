var asp = require('rsvp').denodeify;
var Promise = require('rsvp').Promise;
var glob = require('glob');

function parseExpression(expressionString) {
  var args = '+ ' + expressionString.split(' ');

  var operations = [];

  for (var i = 0; i < args.length; i += 2) {
    var operator = args[i];
    var moduleName = args[i + 1];

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
    throw 'Unknown operator ' + op.operator;
}

function getTreeModuleOperation(builder, symbol) {
  if (symbol == '+')
    return function(tree, module) {
      
      var addedTree = {};
      for (var p in tree)
        addedTree[p] = tree[p];

      return builder.trace(module).then(function(trace) {
        addedTree[trace.moduleName] = trace.tree;
        return addedTree;
      });
    };
  else if (symbol == '-')
    return function(tree, module) {
      var subtractedTree = {};
      for (var p in tree) {
        if (p != module)
          subtractedTree[p] = tree[p];
      }
      return subtractedTree;
    };
  else if (symbol == '&')
    throw 'Single modules cannot be intersected.';
  else
    throw 'Unknown operator ' + op.operator;
}

// reverse mapping from globbed address
function getModuleName(loader, address) {
  var name = path.relative(this.baseURL, address);
  
  // now just reverse apply paths rules to get canonical name
  for (var p in loader.paths) {
    var path = loader.paths[p];
    var wIndex = path.indexOf('*');
    if (name.substr(0, wIndex) === path.substr(0, wIndex) 
        && name.substr(name.length - path.length + wIndex - 1) === path.substr(wIndex - 1))
      return p.replace('*', name.substr(wIndex, name.length - path.length + 1));
  }
}

function expandGlob(builder, operation) {
  if (operation.moduleName.indexOf('*') == -1)
    return [operation];

  var loader = builder.loader;
  return loader.normalize(operation.moduleName)
  .then(function(normalized) {
    return loader.locate({ name: normalized, metadata: {} });
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
        moduleName: getModuleName(builder.loader, 'file:' + file),
        singleModule: operation.singleModule
      };
    })
  });
}

exports.traceExpression = function(builder, expression, cfg) {
  var builder = this;

  var operations = parseExpression(expression);
  var expandedOperations = [];

  // expand any globbing operations in the expression
  var expandPromise = Promise.resolve();
  operations.forEach(function(operation) {
    expandPromise.then(function() {
      return expandGlob(builder, operation)
      .then(function(expanded) {
        expandedOperations = expandedOperations.concat(expanded);
      });
    });
  });

  return Promise.resolve(expandPromise)
  .then(function() {
    builder.config(cfg);

    // chain the operations, applying them with the trace of the next module
    return expandedOperations.reduce(function(p, op) {
      return p.then(function(curTree) {
        // tree . module
        if (op.singleModule)
          return getTreeModuleOperation(op.operator)(builder, curTree, op.moduleName);

        // tree . tree
        return builder.trace(op.moduleName)
        .then(function(nextTrace) {
          return getTreeOperation(op.operator)(builder, curTree, nextTrace.tree);
        });
      });
    }, Promise.resolve({}));
  });
};
