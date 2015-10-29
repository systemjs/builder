console.log(__filename);

(function(require) {
  if (typeof require != 'undefined' && eval('typeof require') == 'undefined')
    exports.cjs = true;
})(require);

exports.env = process.env.NODE_ENV;