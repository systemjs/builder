SystemJS Build Tool [![Build Status][travis-image]][travis-url]
===

_Note SystemJS Builder 0.11 & 0.12 correspond to the SystemJS 0.17 and 0.18 releases which include the breaking change making module names URLs.
Read the [SystemJS 0.17 release notes](https://github.com/systemjs/systemjs/releases/tag/0.17.0) for more information on this change._

Provides a single-file build for SystemJS of mixed-dependency module trees.

Builds ES6 into ES5, CommonJS, AMD and globals into a single file in a way that supports the CSP SystemJS loader
as well as circular references.

Example
---

app.js
```javascript
import $ from "./jquery.js";
export var hello = 'es6';
```

jquery.js
```javascript
define(function() {
  return 'this is jquery';
});
```

Will build the module `app` into a bundle containing both `app` and `jquery` defined through `System.register` calls.

Circular references and bindings in ES6, CommonJS and AMD all behave exactly as they should, including maintaining execution order.

Usage
---

### Install

```javascript
npm install systemjs-builder
```

### Basic Use

Ensure that the transpiler is installed separately (`npm install babel-core` here).

```javascript
var path = require("path");
var Builder = require('systemjs-builder');

var builder = new Builder({
  baseURL: 'some/folder',

  // any map config
  map: {
    jquery: 'jquery-1.2.3/jquery'
  },
  
  // opt in to Babel for transpiling over Traceur
  transpiler: 'babel'

  // etc. any SystemJS config
})
.build('local/module.js', 'outfile.js')
.then(function() {
  console.log('Build complete');
})
.catch(function(err) {
  console.log('Build error');
  console.log(err);
});
```

### Setting Configuration

To load a SystemJS configuration file, containing configure calls like:

```javascript
System.config({ ... });
```

Then we can load this config file through the builder:

```javascript
// `builder.loadConfig` will load config from a file
builder.loadConfig('./cfg.js')
.then(function() {
  // additional config can also be set through `builder.config`
  builder.config({ baseURL: './app' });

  return builder.build('myModule.js', 'outfile.js');
});

```

Multiple config calls can be run, which will combine into the loader configuration.

To reset the loader state and configuration use `builder.reset()`.

### Self-Executing (SFX) Bundles

To make a bundle that is independent of the SystemJS loader entirely, we can make SFX bundles:

```javascript
builder.buildSFX('myModule.js', 'outfile.js', options);
```

This bundle file can then be included with a `<script>` tag, and no other dependencies would need to be included in the page. 

By default, Traceur or Babel runtime are automatically included in the SFX bundle if needed. To exclude the Babel or Traceur runtime set the `runtime` build option to false:

```javascript
builder.buildSFX('myModule.js', 'outfile.js', { runtime: false });
```

#### SFX Format

SFX bundles can also be output as a custom module format - `amd`, `cjs` or `es6` for consumption in different environments.

This is handled via the `sfxFormat` option:

```javascript
builder.buildSFX('myModule.js', 'outfile.js', { sfxFormat: 'cjs' });
```

The first module used as input (`myModule.js` here) will then have its exports output as the CommonJS exports of the whole SFX bundle itself
when run in a CommonJS environment.

#### Adapter Modules

To have globals like `jQuery` not included, and included in a separate script tag, set up an adapter module something like:

jquery.js
```javascript
module.exports = window.jQuery;
```

### Minfication & Source Maps

As well as an `options.config` parameter, it is also possible to specify minification and source maps options:

```javascript
builder.build('myModule.js', 'outfile.js', { minify: true, sourceMaps: true, config: cfg });
```

Compile time with source maps can also be improved with the `lowResSourceMaps` option:

```javascript
builder.build('myModule.js', 'outfile.js', { sourceMaps: true, lowResSourceMaps: true });
```

#### Minification Options

* `mangle`, defaults to true.
* `globalDefs`, object allowing for global definition assignments for dead code removal.

```javascript
builder.build('myModule.js', 'outfile.js', { minify: true, mangle: false, globalDefs: { DEBUG: false } });
```

### In-Memory Builds

Leave out the `outFile` option to run an in-memory build:

```javascript
builder.build('myModule.js', { minify: true }).then(function(output) {
  output.source;    // generated bundle source
  output.sourceMap; // generated bundle source map
  output.modules;   // array of module names defined in the bundle
});
```

The `output` object above is provided for all builds, including when `outFile` is set.

`output.modules` can be used to directly populate SystemJS bundles configuration.

### Ignore Resources

If loading resources that shouldn't even be traced as part of the build (say an external import), these
can be configured with:

```javascript
builder.config({
  meta: {
    'resource/to/ignore.js' = {
      build: false
    }
  }
});
```

### Bundle Arithmetic

Both `builder.build` and `builder.buildSFX` support bundle arithmetic expressions. This allows for the easy construction of custom bundles.

**NOTE**: SFX Bundles can only use addition and wildcard arithmetic.

There is also a `builder.trace` and `builder.buildTree` for building direct trace tree objects.

#### Example - Arithmetic Expressions

In this example we build all our application code in `app/` excluding the tree `app/corelibs`:

```javascript
var Builder = require('systemjs-builder');

var builder = new Builder({
  baseURL: '...',
  map: {
  } // etc. config
});

builder.build('app/* - app/corelibs.js', 'output-file.js', { minify: true, sourceMaps: true });
```

#### Example - Common Bundles

Build a bundle for the dependencies of `app/` excluding anything from `app/` itself.

For this we can use the `[module]` syntax which represents a single module instead of all its dependencies as well:

```javascript
builder.build('app/**/* - [app/**/*]', 'common.js', { minify: true, sourceMaps: true });
```

The above means _take the tree of app and all its dependencies, and subtract just the modules in app_.

We can then exclude this common bundle in future builds:

```javascript
builder.build('app/componentA.js - common.js', { minify: true, sourceMaps: true });
```

#### Example - Direct Trace API

Instead of using the arithmetic syntax, we can construct the trace ourselves.

In this example we build `app/first` and `app/second` into two separate bundles, while creating a separate shared bundle:

```javascript
var Builder = require('systemjs-builder');

var builder = new Builder({
  // ...
});

Promise.all([builder.trace('app/first.js'), builder.trace('app/second.js')])
.then(function(trees) {
  var commonTree = builder.intersectTrees(trees[0], trees[1]);
  return Promise.all([
    builder.buildTree(commonTree, 'shared-bundle.js')
    builder.buildTree(builder.subtractTrees(trees[0], commonTree), 'first-bundle.js'),
    builder.buildTree(builder.subtractTrees(trees[1], commonTree), 'second-bundle.js')
  ]);
});
```

License
---

MIT

[travis-url]: https://travis-ci.org/systemjs/builder
[travis-image]: https://travis-ci.org/systemjs/builder.svg?branch=master
