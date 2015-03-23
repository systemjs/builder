define(['./first', './second', 'require', 'module'], function(first, second, require, module) {

  module.exports = {
    first: first,
    second: require('./second')
  };

  if (DEBUG) {
    console.log('debug mode');
  }

});