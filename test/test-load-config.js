var Builder = require('../index');
var fs = require('fs');
var Promise = require('rsvp').Promise;


suite('Test builder.loadConfig', function() {
    
  test('builder.loadConfig works', function(done) {
    
    var configFile = 'test/output/builderConfig.js';
    var builder = new Builder();
    fs.writeFileSync(configFile, 'System.config({map: {m: "./m.js"}});');
    builder.loadConfig(configFile).then(function() {
      
      assert.equal(builder.loader.map['m'], './m.js', 'loader map was loaded from config');
      
    }).then(done, done);
    
  });
  
  test('builder.loadConfig does not affect other builders', function(done) {
  
    var configFile1 = 'test/output/builder1Config.js';
    var configFile2 = 'test/output/builder2Config.js';
    fs.writeFileSync(configFile1, 'System.config({map: {m1: "./m1.js"}});');
    fs.writeFileSync(configFile2, 'System.config({map: {m2: "./m2.js"}});');
    
    var builder1 = new Builder();
    var builder2 = new Builder();
    
    var p1 = builder1.loadConfig(configFile1);
    var p2 = builder2.loadConfig(configFile2);
    
    
    Promise.all([p1, p2]).then(function() {
      
      assert.equal(builder1.loader.map['m1'], './m1.js', 'builder1.loader map was loaded from config');
      assert.equal(builder2.loader.map['m2'], './m2.js', 'builder2.loader map was loaded from config');
      
    }).then(done, done);      
      
  });

});