# Level Down

Level Down is a local browser extension for personal Dynamics 365 and Power Apps model-driven app development/admin work. It inspects the current form, record, fields, tabs, sections, controls, and useful URLs from the browser session you are already logged into.

Actions are launched from the popup. Large reports open in a separate Level Down browser tab, while quick page actions such as logical-name overlays, REST Builder, lock/unlock, tab toggles, subgrid refresh, and debug snapshot run directly from the popup.

## Features

- Copy current record ID, entity logical name, record URL, and Web API URL.
- Show form context information, including organization URL, app ID, form type, dirty state, and current user details where available.
- List all form fields with values, required level, dirty state, and submit mode.
- List changed fields only.
- Show choice and multi-select choice values and available options.
- Show OptionSet values in a table grouped by option set control.
- Add and remove a temporary logical-name overlay beside matched visible field labels.
- Unlock or lock form controls for developer/admin testing without saving.
- List tabs, sections, visibility, and display state.
- Toggle tab visibility on the current form view.
- Refresh subgrids.
- Copy a debug snapshot as JSON.
- Environment/admin helpers for environment details, settings, roles, users, current user record, mailbox, command debugger, forms monitor, and entity metadata.
- Bundled Dataverse REST Builder launcher for advanced Web API request building, code generation, request collections, and exports.
- Open large report results in a dedicated extension tab with search, copy, rerun, and source-tab controls.
- Run quick form/tools actions without opening another tab.

## Safety Warning

This extension is for personal development and admin troubleshooting only. It does not bypass Dynamics 365, Power Apps, Dataverse, or browser security permissions. It can only interact with data and controls the logged-in user can already access in the browser.

Level Down does not auto-save records, auto-delete records, bulk update records, bulk create records, send data to servers, use external APIs, load remote scripts, collect analytics, or track usage. Data stays in the browser unless you explicitly copy it.

Unlocking fields only changes the current browser form state for testing. It does not change security, business rules, server-side validation, field-level security, plugins, or the original form configuration.

The bundled Dataverse REST Builder can generate and execute Dataverse Web API requests. Some request types can create, update, delete, associate, or otherwise modify data if you execute them. Review every request before running it, especially in production.

## Chrome Installation

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the `LevelDown` extension folder.
6. Pin the extension if desired.
7. Open a Dynamics 365 or Power Apps model-driven app.
8. Open a record form.
9. Click **Level Down**.
10. Pick an action. A new Level Down result tab opens beside the Dynamics tab.

## Microsoft Edge Installation

1. Open Edge.
2. Go to `edge://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the `LevelDown` extension folder.
6. Open a model-driven app record and click **Level Down**.
7. Pick an action. A new Level Down result tab opens beside the Dynamics tab.

## Troubleshooting

### Xrm not found

If you see `Dynamics form context was not found. Open a model-driven app record form and try again.`, reload the Dynamics tab and make sure you are on a model-driven app record form. Some maker pages, dashboards, custom pages, and grids do not expose the same form context.

### Not working on non-record pages

Record, field, tab, and control actions require an open record form. Open a specific row/record and try again.

### Extension reload required after code changes

After editing extension files, go to `chrome://extensions` or `edge://extensions` and click reload on Level Down. Then reload the Dynamics page.

If you loaded or reloaded the extension while a Dynamics tab was already open, Level Down will try to inject its content helper automatically. If the browser blocks that, reload the Dynamics tab once.

### REST Builder opens but cannot load data

Use the **REST Builder** button from an open Dynamics 365 / Power Apps model-driven app tab. The bundled builder runs inside that Dynamics page so it can use the current `Xrm` context and your existing session permissions.

### Host permissions

Level Down runs only on configured Dynamics and Power Apps hosts. If your environment uses a different host pattern, add it to `host_permissions`, `content_scripts.matches`, and `web_accessible_resources.matches` in `manifest.json`.

## Privacy

- No data leaves your browser.
- No analytics.
- No tracking.
- No remote scripts.
- No external network calls except user-initiated Dataverse Web API calls made by the bundled REST Builder against the environment you opened it from.
- No Dynamics data is stored by the extension unless you copy it yourself.

## Third-Party Code

Level Down bundles Dataverse REST Builder from the local `DRB` folder. Dataverse REST Builder is MIT licensed, copyright Guido Preite. Keep `DRB/LICENSE` with this project when redistributing or sharing this extension.

## Development Notes

Chrome content scripts run in an isolated JavaScript world, so they cannot reliably access page objects such as `window.Xrm` directly. Level Down uses this flow:

1. `popup.js` sends a command to `content.js`.
2. `popup.js` opens `result.html` in a new extension tab with the selected command and source tab ID.
3. `result.js` sends the command to `content.js` in the Dynamics tab.
4. `content.js` injects `injected.js` into the actual page context once.
5. `injected.js` accesses `window.Xrm` and the form context where available, including visible same-origin iframes where possible.
6. `injected.js` posts a response back with `window.postMessage`.
7. `content.js` forwards the result to `result.js`.
8. `result.js` renders the result and copy actions in the dedicated result tab.

The command message shape is:

```json
{
  "source": "level-down-extension",
  "command": "GET_RECORD_ID",
  "requestId": "unique-id"
}
```

Responses use:

```json
{
  "source": "level-down-page",
  "requestId": "same-id",
  "success": true,
  "data": {}
}
```

or:

```json
{
  "source": "level-down-page",
  "requestId": "same-id",
  "success": false,
  "error": "Friendly error message"
}
```
# LevelDown
