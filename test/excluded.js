"format register";

System.register("tree/second", ["./third", "./cjs"], function($__0) {
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
      ;
      q = 4;
    }
  };
});

System.register("tree/first", ["./second", "./amd"], function($__0) {
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
      ;
      p = 5;
    }
  };
});

System.register("tree/third", [], function(deps) {
  return {
    exports: {
      some: 'exports'
    },
    execute: function() {}
  };
});

System.register("tree/cjs", [], true, function(require, exports, __moduleName) {
  var global = System.global;
  var __define = global.define;
  global.define = undefined;
  var module = { exports: exports };
  var process = System.get("@@nodeProcess")["default"];
    var __filename = "tree/cjs.js";
    var __dirname = "tree";
  exports.cjs = true;
  
  global.define = __define;
  return module.exports;
});
