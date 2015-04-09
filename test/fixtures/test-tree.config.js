System.config({
  baseURL: './test/fixtures/test-tree/',
  map: {
    'jquery-cdn': '@empty'
  },
  paths: {
    'babel': '../../../node_modules/babel-core/browser.js',
    'babel-helpers': '../../../node_modules/babel-core/external-helpers.js',
    'traceur': '../../../node_modules/traceur/bin/traceur.js',
    'traceur-runtime': '../../../node_modules/traceur/bin/traceur-runtime.js'
  },
  meta: {
    'jquery-cdn': {
      build: false
    }
  }
});
