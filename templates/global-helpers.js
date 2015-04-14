(function(__global) {
  var hasOwnProperty = __global.hasOwnProperty;
  var indexOf = Array.prototype.indexOf;

  var curGlobalObj;
  var ignoredGlobalProps = ['_g', 'indexedDB', 'sessionStorage', 'localStorage',
      'clipboardData', 'frames', 'webkitStorageInfo', 'toolbar', 'statusbar',
      'scrollbars', 'personalbar', 'menubar', 'locationbar', 'webkitIndexedDB',
      'screenTop', 'screenLeft'];

  System.set('@@global-helpers', System.newModule({
    prepareGlobal: function(moduleName) {
      // store a complete copy of the global object in order to detect changes
      curGlobalObj = {};

      for (var g in __global) {
        if (indexOf.call(ignoredGlobalProps, g) != -1)
          continue;
        if (!hasOwnProperty || __global.hasOwnProperty(g)) {
          try {
            curGlobalObj[g] = __global[g];
          }
          catch (e) {
            ignoredGlobalProps.push(g);
          }
        }
      }
    },
    retrieveGlobal: function(moduleName) {
      var singleGlobal;
      var multipleExports;
      var exports;

      for (var g in __global) {
        if (indexOf.call(ignoredGlobalProps, g) != -1)
          continue;

        var value = __global[g];

        // see which globals differ from the previous copy to determine global exports
        if ((!hasOwnProperty || __global.hasOwnProperty(g)) 
            && g !== __global && curGlobalObj[g] !== value) {
          if (!exports) {
            // first property found
            exports = {};
            singleGlobal = value;
          }
          
          exports[g] = value;
          
          if (!multipleExports && singleGlobal !== value)
            multipleExports = true;
        }
      }

      return multipleExports ? exports : singleGlobal;
    }
  }));
})(typeof window != 'undefined' ? window : (typeof WorkerGlobalScope != 'undefined' ? self : global));
