var expect = require('unexpected');
var getTreeModulesPostOrder = require('../lib/trace').getTreeModulesPostOrder;

suite('Test post order traversal', function() {
  test('should return single module that has no incoming relation', function() {
    var tree = {
      'a': {
        deps: [],
        depMap: {}
      }
    };

    return expect(getTreeModulesPostOrder(tree).modules, 'to satisfy', ['a']);
  });

  test('should return modules that has no incoming relations', function() {
    var tree = {
      'a': {
        deps: [],
        depMap: {}
      },
      'b': {
        deps: [],
        depMap: {}
      }
    };

    return expect(getTreeModulesPostOrder(tree).modules, 'to satisfy', ['a', 'b']);
  });

  test('should resolve module names based on depMap', function() {
    var tree = {
      'a': {
        deps: ['foo'],
        depMap: {
          'foo': 'b'
        }
      },
      'b': {
        deps: [],
        depMap: {}
      }
    };

    return expect(getTreeModulesPostOrder(tree).modules, 'to satisfy', ['b', 'a']);
  });

  test('should order modules with dependencies first', function() {
    var tree = {
      'a': {
        deps: ['b', 'd'],
        depMap: {
          'b': 'b',
          'd': 'd'
        }
      },
      'b': {
        deps: ['c'],
        depMap: {
          'c': 'c'
        }
      },
      'c': {
        deps: [],
        depMap: {}
      },
      'd': {
        deps: [],
        depMap: {}
      }
    };

    return expect(getTreeModulesPostOrder(tree).modules, 'to satisfy', ['c', 'b', 'd', 'a']);
  });

  test('should order graph entries alphabetically', function() {
    var tree = {
      'a': {
        deps: ['b'],
        depMap: {
          'b': 'b'
        }
      },
      'b': {
        deps: ['c'],
        depMap: {
          'c': 'c'
        }
      },
      'c': {
        deps: [],
        depMap: {}
      },
      'd': {
        deps: [],
        depMap: {}
      }
    };

    return expect(getTreeModulesPostOrder(tree).modules, 'to satisfy', ['c', 'b', 'a', 'd']);
  });

  test('should override alphabetical graph entry order with entryPoints array', function() {
    var tree = {
      'a': {
        deps: ['b'],
        depMap: {
          'b': 'b'
        }
      },
      'b': {
        deps: ['c'],
        depMap: {
          'c': 'c'
        }
      },
      'c': {
        deps: [],
        depMap: {}
      },
      'd': {
        deps: [],
        depMap: {}
      }
    };

    return expect(getTreeModulesPostOrder(tree, ['d', 'a']).modules, 'to satisfy', ['d', 'c', 'b', 'a']);
  });

  test('should include entry points not present in given entryPoints order, in alphabetical order', function() {
    var tree = {
      'a': {
        deps: ['b'],
        depMap: {
          'b': 'b'
        }
      },
      'b': {
        deps: ['c'],
        depMap: {
          'c': 'c'
        }
      },
      'c': {
        deps: [],
        depMap: {}
      },
      'd': {
        deps: [],
        depMap: {}
      },
      'e': {
        deps: [],
        depMap: {}
      }
    };

    return expect(getTreeModulesPostOrder(tree, ['d']).modules, 'to satisfy', ['d', 'c', 'b', 'a', 'e']);
  });
});
