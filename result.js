const SOURCE = "level-down-extension";
const PAGE_SOURCE = "level-down-page";
const params = new URLSearchParams(window.location.search);
const command = params.get("command") || "";
const label = params.get("label") || command;
const sourceTabId = Number(params.get("tabId") || 0);
const sourceUrl = params.get("sourceUrl") || "";

const titleEl = document.getElementById("title");
const sourceUrlEl = document.getElementById("source-url");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const copyButton = document.getElementById("copy-result");
const runAgainButton = document.getElementById("run-again");
const openSourceButton = document.getElementById("open-source");
const searchInput = document.getElementById("search");
const toolsEl = document.getElementById("tools");
const openUrlButton = document.getElementById("open-url");

let lastCopyText = "";
let lastOpenUrl = "";

titleEl.textContent = label;
sourceUrlEl.textContent = sourceUrl;

copyButton.addEventListener("click", copyResult);
runAgainButton.addEventListener("click", run);
openSourceButton.addEventListener("click", () => {
  if (sourceTabId) {
    chrome.tabs.update(sourceTabId, { active: true });
  }
});
openUrlButton.addEventListener("click", () => {
  if (lastOpenUrl) {
    chrome.tabs.create({ url: lastOpenUrl, active: true });
  }
});
searchInput.addEventListener("input", filterRows);

run();

async function run() {
  if (!command || !sourceTabId) {
    showError("This result tab is missing the command or source tab ID.");
    return;
  }

  setStatus("Running command...", "");
  resultEl.innerHTML = "";
  setCopyText("");
  setOpenUrl("");
  toolsEl.classList.add("hidden");
  runAgainButton.disabled = true;

  try {
    const response = await sendCommand(command);
    if (!response.success) {
      showError(response.error || "The action could not be completed.");
      return;
    }
    renderCommandResult(command, response.data || {});
  } catch (error) {
    console.error("Level Down result error", error);
    showError(error.message || "The action could not be completed.");
  } finally {
    runAgainButton.disabled = false;
  }
}

async function sendCommand(commandName, payload = {}) {
  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const message = {
    source: SOURCE,
    command: commandName,
    payload,
    requestId
  };

  try {
    return await chrome.tabs.sendMessage(sourceTabId, message);
  } catch (firstError) {
    console.warn("Level Down initial message failed; trying content-script injection", firstError);
    await chrome.scripting.executeScript({
      target: { tabId: sourceTabId },
      files: ["content.js"]
    });
    return chrome.tabs.sendMessage(sourceTabId, message);
  }
}

function renderCommandResult(commandName, data) {
  setStatus("Command completed.", "success");
  resultEl.innerHTML = "";

  switch (commandName) {
    case "GET_RECORD_ID":
      renderMessage(data.recordId || "No record ID was found.");
      setCopyText(data.recordId || "");
      break;
    case "GET_ENTITY_NAME":
      renderMessage(data.entityName || "No entity name was found.");
      setCopyText(data.entityName || "");
      break;
    case "GET_RECORD_URL":
      renderMessage(data.url || "No record URL could be built.");
      setCopyText(data.url || "");
      setOpenUrl(data.url || "");
      break;
    case "GET_WEB_API_URL":
      if (data.url) {
        renderMessage(data.url);
        setCopyText(data.url);
        setOpenUrl(data.url);
      } else {
        showError(data.message || "Entity set name could not be detected.");
      }
      break;
    case "GET_FORM_INFO":
      renderKeyValues(data);
      setCopyText(JSON.stringify(data, null, 2));
      break;
    case "GET_ALL_FIELDS":
      renderFieldsTable(data.fields || []);
      setCopyText(JSON.stringify(data.fields || [], null, 2));
      break;
    case "GET_CHANGED_FIELDS":
      if (!data.fields || data.fields.length === 0) {
        renderMessage("No changed fields found.");
      } else {
        renderFieldsTable(data.fields);
        setCopyText(JSON.stringify(data.fields, null, 2));
      }
      break;
    case "GET_CHOICE_VALUES":
      renderChoices(data.fields || []);
      setCopyText(JSON.stringify(data.fields || [], null, 2));
      break;
    case "GET_OPTIONSET_VALUES":
      renderOptionSets(data.optionSets || []);
      setCopyText(JSON.stringify(data.optionSets || [], null, 2));
      break;
    case "GET_TABS_SECTIONS":
      renderTabsSections(data.tabs || []);
      setCopyText(JSON.stringify(data.tabs || [], null, 2));
      break;
    case "GET_ENVIRONMENT_DETAILS":
    case "GET_ENTITY_METADATA":
      renderKeyValues(data);
      setCopyText(JSON.stringify(data, null, 2));
      break;
    case "GET_MY_ROLES":
      renderRoles(data);
      setCopyText(JSON.stringify(data, null, 2));
      break;
    case "GET_DEBUG_SNAPSHOT":
      renderJson(data);
      setCopyText(JSON.stringify(data, null, 2));
      break;
    default:
      renderMessage(data.message || "Done.");
      if (data.copyText) {
        setCopyText(data.copyText);
      }
      if (data.url) {
        setOpenUrl(data.url);
      }
      if (data.url && data.autoOpen) {
        chrome.tabs.create({ url: data.url, active: true });
        setStatus(`${data.message || "Opened target page."} Target tab opened.`, "success");
      }
      break;
  }
}

function renderMessage(message) {
  const card = document.createElement("div");
  card.className = "card message";
  card.textContent = message;
  resultEl.append(card);
}

function renderKeyValues(data) {
  const card = document.createElement("div");
  card.className = "card kv";
  Object.entries(data).forEach(([key, value]) => {
    const keyEl = document.createElement("div");
    keyEl.className = "key";
    keyEl.textContent = labelize(key);
    const valueEl = document.createElement("div");
    valueEl.className = "value";
    valueEl.textContent = formatValue(value);
    card.append(keyEl, valueEl);
  });
  resultEl.append(card);
}

function renderFieldsTable(fields) {
  if (fields.length === 0) {
    renderMessage("No fields found.");
    return;
  }

  toolsEl.classList.remove("hidden");
  const wrap = document.createElement("div");
  wrap.className = "table-wrap";
  const table = document.createElement("table");
  table.append(createRow(["Logical name", "Value", "Required", "Dirty", "Submit"], "th"));
  fields.forEach((field) => {
    const row = document.createElement("tr");
    appendCell(row, field.logicalName);
    appendValueCell(row, formatValue(field.value));
    appendCell(row, field.requiredLevel);
    appendCell(row, String(Boolean(field.isDirty)));
    appendCell(row, field.submitMode);
    table.append(row);
  });
  wrap.append(table);
  resultEl.append(wrap);
}

function renderChoices(fields) {
  if (fields.length === 0) {
    renderMessage("No choice fields were found on this form.");
    return;
  }

  toolsEl.classList.remove("hidden");
  const card = document.createElement("div");
  card.className = "card";
  fields.forEach((field) => {
    const details = document.createElement("details");
    details.open = fields.length <= 2;
    const summary = document.createElement("summary");
    summary.textContent = `${field.logicalName} - ${formatValue(field.selectedLabel || field.selectedValue)}`;
    const pre = document.createElement("pre");
    pre.textContent = JSON.stringify(field, null, 2);
    details.append(summary, pre);
    card.append(details);
  });
  resultEl.append(card);
}

function renderOptionSets(optionSets) {
  if (optionSets.length === 0) {
    renderMessage("No option set controls were found on this form.");
    return;
  }

  toolsEl.classList.remove("hidden");
  const card = document.createElement("div");
  card.className = "card";
  optionSets.forEach((optionSet) => {
    const details = document.createElement("details");
    details.open = optionSets.length <= 2;
    const summary = document.createElement("summary");
    const current = optionSet.currentText || optionSet.currentValue || "no current value";
    summary.textContent = `${optionSet.logicalName} - ${current} (${(optionSet.options || []).length} options)`;

    const table = document.createElement("table");
    table.append(createRow(["OptionSet Name", "OptionSet Value"], "th"));
    (optionSet.options || []).forEach((option) => {
      table.append(createRow([option.label || "", option.value == null ? "-" : option.value]));
    });

    details.append(summary, table);
    card.append(details);
  });
  resultEl.append(card);
}

function renderRoles(data) {
  const roles = data.roles || [];
  if (roles.length === 0) {
    renderKeyValues(data);
    return;
  }

  const userCard = document.createElement("div");
  userCard.className = "card kv";
  [["User ID", data.userId], ["User Name", data.userName]].forEach(([key, value]) => {
    const keyEl = document.createElement("div");
    keyEl.className = "key";
    keyEl.textContent = key;
    const valueEl = document.createElement("div");
    valueEl.className = "value";
    valueEl.textContent = value || "";
    userCard.append(keyEl, valueEl);
  });
  resultEl.append(userCard);

  const wrap = document.createElement("div");
  wrap.className = "table-wrap";
  const table = document.createElement("table");
  table.append(createRow(["Role name", "Role ID"], "th"));
  roles.forEach((role) => table.append(createRow([role.name, role.id])));
  wrap.append(table);
  resultEl.append(wrap);
  toolsEl.classList.remove("hidden");
}

function renderTabsSections(tabs) {
  if (tabs.length === 0) {
    renderMessage("No tabs were found.");
    return;
  }

  toolsEl.classList.remove("hidden");
  const card = document.createElement("div");
  card.className = "card";
  tabs.forEach((tab) => {
    const details = document.createElement("details");
    details.open = true;
    const summary = document.createElement("summary");
    summary.textContent = `${tab.label || tab.name} (${tab.visible ? "visible" : "hidden"}, ${tab.displayState})`;
    const table = document.createElement("table");
    table.append(createRow(["Section", "Label", "Visible"], "th"));
    (tab.sections || []).forEach((section) => {
      table.append(createRow([section.name, section.label, String(Boolean(section.visible))]));
    });
    details.append(summary, table);
    card.append(details);
  });
  resultEl.append(card);
}

function renderJson(data) {
  const card = document.createElement("div");
  card.className = "card";
  const pre = document.createElement("pre");
  pre.textContent = JSON.stringify(data, null, 2);
  card.append(pre);
  resultEl.append(card);
}

function createRow(values, cellName = "td") {
  const row = document.createElement("tr");
  values.forEach((value) => {
    const cell = document.createElement(cellName);
    cell.textContent = value == null ? "" : String(value);
    row.append(cell);
  });
  return row;
}

function appendCell(row, value) {
  const cell = document.createElement("td");
  cell.textContent = value == null ? "" : String(value);
  row.append(cell);
}

function appendValueCell(row, value) {
  const cell = document.createElement("td");
  const text = value == null ? "" : String(value);
  if (text.length <= 260) {
    cell.textContent = text;
  } else {
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = `${text.slice(0, 259)}...`;
    const pre = document.createElement("pre");
    pre.textContent = text;
    details.append(summary, pre);
    cell.append(details);
  }
  row.append(cell);
}

function filterRows() {
  const query = searchInput.value.trim().toLowerCase();
  document.querySelectorAll("tbody tr, table tr").forEach((row) => {
    if (row.querySelector("th")) {
      return;
    }
    row.classList.toggle("filtered", query && !row.textContent.toLowerCase().includes(query));
  });
}

function setStatus(message, type) {
  statusEl.className = `status ${type || ""}`.trim();
  statusEl.textContent = message;
}

function showError(message) {
  setStatus(message, "error");
  resultEl.innerHTML = "";
  setCopyText("");
}

async function copyResult() {
  if (!lastCopyText) {
    return;
  }
  await navigator.clipboard.writeText(lastCopyText);
  copyButton.textContent = "Copied";
  setTimeout(() => {
    copyButton.textContent = "Copy";
  }, 1000);
}

function setCopyText(text) {
  lastCopyText = text || "";
  copyButton.disabled = !lastCopyText;
}

function setOpenUrl(url) {
  lastOpenUrl = url || "";
  openUrlButton.classList.toggle("hidden", !lastOpenUrl);
  if (lastOpenUrl) {
    toolsEl.classList.remove("hidden");
  }
}

function labelize(value) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (char) => char.toUpperCase());
}

function formatValue(value) {
  if (value == null || value === "") {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}
