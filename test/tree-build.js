"format register";


System.register("tree/jquery", [], false, function(__require, __exports, __module) {
  System.get("@@global-helpers").prepareGlobal(__module.id, []);
  (function() {
this.jquery = {};



  }).call(System.global);  return System.get("@@global-helpers").retrieveGlobal(__module.id, false);
});

System.register("tree/global", ["./jquery"], false, function(__require, __exports, __module) {
  System.get("@@global-helpers").prepareGlobal(__module.id, ["./jquery"]);
  (function() {
"deps ./jquery";
"exports jquery.test";
this.jquery = this.jquery || {};
this.jquery.test = 'output';



  this["jquery.test"] = jquery.test;
  }).call(System.global);  return System.get("@@global-helpers").retrieveGlobal(__module.id, "jquery.test");
});


System.register("tree/third", [], function($__export) {
  return {
    setters: [],
    execute: function() {
      $__export('some', 'exports');
    }
  };
});

System.register("tree/second", ["./third", "./cjs"], function($__export) {
  "use strict";
  var __moduleName = "tree/second";
  function require(path) {
    return $traceurRuntime.require("tree/second", path);
  }
  var q;
  return {
    setters: [function(m) {}, function(m) {}],
    execute: function() {
      q = $__export("q", 4);
    }
  };
});



(function() {
function define(){};  define.amd = {};
System.register("tree/amd", ["./global", "./some!./plugin", "./text.txt!./text-plugin"], false, function(__require, __exports, __module) {
  return (function(a, b, c) {
    return {
      is: 'amd',
      text: c
    };
  }).call(this, __require('./global'), __require('./some!./plugin'), __require('./text.txt!./text-plugin'));
});


})();
System.register("tree/first", ["jquery-cdn", "@empty", "./second", "./amd"], function($__export) {
  "use strict";
  var __moduleName = "tree/first";
  function require(path) {
    return $traceurRuntime.require("tree/first", path);
  }
  var dep,
      p;
  return {
    setters: [function(m) {}, function(m) {}, function(m) {
      dep = m.dep;
    }, function(m) {}],
    execute: function() {
      p = $__export("p", 5);
    }
  };
});



System.register("tree/cjs", [], true, function(require, exports, module) {
  var global = System.global;
  var __define = global.define;
  global.define = undefined;
  var __filename = "tree/cjs.js";
  var __dirname = "tree";
exports.cjs = true;



  global.define = __define;
  return module.exports;
});

System.register("tree/plugin", [], true, function(require, exports, module) {
  var global = System.global;
  var __define = global.define;
  global.define = undefined;
  var __filename = "tree/plugin.js";
  var __dirname = "tree";
exports.build = false;
exports.fetch = function() {
  return '';
};



  global.define = __define;
  return module.exports;
});

System.register("tree/text.txt!tree/text-plugin", [], true, function(require, exports, module) {
  var global = System.global;
  var __define = global.define;
  global.define = undefined;
  var __filename = "tree/text.txt";
  var __dirname = "tree";
module.exports = "This is some text";



  global.define = __define;
  return module.exports;
});

//# sourceMappingURL=tree-build.js.map