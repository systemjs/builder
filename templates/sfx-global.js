(function(factory) {
  ${sfxGlobalName ? sfxGlobalName + ' = ' : ''}factory(${sfxGlobals.join(', ')});
});