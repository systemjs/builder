var path = require('path');

function fromFileURL(url) {
  return url.substr(7 + !!process.platform.match(/^win/)).replace(/\//g, path.sep);
}
exports.fromFileURL = fromFileURL;

function toFileURL(path) {
  return 'file://' + (process.platform.match(/^win/) ? '/' : '') + path.replace(/\\/g, '/');
}
exports.toFileURL = toFileURL;

function isFileURL(url) {
  return url.substr(0, 5) === 'file:';
}
exports.isFileURL = isFileURL;

/* Remove scheme prefix from file URLs, so that they are paths. */
function filePath(url) {
  if (isFileURL(url))
    return url.replace(/^file:\/+/, '/');
}
exports.filePath = filePath;

/* Coerce URLs to paths, assuming they are file URLs */
function coercePath(url) {
  if (isFileURL(url))
    return url.replace(/^file:\/+/, '/');
  else
    // assume relative
    return path.resolve(process.cwd(), url);
}
exports.coercePath = coercePath;
