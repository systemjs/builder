"format register";
(function(global) {

  var defined = {};

  // indexOf polyfill for IE8
  var indexOf = Array.prototype.indexOf || function(item) {
    for (var i = 0, l = this.length; i < l; i++)
      if (this[i] === item)
        return i;
    return -1;
  }

  function dedupe(deps) {
    var newDeps = [];
    for (var i = 0, l = deps.length; i < l; i++)
      if (indexOf.call(newDeps, deps[i]) == -1)
        newDeps.push(deps[i])
    return newDeps;
  }

  function register(name, deps, declare, execute) {
    if (typeof name != 'string')
      throw "System.register provided no module name";
    
    var entry;

    // dynamic
    if (typeof declare == 'boolean') {
      entry = {
        declarative: false,
        deps: deps,
        execute: execute,
        executingRequire: declare
      };
    }
    else {
      // ES6 declarative
      if (deps.length > 0 && declare.length != 1)
        throw 'Invalid System.register form for ' + name + '. Declare function must take one argument.';
      entry = {
        declarative: true,
        deps: deps,
        declare: declare
      };
    }

    entry.name = name;
    
    // we never overwrite an existing define
    if (!defined[name])
      defined[name] = entry; 

    entry.deps = dedupe(entry.deps);

    // we have to normalize dependencies
    // (assume dependencies are normalized for now)
    // entry.normalizedDeps = entry.deps.map(normalize);
    entry.normalizedDeps = entry.deps;
  }

  function buildGroups(entry, groups) {
    groups[entry.groupIndex] = groups[entry.groupIndex] || [];

    if (indexOf.call(groups[entry.groupIndex], entry) != -1)
      return;

    groups[entry.groupIndex].push(entry);

    for (var i = 0, l = entry.normalizedDeps.length; i < l; i++) {
      var depName = entry.normalizedDeps[i];
      var depEntry = defined[depName];
      
      // not in the registry means already linked / ES6
      if (!depEntry || depEntry.evaluated)
        continue;
      
      // now we know the entry is in our unlinked linkage group
      var depGroupIndex = entry.groupIndex + (depEntry.declarative != entry.declarative);

      // the group index of an entry is always the maximum
      if (depEntry.groupIndex === undefined || depEntry.groupIndex < depGroupIndex) {
        
        // if already in a group, remove from the old group
        if (depEntry.groupIndex) {
          groups[depEntry.groupIndex].splice(indexOf.call(groups[depEntry.groupIndex], depEntry), 1);

          // if the old group is empty, then we have a mixed depndency cycle
          if (groups[depEntry.groupIndex].length == 0)
            throw new TypeError("Mixed dependency cycle detected");
        }

        depEntry.groupIndex = depGroupIndex;
      }

      buildGroups(depEntry, groups);
    }
  }

  function link(name) {
    var startEntry = defined[name];

    startEntry.groupIndex = 0;

    var groups = [];

    buildGroups(startEntry, groups);

    var curGroupDeclarative = !!startEntry.declarative == groups.length % 2;
    for (var i = groups.length - 1; i >= 0; i--) {
      var group = groups[i];
      for (var j = 0; j < group.length; j++) {
        var entry = group[j];

        // link each group
        if (curGroupDeclarative)
          linkDeclarativeModule(entry);
        else
          linkDynamicModule(entry);
      }
      curGroupDeclarative = !curGroupDeclarative; 
    }
  }

  // module binding records
  var moduleRecords = {};
  function getOrCreateModuleRecord(name) {
    return moduleRecords[name] || (moduleRecords[name] = {
      name: name,
      dependencies: [],
      exports: {}, // start from an empty module and extend
      importers: []
    })
  }

  function linkDeclarativeModule(entry) {
    // only link if already not already started linking (stops at circular)
    if (entry.module)
      return;

    var module = entry.module = getOrCreateModuleRecord(entry.name);
    var exports = entry.module.exports;

    var declaration = entry.declare.call(global, function(name, value) {
      module.locked = true;
      exports[name] = value;

      for (var i = 0, l = module.importers.length; i < l; i++) {
        var importerModule = module.importers[i];
        if (!importerModule.locked) {
          var importerIndex = indexOf.call(importerModule.dependencies, module);
          importerModule.setters[importerIndex](exports);
        }
      }

      module.locked = false;
      return value;
    });
    
    module.setters = declaration.setters;
    module.execute = declaration.execute;

    if (!module.setters || !module.execute)
      throw "Invalid System.register form for " + entry.name;

    // now link all the module dependencies
    for (var i = 0, l = entry.normalizedDeps.length; i < l; i++) {
      var depName = entry.normalizedDeps[i];
      var depEntry = defined[depName];
      var depModule = moduleRecords[depName];

      // work out how to set depExports based on scenarios...
      var depExports;

      if (depModule) {
        depExports = depModule.exports;
      }
      else if (depEntry && !depEntry.declarative) {
        depExports = { 'default': depEntry.module.exports, __useDefault: true };
      }
      // in the module registry
      else if (!depEntry) {
        depExports = load(depName);
      }
      // we have an entry -> link
      else {
        linkDeclarativeModule(depEntry);
        depModule = depEntry.module;
        depExports = depModule.exports;
      }

      // only declarative modules have dynamic bindings
      if (depModule && depModule.importers) {
        depModule.importers.push(module);
        module.dependencies.push(depModule);
      }
      else
        module.dependencies.push(null);

      // run the setter for this dependency
      if (module.setters[i])
        module.setters[i](depExports);
    }
  }

  // An analog to loader.get covering execution of all three layers (real declarative, simulated declarative, simulated dynamic)
  function getModule(name) {
    var exports;
    var entry = defined[name];

    if (!entry) {
      exports = load(name);
      if (!exports)
        throw "System Register: The module requested " + name + " but this was not declared as a dependency";
    }

    else {
      if (entry.declarative)
        ensureEvaluated(name, []);
    
      else if (!entry.evaluated)
        linkDynamicModule(entry);

      exports = entry.module.exports;
    }

    if ((!entry || entry.declarative) && exports && exports.__useDefault)
      return exports['default'];

    return exports;
  }

  function linkDynamicModule(entry) {
    if (entry.module)
      return;

    var exports = {};

    var module = entry.module = { exports: exports, id: entry.name };

    // AMD requires execute the tree first
    if (!entry.executingRequire) {
      for (var i = 0, l = entry.normalizedDeps.length; i < l; i++) {
        var depName = entry.normalizedDeps[i];
        var depEntry = defined[depName];
        if (depEntry)
          linkDynamicModule(depEntry);
      }
    }

    // now execute
    entry.evaluated = true;
    var output = entry.execute.call(global, function(name) {
      for (var i = 0, l = entry.deps.length; i < l; i++) {
        if (entry.deps[i] != name)
          continue;
        return getModule(entry.normalizedDeps[i]);
      }
    }, exports, module);
    
    if (output)
      module.exports = output;
  }

  /*
   * Given a module, and the list of modules for this current branch,
   *  ensure that each of the dependencies of this module is evaluated
   *  (unless one is a circular dependency already in the list of seen
   *  modules, in which case we execute it)
   *
   * Then we evaluate the module itself depth-first left to right 
   * execution to match ES6 modules
   */
  function ensureEvaluated(moduleName, seen) {
    var entry = defined[moduleName];

    // if already seen, that means it's an already-evaluated non circular dependency
    if (entry.evaluated || !entry.declarative)
      return;

    // this only applies to declarative modules which late-execute

    seen.push(moduleName);

    for (var i = 0, l = entry.normalizedDeps.length; i < l; i++) {
      var depName = entry.normalizedDeps[i];
      if (indexOf.call(seen, depName) == -1) {
        if (!defined[depName])
          load(depName);
        else
          ensureEvaluated(depName, seen);
      }
    }

    if (entry.evaluated)
      return;

    entry.evaluated = true;
    entry.module.execute.call(global);
  }

  // magical execution function
  var modules = {};
  function load(name) {
    if (modules[name])
      return modules[name];

    var entry = defined[name];

    // first we check if this module has already been defined in the registry
    if (!entry)
      throw "Module " + name + " not present.";

    // recursively ensure that the module and all its 
    // dependencies are linked (with dependency group handling)
    link(name);

    // now handle dependency execution in correct order
    ensureEvaluated(name, []);

    // remove from the registry
    defined[name] = undefined;

    var module = entry.declarative ? entry.module.exports : { 'default': entry.module.exports, '__useDefault': true };

    // return the defined module object
    return modules[name] = module;
  };

  return function(main, declare) {

    var System;

    // if there's a system loader, define onto it
    if (typeof System != 'undefined' && System.register) {
      declare(System);
      System['import'](main);
    }
    // otherwise, self execute
    else {
      declare(System = {
        register: register, 
        get: load, 
        set: function(name, module) {
          modules[name] = module; 
        },
        newModule: function(module) {
          return module;
        },
        global: global 
      });
      load(main);
    }
  };

})(typeof window != 'undefined' ? window : global)
/* ('mainModule', function(System) {
  System.register(...);
}); */
('tree/amd-1', function(System) {




System.register("tree/some!tree/plugin", [], false, function() { console.log("SystemJS Builder - Plugin for tree/some!tree/plugin does not support sfx builds"); });


System.register("tree/third", [], function($__export) {
  return {
    setters: [],
    execute: function() {
      $__export('some', 'exports');
    }
  };
});

System.register("tree/cjs", [], true, function(require, exports, module) {
  var global = System.global;
  var __define = global.define;
  global.define = undefined;
  var __filename = "tree/cjs.js";
  var __dirname = "tree";
  exports.cjs = true;
  
  global.define = __define;
  return module.exports;
});

System.register("tree/jquery", [], false, function(__require, __exports, __module) {
  System.get("@@global-helpers").prepareGlobal(__module.id, []);
  (function() {  this.jquery = {};
      
  }).call(System.global);  return System.get("@@global-helpers").retrieveGlobal(__module.id, false);
});

System.register("tree/plugin", [], true, function(require, exports, module) {
  var global = System.global;
  var __define = global.define;
  global.define = undefined;
  var __filename = "tree/plugin.js";
  var __dirname = "tree";
  exports.build = false;
  exports.fetch = function() {
    return '';
  };
  
  global.define = __define;
  return module.exports;
});

System.register("tree/text.txt!tree/text-plugin", [], true, function(require, exports, module) {
  var global = System.global;
  var __define = global.define;
  global.define = undefined;
  var __filename = "tree/text.txt";
  var __dirname = "tree";
  module.exports = "This is some text";
  
  global.define = __define;
  return module.exports;
});

System.register("tree/second", ["tree/third", "tree/cjs"], function($__export) {
  "use strict";
  var __moduleName = "tree/second";
  var q;
  return {
    setters: [function(m) {}, function(m) {}],
    execute: function() {
      q = $__export("q", 4);
    }
  };
});

System.register("tree/global", ["tree/jquery"], false, function(__require, __exports, __module) {
  System.get("@@global-helpers").prepareGlobal(__module.id, ["tree/jquery"]);
  (function() {  "deps ./jquery";
      "exports jquery.test";
      
      this.jquery = this.jquery || {};
      this.jquery.test = 'output';
      
  this["jquery.test"] = jquery.test;
  }).call(System.global);  return System.get("@@global-helpers").retrieveGlobal(__module.id, "jquery.test");
});

(function() {
function define(){};  define.amd = {};
  System.register("tree/amd", ["tree/global", "tree/some!tree/plugin", "tree/text.txt!tree/text-plugin"], false, function(__require, __exports, __module) {
    return (function(a, b, c) {
      return {
        is: 'amd',
        text: c
      };
    }).call(this, __require('tree/global'), __require('tree/some!tree/plugin'), __require('tree/text.txt!tree/text-plugin'));
  });
  })();
System.register("tree/first", ["tree/second", "tree/amd"], function($__export) {
  "use strict";
  var __moduleName = "tree/first";
  var dep,
      p;
  return {
    setters: [function(m) {
      dep = m.dep;
    }, function(m) {}],
    execute: function() {
      p = $__export("p", 5);
    }
  };
});

(function() {
function define(){};  define.amd = {};
  System.register("tree/amd-1", ["tree/first", "tree/second"], false, function(__require, __exports, __module) {
    return (function(first, second, require, module) {
      module.exports = {
        first: first,
        second: require("tree/second")
      };
    }).call(this, __require('tree/first'), __require('tree/second'), __require, __module);
  });
  })();
(function() {
  var loader = System;
  var hasOwnProperty = loader.global.hasOwnProperty;
  var moduleGlobals = {};
  var curGlobalObj;
  var ignoredGlobalProps;
  if (typeof indexOf == 'undefined')
    indexOf = Array.prototype.indexOf;
  System.set("@@global-helpers", System.newModule({
    prepareGlobal: function(moduleName, deps) {
      for (var i = 0; i < deps.length; i++) {
        var moduleGlobal = moduleGlobals[deps[i]];
        if (moduleGlobal)
          for (var m in moduleGlobal)
            loader.global[m] = moduleGlobal[m];
      }
      curGlobalObj = {};
      ignoredGlobalProps = ["indexedDB", "sessionStorage", "localStorage", "clipboardData", "frames", "webkitStorageInfo"];
      for (var g in loader.global) {
        if (indexOf.call(ignoredGlobalProps, g) != -1) { continue; }
        if (!hasOwnProperty || loader.global.hasOwnProperty(g)) {
          try {
            curGlobalObj[g] = loader.global[g];
          } catch (e) {
            ignoredGlobalProps.push(g);
          }
        }
      }
    },
    retrieveGlobal: function(moduleName, exportName, init) {
      var singleGlobal;
      var multipleExports;
      var exports = {};
      if (init) {
        var depModules = [];
        for (var i = 0; i < deps.length; i++)
          depModules.push(require(deps[i]));
        singleGlobal = init.apply(loader.global, depModules);
      }
      else if (exportName) {
        var firstPart = exportName.split(".")[0];
        singleGlobal = eval.call(loader.global, exportName);
        exports[firstPart] = loader.global[firstPart];
      }
      else {
        for (var g in loader.global) {
          if (indexOf.call(ignoredGlobalProps, g) != -1)
            continue;
          if ((!hasOwnProperty || loader.global.hasOwnProperty(g)) && g != loader.global && curGlobalObj[g] != loader.global[g]) {
            exports[g] = loader.global[g];
            if (singleGlobal) {
              if (singleGlobal !== loader.global[g])
                multipleExports = true;
            }
            else if (singleGlobal !== false) {
              singleGlobal = loader.global[g];
            }
          }
        }
      }
      moduleGlobals[moduleName] = exports;
      return multipleExports ? exports : singleGlobal;
    }
  }));
})();

});