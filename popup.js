const SOURCE = "level-down-extension";

const commandLabels = {
  GET_RECORD_ID: "Record ID",
  GET_ENTITY_NAME: "Entity Name",
  GET_RECORD_URL: "Record URL",
  GET_WEB_API_URL: "Web API URL",
  GET_FORM_INFO: "Form Info",
  GET_ALL_FIELDS: "All Fields",
  GET_CHANGED_FIELDS: "Changed Fields",
  GET_CHOICE_VALUES: "Choice Values",
  GET_OPTIONSET_VALUES: "OptionSet Values",
  SHOW_LOGICAL_NAMES: "Show Logical Names",
  HIDE_LOGICAL_NAMES: "Hide Logical Names",
  UNLOCK_FIELDS: "Unlock Fields",
  LOCK_FIELDS: "Lock Fields",
  GET_TABS_SECTIONS: "Tabs & Sections",
  TOGGLE_TABS: "Toggle Tabs",
  REFRESH_SUBGRIDS: "Refresh Subgrids",
  GET_DEBUG_SNAPSHOT: "Debug Snapshot",
  GET_ENVIRONMENT_DETAILS: "Environment Details",
  OPEN_ENVIRONMENT_SETTINGS: "Environment Settings",
  GET_MY_ROLES: "My Roles",
  OPEN_USERS_AND_ROLES: "Users and Roles",
  OPEN_MY_USER_RECORD: "My User Record",
  OPEN_MY_MAILBOX: "My Mailbox",
  OPEN_COMMAND_DEBUGGER: "Command Debugger",
  OPEN_FORMS_MONITOR: "Forms Monitor",
  GET_ENTITY_METADATA: "Entity Metadata",
  OPEN_REST_BUILDER: "REST Builder"
};

const inlineCommands = new Set([
  "SHOW_LOGICAL_NAMES",
  "HIDE_LOGICAL_NAMES",
  "UNLOCK_FIELDS",
  "LOCK_FIELDS",
  "TOGGLE_TABS",
  "REFRESH_SUBGRIDS",
  "GET_DEBUG_SNAPSHOT",
  "OPEN_REST_BUILDER"
]);

const resultEl = document.getElementById("result");
const resultTitleEl = document.getElementById("result-title");
const copyButton = document.getElementById("copy-result");
let lastCopyText = "";

showInfo("Choose an action. Quick page actions run here; reports open in a Level Down tab.");

copyButton.addEventListener("click", async () => {
  if (!lastCopyText) {
    return;
  }

  try {
    await navigator.clipboard.writeText(lastCopyText);
    copyButton.textContent = "Copied";
    setTimeout(() => {
      copyButton.textContent = "Copy";
    }, 1000);
  } catch (error) {
    console.error("Level Down copy error", error);
    showError("Copy failed. You can still select the text manually.");
  }
});

document.querySelectorAll(".tab-button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab-button").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    document.querySelector(`[data-panel="${button.dataset.tab}"]`).classList.add("active");
  });
});

document.querySelectorAll("[data-command]").forEach((button) => {
  button.addEventListener("click", async () => {
    const command = button.dataset.command;
    if (inlineCommands.has(command)) {
      await runInlineCommand(command, button);
      return;
    }
    await openResultTab(command);
  });
});

async function runInlineCommand(command, button) {
  resultTitleEl.textContent = commandLabels[command] || "Result";
  showInfo("Working...");
  setBusy(true);

  try {
    const tab = await getCurrentDynamicsTab();
    const response = await sendCommandToTab(tab.id, command);
    if (!response || !response.success) {
      showError(response && response.error ? response.error : "The action could not be completed.");
      return;
    }

    const data = response.data || {};
    if (command === "GET_DEBUG_SNAPSHOT") {
      renderJson(data);
      setCopyText(JSON.stringify(data, null, 2));
      return;
    }

    showSuccess(data.message || "Done.");
    setCopyText(data.copyText || "");
  } catch (error) {
    console.error("Level Down inline command error", error);
    showError(error.message || "The action could not be completed.");
  } finally {
    setBusy(false);
    if (button) {
      button.blur();
    }
  }
}

async function openResultTab(command) {
  resultTitleEl.textContent = commandLabels[command] || "Result";
  showInfo("Opening result tab...");

  try {
    const tab = await getCurrentDynamicsTab();
    const params = new URLSearchParams({
      command,
      label: commandLabels[command] || command,
      tabId: String(tab.id),
      sourceUrl: tab.url || ""
    });

    const createOptions = {
      url: chrome.runtime.getURL(`result.html?${params.toString()}`),
      active: true
    };
    if (typeof tab.index === "number") {
      createOptions.index = tab.index + 1;
    }

    await chrome.tabs.create(createOptions);
    window.close();
  } catch (error) {
    console.error("Level Down popup error", error);
    showError(error.message || "Could not open the result tab.");
  }
}

async function getCurrentDynamicsTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    throw new Error("No active tab was found.");
  }

  if (!isSupportedUrl(tab.url || "")) {
    throw new Error("Open a Dynamics 365 or Power Apps model-driven app page and try again.");
  }

  return tab;
}

async function sendCommandToTab(tabId, command, payload = {}) {
  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const message = {
    source: SOURCE,
    command,
    payload,
    requestId
  };

  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (_error) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });
    return chrome.tabs.sendMessage(tabId, message);
  }
}

function isSupportedUrl(url) {
  try {
    const { hostname, protocol } = new URL(url);
    return protocol === "https:" && (
      hostname.endsWith(".dynamics.com") ||
      hostname.endsWith(".powerapps.com") ||
      hostname === "make.powerapps.com"
    );
  } catch (_error) {
    return false;
  }
}

function showInfo(message) {
  resultEl.className = "result empty";
  resultEl.textContent = message;
  setCopyText("");
}

function showSuccess(message) {
  resultEl.className = "result";
  resultEl.innerHTML = "";
  const div = document.createElement("div");
  div.className = "message success";
  div.textContent = message;
  resultEl.append(div);
}

function showError(message) {
  resultEl.className = "result";
  resultEl.innerHTML = "";
  const div = document.createElement("div");
  div.className = "message error";
  div.textContent = message;
  resultEl.append(div);
  setCopyText("");
}

function setBusy(isBusy) {
  document.querySelectorAll("[data-command]").forEach((button) => {
    button.disabled = isBusy;
  });
}

function renderJson(data) {
  resultEl.className = "result";
  resultEl.innerHTML = "";
  const pre = document.createElement("pre");
  pre.textContent = JSON.stringify(data, null, 2);
  resultEl.append(pre);
}

function setCopyText(text) {
  lastCopyText = text || "";
  copyButton.classList.toggle("hidden", !lastCopyText);
}
