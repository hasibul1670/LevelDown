(function () {
  "use strict";

  function start() {
    if (!window.DRB) {
      showFatal("Level Down REST Builder scripts did not load.");
      return;
    }

    try {
      window.DRB.InsertMainBodyContent();
      window.DRB.Initialize();
      customizeBranding();
      installExecutePatch();
      installExecuteShortcut();
      document.documentElement.classList.add("level-down-drb-ready");
    } catch (error) {
      console.error("Level Down DRB startup failed", error);
      showFatal(error && error.message ? error.message : "Level Down REST Builder could not start.");
    }
  }

  function customizeBranding() {
    document.title = "Level Down REST Builder";

    const notice = document.getElementById("div_notice");
    if (notice) {
      notice.remove();
    }

    const noticeButton = document.getElementById("btn_notice");
    if (noticeButton) {
      noticeButton.remove();
    }

    const heading = Array.from(document.querySelectorAll("h1, h2, h3"))
      .find((item) => /Dataverse REST Builder/i.test(item.textContent || ""));
    if (heading) {
      heading.textContent = "Level Down REST Builder";
      heading.classList.add("level-down-drb-title");
    }

    Array.from(document.querySelectorAll("a")).forEach((link) => {
      const text = (link.textContent || "").trim();
      if (["Twitter", "LinkedIn", "GitHub", "Blog"].includes(text)) {
        const row = link.parentElement;
        if (row) {
          row.style.display = "none";
        }
      }
    });

    Array.from(document.body.querySelectorAll("*")).forEach((node) => {
      if (node.children.length === 0) {
        return;
      }
      const text = (node.textContent || "").trim();
      if (/^Created by Guido Preite/i.test(text)) {
        node.style.display = "none";
      }
    });

    const mainLayout = document.querySelector(".mainlayout");
    if (mainLayout) {
      mainLayout.classList.add("level-down-drb-shell");
    }
  }

  function installExecuteShortcut() {
    const existing = document.getElementById("level-down-drb-execute-shortcut");
    if (existing) {
      return;
    }

    const button = document.createElement("button");
    button.id = "level-down-drb-execute-shortcut";
    button.type = "button";
    button.textContent = "Execute";
    button.title = "Execute the generated request and open Results";
    button.addEventListener("click", () => {
      executeGeneratedRequest();
    });

    document.body.appendChild(button);
  }

  function installExecutePatch() {
    if (!window.DRB || !window.DRB.Logic || window.DRB.Logic.__levelDownExecutePatched) {
      return;
    }

    window.DRB.Logic.__levelDownOriginalExecuteCodeFromEditor = window.DRB.Logic.ExecuteCodeFromEditor;
    window.DRB.Logic.ExecuteCodeFromEditor = executeCodeFromEditor;
    window.DRB.Logic.__levelDownExecutePatched = true;
  }

  function executeGeneratedRequest() {
    if (!window.DRB || !window.DRB.Settings || !window.DRB.Logic) {
      return;
    }

    try {
      ensureEditorHasCode();
      showExecutionLoader();
      window.DRB.Logic.ExecuteCodeFromEditor();
      const resultsTab = document.getElementById("a_code_results");
      if (resultsTab) {
        setTimeout(() => resultsTab.click(), 150);
      }
      watchExecutionResults();
    } catch (error) {
      hideExecutionLoader("Execution could not start.");
      console.error("Level Down REST Builder execute failed", error);
    }
  }

  function executeCodeFromEditor() {
    const editors = window.DRB.Settings.Editors || {};
    const resultsEditor = editors[window.DRB.Settings.TabResults] || editors.code_results;
    const targetEditor = editors[window.DRB.Settings.TabExecute] || editors.code_editor;
    if (!targetEditor || !targetEditor.session || !resultsEditor || !resultsEditor.session) {
      throw new Error("Editor or Results tab is not ready.");
    }

    resultsEditor.session.setValue("");
    writeResult(`Execution Start: ${new Date().toLocaleString("sv")}`);

    const selectedCode = ensureEditorHasCode();
    const executableCode = prepareExecutableCode(selectedCode);
    if (!executableCode.trim()) {
      writeResult("No executable request code was generated. Configure the request first, then run Execute.");
      openResultsTab();
      return;
    }

    const resultConsole = {
      log: (...args) => writeResult(formatConsoleArgs(args)),
      error: (...args) => writeResult(formatConsoleArgs(args)),
      warn: (...args) => writeResult(formatConsoleArgs(args))
    };

    const xrm = getParentXrm();
    if (!xrm) {
      writeResult("Xrm was not found on the Dynamics page. Reload the Dynamics tab and open REST Builder again from Level Down.");
      openResultsTab();
      return;
    }

    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled || hasResultBeyondStart()) {
        return;
      }
      writeResult("No response was returned after 15 seconds. The request may still be blocked by the browser/session, or the generated request did not call console.log in its callback.");
      hideExecutionLoader("No response returned.", true);
    }, 15000);

    try {
      const run = new Function("Xrm", "DRB", "$", "console", `"use strict";\n${executableCode}`);
      const returnValue = run(xrm, window.DRB, window.$, resultConsole);
      if (returnValue && typeof returnValue.then === "function") {
        returnValue
          .then((value) => {
            settled = true;
            clearTimeout(timeoutId);
            if (value !== undefined) {
              writeResult(value);
            }
            hideExecutionLoader("Results updated.");
          })
          .catch((error) => {
            settled = true;
            clearTimeout(timeoutId);
            writeResult(error);
            hideExecutionLoader("Execution failed.", true);
          });
      } else {
        if (returnValue !== undefined) {
          settled = true;
          clearTimeout(timeoutId);
          writeResult(returnValue);
        }
      }
    } catch (error) {
      settled = true;
      clearTimeout(timeoutId);
      writeResult(error);
      hideExecutionLoader("Execution failed.", true);
    }

    openResultsTab();
  }

  function ensureEditorHasCode() {
    const editors = window.DRB.Settings.Editors || {};
    const targetEditor = editors.code_editor;
    if (!targetEditor || !targetEditor.session) {
      throw new Error("Editor tab is not ready.");
    }

    const preferredSources = [
      "code_fetchapi",
      "code_xmlhttprequest",
      "code_jquery",
      "code_xrmwebapi",
      "code_xrmwebapiexecute"
    ];

    for (const sourceName of preferredSources) {
      const sourceEditor = editors[sourceName];
      if (!sourceEditor || !sourceEditor.session) {
        continue;
      }

      const sourceCode = sourceEditor.session.getValue();
      if (sourceCode && sourceCode.trim().length > 0 && !/^\/\/ Select /i.test(sourceCode.trim())) {
        targetEditor.session.setValue(sourceCode);
        return sourceCode;
      }
    }

    const existingCode = targetEditor.session.getValue();
    if (existingCode && existingCode.trim().length > 0) {
      return existingCode;
    }

    return targetEditor.session.getValue() || "";
  }

  function prepareExecutableCode(code) {
    let executableCode = String(code || "");
    executableCode = executableCode.replace(/console\.log/gi, "console.log");
    executableCode = executableCode.replace(/console\.error/gi, "console.error");
    executableCode = executableCode.replace(/Xrm\.Utility\.getGlobalContext\(\)\.getClientUrl\(\)/gi, "Xrm.Utility.getGlobalContext().getClientUrl()");
    executableCode = executableCode.replace(/fetch\(([^,]+),\s*\{/g, (match) => {
      if (/credentials\s*:/.test(match)) {
        return match;
      }
      return match.replace("{", '{ credentials: "same-origin",');
    });
    return executableCode;
  }

  function getParentXrm() {
    try {
      if (window.parent && window.parent.Xrm) {
        return window.parent.Xrm;
      }
    } catch (_error) {
      // Access can fail if the builder is moved to a different browsing context.
    }
    return window.Xrm || null;
  }

  function writeResult(value) {
    const editors = window.DRB && window.DRB.Settings ? window.DRB.Settings.Editors || {} : {};
    const resultsEditor = editors[window.DRB.Settings.TabResults] || editors.code_results;
    if (!resultsEditor || !resultsEditor.session) {
      return;
    }

    const formatted = formatResultValue(value);
    const existing = resultsEditor.session.getValue();
    resultsEditor.session.setValue(existing ? `${existing}\n${formatted}` : formatted);
    try {
      console.log(formatted);
    } catch (_error) {
      // Ignore console failures.
    }
  }

  function formatConsoleArgs(args) {
    return args.map(formatResultValue).join(" ");
  }

  function formatResultValue(value) {
    if (value instanceof Error) {
      return value.stack || value.message || String(value);
    }
    if (typeof value === "string") {
      return value;
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch (_error) {
      return String(value);
    }
  }

  function hasResultBeyondStart() {
    const editors = window.DRB && window.DRB.Settings ? window.DRB.Settings.Editors || {} : {};
    const resultsEditor = editors[window.DRB.Settings.TabResults] || editors.code_results;
    const value = resultsEditor && resultsEditor.session ? resultsEditor.session.getValue() : "";
    return value.split(/\r?\n/).filter((line) => line.trim()).length > 1;
  }

  function openResultsTab() {
    const resultsTab = document.getElementById("a_code_results");
    if (resultsTab) {
      setTimeout(() => resultsTab.click(), 120);
    }
  }

  function showExecutionLoader() {
    let loader = document.getElementById("level-down-drb-loader");
    if (!loader) {
      loader = document.createElement("div");
      loader.id = "level-down-drb-loader";
      loader.innerHTML = '<span class="level-down-drb-spinner"></span><span>Executing request...</span>';
      document.body.appendChild(loader);
    }
    loader.classList.remove("done", "error");
    loader.style.display = "inline-flex";
  }

  function hideExecutionLoader(message, isError) {
    const loader = document.getElementById("level-down-drb-loader");
    if (!loader) {
      return;
    }
    if (message) {
      loader.innerHTML = `<span>${message}</span>`;
      loader.classList.toggle("error", Boolean(isError));
      loader.classList.add("done");
      setTimeout(() => {
        loader.style.display = "none";
      }, 1800);
      return;
    }
    loader.style.display = "none";
  }

  function watchExecutionResults() {
    const start = Date.now();
    const timer = setInterval(() => {
      const editor = window.DRB && window.DRB.Settings && window.DRB.Settings.Editors
        ? window.DRB.Settings.Editors.code_results
        : null;
      const value = editor && editor.session ? editor.session.getValue() : "";
      const hasMoreThanStart = value && value.split(/\r?\n/).length > 1;
      if (hasMoreThanStart) {
        clearInterval(timer);
        hideExecutionLoader("Results updated.");
      } else if (Date.now() - start > 12000) {
        clearInterval(timer);
        hideExecutionLoader("Waiting for async response...", false);
      }
    }, 300);
  }

  function showFatal(message) {
    document.body.innerHTML = "";
    const wrap = document.createElement("main");
    wrap.className = "level-down-drb-fatal";
    const title = document.createElement("h1");
    title.textContent = "REST Builder could not start";
    const text = document.createElement("p");
    text.textContent = message;
    wrap.append(title, text);
    document.body.append(wrap);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
