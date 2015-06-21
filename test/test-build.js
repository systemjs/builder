var Builder = require('../index');
var inline = require('../lib/output').inlineSourceMap;
var fs = require('fs');
var Promise = require('rsvp').Promise;
var spawn = require('child_process').spawn;
if (process.argv[2] == 'typescript')
  global.ts = require('typescript');

var minify = true;

var err = function(e) {
  setTimeout(function() {
    throw e;
  });
};

var builder = new Builder('test/fixtures/test-tree');

var cfg = {
  paths: {
    'jquery-cdn': 'https://code.jquery.com/jquery-2.1.1.min.js',
    'babel': './node_modules/babel-core/browser.js',
    'babel/external-helpers': './node_modules/babel-core/external-helpers.js',
    'traceur': './node_modules/traceur/bin/traceur.js',
    'traceur-runtime': './node_modules/traceur/bin/traceur-runtime.js'
  },
  meta: {
    'jquery-cdn': {
      build: false
    }
  }
};

function testPhantom(html) {
  return new Promise(function(resolve, reject) {
    spawn('node_modules/.bin/mocha-phantomjs', [html], { stdio: 'inherit' })
    .on('close', function(code) {
      if (code !== 0)
        reject(Error('Phantom test failed'));
      else
        resolve();
    });
  });
}

function doTests(transpiler) {
  builder.reset();
  builder.config(cfg);
  builder.config({ transpiler: transpiler });

  test('In-memory build', function() {
    return builder.build('first.js', null, { sourceMaps: true, minify: minify })
    .then(function(output) {
      fs.writeFileSync('test/output/memory-test.js', inline(output));
    })
  });

  test('Multi-format tree build', function() {

    return builder.build('first.js', 'test/output/tree-build.js', { sourceMaps: true, minify: minify, globalDefs: { DEBUG: false } })
    .then(function() {
      var treeFirst;
      Promise.all(['first.js', 'amd.js'].map(builder.trace.bind(builder)))
      .then(function(trees) {
        treeFirst = trees[0];
        return builder.buildTree(builder.subtractTrees(trees[0], trees[1]), 'test/output/excluded.js');
      })

      .then(function() {
        return builder.trace('global-inner.js').then(function(tree) {
          return builder.buildTree(tree, 'test/output/global-inner.js');
        });
      })

      .then(function() {
        return builder.trace('global-outer.js').then(function(tree) {
          return builder.buildTree(tree, 'test/output/global-outer.js');
        });
      })

      .then(function() {
        return builder.trace('amd-1.js').then(function(tree) {
          return builder.buildTree(builder.subtractTrees(tree, treeFirst), 'test/output/amd-1.js');
        });
      })

      .then(function() {
        return builder.trace('amd-2.js').then(function(tree) {
          return builder.buildTree(builder.subtractTrees(tree, treeFirst), 'test/output/amd-2.js');
        });
      })

      .then(function() {
        return builder.trace('amd-3.js').then(function(tree) {
          return builder.buildTree(builder.subtractTrees(tree, treeFirst), 'test/output/amd-3.js');
        });
      })

      .then(function() {
        return builder.trace('amd-4.js').then(function(tree) {
          return builder.buildTree(builder.subtractTrees(tree, treeFirst), 'test/output/amd-4.js');
        });
      })

      .then(function() {
        return builder.trace('amd-5a.js').then(function(tree) {
          return builder.buildTree(builder.subtractTrees(tree, treeFirst), 'test/output/amd-5a.js');
        });
      })

      .then(function() {
        return builder.trace('amd-5b.js').then(function(tree) {
          return builder.buildTree(builder.subtractTrees(tree, treeFirst), 'test/output/amd-5b.js');
        });
      })


      .then(function() {
        return builder.trace('amd-6a.js').then(function(tree) {
          return builder.buildTree(builder.subtractTrees(tree, treeFirst), 'test/output/amd-6a.js');
        });
      })

      .then(function() {
        return builder.trace('amd-6b.js').then(function(tree) {
          return builder.buildTree(builder.subtractTrees(tree, treeFirst), 'test/output/amd-6b.js');
        });
      })

      .then(function() {
        return builder.trace('umd.js').then(function(tree) {
          return builder.buildTree(builder.subtractTrees(tree, treeFirst), 'test/output/umd.js');
        });
      })

      .then(function() {
        return builder.build('amd-7.js', 'test/output/amd-7.js');
      })
    })
    .then(function () {
      return testPhantom('test/test-build.html');
    })
  });

  // traceur runtime function.bind fails in Phantom
  if (transpiler != 'traceur')
  test('SFX tree build', function() {
    builder.reset();
    builder.config(cfg);
    builder.config({transpiler: transpiler });
    builder.config({
      map: {
      'jquery-cdn': '@empty',
      'toamd1': 'amd-1.js'
      }
    });
    return builder.buildSFX('toamd1', 'test/output/sfx.js', { runtime: true, minify: minify, globalDefs: { DEBUG: false } })
    .then(function() {
      return testPhantom('test/test-sfx.html');
    })
  });
}

suite('Test tree builds - Traceur', function() {

  doTests('traceur');

});

suite('Test tree builds - Babel', function() {

  doTests('babel');

});


/* suite('Test tree builds - TypeScript', function() {

  doTests('typescript');

}); */


suite('Bundle Format', function() {
  test('Test AMD format', function() {
    return Promise.resolve()
    .then(function() {
      return builder.buildSFX('sfx-format-01.js', 'test/output/sfx-amd.js', { sfxFormat: 'amd' });
    })
    .then(function() {
      return testPhantom('test/test-sfx-amd.html');
    });
  });
});



