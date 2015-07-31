(function(factory) {
  if (typeof define == 'function' && define.amd)
    define(${JSON.stringify(deps)}, factory);
  else
    factory();
});