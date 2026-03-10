# BBB Playback Enhancer

<img src="icons/icon128.png" alt="BBB Playback Enhancer" width="64">

Browser extension for BigBlueButton playback pages. Provides modern media controls and recording downloads with real-time progress tracking.

## Features

**Control tab** - always available on BBB pages
- Custom media control bar with seek, volume, fullscreen
- Variable playback speed (0.25x to 16x)
- Progress bar with seek-to-position and hover tooltip
- Keyboard shortcuts (see table below)
- Download button in the control bar opens the Download tab

**Download tab** - requires one-time setup
- Downloads any BBB recording as MP4 via [bbb-dl](https://github.com/C0D3D3V/bbb-dl)
- Presets: 720p, 1080p, 480p (slides + audio, webcam excluded)
- Real-time progress bar with phase labels
- Download state persists across popup open/close

**Batch download tab**
- Upload a .txt file containing recording URLs (one per line, or comma/semicolon separated)
- Or type/paste URLs directly into the textarea
- Same preset options and progress tracking as single download

## Requirements

| Component | Notes |
|-----------|-------|
| Python 3.9+ | Must be on PATH (`python --version` should work) |
| pip | Included with Python |
| Brave / Chrome | Any Chromium-based browser |
| Windows | Native messaging setup is Windows-specific |

ffmpeg, Playwright, and bbb-dl are all installed automatically by the setup script.

## Installation

This extension has two parts: the browser extension itself and a local Python bridge that handles the actual downloading. Both must be set up.

### Step 1 - Load the extension

1. Open `brave://extensions` (or `chrome://extensions`)
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select this folder
4. Copy the 32-character **Extension ID** shown under the extension name

After this step you will have media controls on BBB pages, but downloads will not work until Step 2 is complete.

### Step 2 - Run the setup script

Double-click `bbb_dl_setup.bat`. This is required for the download feature to work. The script runs in user space (no admin privileges needed) and does the following:

1. Verifies Python is installed and on PATH
2. Installs `bbb-dl` via pip (the tool that actually downloads BBB recordings)
3. Installs Playwright Chromium (used internally by bbb-dl to capture slide frames)
4. Creates the output directory `C:\croxz\`
5. Generates a native messaging host manifest and wrapper script
6. Registers the native messaging host in the Windows registry under `HKCU` (current user only)
7. Asks for your Extension ID to authorize communication between the browser and the Python bridge

**What the script registers:** A JSON manifest file that tells the browser where the Python host script is. The browser launches this script on demand when you click Download. It runs locally, communicates over stdin/stdout, and has no network access beyond what bbb-dl needs.

After the script completes, reload the extension in the browser (click the reload icon on the extensions page).

### Common issues

**"bbb-dl not found"** - Close and reopen your terminal after running the setup script. The PATH update requires a new terminal session.

**Download button does nothing** - You likely skipped Step 2. The download feature requires the native messaging host to be registered. Run `bbb_dl_setup.bat`.

**"Native host connection failed"** - Re-run `bbb_dl_setup.bat` and make sure you entered the correct Extension ID. The ID changes if you remove and re-add the extension.

**Python not found** - Install Python from https://python.org/downloads and check "Add to PATH" during installation.

## Usage

1. Open any BBB recording page
2. Use the control bar at the bottom for playback
3. Click the download icon in the control bar, or switch to the Download tab in the popup
4. Select a preset (720p recommended) and click Download
5. Output is saved to `C:\croxz\`

For batch downloads, switch to the Batch tab, upload a .txt file with recording URLs (one per line or comma-separated), and click Download All. Files are processed sequentially. You can also paste URLs directly into the textarea.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Space / K | Play/Pause |
| Left / Right | Seek -/+ 10 seconds |
| Up / Down | Volume +/- 10% |
| M | Mute/Unmute |
| F | Toggle fullscreen |
| < / > | Decrease/Increase speed |
| 0-9 | Seek to 0% to 90% |

## Supported Sites

- `*://*/playback/presentation/*`
- `*://*.bigbluebutton.org/playback/*`

## Files

```
manifest.json          Extension config (Manifest V3)
content.js             BBB player UI injection + custom control bar
styles.css             Player styles
popup.html/css/js      Popup interface (Control + Download + Batch tabs)
background.js          Service worker: native messaging bridge + session state
bbb_dl_host.py         Python native messaging host (runs bbb-dl)
bbb_dl_setup.bat       One-time Windows setup script
icons/                 Extension icons
```

## Credits

The download feature uses [bbb-dl](https://github.com/C0D3D3V/bbb-dl) by [C0D3D3V](https://github.com/C0D3D3V) for downloading BigBlueButton recordings. This extension provides a browser-integrated UI on top of it via Chrome Native Messaging.

The UI follows the [Anthropic brand palette](https://anthropic.com) as design inspiration: dark `#141413`, cream `#faf9f5`, orange accent `#d97757`, with Poppins and Lora typography. Not affiliated with or endorsed by Anthropic.

## License

MIT
