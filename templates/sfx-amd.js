(function(factory) {
  if (typeof define == 'function' && define.amd){
    define(function () {
      var obj = factory.apply(this, arguments);
      var keys = Object.keys(obj);
      if (keys.length === 1) {
        return obj[keys[0]];
      } else {
        return obj;
      }
    });
  } else {
    factory();
  }
})