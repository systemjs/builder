var path = require('path');

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
  // give absolute URLs benefit of the doubt that they are file paths
  if (path.isAbsolute(url))
    return url;
  else if (isFileURL(url))
    return url.replace(/^file:\/+/, '/');
  else // assume relative
    return path.resolve(process.cwd(), url);
}
exports.coercePath = coercePath;
