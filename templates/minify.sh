uglifyjs sfx-core.js -cm | sed 's/.$//' > sfx-core.min.js
uglifyjs amd-helpers.js -cm > amd-helpers.min.js
uglifyjs global-helpers.js -cm > global-helpers.min.js
