"format register";

(function() {
function define(){};  define.amd = {};
  System.register("tree/amd-3", ["./first"], false, function(__require, __exports, __module) {
    (function(req, exports, module) {
      module.exports = req('./first');
    }).call(__exports, __require, __exports, __module);
  });
  })();