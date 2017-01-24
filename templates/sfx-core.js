(function (global) {
  var registry = {};

  var BASE_OBJECT = typeof Symbol !== 'undefined' ? Symbol() : '@@baseObject';

  function extendNamespace (key) {
    Object.defineProperty(this, key, {
      enumerable: true,
      get: function () {
        return this[BASE_OBJECT][key];
      }
    });
  }

  function createModule (bindings) {
    // __esModule flag extension support
    var esModule;
    if (bindings && bindings.__esModule) {
      esModule = {};
      for (var p in bindings) {
        if (bindings.hasOwnProperty(p))
          esModule[p] = bindings[p];
      }
      esModule.default = bindings;
    }
    else {
      esModule = bindings;
    }
    return new Module(esModule);
  }

  function Module (bindings) {
    Object.defineProperty(this, BASE_OBJECT, {
      value: bindings
    });
    Object.keys(bindings).forEach(extendNamespace, this);
  }
  Module.prototype = Object.create(null);
  if (typeof Symbol !== 'undefined' && Symbol.toStringTag)
    Module.prototype[Symbol.toStringTag] = 'Module';

  var nodeRequire = typeof System != 'undefined' && System._nodeRequire || typeof require != 'undefined' && typeof require.resolve != 'undefined' && typeof process != 'undefined' && process.platform && require;

  function getLoad (key) {
    if (key.substr(0, 6) === '@node/')
      return defineModule(key, createModule(nodeRequire(key.substr(6))), {});
    else
      return registry[key];
  }

  function load (key) {
    var load = getLoad(key);

    if (!load)
      throw new Error('Module "' + key + '" expected, but not contained in build.');

    if (load.module)
      return load.module;

    var link = load.linkRecord;

    instantiate(load, link);

    doEvaluate(load, link, []);

    return load.module;
  }

  function instantiate (load, link) {
    // circular stop condition
    if (link.depLoads)
      return;

    if (link.declare)
      registerDeclarative(load, link);

    link.depLoads = [];
    for (var i = 0; i < link.deps.length; i++) {
      var depLoad = getLoad(link.deps[i]);
      link.depLoads.push(depLoad);
      if (depLoad.linkRecord)
        instantiate(depLoad, depLoad.linkRecord);

      var setter = link.setters && link.setters[i];
      if (setter) {
        setter(depLoad.module || depLoad.linkRecord.moduleObj);
        depLoad.importerSetters.push(setter);
      }
    }

    return load;
  }

  function registerDeclarative (load, link) {
    var moduleObj = link.moduleObj;
    var importerSetters = load.importerSetters;

    var locked = false;

    // closure especially not based on link to allow link record disposal
    var declared = link.declare.call(global, function (name, value) {
      // export setter propogation with locking to avoid cycles
      if (locked)
        return;

      if (typeof name == 'object') {
        for (var p in name)
          if (p !== '__useDefault')
            moduleObj[p] = name[p];
      }
      else {
        moduleObj[name] = value;
      }

      locked = true;
      for (var i = 0; i < importerSetters.length; i++)
        importerSetters[i](moduleObj);
      locked = false;

      return value;
    }, { id: load.key });

    if (typeof declared !== 'function') {
      link.setters = declared.setters;
      link.execute = declared.execute;
    }
    else {
      link.setters = [];
      link.execute = declared;
    }
  }

  function register (key, deps, declare) {
    return registry[key] = {
      key: key,
      module: undefined,
      importerSetters: [],
      linkRecord: {
        deps: deps,
        depLoads: undefined,
        declare: declare,
        setters: undefined,
        execute: undefined,
        moduleObj: {}
      }
    };
  };

  function registerDynamic (key, deps, executingRequire, execute) {
    return registry[key] = {
      key: key,
      module: undefined,
      importerSetters: [],
      linkRecord: {
        deps: deps,
        depLoads: undefined,
        declare: undefined,
        execute: execute,
        executingRequire: false,
        moduleObj: {
          default: {},
          __useDefault: true
        },
        setters: undefined
      }
    };
  }

  function makeDynamicRequire (deps, depLoads, seen) {
    // we can only require from already-known dependencies
    return function (name) {
      for (var i = 0; i < deps.length; i++)
        if (deps[i] === name) {
          var depLoad = depLoads[i];
          var module = doEvaluate(depLoad, depLoad.linkRecord, seen);
          return module.__useDefault ? module.default : module;
        }
    };
  }

  function doEvaluate (load, link, seen) {
    seen.push(load);

    if (load.module)
      return load.module;

    var err;

    // es modules evaluate dependencies first
    if (link.setters) {
      for (var i = 0; i < link.deps.length; i++) {
        var depLoad = link.depLoads[i];
        var depLink = depLoad.linkRecord;

        if (depLink && seen.indexOf(depLoad) === -1)
          err = doEvaluate(depLoad, depLink, depLink.setters ? seen : []);
      }

      link.execute.call(nullContext);
    }
    else {
      var module = { id: load.key };
      var moduleObj = link.moduleObj;
      Object.defineProperty(module, 'exports', {
        set: function (exports) {
          moduleObj.default = exports;
        },
        get: function () {
          return moduleObj.default;
        }
      });
      var require = makeDynamicRequire(link.deps, link.depLoads, seen);
      var output = link.execute.call(global, require, moduleObj.default, module);
      if (output !== undefined)
        moduleObj.default = output;
    }

    var module = load.module = createModule(link.moduleObj);

    if (!link.setters)
      for (var i = 0; i < load.importerSetters.length; i++)
        load.importerSetters[i](module);

    return module;
  }

  // {} is the closest we can get to call(undefined)
  var nullContext = {};
  if (Object.freeze)
    Object.freeze(nullContext);

  function defineModule (name, module) {
    registry[name] = {
      key: name,
      module: module,
      importerSetters: [],
      linkRecord: undefined
    };
  }

  return function (mains, depNames, exportDefault, declare) {
    return function (formatDetect) {
      formatDetect(function (deps) {
        var System = {
          _nodeRequire: nodeRequire,
          register: register,
          registerDynamic: registerDynamic,
          get: function (name) {
            return registry[name].module;
          },
          set: defineModule,
          newModule: function (module) {
            return new Module(module);
          }
        };

        defineModule('@empty', new Module({}));

        // register external dependencies
        for (var i = 0; i < depNames.length; i++)
          defineModule(depNames[i], createModule(arguments[i], {}));

        // register modules in this bundle
        declare(System);

        // load mains
        var firstLoad = load(mains[0]);
        if (mains.length > 1)
          for (var i = 1; i < mains.length; i++)
            load(mains[i]);

        if (exportDefault)
          return firstLoad.default;
        else
          return firstLoad;
      });
    };
  };

})(typeof self !== 'undefined' ? self : global)
/* (['mainModule'], ['external-dep'], false, function($__System) {
  System.register(...);
})
(function(factory) {
  if (typeof define && define.amd)
    define(['external-dep'], factory);
  // etc UMD / module pattern
})*/
