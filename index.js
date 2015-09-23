var profile = require('./lib/profile');

var evt = profile.event('startup');

module.exports = require('./lib/builder');

evt.done();