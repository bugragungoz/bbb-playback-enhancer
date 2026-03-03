# BBB Playback Enhancer

<img src="icons/icon128.png" alt="BBB Playback Enhancer" width="64">

Browser extension for BigBlueButton playback pages. Provides modern media controls and one-click recording downloads with real-time progress tracking.

## Features

**Control tab** (always on BBB pages)
- YouTube-style media control bar with seek, volume, fullscreen
- Variable playback speed (0.25x – 16x) via the speed menu
- Progress bar with seek-to-position and hover tooltip
- Keyboard shortcuts (see table below)
- Download button in the control bar — one click opens the Download tab

**Download tab** (requires one-time setup)
- Downloads any BBB recording as MP4 via [bbb-dl](https://github.com/C0D3D3V/bbb-dl)
- Presets: **720p**, **1080p**, **480p** — slides + audio, webcam excluded
- Simulated + real-time progress bar with phase labels
- Output: `C:\croxz\`

## Requirements

| Component | Notes |
|-----------|-------|
| Python 3.9+ | Must be on PATH — `python --version` should work |
| pip | Comes with Python |
| Brave / Chrome | Any Chromium-based browser |
| Windows | Native messaging setup is Windows-specific |
| ffmpeg | **Automatically installed** by bbb-dl / Playwright — you don't need to install it manually |

> **You do not need to install ffmpeg, Playwright, or bbb-dl yourself.** The setup script handles everything.

## Installation

### Step 1 — Load the extension
1. Open `brave://extensions` (or `chrome://extensions`)
2. Enable **Developer mode** (top-right toggle)
3. Click **"Load unpacked"** → select this folder
4. Copy the 32-character **Extension ID** shown under the extension name

### Step 2 — Run `bbb_dl_setup.bat` (one time, no admin needed)

Double-click `bbb_dl_setup.bat`. It will:
- Install `bbb-dl` via pip (and its dependencies: Playwright, ffmpeg, python-ffmpeg)
- Download Playwright's Chromium browser (used internally by bbb-dl to capture slides)
- Create the output folder `C:\croxz\`
- Register the **native messaging host** in the Windows registry — this is what allows the extension to call Python scripts
- Ask for your Extension ID to finalize the setup

After setup, reload the extension in the browser (click the reload icon).

## Usage

1. Open any BBB recording page
2. Use the control bar at the bottom for playback
3. Click the **download icon** ( ↓ ) in the control bar, or switch to the **Download tab** in the popup
4. Select a preset (720p recommended) and click **Download**
5. The file will be saved to `C:\croxz\`

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Space / K | Play/Pause |
| ← / → | Seek -/+ 10 seconds |
| J / L | Seek -/+ 10 seconds |
| ↑ / ↓ | Volume +/- 10% |
| M | Mute/Unmute |
| F | Toggle fullscreen |
| < / > | Decrease/Increase speed |
| 0–9 | Seek to 0%–90% |

## Supported Sites

- `*://*/playback/presentation/*`
- `*://*.bigbluebutton.org/playback/*`

## Files

```
├── manifest.json          # Extension config (Manifest V3)
├── content.js             # BBB player UI injection + custom control bar
├── styles.css             # Player styles
├── popup.html/css/js      # Popup interface (Control + Download tabs)
├── background.js          # Service worker: native messaging bridge + tab flag
├── bbb_dl_host.py         # Python native messaging host (runs bbb-dl)
├── bbb_dl_setup.bat       # One-time Windows setup script
└── icons/
```

## Credits

The download feature uses **[bbb-dl](https://github.com/C0D3D3V/bbb-dl)** by [C0D3D3V](https://github.com/C0D3D3V) — a powerful tool for downloading BigBlueButton recordings. This extension provides a browser-integrated UI on top of it via Chrome Native Messaging.

## License

MIT
