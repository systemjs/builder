System.register(["./global.js", "./example.js"], function (_export, _context) {
  "use strict";

  var odds, nums, bob, _ref, a, b, _getASTNode, a, b, c, _getASTNode2, op, lhs, rhs, _ref3, a, _ref4, _ref4$, a, tail;

  // Can be used in parameter position
  function g(_ref2) {
    var x = _ref2.name;

    console.log(x);
  }


  // Destructuring + defaults arguments
  function r(_ref5) {
    var x = _ref5.x,
        y = _ref5.y,
        _ref5$w = _ref5.w,
        w = _ref5$w === undefined ? 10 : _ref5$w,
        _ref5$h = _ref5.h,
        h = _ref5$h === undefined ? 10 : _ref5$h;

    return x + y + w + h;
  }


  function f(x) {
    var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 12;

    // y is 12 if not passed (or passed as undefined)
    return x + y;
  }

  function f(x) {
    // y is an Array
    return x * (arguments.length <= 1 ? 0 : arguments.length - 1);
  }

  function f(x, y, z) {
    return x + y + z;
  }
  // Pass each elem of array as argument


  function f() {
    {
      var x = void 0;
      {
        // okay, block scoped name
        var _x2 = "sneaky";
      }
      // okay, declared with `let`
      x = "bar";
    }
  }

  function factorial(n) {
    var acc = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 1;

    if (n <= 1) return acc;
    return factorial(n - 1, n * acc);
  }

  // Stack overflow in most implementations today,
  // but safe on arbitrary inputs in ES2015
  return {
    setters: [function (_globalJs) {}, function (_exampleJs) {}],
    execute: function () {
      odds = evens.map(function (v) {
        return v + 1;
      });
      nums = evens.map(function (v, i) {
        return v + i;
      });


      // Statement bodies
      nums.forEach(function (v) {
        if (v % 5 === 0) fives.push(v);
      });

      // Lexical this
      bob = {
        _name: "Bob",
        _friends: [],
        printFriends: function printFriends() {
          var _this = this;

          this._friends.forEach(function (f) {
            return console.log(_this._name + " knows " + f);
          });
        }
      };
      _ref = [1, 2, 3];
      a = _ref[0];
      b = _ref[2];

      a === 1;
      b === 3;

      // object matching
      _getASTNode = getASTNode();
      a = _getASTNode.op;
      b = _getASTNode.lhs.op;
      c = _getASTNode.rhs;
      _getASTNode2 = getASTNode();
      op = _getASTNode2.op;
      lhs = _getASTNode2.lhs;
      rhs = _getASTNode2.rhs;
      g({ name: 5 });

      // Fail-soft destructuring
      _ref3 = [];
      a = _ref3[0];

      a === undefined;

      // Fail-soft destructuring with defaults
      _ref4 = [];
      _ref4$ = _ref4[0];
      a = _ref4$ === undefined ? 1 : _ref4$;

      a === 1;r({ x: 1, y: 2 }) === 23;f(3) == 15;f(3, "hello", true) == 6;f.apply(undefined, [1, 2, 3]) == 6;
      _export("tail", tail = factorial(100000));

      _export("tail", tail);
    }
  };
});

//# sourceMappingURL=data:application/json;base64,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QUFpQixDQUFqQjtzQkF1QmEsSSxHQUFPLFVBQVUsTUFBVixDIiwiZmlsZSI6InJlZ2lzdGVyLmpzIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IFwiLi9nbG9iYWwuanNcIjtcbmltcG9ydCBcIi4vZXhhbXBsZS5qc1wiO1xuXG4vLyBFeHByZXNzaW9uIGJvZGllc1xudmFyIG9kZHMgPSBldmVucy5tYXAodiA9PiB2ICsgMSk7XG52YXIgbnVtcyA9IGV2ZW5zLm1hcCgodiwgaSkgPT4gdiArIGkpO1xuXG4vLyBTdGF0ZW1lbnQgYm9kaWVzXG5udW1zLmZvckVhY2godiA9PiB7XG4gIGlmICh2ICUgNSA9PT0gMClcbiAgICBmaXZlcy5wdXNoKHYpO1xufSk7XG5cbi8vIExleGljYWwgdGhpc1xudmFyIGJvYiA9IHtcbiAgX25hbWU6IFwiQm9iXCIsXG4gIF9mcmllbmRzOiBbXSxcbiAgcHJpbnRGcmllbmRzKCkge1xuICAgIHRoaXMuX2ZyaWVuZHMuZm9yRWFjaChmID0+XG4gICAgICBjb25zb2xlLmxvZyh0aGlzLl9uYW1lICsgXCIga25vd3MgXCIgKyBmKSk7XG4gIH1cbn07XG5cbi8vIGxpc3QgbWF0Y2hpbmdcbnZhciBbYSwgLGJdID0gWzEsMiwzXTtcbmEgPT09IDE7XG5iID09PSAzO1xuXG4vLyBvYmplY3QgbWF0Y2hpbmdcbnZhciB7IG9wOiBhLCBsaHM6IHsgb3A6IGIgfSwgcmhzOiBjIH1cbiAgPSBnZXRBU1ROb2RlKClcblxuLy8gb2JqZWN0IG1hdGNoaW5nIHNob3J0aGFuZFxuLy8gYmluZHMgYG9wYCwgYGxoc2AgYW5kIGByaHNgIGluIHNjb3BlXG52YXIge29wLCBsaHMsIHJoc30gPSBnZXRBU1ROb2RlKClcblxuLy8gQ2FuIGJlIHVzZWQgaW4gcGFyYW1ldGVyIHBvc2l0aW9uXG5mdW5jdGlvbiBnKHtuYW1lOiB4fSkge1xuICBjb25zb2xlLmxvZyh4KTtcbn1cbmcoe25hbWU6IDV9KVxuXG4vLyBGYWlsLXNvZnQgZGVzdHJ1Y3R1cmluZ1xudmFyIFthXSA9IFtdO1xuYSA9PT0gdW5kZWZpbmVkO1xuXG4vLyBGYWlsLXNvZnQgZGVzdHJ1Y3R1cmluZyB3aXRoIGRlZmF1bHRzXG52YXIgW2EgPSAxXSA9IFtdO1xuYSA9PT0gMTtcblxuLy8gRGVzdHJ1Y3R1cmluZyArIGRlZmF1bHRzIGFyZ3VtZW50c1xuZnVuY3Rpb24gcih7eCwgeSwgdyA9IDEwLCBoID0gMTB9KSB7XG4gIHJldHVybiB4ICsgeSArIHcgKyBoO1xufVxucih7eDoxLCB5OjJ9KSA9PT0gMjNcblxuXG5mdW5jdGlvbiBmKHgsIHk9MTIpIHtcbiAgLy8geSBpcyAxMiBpZiBub3QgcGFzc2VkIChvciBwYXNzZWQgYXMgdW5kZWZpbmVkKVxuICByZXR1cm4geCArIHk7XG59XG5mKDMpID09IDE1XG5mdW5jdGlvbiBmKHgsIC4uLnkpIHtcbiAgLy8geSBpcyBhbiBBcnJheVxuICByZXR1cm4geCAqIHkubGVuZ3RoO1xufVxuZigzLCBcImhlbGxvXCIsIHRydWUpID09IDZcbmZ1bmN0aW9uIGYoeCwgeSwgeikge1xuICByZXR1cm4geCArIHkgKyB6O1xufVxuLy8gUGFzcyBlYWNoIGVsZW0gb2YgYXJyYXkgYXMgYXJndW1lbnRcbmYoLi4uWzEsMiwzXSkgPT0gNlxuXG5cbmZ1bmN0aW9uIGYoKSB7XG4gIHtcbiAgICBsZXQgeDtcbiAgICB7XG4gICAgICAvLyBva2F5LCBibG9jayBzY29wZWQgbmFtZVxuICAgICAgY29uc3QgeCA9IFwic25lYWt5XCI7XG4gICAgfVxuICAgIC8vIG9rYXksIGRlY2xhcmVkIHdpdGggYGxldGBcbiAgICB4ID0gXCJiYXJcIjtcbiAgfVxufVxuXG5cbmZ1bmN0aW9uIGZhY3RvcmlhbChuLCBhY2MgPSAxKSB7XG4gIGlmIChuIDw9IDEpIHJldHVybiBhY2M7XG4gIHJldHVybiBmYWN0b3JpYWwobiAtIDEsIG4gKiBhY2MpO1xufVxuXG4vLyBTdGFjayBvdmVyZmxvdyBpbiBtb3N0IGltcGxlbWVudGF0aW9ucyB0b2RheSxcbi8vIGJ1dCBzYWZlIG9uIGFyYml0cmFyeSBpbnB1dHMgaW4gRVMyMDE1XG5leHBvcnQgY29uc3QgdGFpbCA9IGZhY3RvcmlhbCgxMDAwMDApIl19