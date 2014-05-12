System.register('tree/third', [], function(deps) {
  return {
    exports: {
      some: 'exports'
    },
    execute: function() {}
  };
});System.register("tree/second", ["./third"], function($__0) {
  "use strict";
  var __moduleName = "tree/second";
  var q;
  return {
    exports: {
      get q() {
        return q;
      },
      set q(value) {
        q = value;
      }
    },
    execute: function() {
      ;
      q = 4;
    }
  };
});
System.register("tree/first", ["./second"], function($__0) {
  "use strict";
  var __moduleName = "tree/first";
  var p;
  return {
    exports: {
      get p() {
        return p;
      },
      set p(value) {
        p = value;
      }
    },
    execute: function() {
      ;
      p = 5;
    }
  };
});
