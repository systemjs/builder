var es6DepRegEx = /(^|\}|\s)(from|import)\s*("([^"]+)"|'([^']+)')/g;
var cjsRequireRegEx = /(?:^\s*|[}{\(\);,\n=:\?\&]\s*)require\s*\(\s*("([^"]+)"|'([^']+)')\s*\)/g;

// NB support comments in deps
var amdDefineRegEx = /(?:^\s*|[}{\(\);,\n\?\&]\s*)define\s*\(\s*("[^"]+"\s*,|'[^']+'\s*,\s*)?(\[(\s*("[^"]+"|'[^']+')\s*,)*(\s*("[^"]+"|'[^']+')\s*)?\])?/g;

function regExEscape(str) {
  return str.replace(/\^/g, '\\^');
}

exports.cjs = function(source, depMap) {
  return source.replace(cjsRequireRegEx, function(statement, str, singleString, doubleString) {
    var name = singleString || doubleString;

    var mapped = depMap[name];

    if (!mapped)
      return statement;

    name = regExEscape(name);

    return statement.replace(new RegExp('"' + name + '"|\'' + name + '\'', 'g'), '\'' + mapped + '\'');
  });
}

exports.amd = function(source, depMap) {

  // NB support AMD CommonJS form too

  amdDefineRegEx.lastIndex = 0;
  var defineStatement = amdDefineRegEx.exec(source);
  if (defineStatement) {
    if (!defineStatement[2])
      return;
    
    var depArray = eval(defineStatement[2]);
    depArray.map(function(name) {
      var mapped = depMap[name];
      
      if (!mapped)
        return name;

      return mapped;
    });

    source = source.replace(defineStatement[2], JSON.stringify(depArray));
  }
}

exports.meta = function(source, depMap) {
  // todo (eg "deps jquery" in globals)
}

exports.es6 = function(source, depMap) {
  source = source.replace(es6DepRegEx, function(statement, start, type, str, singleString, doubleString) {
    var name = singleString || doubleString;
    var mapped = depMap[name];

    if (!mapped)
      return statement;

    name = regExEscape(name);

    return statement.replace(new RegExp('"' + name + '"|\'' + name + '\'', 'g'), '\'' + mapped + '\'');
  });
}
