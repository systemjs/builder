var Profile = module.exports;

// profiling events
var events = [];

// profiling is enabled via profile.enable() or `--profile` flag
var enabled = process.argv.indexOf('--profile') != -1;
Profile.enable = function() {
  enabled = true;
};

function ProfileEvent(name, item) {
  this.name = name;
  this.item = (typeof item == 'function' ? item() : item) || 'default';
  this.start = Date.now();
  this.stop = null;
  this.cancelled = false;
}
ProfileEvent.prototype.rename = function(name, item) {
  this.name = name;
  if (arguments.length > 1)
    this.item = item;
};
ProfileEvent.prototype.done = function() {
  if (this.stop)
    throw new TypeError('Event ' + name + ' (' + this.item + ') has already completed.');
  this.stop = Date.now();
};
ProfileEvent.prototype.cancel = function() {
  this.cancelled = true;
};
ProfileEvent.prototype.cancelIfNotDone = function() {
  if (!this.stop)
    this.cancelled = true;
};

var nullEvent = { done: function() {}, cancel: function() {}, cancelIfNotDone: function() {} };

Profile.event = function(eventName, eventItem) {
  if (!enabled)
    return nullEvent;

  var evt = new ProfileEvent(eventName, eventItem);
  events.push(evt);
  return evt;
};

process.on('exit', function() {
  if (!logged)
    Profile.logSummary();
});

var logged = false;
Profile.logSummary = function(excludeEvts) {
  excludeEvts = excludeEvts || [];
  logged = true;
  // create groupings of events by event name to time data
  // filtering out cancelled events
  var groupedEvents = {};
  events.forEach(function(evt) {
    if (excludeEvts.indexOf(evt.name) != -1)
      return;
    if (evt.cancelled)
      return;
    if (!evt.stop)
      throw new TypeError('Event ' + evt.name + ' (' + evt.item + ') never completed.');

    var evtTimes = groupedEvents[evt.name] = groupedEvents[evt.name] || [];
    evtTimes.push({
      time: evt.stop - evt.start,
      item: evt.item
    });
  });

  Object.keys(groupedEvents).forEach(function(evt) {
    var evtTimes = groupedEvents[evt];

    // only one event -> log as a single event
    if (evtTimes.length == 1) {
      console.log(toTitleCase(evt) + (evtTimes[0].item != 'default' ? ' (' + evtTimes[0].item + ')' : ''));
      logStat('Total Time', evtTimes[0].time);
      console.log('');
      return;
    }

    // multiple events, give some stats!
    var evtCount = evtTimes.length;

    console.log(toTitleCase(evt) + ' (' + evtCount + ' events)');

    var totalTime = evtTimes.reduce(function(curSum, evt) {
      return curSum + evt.time;
    }, 0);
    logStat('Cumulative Time', totalTime);

    var mean = totalTime / evtCount;
    logStat('Mean', mean);

    var stdDev = Math.sqrt(evtTimes.reduce(function(curSum, evt) {
      return curSum + Math.pow(evt.time - mean, 2);
    }, 0) / evtCount);

    logStat('Std Deviation', stdDev);

    var withoutOutliers = evtTimes.filter(function(evt) {
      return evt.time > mean - stdDev && evt.time < mean + stdDev;
    });

    logStat('Avg within 2σ', withoutOutliers.reduce(function(curSum, evt) {
      return curSum + evt.time;
    }, 0) / withoutOutliers.length);

    var sorted = evtTimes.sort(function(a, b) {
      return a.time > b.time ? 1 : -1;
    });

    var medianIndex = Math.round(evtCount / 2);
    logStat('Median', sorted[medianIndex].time, sorted[medianIndex].evt);

    logStat('Max', sorted[evtCount - 1].time, sorted[evtCount - 1].item);

    logStat('Min', sorted[0].time, sorted[0].item);

    var duplicates = evtTimes.filter(function(evt) {
      return evtTimes.some(function(dup) {
        return dup !== evt && dup.name == evt.name && dup.item == evt.item;
      });
    });

    logStat('Duplicate Events', duplicates.length, true);

    logStat('Total Duplicated Time', duplicates.reduce(function(duplicateTime, evt) {
      return duplicateTime + evt.time;
    }, 0));

    console.log('');
  });
};

function toTitleCase(title) {
  return title.split('-').map(function(part) {
    return part[0].toUpperCase() + part.substr(1);
  }).join(' ');
}

var titleLen = 25;
function logStat(title, value, item, isNum) {
  if (item === true) {
    item = undefined;
    isNum = true;
  }
  var spaces = Array(titleLen - title.length + 1).join(' ');
  var value = isNum ? value : Math.round(value * 100) / 100 + 'ms';
  console.log('  ' + title + spaces + ': ' + value + (item ? ' (' + item + ')' : ''));
}