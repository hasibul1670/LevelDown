# Level Down

Chrome/Edge extension for Dynamics 365 and Power Apps model-driven apps.

Level Down helps developers and admins quickly inspect records, fields, logical names, form details, environment info, and Dataverse Web API URLs from the current browser session.

## Features

- Copy record ID, table name, record URL, and Web API URL.
- Show all fields, changed fields, choices, and OptionSet values.
- Show logical names beside form labels with copy buttons.
- Unlock/lock fields locally for testing.
- Refresh subgrids.
- Open admin/helper pages.
- Includes a bundled REST Builder.

## Install In Chrome

1. Download this project.
2. Open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Select the `LevelDown` folder.
6. Done.

Open a Dynamics/Power Apps record form and click the Level Down icon.

After code changes, reload the extension from `chrome://extensions` and refresh the Dynamics tab.

## Install In Edge

1. Open `edge://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select the `LevelDown` folder.

## Notes

- Works only on configured Dynamics and Power Apps hosts in `manifest.json`.
- Data stays in the browser unless you copy it or execute a REST Builder request.
- REST Builder can modify Dataverse data if you run create/update/delete requests.

## Development

No build step is required.

Basic checks:

```bash
node --check content.js popup.js result.js injected.js drb-embed.js drb-ace-config.js
node -e "JSON.parse(require('fs').readFileSync('manifest.json', 'utf8'))"
```

## Third-Party

This project bundles Dataverse REST Builder in `DRB/`.

Dataverse REST Builder is MIT licensed by Guido Preite. Keep `DRB/LICENSE` when redistributing.

## License

Add a root `LICENSE` file before publishing as open source.
