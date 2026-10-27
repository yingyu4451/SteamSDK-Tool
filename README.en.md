# SteamSDK Upload Workbench

A desktop tool for Steam developers: **one SteamSDK install manages every App / Depot / build**, so you don't copy the SDK per version and don't have to memorise steamcmd flags.

The UI follows Steam's own visual language. Vue 3 + Electron, Windows installer.

> **Download**: [latest release](https://github.com/yingyu4451/SteamSDK-Tool/releases/latest) — a three-step setup guide runs on first launch.

**English** · [中文](README.md)

> ⚠️ **The application UI is currently Chinese only.** This document describes it in English, and the button names below are given as English glosses of the Chinese labels.

![Workbench](docs/workbench.png)

---

## What problem does it solve

Valve gives you `steamcmd` plus a pile of `.vdf` files. In practice you run into this:

- A game with a Demo / full release / playtest looks like it needs several App folders and several copies of the SDK;
- Shipping Windows, macOS and Linux means maintaining three sets of depot config;
- Finding out which DepotIDs exist in the backend, whether an upload actually landed, and whether local and remote agree means digging through web pages;
- Debug leftovers (`*.pdb`, logs, Burst debug info, player saves) get uploaded because nobody remembered to exclude them.

This tool folds all of that into one window: **one App = one project folder, with a Depot per platform underneath, and one build ships every platform at once.**

---

## Quick start

1. Download and run `SteamSDK Tool-x.y.z-setup.exe`;
2. Follow the three-step guide on first launch: **① confirm the SteamSDK path → ② enter your Steam account → ③ create or pick an App**;
   - Returning users can click **Skip tutorial**; everything lives on the Settings page;
3. Click **Read backend Depots** — it lists the Depots already configured for this App in Steamworks, and ticking one fills in the real DepotID;
4. Click **Self-check** to validate the config, then **Preview (dry run)** to walk the whole flow without uploading;
5. When it looks right, click **Upload for real**.

<table>
<tr>
<td width="50%"><img src="docs/onboard.png" alt="First-run guide"><br><sub>Three-step first-run guide — returning users can skip it</sub></td>
<td width="50%"><img src="docs/wizard.png" alt="New App"><br><sub>New App: reads real backend DepotIDs, platforms are drag-sortable</sub></td>
</tr>
</table>

---

## Core concepts

| Concept | What it is |
|---|---|
| **App** | A "product" on Steam with a unique AppID. A Demo, the full game and a playtest are **separate Apps**, each with its own AppID |
| **Depot** | The upload unit inside an App, split by platform (or DLC, or language). **One Depot per platform**, each with its own DepotID |
| **Project folder** | The parent directory holding every platform's build output for one App, e.g. `D:\SteamBuilds\MyGame`, with `win64\`, `macos\`, `linux\` each bound to a Depot |
| **Branch / SetLive** | SteamPipe beta branches. `SetLive` picks which branch a build publishes to; **it cannot target `default`** — create branches in the Steamworks backend first |
| **Preview (dry run)** | Runs the entire build flow without uploading anything. Used to validate config and exclusion rules |

### Directory layout

```text
D:\SteamSDK\tools\ContentBuilder\
├─ build.ps1 / check.ps1        ← build / validation scripts, shipped with this tool (not in the SDK)
├─ builder\                     ← steamcmd
├─ output\                      ← build logs
└─ scripts\
   ├─ MyGame\                 ← one folder per App
   │  ├─ app_1234560.vdf
   │  ├─ depot_1234561_win64.vdf
   │  └─ depot_1234563_macos.vdf
   └─ MyGame\
      └─ ...
```

> The GUI and the command line drive **the same scripts**, so there is no "works in the UI, not from the shell" split. You can bypass the GUI entirely with `D:\SteamSDK\tools\ContentBuilder\build.ps1 -App MyGame`.
>
> Those two scripts are **not** part of the Steamworks SDK — the installer ships a copy and the tool writes them into `ContentBuilder` on startup / SDK-path change / before any check or upload when they are missing (existing files are never overwritten). If you edited them and want the bundled version back, click "Install/repair scripts" in Settings.

---

## Features

### Multiple Apps, multiple platforms

- **＋** in the sidebar creates an App: name + AppID, tick the platforms you need, and DepotIDs are numbered `AppID+1`, `+2`, … automatically;
- **Platform rows are drag-sortable** — top to bottom is the DepotID order, and the list reorders live as you drag;
- An App can carry any number of platform Depots; a single `run_app_build` ships them all;
- App names are renameable at any time, **including the folder under `scripts\`**.

### Read real backend DepotIDs

No Steamworks admin rights and no Web API key needed — it drives the same `steamcmd +app_info_print` you already use, with the account you saved:

| DepotID | Platform | Build | Size |
|---|---|---|---|
| 1234561 | Windows 64 | 8650706403037703068 · public | 1.3 GB |
| 1234562 | Linux | 7141745897605008214 · public | 270.6 MB |
| 1234563 | macOS | 2851455297450281867 · public | 996.3 MB |

If you do hold a Publisher-level Web API key, entering it in Settings makes the tool prefer the official API (which additionally returns the App list within the key's scope, and build history). Not having one changes nothing else.

### Sync Depots

**Sync Depots** diffs the backend Depot list against your local scripts:

- Backend has it, local doesn't → tick it and a depot script is created for you (its content root defaults to the platform subfolder of the project folder);
- Local has it, backend doesn't → flagged, meaning that DepotID doesn't exist remotely and an upload would fail.

### Drag and drop

Drag a **folder or zip archive** straight from Explorer into the window:

1. It works out the platform (`.app` bundle / `UnityPlayer.dll` / `UnityPlayer.so` / `UnityPlayer` dylib), the file count, the total size, and which junk should be excluded;
2. A dialog asks which Depot to put it in (the platform match is labelled "this is the one you dragged"), or offers to **create a new Depot**;
3. Choose either **point at it directly** (repoint the content root, no copy) or **copy into the existing content root**.

Zip files are extracted to a temp directory, and a single wrapping folder is unwrapped automatically. Only `.zip` is supported today (`.7z` / `.rar` must be extracted manually first).

![Drag and drop](docs/drop.png)

### Checking the files

The **检查文件 (Check files)** button catches things **检查配置 (Check config) can't see but Steam will choke on**:

- Illegal characters in filenames, and over-long paths (relative path > 200 chars, or a single segment > 120);
- Case collisions (`Readme.txt` next to `README.TXT` — Steam depots are case-sensitive, Windows players get a clash);
- Symlinks / junctions;
- macOS `.DS_Store`, `._*`, `__MACOSX`;
- `.app` bundles with no executable, or containing symlinks (Valve's `tools\ContentPrep` exists precisely for this, and runs on macOS);
- Empty directories.

### Content health

Each Depot card shows four numbers directly: **files on disk / total size / excluded / will upload**. Expanding it shows:

- the suspicious files that really will be uploaded;
- the files blocked by `FileExclusion`, grouped by rule.

### Builds and history

- **Self-check** runs `check.ps1` with output streamed live into the window;
- **Preview (dry run)** runs the full flow without uploading;
- **Upload for real** requires a **second click to confirm**;
- **Abort** kills the whole process tree (steamcmd included);
- **Each App has its own build console** — switching Apps switches the log;
- Build history filters by "all / individual App" and is searchable.

### The editor won't destroy your vdf comments

Reads go through a parser, writes go through **line-level replacement**. Comments you wrote in the vdf, and the notes in Valve's templates, survive every edit.

The alternative — parse to objects and re-serialise — wipes them all out. This tool deliberately avoids that route.

### After an upload

- Three-state status light: **green** = fine, **yellow** = things to look at, **red** = structurally broken (missing AppID, missing depot script, AppID collision);
- Every "to do" item can be **ignored individually** (say, a Depot that intentionally points at `Downloads`); the choice persists and can be restored anytime;
- Paths — depot content roots, build scripts — are **clickable** and open in Explorer.

### There's a manual inside the app

The sidebar's **使用手册** entry is built in and works offline: what each toolbar button actually checks, the three core concepts, what not to ship, and how branches work. It has a search box that filters sections.

![Manual](docs/manual.png)

For first-time setup, click **新手教程** in the manual header to walk through it again (find the SDK → enter your account).

### Spaces in app names

The app name is the folder name under `scripts/`, and it **may contain spaces and parentheses** — Valve's own examples (`MyGame Steam(Body-1234570) B0.7.9`) do. The only things rejected are `\ / : * ? " < > |`, control characters, and a leading underscore (directories starting with `_` are skipped by the scanner).

---

## How credentials are handled

- The password is encrypted at rest with **Windows DPAPI** (Electron `safeStorage`) and is only decryptable by the current Windows user;
- It is **never passed on the command line** — it goes to `build.ps1` via an environment variable, and PowerShell pipes it into steamcmd's stdin;
- If the password appears in output it is redacted to `********`;
- Storing it is optional: if you don't, the UI asks each time you upload for real. The tidier alternative is **Log in once**, which opens a real console where you `login`, letting steamcmd cache the credential itself.

The optional Web API key is likewise DPAPI-encrypted locally.

---

## Updates

The tool checks GitHub Releases for new versions: the **About** card in Settings shows the current version and a **Check for updates** button, and a `vX.Y.Z available` pill appears in the title bar when there's a newer build — click through to download and restart-install in one step.

Update checks go through `releases.atom` and the release web pages, **not the GitHub API** — the anonymous API is limited to 60 requests/hour/IP, which a whole office behind one NAT would burn through instantly.

### Two editions

| | `-setup.exe` | `-portable.exe` |
|---|---|---|
| Install | Double-click to install; Start-menu entry and uninstaller | Double-click to run; nothing installed, nothing written to the registry |
| Permissions | Can install per-user without admin | Never needs admin |
| Updates | **Restart and install** replaces it automatically | **Open download location**, then close the tool and swap the exe yourself |

A portable build can't overwrite itself while running, so its update is manual by design — the app says so, and the updater only downloads the edition you're actually running.

### Publishing a new version (maintainer notes)

Push a `v*` tag and the workflow in `.github/workflows/build.yml` builds both editions and creates the release. Manually it's the same path:

```powershell
# 1. bump version in package.json, e.g. 0.2.0
# 2. build + package (both editions)
pnpm build
$env:ELECTRON_BUILDER_BINARIES_MIRROR='https://npmmirror.com/mirrors/electron-builder-binaries/'
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
pnpm dist
# 3. publish — the tag MUST be vX.Y.Z, that's what the updater looks for
gh release create v0.2.0 --title "v0.2.0" --notes-file NOTES.md `
  "release\SteamSDK Tool-0.2.0-setup.exe" "release\SteamSDK Tool-0.2.0-portable.exe"
```

> Upload both. If only the setup is published, portable users get an installer — downloadable, but the wrong thing.

---

## Settings

| Setting | Description |
|---|---|
| SDK path | The directory containing `tools\ContentBuilder`, e.g. `D:\SteamSDK` |
| Steam account | The account name used for uploads (not the email) |
| Password | Optional, DPAPI-encrypted locally |
| Web API key | Optional, Publisher level; when present the official API is preferred |
| Local content server | Starts a local HTTP server from the SDK's own `ContentServer\`, paired with Steam's `@localcontentserver` for upload-free local testing |

---

## Known limitations

- **`SetLive` cannot be set to `default`** — a Valve restriction; publishing to the default branch has to be done from the Steamworks backend;
- **`FileExclusion` does not block empty directories** — empty shells still land in the manifest;
- **`LocalPath "*"` + `DepotPath "."` adds an extra same-named folder**; if that bothers you, write multiple FileMappings to remap manually;
- The backend is read-only here: deleting or renaming a Depot must be done on the Steamworks website. Changing a DepotID locally only edits the script — it does not sync back;
- Drag-and-drop extraction only handles `.zip`;
- The local content server defaults to port 80, which may collide with the Steam client; change it in Settings.

---

## Stack and development

Vue 3 + Electron + Tailwind CSS v4 + GSAP, icons from [Lucide](https://lucide.dev) (`@lucide/vue`), built with electron-vite, packaged with electron-builder.

```powershell
pnpm install
pnpm dev          # dev (note: main-process hot reload is unreliable; prefer pnpm build + run out/)
pnpm build        # build into out/
pnpm dist         # produce the installer in release/
```

Main-process code lives in `src/main/`:

| File | Responsibility |
|---|---|
| `index.js` | Entry point + all IPC |
| `vdf.js` | VDF parser (read) |
| `vdf-edit.js` | Line-level VDF editing (write) + template generation |
| `sdk.js` | App / Depot CRUD, path checks, scanning |
| `steamapi.js` | Steamworks Web API (needs a publisher key) |
| `steamcmdinfo.js` | `steamcmd +app_info_print` parsing (**no key needed**) |
| `preflight.js` | Checks the files that will actually be uploaded |
| `dropzone.js` | Drag-and-drop analysis (folders / zip) |
| `localserver.js` | Local content server |
| `updater.js` | GitHub Releases update check |
| `runner.js` | Runs PowerShell / steamcmd with streamed output |
| `scripts.js` | Installs / version-checks the bundled `build.ps1` / `check.ps1` |
| `store.js` | Settings and credential persistence |

---

## Troubleshooting

**The UI says "SDK not ready"**
The SDK path in Settings must point at the directory containing `tools\ContentBuilder`. If `builder\steamcmd.exe` is missing, run `steamcmd.exe` once so it self-updates.

**`build.ps1` / `check.ps1` show up red in Settings**
Those two are **not** part of the Steamworks SDK — they are this tool's own build / validation logic. The installer ships a copy and writes it into `tools\ContentBuilder` on startup, SDK-path change, and before any check or upload (existing files are never overwritten, so your edits survive). If the directory is read-only or the write fails, Settings shows an "Install/repair scripts" button that writes the bundled version back.

**"Upload for real" finished but nothing was uploaded**
Check whether `"preview"` in the app vdf is `1`. That value is now driven by the button (clicking Upload for real forces it to 0), but be aware if you hand-edited the script.

**Self-check says "the script referenced by Depot … does not exist"**
The depot path in the app vdf is wrong. Both absolute paths and bare filenames are supported.

**A to-do item says "Depot X uploads … which is not inside the project folder"**
That Depot's content root sits outside the project folder (commonly because it points at `Downloads`). If that's intentional, click Ignore; otherwise fix the content root on the Depot card.

---

## Feedback

Bugs and feature requests: open an [issue](https://github.com/yingyu4451/SteamSDK-Tool/issues).
