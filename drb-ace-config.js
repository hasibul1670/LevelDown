(function () {
  "use strict";

  if (!window.ace || !window.ace.config) {
    return;
  }

  var script = document.currentScript;
  var basePath = script && script.dataset ? script.dataset.aceBasePath || "" : "";
  if (!basePath) {
    return;
  }

  window.ace.config.set("basePath", basePath);
  window.ace.config.set("modePath", basePath);
  window.ace.config.set("themePath", basePath);
  window.ace.config.set("workerPath", basePath);
  window.ace.config.set("loadWorkerFromBlob", false);
})();
