System.register(["./component.jsx!jsx.js"], function (exports_1, context_1) {
    "use strict";
    var __moduleName = context_1 && context_1.id;
    function basic() {
        return 1 + 1;
    }
    exports_1("basic", basic);
    var component_jsx_jsx_js_1, component;
    return {
        setters: [
            function (component_jsx_jsx_js_1_1) {
                component_jsx_jsx_js_1 = component_jsx_jsx_js_1_1;
            }
        ],
        execute: function () {
            exports_1("component", component = component_jsx_jsx_js_1.default);
            exports_1("default", {
                'hello': 'world'
            });
        }
    };
});
