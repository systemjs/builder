(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['require', 'exports', 'cjs'], factory);
  } else if (typeof exports === 'object') {
    module.exports = factory(require, exports, module);
  } else {
    root.wAnalytics = factory();
  }
}(this, function(require, exports) {
  require('cjs');
  exports.umd = 'detection';
}));