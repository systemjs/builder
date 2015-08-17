var getCanonicalName = require('./utils').getCanonicalName;

module.exports = Trace;

function Trace(loader, traceCache) {
  this.loader = loader;
  // stored traced load records
  this.loads = traceCache;
  // in progress traces
  this.tracing = {};
}

// runs the pipeline hooks, returning the load record for a module
Trace.prototype.getLoadRecord = function(name) {
  var loader = this.loader;
  var loads = this.loads;

  var self = this;

  return Promise.resolve(loader.normalize(name))
  .then(function(normalized) {
    name = getCanonicalName(loader, normalized);

    if (loads[name])
      return Promise.resolve(loads[name]);

    if (self.tracing[name])
      return self.tracing[name];

    var load = {
      name: name,
      normalized: normalized,
      address: null,
      metadata: {},
      deps: null,
      depMap: {},
      source: null,
      originalSource: null
    };

    // loader hooks
    return (self.tracing[name] = Promise.resolve(loader.locate({ name: normalized, metadata: load.metadata}))
    .then(function(address) {
      load.address = address;
      if (load.metadata.build === false || load.metadata.loaderModule && load.metadata.loaderModule.build === false)
        return null;
      
      return Promise.resolve(loader.fetch({ name: normalized, metadata: load.metadata, address: load.address }))
      .then(function(source) {
        load.originalSource = source;
        return loader.translate({ name: normalized, metadata: load.metadata, address: load.address, source: source });
      })
      .then(function(source) {
        load.source = source;
        return loader.instantiate({ name: normalized, metadata: load.metadata, address: load.address, source: source });
      })
      .then(function(result) {
        if (!result)
          throw new TypeError('Native ES Module builds not supported. Ensure transpilation is included in the loader pipeline.');
        
        // make address sourceMap-friendly
        if (load.address.indexOf('!') != -1)
          load.address = load.address.substr(0, load.address.indexOf('!'));

        load.deps = result.deps;

        // normalize dependencies to populate depMap
        return Promise.all(result.deps.map(function(dep) {
          return loader.normalize(dep, normalized, load.address)
          .then(function(normalized) {
            load.depMap[dep] = getCanonicalName(loader, normalized);
          });
        }));
      })
      .then(function() {
        return loads[name] = load;
      });
    }));
  });
};

// traces a load and all its dependencies, returning the tree object
Trace.prototype.getAllLoadRecords = function(name, curLoads) {
  var loader = this.loader;

  curLoads = curLoads || {};

  if (name == '@empty')
    return curLoads;

  var self = this;

  return Promise.resolve(loader.normalize(name))
  .then(function(normalized) {
    name = getCanonicalName(loader, normalized);

    if (curLoads[name])
      return curLoads;

    return self.getLoadRecord(normalized)
    .then(function(load) {
      // build: false will return a null
      if (load == null)
        return curLoads;

      curLoads[name] = load;

      return Promise.resolve()
      .then(function() {
        // if this record uses a plugin, trace the plugin as well
        if (load.metadata.loader && load.metadata.build === false)
          return Promise.resolve(self.loader.normalize(load.metadata.loader, name))
          .then(function(pluginName) {
            return self.getAllLoadRecords(pluginName, curLoads);
          });
      })
      .then(function() {
        return Promise.all(load.deps.map(function(dep) {
          return self.getAllLoadRecords(load.depMap[dep], curLoads);
        }));
      })
      .then(function() {
        return curLoads;
      });
    });
  });
};

