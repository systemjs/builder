var compiler = require('./compiler');

exports.compile = function (load, opts, loader) {
  return compiler.compile(load, opts, [require('transform-system-register').default, {
    moduleName: !opts.anonymous && load.name,
    map: function (dep) {
      return opts.normalize ? load.depMap[dep] : dep;
    },
    systemGlobal: opts.systemGlobal
  }]);
};
