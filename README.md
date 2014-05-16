SystemJS Build Tool
===

Provides a single-file build for SystemJS of mixed-dependency module trees.

Builds ES6 into ES5, CommonJS, AMD and globals into a single file in a way that supports the CSP SystemJS loader
as well as circular references.

### Basic Use

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

### License

MIT

