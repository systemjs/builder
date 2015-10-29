var asp = require('rsvp').denodeify;
var Promise = require('rsvp').Promise;
var glob = require('glob');
var path = require('path');
var url = require('url');

var getLoadDependencies = require('./trace').getLoadDependencies;

var fromFileURL = require('./utils').fromFileURL;
var toFileURL = require('./utils').toFileURL;

var verifyTree = require('./utils').verifyTree;

function parseExpression(expressionString) {
  var args = ('+ ' + expressionString).split(' ');

  var operations = [];

  for (var i = 0; i < args.length; i += 2) {
    var operator = args[i];
    var moduleName = args[i + 1];

    if (operator !== '+' && operator !== '-' && operator !== '&')
      throw new TypeError('Expected operator before ' + operator);
    if (!moduleName)
      throw new TypeError('A module name is needed after ' + operator);

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

function getTreeOperation(symbol) {
  if (symbol == '+')
    return addTrees;
  else if (symbol == '-')
    return subtractTrees;
  else if (symbol == '&')
    return intersectTrees;
  else
    throw new TypeError('Unknown operator ' + symbol);
}

function getTreeModuleOperation(builder, symbol) {
  if (symbol == '+')
    return function(tree, canonical) {
      var addedTree = {};
      for (var p in tree)
        addedTree[p] = tree[p];

      return builder.tracer.getLoadRecord(canonical).then(function(load) {
        addedTree[canonical] = load;
        return addedTree;
      });
    };
  else if (symbol == '-')
    return function(tree, canonical) {
      var subtractedTree = {};
      for (var p in tree) {
        if (p != canonical)
          subtractedTree[p] = tree[p];
      }
      return subtractedTree;
    };
  else if (symbol == '&')
    throw new TypeError('Single modules cannot be intersected.');
  else
    throw new TypeError('Unknown operator ' + symbol);
}

function expandGlobAndCanonicalize(builder, operation) {
  var loader = builder.loader;

  // no glob -> just canonicalize
  if (operation.moduleName.indexOf('*') == -1)
    return loader.normalize(operation.moduleName)
    .then(function(normalized) {
      operation.moduleName = builder.getCanonicalName(normalized);
      return [operation];
    });

  // globbing
  var metadata = {};
  return loader.normalize(operation.moduleName)
  .then(function(normalized) {
    return loader.locate({ name: normalized, metadata: metadata });
  })
  .then(function(address) {
    // now we have a file path to glob -> glob the pattern
    return asp(glob)(fromFileURL(address), {
      nobrace: true,
      noext: true,
      nodir: true
    });
  }).then(function(addresses) {
    return addresses.map(function(file) {
      return {
        operator: operation.operator,
        moduleName: builder.getCanonicalName(toFileURL(file) + (metadata.loader ? '!' + metadata.loader : '')),
        singleModule: operation.singleModule
      };
    })
  });
}

exports.traceExpression = function(builder, expression, traceOpts) {
  if (!expression)
    throw new Error('A module expression must be provided to trace.');

  var operations = parseExpression(expression);
  var expandedOperations = [];

  // expand any globbing operations in the expression
  var expandPromise = Promise.resolve();
  operations.forEach(function(operation) {
    expandPromise = expandPromise.then(function() {
      return Promise.resolve(expandGlobAndCanonicalize(builder, operation))
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
        return builder.tracer.traceModule(op.moduleName, traceOpts.traceAllConditionals, traceOpts.conditions, traceOpts.traceConditionsOnly)
        .then(function(nextTrace) {
          return getTreeOperation(op.operator)(curTree, nextTrace.tree);
        });
      });
    }, Promise.resolve({}));
  });
};


// returns a new tree containing tree1 n tree2
exports.intersectTrees = intersectTrees;
function intersectTrees(tree1, tree2) {
  verifyTree(tree1);
  verifyTree(tree2);

  var name;
  var intersectTree = {};

  var tree1Names = [];
  for (name in tree1)
    tree1Names.push(name);

  for (name in tree2) {
    if (tree1Names.indexOf(name) == -1)
      continue;
    // intersect deps layer (load: false) and actual bundle includes separately
    if (tree1[name] === false && tree2[name] === false)
      continue;

    intersectTree[name] = tree1[name] || tree2[name];
  }

  return intersectTree;
};

// returns a new tree containing tree1 + tree2
exports.addTrees = addTrees;
function addTrees(tree1, tree2) {
  verifyTree(tree1);
  verifyTree(tree2);

  var name;
  var unionTree = {};

  for (name in tree2)
    unionTree[name] = tree2[name];

  for (name in tree1)
    if (!(name in unionTree))
      unionTree[name] = tree1[name];

  return unionTree;
}

// returns a new tree containing tree1 - tree2
exports.subtractTrees = subtractTrees;
function subtractTrees(tree1, tree2) {
  verifyTree(tree1);
  verifyTree(tree2);

  var name;
  var subtractTree = {};

  for (name in tree1)
    subtractTree[name] = tree1[name];

  for (name in tree2)
    if (tree2[name] !== false || tree1[name] === false)
      delete subtractTree[name];

  return subtractTree;
};

// pre-order tree traversal with a visitor and stop condition
exports.traverseTree = traverseTree;
function traverseTree(tree, moduleName, visitor, parent, seen) {
  verifyTree(tree);

  seen = seen || [];
  seen.push(moduleName);
  parent = parent || null;

  var curNode = tree[moduleName];

  if (curNode && visitor(moduleName, parent) !== false)
    getLoadDependencies(curNode).forEach(function(dep) {
      if (seen.indexOf(dep) == -1)
        traverseTree(tree, dep, visitor, moduleName, seen);
    });
}




