"format register";

System.register("tree/global-outer", [], false, function(__require, __exports, __module) {
  System.get("@@global-helpers").prepareGlobal(__module.id, []);
  (function() {
    var p = this["p"];
    var window = this["window"];
    (function() {
      p = 6;
    });
    var p = 5;
    if (false)
      var window = 5;
    this["p"] = p;
    this["window"] = window;
  }).call(System.global);
  return System.get("@@global-helpers").retrieveGlobal(__module.id, false);
});
