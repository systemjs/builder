define(function(require) {
  var o = {
    getCircular: function() {
      var circular1 = require('./amd-circular1.js');
      o.circular1 = circular1();
    },
    ready: true
  };
  return o;
});
