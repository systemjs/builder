"format register";


System.register("tree/third", [], function($__export) {
  return {
    setters: [],
    execute: function() {
      $__export('some', 'exports');
    }
  };
});

System.register("tree/cjs", [], true, function(require, exports, module) {
  var global = System.global;
  var __define = global.define;
  global.define = undefined;
  var process = System.get("@@nodeProcess")["default"];
    var __filename = "tree/cjs.js";
    var __dirname = "tree";
  exports.cjs = true;
  
  global.define = __define;
  return module.exports;
});

System.register("tree/jquery", [], false, function(__require, __exports, __module) {
  System.get("@@global-helpers").prepareGlobal(__module.id, []);
  this.jquery = {};
    
  return System.get("@@global-helpers").retrieveGlobal(__module.id, false);
});

System.register("tree/plugin", [], true, function(require, exports, module) {
  var global = System.global;
  var __define = global.define;
  global.define = undefined;
  var process = System.get("@@nodeProcess")["default"];
    var __filename = "tree/plugin.js";
    var __dirname = "tree";
  exports.build = false;
  
  global.define = __define;
  return module.exports;
});

System.register("tree/second", ["tree/third", "tree/cjs"], function($__export) {
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
  "deps ./jquery";
    "exports jquery.test";
    
    this.jquery = this.jquery || {};
    this.jquery.test = 'output';
    
  this["jquery.test"] = jquery.test;
  return System.get("@@global-helpers").retrieveGlobal(__module.id, "jquery.test");
});

System.register("tree/amd", ['./global', './some!./plugin'], false, function(__require, __exports, __module) {
  return (function() {
    return {is: 'amd'};
  })(__require('./global'), __require('./some!./plugin'));
});

System.register("tree/first", ["tree/second", "tree/amd"], function($__export) {
  "use strict";
  var __moduleName = "tree/first";
  var dep,
      p;
  return {
    setters: [function(m) {
      dep = m.dep;
    }, function(m) {}],
    execute: function() {
      p = $__export("p", 5);
    }
  };
});

function factory(first) {
  return {
    jquery: '1',
    first: first
  };
}
System.register("jquery", ['./first'], false, function(__require, __exports, __module) {
  return (factory)(__require('./first'));
});
