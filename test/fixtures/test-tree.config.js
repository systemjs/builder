System.config({
  baseURL: './test/fixtures/test-tree/',
  paths: {
    'jquery-cdn': 'https://code.jquery.com/jquery-2.1.1.min.js',
    'babel': '../../../node_modules/babel-core/browser.js',
    'babel-helpers': '../../../node_modules/babel-core/external-helpers.js',
    'traceur': '../../../node_modules/traceur/bin/traceur.js',
    'traceur-runtime': '../../../node_modules/traceur/bin/traceur-runtime.js'
  },
  map: {
    'jquery-cdn': '@empty'
  },
  meta: {
    'jquery-cdn': {
      build: false
    }
  }
});
