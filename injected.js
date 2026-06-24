(function () {
  "use strict";

  const EXTENSION_SOURCE = "level-down-extension";
  const EXTENSION_SOURCE_V2 = "level-down-extension-v2";
  const PAGE_SOURCE = "level-down-page";
  const INJECTION_VERSION = "2026-06-24-drb-ace-base-path";
  const OVERLAY_CLASS = "level-down-logical-name-badge";
  const OVERLAY_STYLE_ID = "level-down-overlay-style";
  const DRB_OVERLAY_ID = "level-down-drb-overlay";
  let logicalNameObserver = null;
  let logicalNameRefreshTimer = null;
  let logicalNamesActive = false;

  const commands = {
    GET_RECORD_ID: getRecordId,
    GET_ENTITY_NAME: getEntityName,
    GET_RECORD_URL: getRecordUrl,
    GET_WEB_API_URL: getWebApiUrl,
    GET_FORM_INFO: getFormInfo,
    GET_ALL_FIELDS: getAllFields,
    GET_CHANGED_FIELDS: getChangedFields,
    GET_CHOICE_VALUES: getChoiceValues,
    GET_OPTIONSET_VALUES: getOptionSetValues,
    SHOW_LOGICAL_NAMES: showLogicalNames,
    HIDE_LOGICAL_NAMES: hideLogicalNames,
    UNLOCK_FIELDS: () => setControlsDisabled(false),
    LOCK_FIELDS: () => setControlsDisabled(true),
    GET_TABS_SECTIONS: getTabsSections,
    TOGGLE_TABS: toggleTabs,
    REFRESH_SUBGRIDS: refreshSubgrids,
    GET_DEBUG_SNAPSHOT: getDebugSnapshot,
    GET_ENVIRONMENT_DETAILS: getEnvironmentDetails,
    OPEN_ENVIRONMENT_SETTINGS: openEnvironmentSettings,
    GET_MY_ROLES: getMyRoles,
    OPEN_USERS_AND_ROLES: openUsersAndRoles,
    OPEN_MY_USER_RECORD: openMyUserRecord,
    OPEN_MY_MAILBOX: openMyMailbox,
    OPEN_COMMAND_DEBUGGER: openCommandDebugger,
    OPEN_FORMS_MONITOR: openFormsMonitor,
    GET_ENTITY_METADATA: getEntityMetadata,
    OPEN_REST_BUILDER: openRestBuilder
  };

  window.addEventListener("message", async (event) => {
    if (event.source !== window || !event.data || ![EXTENSION_SOURCE, EXTENSION_SOURCE_V2].includes(event.data.source)) {
      return;
    }

    const { command, requestId, payload } = event.data;
    const handler = commands[command];
    if (!handler) {
      respond(requestId, false, null, "Unknown Level Down command.");
      return;
    }

    try {
      const data = await handler(payload || {});
      respond(requestId, true, data);
    } catch (error) {
      console.error("Level Down page error", error);
      respond(requestId, false, null, friendlyError(error));
    }
  });

  document.documentElement.dataset.levelDownInjected = "true";
  document.documentElement.dataset.levelDownInjectedVersion = INJECTION_VERSION;
  window.postMessage({ source: PAGE_SOURCE, command: "READY", success: true, injectionVersion: INJECTION_VERSION }, window.location.origin);

  function respond(requestId, success, data, error) {
    window.postMessage({
      source: PAGE_SOURCE,
      requestId,
      success,
      data: data || {},
      error
    }, window.location.origin);
  }

  function friendlyError(error) {
    if (error && error.levelDownMessage) {
      return error.levelDownMessage;
    }
    if (error && error.message) {
      return error.message;
    }
    return "The action could not be completed.";
  }

  function getXrm() {
    const targetWindow = getTargetWindow();
    if (!targetWindow || !targetWindow.Xrm) {
      throw friendly("Dynamics form context was not found. Open a model-driven app record form and try again.");
    }
    return targetWindow.Xrm;
  }

  function getTargetWindow() {
    return findWindowWithXrm(window, 0);
  }

  function getTargetDocument() {
    const targetWindow = getTargetWindow();
    return targetWindow && targetWindow.document ? targetWindow.document : document;
  }

  function findWindowWithXrm(candidateWindow, depth) {
    if (!candidateWindow || depth > 3) {
      return null;
    }

    try {
      if (candidateWindow.Xrm) {
        return candidateWindow;
      }

      const frames = Array.from(candidateWindow.document.querySelectorAll("iframe"))
        .filter((frame) => isFrameWorthChecking(frame));
      for (const frame of frames) {
        const found = findWindowWithXrm(frame.contentWindow, depth + 1);
        if (found) {
          return found;
        }
      }
    } catch (error) {
      console.warn("Level Down could not inspect a frame for Xrm", error);
    }

    return null;
  }

  function isFrameWorthChecking(frame) {
    try {
      const style = window.getComputedStyle(frame);
      const rect = frame.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    } catch (_error) {
      return true;
    }
  }

  function getGlobalContext() {
    const xrm = getXrm();
    if (xrm.Utility && typeof xrm.Utility.getGlobalContext === "function") {
      return xrm.Utility.getGlobalContext();
    }
    if (xrm.Page && xrm.Page.context) {
      return xrm.Page.context;
    }
    return null;
  }

  function getFormContext() {
    const xrm = getXrm();
    if (xrm.Page && xrm.Page.data && xrm.Page.ui) {
      return xrm.Page;
    }
    throw friendly("Dynamics form context was not found. Open a model-driven app record form and try again.");
  }

  function requireRecordForm() {
    const formContext = getFormContext();
    if (!formContext.data || !formContext.data.entity) {
      throw friendly("This action requires an open record form.");
    }
    return formContext;
  }

  function friendly(message) {
    const error = new Error(message);
    error.levelDownMessage = message;
    return error;
  }

  function getRecordId() {
    const formContext = requireRecordForm();
    const recordId = cleanGuid(safeCall(formContext.data.entity, "getId"));
    if (!recordId) {
      throw friendly("This action requires an open record form.");
    }
    return { recordId };
  }

  function getEntityName() {
    const formContext = requireRecordForm();
    const entityName = safeCall(formContext.data.entity, "getEntityName");
    if (!entityName) {
      throw friendly("This action requires an open record form.");
    }
    return { entityName };
  }

  async function getRecordUrl() {
    const formContext = requireRecordForm();
    const context = getGlobalContext();
    const clientUrl = normalizeUrl(safeCall(context, "getClientUrl"));
    const entityName = safeCall(formContext.data.entity, "getEntityName");
    const recordId = cleanGuid(safeCall(formContext.data.entity, "getId"));
    const appId = await getAppId(context);

    if (!clientUrl || !entityName || !recordId) {
      throw friendly("This action requires an open record form.");
    }

    const params = new URLSearchParams({
      pagetype: "entityrecord",
      etn: entityName,
      id: `{${recordId}}`
    });
    if (appId) {
      params.set("appid", appId);
    }

    return { url: `${clientUrl}/main.aspx?${params.toString()}`, appId, entityName, recordId };
  }

  async function getWebApiUrl() {
    const formContext = requireRecordForm();
    const context = getGlobalContext();
    const clientUrl = normalizeUrl(safeCall(context, "getClientUrl"));
    const entityName = safeCall(formContext.data.entity, "getEntityName");
    const recordId = cleanGuid(safeCall(formContext.data.entity, "getId"));
    const entitySetName = await getEntitySetName(entityName);

    if (!clientUrl || !entityName || !recordId) {
      throw friendly("This action requires an open record form.");
    }

    if (!entitySetName) {
      return {
        url: "",
        message: `Entity set name could not be detected for ${entityName}. Dataverse Web API record URLs need the entity set name, not only the table logical name.`,
        entityName,
        recordId
      };
    }

    return {
      url: `${clientUrl}/api/data/v9.2/${entitySetName}(${recordId})`,
      entityName,
      entitySetName,
      recordId
    };
  }

  async function getFormInfo() {
    const formContext = requireRecordForm();
    const context = getGlobalContext();
    const appId = await getAppId(context);
    const roles = getUserRoles(context);

    return {
      organizationUrl: normalizeUrl(safeCall(context, "getClientUrl")),
      appId,
      appUrl: appId ? `${normalizeUrl(safeCall(context, "getClientUrl"))}/main.aspx?appid=${encodeURIComponent(appId)}` : "",
      entityLogicalName: safeCall(formContext.data.entity, "getEntityName"),
      recordId: cleanGuid(safeCall(formContext.data.entity, "getId")),
      formType: safeCall(formContext.ui, "getFormType"),
      isDirty: Boolean(safeCall(formContext.data.entity, "getIsDirty")),
      userId: cleanGuid(safeCall(context && context.userSettings, "userId")),
      userName: context && context.userSettings ? context.userSettings.userName || "" : "",
      userRoles: roles
    };
  }

  function getAllFields() {
    return { fields: collectAttributes() };
  }

  function getChangedFields() {
    return { fields: collectAttributes().filter((field) => field.isDirty) };
  }

  function getChoiceValues() {
    const formContext = requireRecordForm();
    const fields = [];
    forEachCollection(formContext.data.entity.attributes, (attribute) => {
      const type = safeCall(attribute, "getAttributeType");
      const hasOptions = typeof attribute.getOptions === "function";
      if (!hasOptions && type !== "optionset" && type !== "multiselectoptionset") {
        return;
      }

      const value = safeCall(attribute, "getValue");
      fields.push({
        logicalName: safeCall(attribute, "getName"),
        type,
        selectedValue: serializeValue(value),
        selectedLabel: serializeValue(safeCall(attribute, "getText")),
        options: (safeCall(attribute, "getOptions") || []).map((option) => ({
          value: option.value,
          label: option.text
        }))
      });
    });
    return { fields };
  }

  function getOptionSetValues() {
    const formContext = requireRecordForm();
    const optionSets = [];

    forEachCollection(formContext.ui.controls, (control) => {
      const controlType = String(safeCall(control, "getControlType") || "").toLowerCase();
      if (controlType !== "optionset" && controlType !== "multiselectoptionset") {
        return;
      }

      const attribute = typeof control.getAttribute === "function" ? control.getAttribute() : null;
      const options = typeof control.getOptions === "function"
        ? control.getOptions()
        : attribute && typeof attribute.getOptions === "function"
          ? attribute.getOptions()
          : [];

      optionSets.push({
        logicalName: safeCall(control, "getName"),
        label: safeCall(control, "getLabel"),
        controlType,
        currentValue: serializeValue(attribute ? safeCall(attribute, "getValue") : ""),
        currentText: serializeValue(attribute ? safeCall(attribute, "getText") : ""),
        options: (options || []).map((option) => ({
          label: option.text,
          value: option.value
        }))
      });
    });

    return { optionSets };
  }

  function showLogicalNames() {
    const formContext = requireRecordForm();
    const targetDocument = getTargetDocument();
    hideLogicalNames();
    ensureOverlayStyle(targetDocument);
    logicalNamesActive = true;

    const result = applyLogicalNameBadges(formContext, targetDocument);
    startLogicalNameWatcher(formContext, targetDocument);
    return result;
  }

  function applyLogicalNameBadges(formContext, targetDocument) {
    let count = 0;
    let existingCount = 0;
    const usedPlacements = new WeakSet();
    const matchedControlNames = new Set();
    const attemptedNames = new Set();

    targetDocument.querySelectorAll(`.${OVERLAY_CLASS}`).forEach((badge) => {
      const parent = badge.parentElement;
      if (parent) {
        usedPlacements.add(parent);
      }
      existingCount += 1;
    });

    forEachCollection(formContext.ui.controls, (control) => {
      if (safeCall(control, "getVisible") === false) {
        return;
      }

      const name = getControlLogicalName(control);
      if (!name) {
        return;
      }
      attemptedNames.add(name);

      const placement = findControlPlacement(control, targetDocument);
      if (!placement || !placement.element) {
        return;
      }
      matchedControlNames.add(name);

      if (usedPlacements.has(placement.element) || placementHasBadge(placement.element, name)) {
        return;
      }
      usedPlacements.add(placement.element);

      const badge = createLogicalNameBadge(targetDocument, name);
      placeLogicalNameBadge(placement, badge);
      count += 1;
    });

    forEachCollection(formContext.data.entity.attributes, (attribute) => {
      const name = safeCall(attribute, "getName");
      if (!name || matchedControlNames.has(name)) {
        return;
      }
      const label = safeCall(attribute, "getLabel");
      attemptedNames.add(name);

      const placement = findPlacementForField(name, label, targetDocument);
      if (!placement || !placement.element) {
        return;
      }

      if (usedPlacements.has(placement.element) || placementHasBadge(placement.element, name)) {
        return;
      }
      usedPlacements.add(placement.element);
      matchedControlNames.add(name);

      const badge = createLogicalNameBadge(targetDocument, name);
      placeLogicalNameBadge(placement, badge);
      count += 1;
    });

    const visibleControls = [];
    forEachCollection(formContext.ui.controls, (control) => {
      if (safeCall(control, "getVisible") !== false && safeCall(control, "getName")) {
        visibleControls.push(control);
      }
    });
    const visibleControlNames = new Set(
      visibleControls
        .map((control) => safeCall(control, "getName"))
        .filter(Boolean)
    );
    const attemptedCount = Math.max(attemptedNames.size, visibleControlNames.size);
    const missed = Math.max(attemptedCount - count, 0);
    const totalShown = count + existingCount;

    return {
      message: totalShown > 0
        ? `Logical name overlay active for ${totalShown} fields. Scroll the form and Level Down will add names for newly rendered fields.${missed ? ` ${missed} fields could not be matched to visible page markup yet.` : ""}`
        : "No visible field labels could be matched. Dynamics may have changed the form markup for this page."
    };
  }

  function hideLogicalNames() {
    logicalNamesActive = false;
    stopLogicalNameWatcher();
    getTargetDocument().querySelectorAll(`.${OVERLAY_CLASS}`).forEach((badge) => badge.remove());
    return { message: "Logical name overlay removed." };
  }

  function placementHasBadge(element, logicalName) {
    if (!element) {
      return false;
    }
    const selector = `.${OVERLAY_CLASS}[data-level-down-logical-name="${cssAttributeValue(logicalName)}"]`;
    return Boolean(
      element.matches && element.matches(selector) ||
      element.querySelector && element.querySelector(selector) ||
      element.previousElementSibling && element.previousElementSibling.matches(selector) ||
      element.nextElementSibling && element.nextElementSibling.matches(selector) ||
      element.parentElement && element.parentElement.querySelector(selector)
    );
  }

  function startLogicalNameWatcher(formContext, targetDocument) {
    stopLogicalNameWatcher();

    const refresh = () => {
      if (!logicalNamesActive) {
        return;
      }
      if (logicalNameRefreshTimer) {
        clearTimeout(logicalNameRefreshTimer);
      }
      logicalNameRefreshTimer = setTimeout(() => {
        logicalNameRefreshTimer = null;
        try {
          applyLogicalNameBadges(formContext, targetDocument);
        } catch (error) {
          console.warn("Level Down could not refresh logical name badges", error);
        }
      }, 120);
    };

    const targetWindow = targetDocument.defaultView || window;
    logicalNameObserver = new MutationObserver(refresh);
    logicalNameObserver.observe(targetDocument.body || targetDocument.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class", "aria-hidden", "data-id", "data-lp-id"]
    });

    logicalNameObserver._levelDownCleanup = () => {
      targetWindow.removeEventListener("scroll", refresh, true);
      targetWindow.removeEventListener("resize", refresh, true);
    };

    targetWindow.addEventListener("scroll", refresh, true);
    targetWindow.addEventListener("resize", refresh, true);
  }

  function stopLogicalNameWatcher() {
    if (logicalNameRefreshTimer) {
      clearTimeout(logicalNameRefreshTimer);
      logicalNameRefreshTimer = null;
    }
    if (logicalNameObserver) {
      if (typeof logicalNameObserver._levelDownCleanup === "function") {
        logicalNameObserver._levelDownCleanup();
      }
      logicalNameObserver.disconnect();
      logicalNameObserver = null;
    }
  }

  function setControlsDisabled(disabled) {
    const formContext = requireRecordForm();
    let count = 0;
    forEachCollection(formContext.ui.controls, (control) => {
      if (typeof control.setDisabled === "function") {
        try {
          control.setDisabled(disabled);
          count += 1;
        } catch (error) {
          console.warn("Level Down could not change control lock state", control, error);
        }
      }
    });

    return {
      message: disabled
        ? `Locked ${count} controls. Level Down does not know the original lock state; reload the form to restore server-rendered behavior.`
        : `Unlocked ${count} controls for developer/admin testing only. No save was triggered.`
    };
  }

  function getTabsSections() {
    const formContext = requireRecordForm();
    const tabs = [];
    forEachCollection(formContext.ui.tabs, (tab) => {
      const sections = [];
      forEachCollection(tab.sections, (section) => {
        sections.push({
          name: safeCall(section, "getName"),
          label: safeCall(section, "getLabel"),
          visible: safeCall(section, "getVisible")
        });
      });

      tabs.push({
        name: safeCall(tab, "getName"),
        label: safeCall(tab, "getLabel"),
        visible: safeCall(tab, "getVisible"),
        displayState: safeCall(tab, "getDisplayState"),
        sections
      });
    });

    return { tabs };
  }

  function toggleTabs() {
    const formContext = requireRecordForm();
    const tabs = [];
    forEachCollection(formContext.ui.tabs, (tab) => tabs.push(tab));
    const visibleCount = tabs.filter((tab) => safeCall(tab, "getVisible") !== false).length;
    const shouldShow = visibleCount < tabs.length / 2;
    let changed = 0;

    tabs.forEach((tab) => {
      if (typeof tab.setVisible === "function") {
        tab.setVisible(shouldShow);
        changed += 1;
      }
    });

    return {
      message: `${shouldShow ? "Showed" : "Hid"} ${changed} tabs. This only changes the current browser form view and does not save anything.`
    };
  }

  function refreshSubgrids() {
    const formContext = requireRecordForm();
    let count = 0;
    forEachCollection(formContext.ui.controls, (control) => {
      const type = String(safeCall(control, "getControlType") || "").toLowerCase();
      if (type === "subgrid" && typeof control.refresh === "function") {
        control.refresh();
        count += 1;
      }
    });

    return { message: `Refreshed ${count} subgrids.` };
  }

  async function getDebugSnapshot() {
    const formContext = requireRecordForm();
    const context = getGlobalContext();
    const tabs = [];
    const controls = [];
    const fields = [];
    forEachCollection(formContext.ui.tabs, (tab) => tabs.push(tab));
    forEachCollection(formContext.ui.controls, (control) => controls.push(control));
    forEachCollection(formContext.data.entity.attributes, (attribute) => fields.push(attribute));

    return {
      currentUrl: getTargetWindow() && getTargetWindow().location ? getTargetWindow().location.href : window.location.href,
      clientUrl: normalizeUrl(safeCall(context, "getClientUrl")),
      appId: await getAppId(context),
      entityName: safeCall(formContext.data.entity, "getEntityName"),
      recordId: cleanGuid(safeCall(formContext.data.entity, "getId")),
      formType: safeCall(formContext.ui, "getFormType"),
      dirtyState: Boolean(safeCall(formContext.data.entity, "getIsDirty")),
      fieldCount: fields.length,
      tabCount: tabs.length,
      controlCount: controls.length,
      timestamp: new Date().toISOString()
    };
  }

  async function getEnvironmentDetails() {
    const context = getGlobalContext();
    const settings = context && context.organizationSettings ? context.organizationSettings : {};
    const userSettings = context && context.userSettings ? context.userSettings : {};
    const organizationId = cleanGuid(settings.organizationId || "");
    const tenantId = await getTenantId(context, organizationId);

    return {
      clientUrl: normalizeUrl(safeCall(context, "getClientUrl")),
      version: safeCall(context, "getVersion"),
      organizationId,
      tenantId,
      bapEnvironmentId: settings.bapEnvironmentId || "",
      uniqueName: settings.uniqueName || "",
      organizationGeo: settings.organizationGeo || "",
      languageId: settings.languageId || "",
      baseCurrencyId: cleanGuid(settings.baseCurrencyId || ""),
      isAutoSaveEnabled: typeof settings.isAutoSaveEnabled === "boolean" ? settings.isAutoSaveEnabled : "",
      isOnPremise: typeof context.isOnPremise === "boolean" ? context.isOnPremise : "",
      currentUserId: cleanGuid(userSettings.userId || ""),
      currentUserName: userSettings.userName || "",
      appId: await getAppId(context),
      currentUrl: window.location.href
    };
  }

  async function getTenantId(context, organizationId) {
    const settings = context && context.organizationSettings ? context.organizationSettings : {};
    const directValue = firstGuid(
      settings.tenantId,
      settings.tenantID,
      settings.aadTenantId,
      settings.aadTenantID,
      settings.azureActiveDirectoryTenantId,
      settings.azureactivedirectorytenantid,
      settings.tenantGuid,
      settings.directoryId,
      context && context.tenantId,
      context && context.tenantID,
      context && context.aadTenantId,
      context && context.aadTenantID,
      context && context.tenantGuid,
      context && context.directoryId
    );
    if (directValue) {
      return directValue;
    }

    const contextTenantId = firstGuidFromObjectByKey(context, /tenant|directory/i);
    if (contextTenantId) {
      return contextTenantId;
    }

    const tokenTenantId = getTenantIdFromPageTokens();
    if (tokenTenantId) {
      return tokenTenantId;
    }

    const storageTenantId = getTenantIdFromStorageHints();
    if (storageTenantId) {
      return storageTenantId;
    }

    if (!organizationId) {
      return "";
    }

    try {
      const xrm = getXrm();
      if (xrm.WebApi && typeof xrm.WebApi.retrieveRecord === "function") {
        const tenantColumns = await getOrganizationTenantColumns(xrm);
        for (const column of tenantColumns) {
          try {
            const organization = await xrm.WebApi.retrieveRecord(
              "organization",
              organizationId,
              `?$select=${encodeURIComponent(column)}`
            );
            const tenantId = firstGuid(organization && organization[column]);
            if (tenantId) {
              return tenantId;
            }
          } catch (columnError) {
            console.warn(`Level Down could not read organization.${column}`, columnError);
          }
        }
      }
    } catch (error) {
      console.warn("Level Down could not read tenant ID from organization metadata", error);
    }

    return "";
  }

  async function getOrganizationTenantColumns(xrm) {
    const knownColumns = [
      "azureactivedirectorytenantid",
      "aadtenantid",
      "tenantid",
      "tenantguid",
      "directoryid"
    ];

    try {
      if (xrm.WebApi && typeof xrm.WebApi.retrieveMultipleRecords === "function") {
        const query = "?$select=LogicalName&$filter=contains(LogicalName,'tenant') or contains(LogicalName,'directory')";
        const result = await xrm.WebApi.retrieveMultipleRecords(
          "EntityDefinitions(LogicalName='organization')/Attributes",
          query
        );
        const metadataColumns = result && result.entities
          ? result.entities.map((item) => item.LogicalName || item.logicalname).filter(Boolean)
          : [];
        return Array.from(new Set([...knownColumns, ...metadataColumns]));
      }
    } catch (error) {
      console.warn("Level Down could not inspect organization tenant metadata", error);
    }

    return knownColumns;
  }

  function getTenantIdFromPageTokens() {
    const targetWindow = getTargetWindow() || window;
    const tokens = [];
    collectJwtCandidatesFromStorage(tokens, targetWindow);
    collectJwtCandidatesFromObject(tokens, targetWindow.Mscrm, 0);
    collectJwtCandidatesFromObject(tokens, targetWindow.__REACT_CONTEXT__, 0);
    collectJwtCandidatesFromObject(tokens, targetWindow.__POWERAPPS_CONTEXT__, 0);

    for (const token of tokens) {
      const payload = decodeJwtPayload(token);
      const tenantId = payload ? firstGuid(payload.tid, payload.tenant_id, payload.tenantId) : "";
      if (tenantId) {
        return tenantId;
      }
    }

    return "";
  }

  function getTenantIdFromStorageHints() {
    const targetWindow = getTargetWindow() || window;
    const texts = [];
    ["localStorage", "sessionStorage"].forEach((storageName) => {
      try {
        const storage = targetWindow && targetWindow[storageName];
        if (!storage) {
          return;
        }
        for (let index = 0; index < storage.length; index += 1) {
          const key = storage.key(index);
          const value = key ? storage.getItem(key) : "";
          texts.push(`${key || ""} ${value || ""}`);
        }
      } catch (error) {
        console.warn(`Level Down could not inspect ${storageName} hints for tenant ID`, error);
      }
    });

    for (const text of texts) {
      const tenantId = findTenantGuidInText(text);
      if (tenantId) {
        return tenantId;
      }
    }

    return "";
  }

  function collectJwtCandidatesFromStorage(tokens, targetWindow) {
    ["localStorage", "sessionStorage"].forEach((storageName) => {
      try {
        const storage = targetWindow && targetWindow[storageName];
        if (!storage) {
          return;
        }
        for (let index = 0; index < storage.length; index += 1) {
          const key = storage.key(index);
          const value = key ? storage.getItem(key) : "";
          collectJwtCandidatesFromText(tokens, `${key || ""} ${value || ""}`);
        }
      } catch (error) {
        console.warn(`Level Down could not inspect ${storageName} for tenant ID`, error);
      }
    });
  }

  function collectJwtCandidatesFromObject(tokens, value, depth) {
    if (!value || depth > 3) {
      return;
    }
    if (typeof value === "string") {
      collectJwtCandidatesFromText(tokens, value);
      return;
    }
    if (typeof value !== "object") {
      return;
    }

    Object.keys(value).slice(0, 80).forEach((key) => {
      try {
        collectJwtCandidatesFromObject(tokens, value[key], depth + 1);
      } catch (_error) {
        // Some Dynamics objects expose throwing getters.
      }
    });
  }

  function collectJwtCandidatesFromText(tokens, text) {
    if (!text || typeof text !== "string") {
      return;
    }
    const matches = text.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g) || [];
    matches.forEach((token) => {
      if (!tokens.includes(token)) {
        tokens.push(token);
      }
    });
  }

  function decodeJwtPayload(token) {
    try {
      const parts = token.split(".");
      if (parts.length < 2) {
        return null;
      }
      const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const padded = base64.padEnd(base64.length + ((4 - base64.length % 4) % 4), "=");
      const json = decodeURIComponent(Array.prototype.map.call(atob(padded), (character) => {
        return `%${(`00${character.charCodeAt(0).toString(16)}`).slice(-2)}`;
      }).join(""));
      return JSON.parse(json);
    } catch (_error) {
      return null;
    }
  }

  function firstGuidFromObjectByKey(value, keyPattern) {
    const seen = typeof WeakSet === "function" ? new WeakSet() : null;
    return firstGuidFromObjectByKeyInternal(value, keyPattern, 0, seen);
  }

  function firstGuidFromObjectByKeyInternal(value, keyPattern, depth, seen) {
    if (!value || depth > 4 || typeof value !== "object") {
      return "";
    }
    if (seen) {
      if (seen.has(value)) {
        return "";
      }
      seen.add(value);
    }

    const keys = Object.keys(value).slice(0, 120);
    for (const key of keys) {
      try {
        const item = value[key];
        if (keyPattern.test(key)) {
          const directGuid = firstGuid(typeof item === "string" ? item : "");
          if (directGuid) {
            return directGuid;
          }
          const textGuid = typeof item === "string" ? findTenantGuidInText(`${key} ${item}`) : "";
          if (textGuid) {
            return textGuid;
          }
        }
        const nestedGuid = firstGuidFromObjectByKeyInternal(item, keyPattern, depth + 1, seen);
        if (nestedGuid) {
          return nestedGuid;
        }
      } catch (_error) {
        // Some Dynamics objects expose throwing getters.
      }
    }

    return "";
  }

  function findTenantGuidInText(text) {
    if (!text || typeof text !== "string") {
      return "";
    }

    const tenantContextPattern = /(tenant|directory|authority|login\.microsoftonline\.com|sts\.windows\.net)[\s\S]{0,160}?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
    const forwardMatch = text.match(tenantContextPattern);
    if (forwardMatch) {
      return cleanGuid(forwardMatch[2]);
    }

    const reverseContextPattern = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})[\s\S]{0,160}?(tenant|directory|authority|login\.microsoftonline\.com|sts\.windows\.net)/i;
    const reverseMatch = text.match(reverseContextPattern);
    return reverseMatch ? cleanGuid(reverseMatch[1]) : "";
  }

  function openEnvironmentSettings() {
    const context = getGlobalContext();
    const envId = getEnvironmentId(context);
    const url = envId
      ? `https://admin.powerplatform.microsoft.com/environments/environment/${encodeURIComponent(envId)}/settings`
      : "https://admin.powerplatform.microsoft.com";
    return navigationResult(url, "Environment Settings opened.");
  }

  function getMyRoles() {
    const context = getGlobalContext();
    return {
      userId: cleanGuid(context && context.userSettings ? context.userSettings.userId || "" : ""),
      userName: context && context.userSettings ? context.userSettings.userName || "" : "",
      roles: getUserRoles(context)
    };
  }

  function openUsersAndRoles() {
    const context = getGlobalContext();
    const settings = context && context.organizationSettings ? context.organizationSettings : {};
    const orgId = cleanGuid(settings.organizationId || "");
    const envId = settings.bapEnvironmentId || "";
    const url = orgId && envId
      ? `https://admin.powerplatform.microsoft.com/manage/environments/${encodeURIComponent(orgId)}/${encodeURIComponent(envId)}/users`
      : "https://admin.powerplatform.microsoft.com";
    return navigationResult(url, "Users and Roles opened.");
  }

  function openMyUserRecord() {
    const context = getGlobalContext();
    const clientUrl = normalizeUrl(safeCall(context, "getClientUrl"));
    const userId = cleanGuid(context && context.userSettings ? context.userSettings.userId || "" : "");
    if (!clientUrl || !userId) {
      throw friendly("Current user record could not be detected.");
    }
    return navigationResult(createMainUrl(clientUrl, "systemuser", userId), "My User Record opened.");
  }

  async function openMyMailbox() {
    const context = getGlobalContext();
    const clientUrl = normalizeUrl(safeCall(context, "getClientUrl"));
    const userId = cleanGuid(context && context.userSettings ? context.userSettings.userId || "" : "");
    let mailboxId = "";

    try {
      const xrm = getXrm();
      if (xrm.WebApi && typeof xrm.WebApi.retrieveMultipleRecords === "function" && userId) {
        const query = `?$select=mailboxid,name&$filter=_ownerid_value eq ${userId}&$top=1`;
        const result = await xrm.WebApi.retrieveMultipleRecords("mailbox", query);
        if (result && result.entities && result.entities.length > 0) {
          mailboxId = cleanGuid(result.entities[0].mailboxid || "");
        }
      }
    } catch (error) {
      console.warn("Level Down could not detect current user's mailbox", error);
    }

    if (clientUrl && mailboxId) {
      return navigationResult(createMainUrl(clientUrl, "mailbox", mailboxId), "My Mailbox opened.");
    }

    if (clientUrl) {
      return navigationResult(`${clientUrl}/main.aspx?pagetype=entitylist&etn=mailbox`, "Mailbox list opened. Current user's mailbox could not be detected directly.");
    }

    throw friendly("Mailbox URL could not be built.");
  }

  function openCommandDebugger() {
    return navigationResult(createCurrentUrlWithParam("ribbondebug", "true"), "Command Debugger opened with ribbondebug=true.");
  }

  function openFormsMonitor() {
    return navigationResult(createCurrentUrlWithParam("monitor", "true"), "Forms Monitor opened with monitor=true.");
  }

  async function getEntityMetadata() {
    const formContext = requireRecordForm();
    const entityName = safeCall(formContext.data.entity, "getEntityName");
    const metadata = await getEntityMetadataObject(entityName);
    if (!metadata) {
      throw friendly(`Entity metadata could not be detected for ${entityName}.`);
    }

    return {
      logicalName: metadata.LogicalName || metadata.logicalName || entityName,
      entitySetName: metadata.EntitySetName || metadata.entitySetName || "",
      displayName: pickLocalizedLabel(metadata.DisplayName || metadata.displayName),
      displayCollectionName: pickLocalizedLabel(metadata.DisplayCollectionName || metadata.displayCollectionName),
      primaryIdAttribute: metadata.PrimaryIdAttribute || metadata.primaryIdAttribute || "",
      primaryNameAttribute: metadata.PrimaryNameAttribute || metadata.primaryNameAttribute || "",
      objectTypeCode: metadata.ObjectTypeCode || metadata.objectTypeCode || "",
      ownershipType: metadata.OwnershipType || metadata.ownershipType || "",
      metadataId: cleanGuid(metadata.MetadataId || metadata.metadataId || ""),
      isActivity: readMetadataBoolean(metadata, "IsActivity"),
      isCustomEntity: readMetadataBoolean(metadata, "IsCustomEntity"),
      isIntersect: readMetadataBoolean(metadata, "IsIntersect"),
      isManaged: readMetadataBoolean(metadata, "IsManaged"),
      canCreate: readMetadataPrivilege(metadata, "CanCreateAttributes"),
      canRead: readMetadataPrivilege(metadata, "CanReadAttributes"),
      canUpdate: readMetadataPrivilege(metadata, "CanUpdateAttributes"),
      raw: serializeValue(metadata)
    };
  }

  function openRestBuilder(payload) {
    const targetDocument = getTargetDocument();
    const targetWindow = getTargetWindow() || window;
    const extensionBaseUrl = payload && payload.extensionBaseUrl ? payload.extensionBaseUrl : "";
    if (!extensionBaseUrl) {
      throw friendly("Level Down could not resolve its bundled REST Builder files.");
    }

    const existing = targetDocument.getElementById(DRB_OVERLAY_ID);
    if (existing) {
      existing.remove();
    }

    const overlay = targetDocument.createElement("section");
    overlay.id = DRB_OVERLAY_ID;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "Level Down REST Builder");
    overlay.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:2147483646",
      "background:#f6f8fb",
      "display:flex",
      "flex-direction:column",
      "font-family:Segoe UI,system-ui,-apple-system,BlinkMacSystemFont,sans-serif"
    ].join(";");

    const header = targetDocument.createElement("header");
    header.style.cssText = [
      "height:54px",
      "display:flex",
      "align-items:center",
      "justify-content:space-between",
      "gap:16px",
      "padding:0 16px",
      "background:#0f1f3d",
      "color:white",
      "box-shadow:0 2px 14px rgba(15,31,61,.22)",
      "flex:0 0 auto"
    ].join(";");

    const title = targetDocument.createElement("div");
    title.style.cssText = "display:flex;align-items:baseline;gap:10px;min-width:0;";
    const titleMain = targetDocument.createElement("strong");
    titleMain.textContent = "Level Down REST Builder";
    titleMain.style.cssText = "font-size:16px;white-space:nowrap;";
    const titleSub = targetDocument.createElement("span");
    titleSub.textContent = normalizeUrl(safeCall(getGlobalContext(), "getClientUrl")) || targetWindow.location.host;
    titleSub.style.cssText = "font-size:12px;color:#bfd0ff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    title.append(titleMain, titleSub);

    const actions = targetDocument.createElement("div");
    actions.style.cssText = "display:flex;align-items:center;gap:8px;flex:0 0 auto;";
    const reloadButton = createDrbHeaderButton(targetDocument, "Reload Builder");
    const closeButton = createDrbHeaderButton(targetDocument, "Close");
    reloadButton.addEventListener("click", () => {
      iframe.srcdoc = createDrbSrcdoc(extensionBaseUrl);
    });
    closeButton.addEventListener("click", () => overlay.remove());
    actions.append(reloadButton, closeButton);
    header.append(title, actions);

    const iframe = targetDocument.createElement("iframe");
    iframe.title = "Level Down REST Builder";
    iframe.style.cssText = [
      "width:100%",
      "height:calc(100vh - 54px)",
      "border:0",
      "background:#f6f8fb",
      "flex:1 1 auto"
    ].join(";");
    iframe.srcdoc = createDrbSrcdoc(extensionBaseUrl);

    overlay.append(header, iframe);
    targetDocument.body.appendChild(overlay);

    return {
      message: "Level Down REST Builder opened on the Dynamics tab. Use the Source Tab button to return to it.",
      copyText: normalizeUrl(safeCall(getGlobalContext(), "getClientUrl"))
    };
  }

  function collectAttributes() {
    const formContext = requireRecordForm();
    const fields = [];
    forEachCollection(formContext.data.entity.attributes, (attribute) => {
      fields.push({
        logicalName: safeCall(attribute, "getName"),
        value: serializeValue(safeCall(attribute, "getValue")),
        requiredLevel: safeCall(attribute, "getRequiredLevel"),
        isDirty: Boolean(safeCall(attribute, "getIsDirty")),
        submitMode: safeCall(attribute, "getSubmitMode")
      });
    });
    return fields;
  }

  function forEachCollection(collection, callback) {
    if (!collection) {
      return;
    }
    if (typeof collection.forEach === "function") {
      collection.forEach(callback);
      return;
    }
    const items = typeof collection.get === "function" ? collection.get() : collection;
    if (Array.isArray(items)) {
      items.forEach(callback);
    }
  }

  function safeCall(target, methodName) {
    if (!target || typeof target[methodName] !== "function") {
      return "";
    }
    try {
      return target[methodName]();
    } catch (error) {
      console.warn(`Level Down ${methodName} failed`, error);
      return "";
    }
  }

  function serializeValue(value) {
    if (value == null) {
      return value;
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (Array.isArray(value)) {
      return value.map(serializeValue);
    }
    if (typeof value === "object") {
      const output = {};
      Object.keys(value).forEach((key) => {
        const item = value[key];
        if (typeof item !== "function") {
          output[key] = serializeValue(item);
        }
      });
      return output;
    }
    return value;
  }

  function cleanGuid(value) {
    if (!value || typeof value !== "string") {
      return "";
    }
    return value.replace(/[{}]/g, "").toLowerCase();
  }

  function firstGuid(...values) {
    for (const value of values) {
      const cleanValue = cleanGuid(value || "");
      if (cleanValue) {
        return cleanValue;
      }
    }
    return "";
  }

  function normalizeUrl(value) {
    if (!value || typeof value !== "string") {
      return "";
    }
    return value.replace(/\/$/, "");
  }

  async function getAppId(context) {
    const targetWindow = getTargetWindow() || window;
    const searches = [];
    try {
      searches.push(window.location.search || "");
      if (targetWindow.location && targetWindow.location !== window.location) {
        searches.push(targetWindow.location.search || "");
      }
    } catch (_error) {
      searches.push(window.location.search || "");
    }
    const urlSearch = searches
      .map((item) => item.replace(/^\?/, ""))
      .filter(Boolean)
      .join("&");
    const urlParams = new URLSearchParams(urlSearch);
    const urlAppId = urlParams.get("appid") || urlParams.get("appId");
    if (urlAppId) {
      return urlAppId;
    }

    if (context && typeof context.getCurrentAppProperties === "function") {
      try {
        const properties = await context.getCurrentAppProperties();
        return properties && properties.appId ? properties.appId : "";
      } catch (error) {
        console.warn("Level Down could not read current app properties", error);
      }
    }

    return "";
  }

  async function getEntitySetName(entityName) {
    const metadata = await getEntityMetadataObject(entityName);
    return metadata && (metadata.EntitySetName || metadata.entitySetName) || "";
  }

  async function getEntityMetadataObject(entityName) {
    const xrm = getXrm();
    if (!entityName || !xrm.Utility || typeof xrm.Utility.getEntityMetadata !== "function") {
      return null;
    }

    try {
      return await xrm.Utility.getEntityMetadata(entityName);
    } catch (error) {
      console.warn("Level Down could not read entity metadata", error);
      return null;
    }
  }

  function getEnvironmentId(context) {
    return context && context.organizationSettings
      ? context.organizationSettings.bapEnvironmentId || ""
      : "";
  }

  function navigationResult(url, message) {
    return {
      message,
      url,
      autoOpen: true,
      copyText: url
    };
  }

  function createMainUrl(clientUrl, entityName, recordId) {
    const params = new URLSearchParams({
      pagetype: "entityrecord",
      etn: entityName,
      id: `{${recordId}}`
    });
    return `${normalizeUrl(clientUrl)}/main.aspx?${params.toString()}`;
  }

  function createCurrentUrlWithParam(name, value) {
    const targetWindow = getTargetWindow() || window;
    const currentUrl = targetWindow.location ? targetWindow.location.href : window.location.href;
    const url = new URL(currentUrl);
    url.searchParams.set(name, value);
    return url.toString();
  }

  function pickLocalizedLabel(labelBag) {
    if (!labelBag) {
      return "";
    }
    const label = labelBag.UserLocalizedLabel || labelBag.LocalizedLabels && labelBag.LocalizedLabels[0];
    return label && label.Label ? label.Label : "";
  }

  function readMetadataBoolean(metadata, propertyName) {
    const value = metadata[propertyName] || metadata[propertyName.charAt(0).toLowerCase() + propertyName.slice(1)];
    if (value && typeof value.Value === "boolean") {
      return value.Value;
    }
    if (typeof value === "boolean") {
      return value;
    }
    return "";
  }

  function readMetadataPrivilege(metadata, propertyName) {
    const value = metadata[propertyName] || metadata[propertyName.charAt(0).toLowerCase() + propertyName.slice(1)];
    if (value && typeof value.Value === "boolean") {
      return value.Value;
    }
    return "";
  }

  function createDrbHeaderButton(targetDocument, text) {
    const button = targetDocument.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.style.cssText = [
      "min-height:34px",
      "padding:6px 12px",
      "border:1px solid rgba(255,255,255,.28)",
      "border-radius:6px",
      "color:white",
      "background:rgba(255,255,255,.1)",
      "font:600 13px/1 Segoe UI,system-ui,sans-serif",
      "cursor:pointer"
    ].join(";");
    button.addEventListener("mouseenter", () => {
      button.style.background = "rgba(255,255,255,.18)";
    });
    button.addEventListener("mouseleave", () => {
      button.style.background = "rgba(255,255,255,.1)";
    });
    return button;
  }

  function createDrbSrcdoc(extensionBaseUrl) {
    const base = extensionBaseUrl.replace(/\/?$/, "/");
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Level Down REST Builder</title>
  <link rel="stylesheet" href="${base}DRB/css/drb_requirements.css">
  <link rel="stylesheet" href="${base}DRB/css/drb_custom.css">
  <link rel="stylesheet" href="${base}drb-leveldown-theme.css">
</head>
<body>
  <div id="main_body"></div>
  <script src="${base}DRB/js/drb_requirements.js"></script>
  <script src="${base}drb-ace-config.js" data-ace-base-path="${base}DRB/js"></script>
  <script src="${base}DRB/js/drb_custom.js"></script>
  <script src="${base}drb-embed.js"></script>
</body>
</html>`;
  }

  function getUserRoles(context) {
    if (!context || !context.userSettings || !context.userSettings.roles) {
      return [];
    }

    const roles = [];
    const roleCollection = context.userSettings.roles;
    if (typeof roleCollection.forEach === "function") {
      roleCollection.forEach((role) => {
        roles.push({
          id: cleanGuid(role.id || ""),
          name: role.name || ""
        });
      });
    } else if (typeof roleCollection.getAll === "function") {
      roleCollection.getAll().forEach((role) => {
        roles.push({
          id: cleanGuid(role.id || ""),
          name: role.name || ""
        });
      });
    }
    return roles;
  }

  function ensureOverlayStyle(targetDocument) {
    if (targetDocument.getElementById(OVERLAY_STYLE_ID)) {
      return;
    }

    const style = targetDocument.createElement("style");
    style.id = OVERLAY_STYLE_ID;
    style.textContent = `
      .${OVERLAY_CLASS} {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: flex-start;
        max-width: 220px;
        min-height: 20px;
        margin: 1px 0 1px 6px;
        padding: 2px 22px 2px 7px;
        border: 0;
        border-radius: 6px;
        color: #04121e;
        background: #27d3d0;
        cursor: pointer;
        font: 700 11px/1.25 "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
        letter-spacing: 0;
        vertical-align: middle;
        z-index: 2147483647;
        box-shadow: none;
      }
      .${OVERLAY_CLASS}:hover {
        background: #20c7b5;
      }
      .${OVERLAY_CLASS} .level-down-logical-name-text {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .${OVERLAY_CLASS} .level-down-copy-logical-name {
        position: absolute;
        top: 2px;
        right: 2px;
        display: grid;
        place-items: center;
        width: 16px;
        height: 16px;
        padding: 0;
        border: 0;
        border-radius: 3px;
        color: #04121e;
        background: rgba(255, 255, 255, .34);
        cursor: pointer;
      }
      .${OVERLAY_CLASS} .level-down-copy-logical-name:hover {
        background: rgba(255, 255, 255, .56);
      }
      .${OVERLAY_CLASS} .level-down-copy-logical-name::before,
      .${OVERLAY_CLASS} .level-down-copy-logical-name::after {
        content: "";
        position: absolute;
        width: 7px;
        height: 8px;
        border: 1px solid currentColor;
        border-radius: 1px;
        background: transparent;
      }
      .${OVERLAY_CLASS} .level-down-copy-logical-name::before {
        transform: translate(1px, -1px);
      }
      .${OVERLAY_CLASS} .level-down-copy-logical-name::after {
        transform: translate(-2px, 2px);
      }
    `;
    (targetDocument.head || targetDocument.documentElement).appendChild(style);
  }

  function createLogicalNameBadge(targetDocument, logicalName) {
    const badge = targetDocument.createElement("span");
    badge.className = OVERLAY_CLASS;
    badge.dataset.levelDownLogicalName = logicalName;

    const text = targetDocument.createElement("span");
    text.className = "level-down-logical-name-text";
    text.textContent = logicalName;

    const copyButton = targetDocument.createElement("button");
    copyButton.type = "button";
    copyButton.className = "level-down-copy-logical-name";
    copyButton.title = `Copy ${logicalName}`;
    copyButton.setAttribute("aria-label", `Copy ${logicalName}`);

    badge.append(text, copyButton);
    badge.title = `Click to copy ${logicalName}`;

    const copyLogicalName = async (event) => {
      event.preventDefault();
      event.stopPropagation();
      try {
        await targetDocument.defaultView.navigator.clipboard.writeText(logicalName);
        const original = text.textContent;
        text.textContent = "Copied";
        setTimeout(() => {
          text.textContent = original;
        }, 900);
      } catch (error) {
        console.warn("Level Down could not copy logical name", error);
      }
    };

    badge.addEventListener("click", copyLogicalName);
    copyButton.addEventListener("click", copyLogicalName);
    return badge;
  }

  function placeLogicalNameBadge(placement, badge) {
    if (placement.mode === "after") {
      placement.element.insertAdjacentElement("afterend", badge);
    } else if (placement.mode === "before") {
      placement.element.insertAdjacentElement("beforebegin", badge);
    } else if (placement.mode === "prepend") {
      placement.element.insertAdjacentElement("afterbegin", badge);
    } else {
      placement.element.appendChild(badge);
    }
  }

  function findControlPlacement(control, targetDocument) {
    const name = getControlLogicalName(control);
    const label = safeCall(control, "getLabel");
    return findPlacementForField(name, label, targetDocument);
  }

  function getControlLogicalName(control) {
    if (!control) {
      return "";
    }

    try {
      if (typeof control.getAttribute === "function") {
        const attribute = control.getAttribute();
        const attributeName = safeCall(attribute, "getName");
        if (attributeName) {
          return attributeName;
        }
      }
    } catch (error) {
      console.warn("Level Down could not read control attribute name", error);
    }

    return safeCall(control, "getName");
  }

  function findPlacementForField(name, label, targetDocument) {
    if (!name) {
      return null;
    }

    const escapedName = cssEscape(name, targetDocument);
    const escapedLabel = cssAttributeValue(label);
    const selectors = [
      `label[id$="${escapedName}-field-label"]`,
      `[data-id="${escapedName}.fieldControl-label"]`,
      `[data-id="${escapedName}-field-label"]`,
      `#${escapedName}_c`,
      `[data-id="${escapedName}.fieldControl"] label`,
      `[data-id^="${escapedName}.fieldControl"] label`,
      `[data-id*="${escapedName}"] label`,
      `[data-lp-id*="${escapedName}"] label`,
      `label[for*="${escapedName}"]`,
      `[id*="${escapedName}"][id*="label"]`,
      `[data-control-name="${escapedName}"] label`,
      `[data-name="${escapedName}"] label`,
      `[data-attribute="${escapedName}"]`,
      `[data-attribute-name="${escapedName}"]`,
      `[name="${escapedName}"] label`,
      `[data-logical-name="${escapedName}"]`,
      `[id^="${escapedName}"] label`,
      `[id*="${escapedName}_"] label`,
      `[aria-label*="${escapedLabel}"]`,
      label ? `[aria-label="${escapedLabel}"]` : ""
    ];

    for (const selector of selectors) {
      if (!selector) {
        continue;
      }
      const match = targetDocument.querySelector(selector);
      if (match && isUsableLabelTarget(match)) {
        return { element: match, mode: "append" };
      }
    }

    if (label) {
      const exactLabelMatch = findVisibleElementByText(label, targetDocument, { exact: true, contains: false });
      if (exactLabelMatch) {
        return { element: exactLabelMatch, mode: "append" };
      }
    }

    return null;
  }

  function findControlContainer(name, targetDocument) {
    const escapedName = cssEscape(name, targetDocument);
    const selectors = [
      `[data-id="${escapedName}.fieldControl"]`,
      `[data-id^="${escapedName}.fieldControl"]`,
      `[data-id*="${escapedName}.fieldControl"]`,
      `[data-lp-id*="${escapedName}"]`,
      `[data-control-name="${escapedName}"]`,
      `[data-name="${escapedName}"]`,
      `[id="${escapedName}"]`,
      `[id^="${escapedName}_"]`,
      `[name="${escapedName}"]`
    ];

    for (const selector of selectors) {
      const element = targetDocument.querySelector(selector);
      if (!element || !isVisibleElement(element)) {
        continue;
      }

      if (isTextOnlyElement(element)) {
        return element.parentElement || element;
      }

      const fieldRoot = element.closest("[data-id], [data-lp-id], .wj-control, .ms-crm-Field-Data-Print, td, div");
      return fieldRoot && isVisibleElement(fieldRoot) ? fieldRoot : element;
    }

    return null;
  }

  function findNestedLabel(container) {
    const labelSelectors = [
      "label",
      "[id*='label']",
      "[data-id*='label']",
      "[aria-label]"
    ];

    for (const selector of labelSelectors) {
      const label = container.querySelector(selector);
      if (label && isVisibleElement(label) && !isFormInputElement(label)) {
        return label;
      }
    }

    return null;
  }

  function findVisibleElementByText(text, targetDocument, options) {
    const resolvedOptions = options || {};
    if (!resolvedOptions.exact && !resolvedOptions.contains) {
      resolvedOptions.exact = true;
    }

    const expected = normalizeText(text);
    if (!expected) {
      return null;
    }

    const exact = resolvedOptions.exact !== false;
    const contains = Boolean(resolvedOptions.contains);

    const elements = targetDocument.querySelectorAll("label, span, div");
    for (const element of elements) {
      if (!isUsableLabelTarget(element)) {
        continue;
      }

      const ownText = normalizeText(element.childNodes.length === 1 ? element.textContent : directText(element, targetDocument));
      if (!ownText) {
        continue;
      }

      if ((exact && ownText === expected) || (contains && ownText.includes(expected))) {
        return element;
      }
    }
    return null;
  }

  function isUsableLabelTarget(element) {
    if (!element || !isVisibleElement(element) || isFormInputElement(element)) {
      return false;
    }

    if (element.closest(`#${DRB_OVERLAY_ID}, .${OVERLAY_CLASS}, nav, header, [role="navigation"], [data-id="notescontrol"], [data-id*="timeline"], [aria-label*="Timeline"]`)) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width > 360 || rect.height > 48) {
      return false;
    }

    return true;
  }

  function directText(element, targetDocument) {
    const textNode = targetDocument.defaultView && targetDocument.defaultView.Node
      ? targetDocument.defaultView.Node.TEXT_NODE
      : Node.TEXT_NODE;
    return Array.from(element.childNodes)
      .filter((node) => node.nodeType === textNode)
      .map((node) => node.textContent)
      .join(" ");
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function isVisibleElement(element) {
    const rect = element.getBoundingClientRect();
    const style = element.ownerDocument.defaultView.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }

  function isTextOnlyElement(element) {
    return ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(element.tagName);
  }

  function isFormInputElement(element) {
    return ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(element.tagName);
  }

  function cssEscape(value, targetDocument) {
    const targetWindow = targetDocument.defaultView || window;
    if (targetWindow.CSS && typeof targetWindow.CSS.escape === "function") {
      return targetWindow.CSS.escape(value);
    }
    return String(value || "").replace(/["\\]/g, "\\$&");
  }

  function cssAttributeValue(value) {
    return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
  }
})();
