var Builder = require('../index');

var builder = new Builder('test/fixtures/default-extension-path');

suite('Test path to package with defaultExtension', function(err) {
  test('path to package with defaultExtension', function() {
      builder.config({
          defaultJSExtensions: true,
          paths: {
            "test-app*": "lib*"
          },
          packages: {
            "test-app": {
              "main": "main.js",
              "format": "esm",
              "defaultExtension": false
            }
          }
      });
      
      return builder.bundle('test-app').then(function(out) {
          console.dir(out.entryPoints);
          assert(out.entryPoints.length == 1 && out.entryPoints[0] == 'test-app/main.js');
      });
  });
});
