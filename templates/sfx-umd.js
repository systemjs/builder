(function(factory) {
  ${ deps.length ? 'var deps = ' + JSON.stringify(deps) + ';\n' : '' }
  if (typeof define == 'function' && define.amd)
    define(${ deps.length ? 'deps' : '[]' }, factory);
  else if (typeof module == 'object' && module.exports && typeof require == 'function')
    module.exports = factory${ deps.length ? '.apply(null, deps.map(require))' : '()' };
  else
    ${ deps.length && !globalDeps.length
      ? 'throw new Error("Module must be loaded as AMD or CommonJS")'
      : (globalName ? globalName + ' = ' : '') + 'factory(' + (globalDeps.length ? globalDeps.join(', ') : '') + ')'};
});