// converts anonymous AMDs into named AMD for the module
exports.compile = function(load) {

  var amdRegEx = /((^\s*|[}{\(\);,\n\?\&])\s*define\s*\(\s*)(("[^"]+"|'[^']+')\s*,\s*)?(\[(\s*("[^"]+"|'[^']+')\s*,)*(\s*("[^"]+"|'[^']+')\s*)?\]|function\s*|{|[_$a-zA-Z\xA0-\uFFFF][_$a-zA-Z0-9\xA0-\uFFFF]*\))/g;
  


  // NB need to handle naming the module itself as the last defined

  var match;

  var parts = [];

  var lastName;

  var lastIndex = 0;

  while (match = amdRegEx.exec(load.source)) {
    if (match[3]) {
      lastName = match[3].substr(1, match[3].length - 2);
    }
    else {
      var nameIndex = amdRegEx.lastIndex - match[0].length + match[1].length;
      parts.push(load.source.substr(lastIndex, nameIndex));
      parts.push('"' + load.name + '", ');
      parts.push(load.source.substr(nameIndex, amdRegEx.lastIndex - nameIndex));
      lastIndex = amdRegEx.lastIndex;
    }
  }

  parts.push(load.source.substr(lastIndex));

  return Promise.resolve({
    source: parts.join('') + '\n'
  });
}
