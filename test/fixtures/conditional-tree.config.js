System.config({
  map: {
    condition: 'conditions.js'
  },
  packages: {
    'pkg': {
      basePath: 'lib',
      map: {
        './env-condition': {
          'browser': './env-condition-browser'
        }
      }
    }
  }
});
