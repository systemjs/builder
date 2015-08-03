System.config({
  map: {
    'jquery-cdn': '@empty'
  },
  paths: {
    '*': './test/fixtures/test-tree/*',
    'babel': './node_modules/babel-core/browser.js',
    'babel-helpers': './node_modules/babel-core/external-helpers.js',
    'traceur': './node_modules/traceur/bin/traceur.js',
    'traceur-runtime': './node_modules/traceur/bin/traceur-runtime.js',
    'typescript': './node_modules/typescript/lib/typescript.js'
  },
  meta: {
    'babel': {
      format: 'global'
    },
    'jquery-cdn': {
      build: false
    },
    'cjs-globals.js': {
      globals: {
        Buffer: 'Buffer.js'
      }
    }
  }
});
