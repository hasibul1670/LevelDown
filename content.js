(function () {
  "use strict";

  if (window.__levelDownContentLoaded) {
    return;
  }
  window.__levelDownContentLoaded = true;

  const EXTENSION_SOURCE = "level-down-extension";
  const PAGE_COMMAND_SOURCE = "level-down-extension-v2";
  const PAGE_SOURCE = "level-down-page";
  const INJECTION_VERSION = "2026-06-24-drb-ace-base-path";
  const pendingRequests = new Map();
  let injectionPromise = null;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.source !== EXTENSION_SOURCE || !message.command || !message.requestId) {
      return false;
    }

    forwardToPage(message)
      .then(sendResponse)
      .catch((error) => {
        console.error("Level Down content error", error);
        sendResponse({
          source: PAGE_SOURCE,
          requestId: message.requestId,
          success: false,
          error: error.message || "Level Down could not inspect this page."
        });
      });

    return true;
  });

  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || event.data.source !== PAGE_SOURCE) {
      return;
    }

    if (event.data.command === "READY") {
      window.dispatchEvent(new CustomEvent("level-down-ready"));
      return;
    }

    const pending = pendingRequests.get(event.data.requestId);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeoutId);
    pendingRequests.delete(event.data.requestId);
    pending.resolve(event.data);
  });

  function forwardToPage(message) {
    return ensureInjected().then(() => new Promise((resolve) => {
      const pageMessage = {
        ...message,
        source: PAGE_COMMAND_SOURCE,
        payload: {
          ...(message.payload || {}),
          extensionBaseUrl: chrome.runtime.getURL(""),
          injectionVersion: INJECTION_VERSION
        }
      };

      const timeoutId = setTimeout(() => {
        pendingRequests.delete(message.requestId);
        resolve({
          source: PAGE_SOURCE,
          requestId: message.requestId,
          success: false,
          error: "Dynamics form context was not found. Open a model-driven app record form and try again."
        });
      }, 10000);

      pendingRequests.set(message.requestId, { resolve, timeoutId });
      window.postMessage(pageMessage, window.location.origin);
    }));
  }

  function ensureInjected() {
    if (injectionPromise) {
      return injectionPromise;
    }

    injectionPromise = new Promise((resolve, reject) => {
      if (document.documentElement.dataset.levelDownInjectedVersion === INJECTION_VERSION) {
        resolve();
        return;
      }

      const script = document.createElement("script");
      script.src = chrome.runtime.getURL("injected.js");
      script.async = false;
      script.dataset.levelDownScript = "true";

      const readyTimeout = setTimeout(resolve, 1500);

      window.addEventListener("level-down-ready", () => {
        clearTimeout(readyTimeout);
        resolve();
      }, { once: true });

      script.addEventListener("load", () => {
        setTimeout(resolve, 0);
      }, { once: true });

      script.addEventListener("error", () => {
        clearTimeout(readyTimeout);
        reject(new Error("Level Down could not load its page helper."));
      }, { once: true });

      document.documentElement.dataset.levelDownInjected = "true";
      document.documentElement.dataset.levelDownInjectedVersion = INJECTION_VERSION;
      (document.head || document.documentElement).appendChild(script);
      script.remove();
    });

    return injectionPromise;
  }
})();
