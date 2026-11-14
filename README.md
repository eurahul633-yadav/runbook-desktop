# Runbook

A desktop workspace for creating and following developer recovery playbooks, built with Pear, Electron and Autopass.

## Features

- Create and delete troubleshooting playbooks with categorized, ordered steps
- Search and filter the playbook library
- Guided Recovery Mode with an interactive checklist and progress indicator
- Autopass-backed storage with live change notifications
- Loading, empty, confirmation, and error states

## Requirements

- Node.js and npm (the existing CI setup uses Node 20)
- Git and GitHub SSH access for the pinned Git-based development dependency
- macOS ARM64 for the verified desktop workflow; native builds may require Xcode Command Line Tools
- Pear CLI only for separate Pear deployment workflows; it is not invoked by `npm start`

## Run locally

```sh
npm install
npm start
```

The committed `package.json#upgrade` already contains a valid Pear project link;
keep it unchanged when assessing this build. A genuinely new library automatically
receives the 12 bundled example playbooks through Autopass. Existing libraries are
preserved and are never classified as new merely because they contain no playbooks.

### Installation and GitHub SSH troubleshooting

`package.json` and the lockfile pin `@electron/node-gyp` to a commit fetched through
`git+ssh://git@github.com/electron/node-gyp.git`. npm therefore needs Git, network
access to GitHub, and an SSH key that GitHub recognizes. This is separate from
access to any Runbook repository; initializing Git here is unnecessary.

Before installing, you can diagnose that connection with `ssh -T git@github.com`.
Verify GitHub's published host-key fingerprint before accepting a first connection.
A successful authentication message can accompany exit status 1 because GitHub
provides no interactive shell. See [GitHub's SSH connection guide](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/testing-your-ssh-connection).

- `Permission denied (publickey)`: check that your intended key is available to
  your SSH agent (`ssh-add -l`) and its public key is registered with your GitHub
  account. Use `ssh -vT git@github.com` for local diagnostics; avoid sharing logs
  containing private machine details. See [GitHub's public-key troubleshooting](https://docs.github.com/en/authentication/troubleshooting-ssh/error-permission-denied-publickey).
- Connection timeout or DNS failure: check the network/firewall and GitHub access.
  On a network that blocks SSH, use an organization-approved connection method;
  do not disable host verification or rewrite global Git settings to bypass it.
- Native build errors: check the installed compiler/SDK and architecture. The
  project provides `npm run install:mac` to install Electron and rebuild its macOS
  native helper modules; this also requires the same GitHub dependency access.

No credentials or private keys belong in this workspace. A clean-machine install
has not been revalidated by the submission cleanup; the existing installed
macOS ARM64 workspace was used for regression and packaging checks.

## Architecture

- `renderer/`: desktop interface, local checklist progress, request/response handling
- `electron/`: existing desktop window and preload bridge
- `workers/main.js`: Pear worker, IPC requests, and updater lifecycle
- `workers/playbooks.js`: Autopass persistence and record validation

The renderer does not access storage directly. It sends operations to the worker over the existing IPC bridge, with a request ID for each response. Autopass change events trigger a library refresh.

## Data model

Each playbook is stored as a JSON value under an Autopass key of the form `playbook:<id>`. Records include title, category, description, steps, and timestamps. Checklist progress is session-local and resets after restarting the app.

## Limitations

Pairing, file attachments, and automated command execution are not implemented. This keeps the exercise focused on core entry operations and a clear desktop interaction. Do not store real credentials or secrets in example playbooks.

## Verified scope and release status

| Capability                                                                                             | Status                                                                               |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| macOS ARM64 development and local packaged executable                                                  | Verified in this workspace                                                           |
| First-run samples, legacy preservation, persistence, retry, search, pagination, checklist and branding | Verified by unit/UI and source/packaged regression checks                            |
| Windows and Linux runtime behavior, including Snap/Flatpak                                             | Not verified; configuration exists only                                              |
| Developer ID / App Store signing and notarization                                                      | Not verified; local executable has an ad-hoc signature, not a distribution signature |
| DMG/PKG/MSIX/AppImage/Snap/Flatpak installers                                                          | Not verified                                                                         |
| Live Pear OTA download/application and multisig deployment                                             | Not verified                                                                         |

No runtime or UI changes are implied by the remaining platform templates. The
Windows `HelloPear` identity and `CN=My Publisher` certificate subject remain
unchanged: the latter is an unresolved template value requiring the maintainer's
real certificate and publisher display name before Windows distribution. Flatpak
retains legacy IDs and an unverified archive manifest; its localhost URLs and
checksums must be replaced with real release artifacts before use. The unused
macOS team ID and unrelated Flatpak developer/release/website claims were removed.
Supply genuine signing identities via the existing signing configuration when
preparing a separately verified release; no identities or certificates are bundled.

No application license has been selected for this submission. The empty package
license field grants no additional permissions. Unsupported MIT/Apache application
license claims were removed from platform templates; the maintainer must establish
licensing and complete AppStream metadata before distributing those formats.
Third-party dependencies retain their own licenses and notices, including
Electron/Chromium's generated license notices. Their licenses are not a license for
Runbook itself. Existing `pear.json` multisig placeholders also require real keys
before deployment; they were not changed during cleanup.

GitHub's integration workflow currently runs lint, not these local test suites.
The retained release workflows are separate automation templates, including a
`v*` tag-triggered publishing workflow; the submission checks do not invoke them.

## Manual verification

1. Create a playbook with several steps and verify it appears in the library.
2. Search by title and filter by category.
3. Open the playbook, complete steps, and reset the checklist.
4. Delete the playbook and confirm it disappears.
5. Restart the app and verify saved playbooks remain available.

## Sharing

Use the Pear CLI sharing instructions: https://docs.pears.com/guide/sharing-a-pear-app

## Runbook playbooks

A genuinely new library opens with the 12 bundled troubleshooting guides already
stored through Autopass. Reviewers can immediately browse two pages of six guides,
search for problems such as certificates or DNS, select a category, and open a
checklist. The samples are instructions only; Runbook does not execute commands.
The investigation-only “Startup persistence verification” record is not bundled.

First-run initialization exclusively creates the `runbook-data` directory before
Corestore opens it. Any pre-existing directory, including an empty directory or
an unmarked legacy library, is conservatively treated as existing and receives no
automatic samples or initialization writes. It is never classified by record count.
A durable `runbook:initialization:v1` record in the same Autopass store tracks
pending/completed initialization. An interrupted pending import resumes with
stable IDs; completed initialization never repeats, even after every guide is
deleted. If startup stops before intent is recorded, the directory is treated as
legacy on reopening; the manual action remains available.

**Add example playbooks** remains an explicit import/restore action. Both paths
reuse the same bundled data and stable `example-*` IDs, skip existing records
(including customized samples), and never overwrite by title. Repeated imports
are safe. Deleting a sample and manually importing again restores that sample.
Titles need not be unique: separate records have separate IDs; saving an existing
ID updates that record and preserves its creation timestamp.

Search and category filtering run before pagination, with six results per page.
Changing either filter returns to page one. Back from a checklist preserves the
page and returns keyboard focus to its card. Checklist completion is session-only;
playbook content and deletion persist in Autopass.

Run `npm test` for real Autopass first-run initialization, legacy preservation,
interrupted import recovery, validation, identity, manual import, deletion and reopen
checks. Run `npm run test:ui` for real Electron/preload/Bare worker navigation tests
against fresh temporary storage. If your environment sets `ELECTRON_RUN_AS_NODE`,
use `env -u ELECTRON_RUN_AS_NODE npm run test:ui`. No existing app storage is used.
The UI test leaves its isolated temporary directory for inspection.

The renderer previously had no Content Security Policy, triggering Electron's
insecure CSP warning. Its HTML now restricts scripts and styles to local files,
disables network resources, inline scripts, eval, base URLs and form navigation.
Autopass and Pear networking remain in the worker and are unaffected by renderer
CSP. A native progress element avoids inline progress styles. An externally
provided `PEAR_DEV_SERVER_URL` must serve its own appropriate CSP.

## Storage and clean restarts

Normal development and packaged launches now share the same persistent root:

| Platform | Storage root and Electron userData                        |
| -------- | --------------------------------------------------------- |
| macOS    | `~/Library/Application Support/Runbook`                   |
| Windows  | `~/AppData/Local/Runbook`                                 |
| Linux    | `$XDG_CONFIG_HOME/Runbook`, otherwise `~/.config/Runbook` |
| Snap     | `$SNAP_USER_COMMON/Runbook`                               |

Playbooks live in `<root>/runbook-data`; OTA storage is separate at
`<root>/pear-runtime/corestore`. An explicit `--storage <dir>` overrides both the
worker root and Electron userData. Paths are canonicalized so symlink aliases
share the same instance lock. A same-root second launch focuses the existing
window rather than starting another worker; a different storage root can run
independently.

**Existing stores are left exactly where they are.** There is no automatic copy,
merge, migration, or sample import into existing libraries. To open the former development library, run
`npm start -- --storage <old-temp-directory>/pear/Runbook`, substituting its actual
absolute path. Prior libraries created with an explicit `--storage` path remain at that path.

Quitting drains accepted requests and closes storage before the Bare sidecar
exits. Electron waits for that exit while retaining its instance lock. If cleanup
takes over 15 seconds, a warning appears and Runbook keeps waiting; it does not
force-kill a worker with pending writes. On macOS, closing the window keeps the
app running; use Quit to fully stop it.

`npm run test:restart` launches independent Electron processes to verify immediate
restarts, exact record persistence, clean sidecar exits, same-root exclusion,
symlink aliases, lock retention during delayed shutdown, and simultaneous isolated roots.
Automated tests use isolated, freshly allocated temporary roots by default. The
separate opt-in `npm run test:normal-storage` deliberately uses the normal library
and adds a verification record; it is not part of `npm test` or the isolated suites. Storage test artifacts are retained
for inspection; record deletion tests operate only on records created in those
fresh test stores. Set `RUNBOOK_TEST_MAIN` to the absolute packaged
`Contents/Resources/app/electron/main.js` path to run the integration suites against
packaged files and pruned dependencies. That harness still runs in development
mode; it does not substitute for testing the actual packaged executable.

On macOS, run `npm run package` followed by `npm run test:packaged` to exercise
actual packaged executables with `app.isPackaged === true`. This creates a fresh
copy of the `.app` and changes only that copy's entry point to a test driver;
production main, worker, preload and renderer files stay identical to the build.
It runs the restart/isolation checks with explicit temporary storage. Both the
build and the instrumented copy are retained. This is an unsigned local runtime
check, not a signing/notarization or installer validation.

## Icons and submission inventory

Runbook's purple/indigo clipboard, checklist and code icon is drawn by
`scripts/generate-icons.swift`. On macOS, run
`swift scripts/generate-icons.swift` to rebuild `build/icon.png`, `build/icon.icns`,
`build/icon.ico`, the six Linux PNG sizes, and the existing MSIX tile assets.
The generator uses native AppKit/CoreGraphics and iconutil without extra packages.
Forge uses `build/icon` for native bundle icons; the Electron window uses the PNG.
Windows package identity/publisher and Pear update keys are retained for continuity.

Run `python3 scripts/audit-submission.py` for a read-only candidate inventory when
Git is unavailable. It applies the simple basename/directory patterns in
`.gitignore`, skips dependency/build/local-storage directories, and scans candidate
contents for private-key blocks and common token formats without printing values.
This is a targeted secret-pattern check, not a guarantee against every possible
credential format. Forge separately excludes local secrets, storage and development
metadata from packaged resources. PNG, ICNS and ICO source assets are intentional
submission files; `node_modules/` and `out/` are generated and excluded.

## Startup recovery

Every window now performs a correlated `status` request followed by a library read,
including macOS window reactivation and renderer reloads. The one-time worker
`ready` notification is not used as a durable subscription. Startup/request waits
are bounded, failed initialization or worker exit replaces the loading placeholder
with a useful error, and **Retry connection** gracefully closes the previous
worker before starting another. It never removes locks or resets a Corestore.

`runbook-startup.log` is appended in the selected storage root. It records the
resolved storage/userData paths, process IDs, worker starts/reuse/exits, and
initialization/IPC errors; playbook records are not logged. No log is uploaded.
A macOS closed window does not imply the app has quit.

`npm run test:restart` and `npm run test:packaged` also exercise macOS window
reactivation and a real Corestore lock failure followed by Retry. They use isolated
storage. `npm run test:normal-storage` is a separate **opt-in** macOS investigation:
it uses an instrumented copy of the real packaged executable, its normal default
persistent storage and updater settings, adds one new verification playbook, and
compares every existing record unchanged over three full quit/reopen cycles plus
window reactivation and renderer reload. It never seeds, edits or deletes existing
records. The verification record and temporary snapshots are retained. Do not run
this opt-in check if adding that record to your normal library is unwanted.
