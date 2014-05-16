SystemJS Build Tool
===

Provides a single-file build for SystemJS of mixed-dependency module trees.

Builds ES6 into ES5, CommonJS, AMD and globals into a single file in a way that supports the CSP SystemJS loader
as well as circular references.

Example
---

app.js
```javascript
import $ from "./jquery";
export var hello = 'es6';
```

jquery.js
```javascript
define(function() {
  return 'this is jquery';
});
```

Builds into:

```javascript
System.register('app', ['./jquery'], function(deps) {
  var $, hello;
  return {
    exports: {
      get hello() {
        return hello;
      },
      set hello(val) {
        hello = val;
      }
    },
    execute: function() {
      $ = deps[0]['default'];
      hello = 'es6';
    }
  }
});

define('jquery', function() {
  return 'this is jquery';
});
```

It also provides a CSP wrapping for CommonJS and Globals. For example, CommonJS is output as:

```javascript
System.defined["some/cjs"] = {
  deps: [],
  executingRequire: true,
  execute: function(require, exports, __moduleName) {
    var global = System.global;
    var __define = global.define;
    global.define = undefined;
    var module = { exports: exports };
    var process = System.get("@@nodeProcess");
    exports.cjs = true;
    
    global.define = __define;
    return module.exports;
  }
};
```

Basic Use
---

```javascript
  npm install systemjs-builder
```

```javascript
  var builder = require('systemjs-builder');

  builder.build('myModule', {
    baseURL: path.resolve('some/folder'),

    // any map config
    map: {
      jquery: 'jquery-1.2.3/jquery'
    },

    // etc. any SystemJS config
  }, 'outfile.js')
  .then(function() {
    console.log('Build complete');
  })
  .catch(function(err) {
    console.log('Build error');
    console.log(err);
  });
```

