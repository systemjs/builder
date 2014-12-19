"format register";



"asdf";
System.register("tree/third", [], function($__export) {
  return {
    setters: [],
    execute: function() {
      $__export('some', 'exports');
    }
  };
});



System.register("tree/cjs", [], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var __filename = System.baseURL + "tree/cjs.js",
      __dirname = System.baseURL + "tree";
  console.log(__filename);
  exports.cjs = true;
  global.define = __define;
  return module.exports;
});



System.register("tree/jquery", [], false, function(__require, __exports, __module) {
  System.get("@@global-helpers").prepareGlobal(__module.id, []);
  (function() {
    var jquery = {};
    this["jquery"] = jquery;
  }).call(System.global);
  return System.get("@@global-helpers").retrieveGlobal(__module.id, false);
});



System.register("tree/plugin", [], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  exports.build = false;
  exports.fetch = function() {
    return '';
  };
  global.define = __define;
  return module.exports;
});



System.register("tree/text.txt!tree/text-plugin", [], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  module.exports = "This is some text";
  global.define = __define;
  return module.exports;
});



System.register("tree/second", ["./third", "./cjs"], function($__export) {
  "use strict";
  var __moduleName = "tree/second";
  var q;
  return {
    setters: [function(m) {}, function(m) {}],
    execute: function() {
      q = $__export("q", 4);
    }
  };
});



System.register("tree/global", ["./jquery"], false, function(__require, __exports, __module) {
  System.get("@@global-helpers").prepareGlobal(__module.id, ["./jquery"]);
  (function() {
    "deps ./jquery";
    "exports jquery.test";
    this.jquery = this.jquery || {};
    this.jquery.test = 'output';
  }).call(System.global);
  return System.get("@@global-helpers").retrieveGlobal(__module.id, "jquery.test");
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



//# sourceMappingURL=tree-build.js.map