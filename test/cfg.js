System.config({
  baseURL: 'test',
  paths: {
    'jquery-cdn': 'https://code.jquery.com/jquery-2.1.1.min.js'
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
