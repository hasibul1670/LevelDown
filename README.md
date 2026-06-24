# Level Down

Level Down is a local Chrome/Edge browser extension for Dynamics 365, Dataverse, and Power Apps model-driven app developers and administrators.

It helps inspect the current model-driven app form from the browser session you are already signed into. You can copy record details, inspect fields and metadata, show logical names beside form labels, unlock controls for local testing, refresh subgrids, open admin URLs, and launch a bundled REST Builder without sending data to an external service.

## What It Does

- Copies the current record ID, table logical name, record URL, and Web API URL.
- Shows form context details such as organization URL, app ID, form type, dirty state, current user, and roles.
- Lists all fields on the current form, including values, required level, dirty state, and submit mode.
- Lists changed fields only.
- Shows choice, multi-select choice, and OptionSet values.
- Adds removable logical-name badges beside matched visible field labels.
- Copies logical names from each badge using the inline copy icon.
- Unlocks or locks form controls in the current browser view for testing.
- Lists tabs, sections, visibility, and display state.
- Toggles tab visibility locally.
- Refreshes subgrids.
- Copies a debug snapshot as JSON.
- Opens environment, user, role, mailbox, command debugger, forms monitor, and metadata helpers.
- Opens large reports in a dedicated Level Down result tab with search, copy, rerun, and source-tab controls.
- Bundles Dataverse REST Builder for Web API request building and execution from the current Dynamics page context.

## Safety And Scope

Level Down is intended for development, troubleshooting, and admin inspection. It does not bypass Dynamics 365, Power Apps, Dataverse, browser, or tenant security. It can only interact with data and controls available to the currently signed-in browser user.

The extension does not:

- Collect analytics.
- Track usage.
- Send extension telemetry.
- Load remote scripts.
- Auto-save records.
- Auto-delete records.
- Bulk create or bulk update records.
- Store Dynamics data outside the browser.

Some actions can still affect your current browser session:

- **Unlock Fields** only changes control state in the current form view. It does not change field security, business rules, plugins, server validation, or form configuration.
- **REST Builder** can execute Dataverse Web API requests. Depending on the request you configure, that can create, update, delete, associate, or otherwise modify data. Review generated requests carefully before executing them, especially in production.

## Installation

### Chrome

Use these steps if you downloaded or cloned this project and want to install it locally in Chrome:

1. Download or clone this repository to your computer.
2. Make sure the folder contains `manifest.json` at the top level.
3. Open Google Chrome.
4. Go to `chrome://extensions`.
5. Turn on **Developer mode** in the top-right corner.
6. Click **Load unpacked**.
7. Select the `LevelDown` project folder.
8. Confirm that **Level Down** appears in your extensions list.
9. Pin the extension from the Chrome toolbar if you want quick access.
10. Open a Dynamics 365 or Power Apps model-driven app record form.
11. Click the **Level Down** extension icon and choose an action.

If you edit any files after installing, go back to `chrome://extensions`, click **Reload** on Level Down, and refresh your Dynamics tab.

### Microsoft Edge

1. Open `edge://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `LevelDown` folder.
5. Open a model-driven app record form.
6. Click **Level Down** and choose an action.

After changing extension files, reload Level Down from the browser extension page and refresh the Dynamics tab.

## Supported Hosts

The default manifest supports common Dynamics and Power Apps hosts:

- `https://*.crm.dynamics.com/*`
- `https://*.dynamics.com/*`
- `https://*.powerapps.com/*`
- `https://make.powerapps.com/*`
- `https://*.crm4.dynamics.com/*`
- `https://*.crm11.dynamics.com/*`
- `https://*.crm12.dynamics.com/*`

If your environment uses another regional or custom host pattern, update these sections in `manifest.json`:

- `host_permissions`
- `content_scripts.matches`
- `web_accessible_resources.matches`

## Repository Structure

```text
LevelDown/
  manifest.json              Extension manifest.
  popup.html                 Popup UI.
  popup.css                  Popup styles.
  popup.js                   Popup command routing.
  content.js                 Content-script bridge between extension and page.
  injected.js                Page-context Dynamics/Xrm inspection logic.
  result.html                Large report result page.
  result.css                 Result page styles.
  result.js                  Result rendering and rerun/copy behavior.
  drb-embed.js               Level Down wrapper for bundled REST Builder.
  drb-ace-config.js          Ace editor path configuration for REST Builder.
  drb-leveldown-theme.css    REST Builder visual overrides.
  icons/                     Extension icons.
  DRB/                       Bundled Dataverse REST Builder assets.
```

## How It Works

Chrome and Edge content scripts run in an isolated JavaScript world, so they cannot reliably access page objects such as `window.Xrm` directly. Level Down uses an injected page helper for the actual model-driven app inspection.

Flow:

1. `popup.js` receives the selected action.
2. For quick actions, `popup.js` sends the command to the active Dynamics tab.
3. For larger reports, `popup.js` opens `result.html` with the command and source tab ID.
4. `content.js` injects `injected.js` into the Dynamics page context.
5. `injected.js` accesses `window.Xrm`, form context, controls, attributes, tabs, metadata, and admin URLs.
6. `injected.js` posts the response back to `content.js`.
7. `content.js` returns the response to the popup or result tab.
8. `result.js` renders tables, JSON, copy actions, filters, and rerun controls.

Command shape:

```json
{
  "source": "level-down-extension",
  "command": "GET_RECORD_ID",
  "requestId": "unique-id"
}
```

Success response:

```json
{
  "source": "level-down-page",
  "requestId": "same-id",
  "success": true,
  "data": {}
}
```

Error response:

```json
{
  "source": "level-down-page",
  "requestId": "same-id",
  "success": false,
  "error": "Friendly error message"
}
```

## REST Builder

Level Down bundles Dataverse REST Builder inside the local `DRB/` folder and opens it inside the current Dynamics page. This lets the builder use the current browser session and page context.

Level Down also adds:

- Level Down branding.
- Local styling.
- Ace editor path configuration.
- An execute shortcut.
- Result output handling for generated requests.

REST Builder is powerful. Generated requests can modify data. Review the selected request type, table, record IDs, payload, and generated code before execution.

## Troubleshooting

### Dynamics form context was not found

Reload the Dynamics tab and make sure you are on a model-driven app record form. Maker pages, dashboards, custom pages, grids, and some dialogs may not expose the same form context.

### Actions do not work after extension reload

Reload the extension from `chrome://extensions` or `edge://extensions`, then refresh the Dynamics tab. Already-open pages may still contain an older injected helper until refreshed.

### Logical name badges look wrong or stale

Click **Hide Logical Names**, refresh the page, then click **Show Logical Names** again. Dynamics virtualizes parts of the form, so badges are added as visible markup appears.

### REST Builder opens but does not load

Make sure the local `DRB/` folder exists and contains:

- `DRB/js/drb_requirements.js`
- `DRB/js/drb_custom.js`
- `DRB/css/drb_requirements.css`
- `DRB/css/drb_custom.css`

Then reload the extension and refresh the Dynamics tab.

### REST Builder result is blank

Open the browser DevTools console for the Dynamics tab and inspect request errors. Browser-blocked telemetry errors are usually unrelated. Dataverse request errors should appear in the REST Builder Results tab after execution.

## Development

There is no build step. This is a static Manifest V3 extension.

Recommended local checks:

```bash
node --check content.js
node --check popup.js
node --check result.js
node --check injected.js
node --check drb-embed.js
node --check drb-ace-config.js
node -e "JSON.parse(require('fs').readFileSync('manifest.json', 'utf8'))"
```

When editing:

1. Change the files.
2. Reload the unpacked extension.
3. Refresh the Dynamics tab.
4. Retest the popup action.

If you change the injected helper behavior, update the `INJECTION_VERSION` constants in `content.js` and `injected.js` so open tabs load the new helper after refresh.

## Contributing

Issues and pull requests are welcome.

Good contributions include:

- Support for additional Dynamics host patterns.
- More robust logical-name matching for new model-driven app markup.
- Safer REST Builder execution handling.
- Accessibility fixes.
- Documentation improvements.
- Focused bug fixes with reproduction steps.

Please keep changes scoped and avoid adding remote services, analytics, or tracking.

## Privacy

Level Down is designed to run locally in the browser. Data stays in your browser unless you explicitly copy it, open a generated URL, or execute a Dataverse request from REST Builder.

The bundled REST Builder may make Dataverse Web API calls to the environment you opened it from when you execute a request.

## Third-Party Code

Level Down bundles Dataverse REST Builder in the `DRB/` folder.

Dataverse REST Builder is MIT licensed and copyrighted by Guido Preite. Keep `DRB/LICENSE` with this project when redistributing or sharing the extension.

## License

Add a repository-level license before publishing this project as open source. If you choose MIT, include a `LICENSE` file at the repository root.
