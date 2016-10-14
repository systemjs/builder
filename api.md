API Documentation
===
* [**Builder**](#builder)
* [**Expression Strings**](#module-tree-expressions)

Builder
---
* [**new Builder()**](#new-builderconfig)
* [**config()**](#builderconfigconfig-saveforreset-ignorebaseurl)
* [**loadConfig()**](#builderloadconfigconfigfile-saveforreset-ignorebaseurl)
* [**loadConfigSync()**](#builderloadconfigsyncconfigfile-saveforreset-ignorebaseurl)
* [**reset()**](#builderconfigconfig-saveforreset-ignorebaseurl)
* [**bundle()**](#builderconfigconfig-saveforreset-ignorebaseurl)
* [**buildStatic()**](#builderconfigconfig-saveforreset-ignorebaseurl)
* [**trace()**](#builderconfigconfig-saveforreset-ignorebaseurl)
* [**addTrees()**](#builderaddtreesfirsttree-secondtree)
* [**subtractTrees()**](#buildersubtracttreesfirsttree-secondtree)
* [**intersectTrees()**](#builderintersecttreesfirsttree-secondtree)

### new Builder([config])
### new Builder([baseURL, [configFile]])
`config`: An object conforming to the [config api] (https:/github.com/systemjs/systemjs/blob/master/docs/config-api.md)  
`baseURL`: Sets the root for the loader  
`configFile`: A systemjs config file conforming to the [systemjs config api] (https:/github.com/systemjs/systemjs/blob/master/docs/config-api.md)  
#### Example
```javascript
new Builder({
  map: {
    'a': 'b.js'
  }
});

new Builder('scripts', 'config.js');
```

### builder.config(config[, saveForReset[, ignoreBaseURL]])
`config`: An object conforming to the [config api] (https:/github.com/systemjs/systemjs/blob/master/docs/config-api.md)  
`saveForReset`: Reload this config when builder.reset() is called  
`ignoreBaseURL`: Don't use the baseURL property from this config  
#### Example
```javascript
builder.config({
  map: {
    'a': 'b.js'
  }
});
```

### builder.loadConfig(configFile[, saveForReset[, ignoreBaseURL]])
`configFile`: A systemjs config file conforming to the [systemjs config api] (https:/github.com/systemjs/systemjs/blob/master/docs/config-api.md)  
`saveForReset`: Reload this config when builder.reset() is called  
`ignoreBaseURL`: Don't use the baseURL property from this config  
#### Example
```javascript
builder.loadConfig('config.js').then(() => {
});
```
### builder.loadConfigSync(configFile[, saveForReset[, ignoreBaseURL]])
Synchronous version of `builder.loadConfig()`  

`configFile`: A systemjs config file conforming to the [systemjs config api] (https:/github.com/systemjs/systemjs/blob/master/docs/config-api.md)  
`saveForReset`: Reload this config when builder.reset() is called  
`ignoreBaseURL`: Don't use the baseURL property from this config  
#### Example
```javascript
builder.loadConfigSync('config.js');
```

### builder.reset()
Reset the builder config to its initial state, or the last saved config() state
#### Example
```javascript
builder.reset();
```

### builder.bundle(tree[, outfile][, options])
### builder.bundle(expression[, outfile][, options])
Concatenate all modules in the tree or module tree expression and optionally write them out to a file  

`tree`: A tree object as returned from builder.trace(), or one of the arithmetic functions  
`expression`: A [module tree expression](#module-tree-expressions)  
`outfile`: The file to write out the bundle to  
`options`: Additional bundle options as outlined below  

Returns a promise which resolves with the bundle content
#### Bundle options
`minify`: Minify source in bundle output _(Default:true)_  
`mangle`: Allow the minifier to shorten non-public variable names _(Default:false)_  
`sourceMaps`: Generate source maps for minified code _(Default:false)_  
`lowResSourceMaps`:  When true, use line-number level source maps, when false, use character level source maps _(Default:false)_  
`globalName`: When building a self-executing bundle, assign the bundle output to a global variable _(Default:null)_   
`globalDeps`: When building a self-executing bundle, indicates external dependendencies available in the global context _(Default:{})_  
`fetch`: Override the fetch function to retrieve module source manually _(Default:undefined)_

#### Example
```javascript
builder.bundle('moduleA.js', { minify:true }).then((bundle) => {
    //bundle contains source to moduleA.js + dependencies
});
```
### builder.buildStatic(tree[, outfile][, options])
### builder.buildStatic(expression[, outfile][, options])
Similar to builder.bundle() but builds a self-executing bundle  

`tree`: A tree object as returned from builder.trace(), or one of the arithmetic functions  
`expression`: A [module tree expression](#module-tree-expressions)  
`outfile`: The file to write out the bundle to  
`options`: Additional bundle options as outlined in `builder.bundle()`  

Returns a promise which resolves with the bundle content
#### Example
```javascript
builder.buildStatic('moduleA.js').then((sfxBundle) => {
    //sfxBundle contains source to moduleA.js + dependencies + self-executing intialization code
});
```

### builder.trace(expression)
Creates the module tree object represented by `expression`  

`expression`: A [module tree expression](#module-tree-expressions)  

#### Example
```javascript
builder.trace('moduleA.js').then((sfxBundle) => {
    //sfxBundle contains source to moduleA.js + dependencies + self-executing intialization code
});
```

### builder.addTrees(firstTree, secondTree)
```javascript
let moduleTree = builder.addTrees('moduleA.js', 'moduleB.js')
```

### builder.subtractTrees(firstTree, secondTree)
```javascript
let moduleTree = builder.subtractTrees('moduleA.js', 'moduleB.js');
```

### builder.intersectTrees(firstTree, secondTree)
```javascript
let moduleTree = builder.intersectTrees('moduleA.js', 'moduleB.js');
```

## Module Tree Expressions
`builder.buildStatic`, `builder.bundle` and `builder.trace` accept module tree expressions

### Module Tree
Represents moduleA and all of its dependencies
```javascript
'moduleA.js'
```

### Single Module
Represents moduleA only
```javascript
'[moduleA.js]'
```

### Addition
Represents a tree that combines moduleA, moduleB and their dependencies
```javascript
'moduleA.js + moduleB.js'
```

### Subtraction
Represents a tree that includes moduleA and its dependencies, excluding moduleB and its dependencies
```javascript
'moduleA.js - moduleB.js'
```

### Intersection
Represents the dependencies shared between moduleA and moduleB
```javascript
'moduleA.js & moduleB.js'
```

### Module Glob
Represents the combination of all modules in dirA and their dependencies
```javascript
'dirA/*'
```

### Parenthesis
Use parenthesis to group module tree operations
```javascript
'(moduleA.js & moduleB.js) + moduleC.js'
```
