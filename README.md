# BBB Playback Enhancer

<img src="icons/icon128.png" alt="BBB Playback Enhancer" width="64">

Browser extension for BigBlueButton playback pages. Provides modern media controls and one-click recording downloads via bbb-dl.

## Features

- YouTube-style media control interface (Control tab)
- Variable playback speed (0.25x – 16x)
- Progress bar with seek support
- **BBB-DL Download tab**: download any BBB recording as MP4 with real-time progress
  - Presets: 720p / 1080p / 480p (slides + audio, no webcam)
  - Live phase indicator and progress bar during download and encoding
  - Output: `C:\croxz\`

## Installation

### 1. Load the extension
1. Open `brave://extensions` (or `chrome://extensions`)
2. Enable **Developer mode**
3. Click **"Load unpacked"** → select this folder
4. Copy the 32-character **Extension ID**

### 2. Run the setup script (one time)
```bat
bbb_dl_setup.bat
```
- Installs `bbb-dl` and Playwright Chromium
- Registers the native messaging host in the Windows registry (no admin needed)
- Prompts for your Extension ID

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Space / K | Play/Pause |
| ← / → | Seek -/+ 5 seconds |
| J / L | Seek -/+ 10 seconds |
| < / > | Decrease/Increase speed |
| 0–9 | Seek to 0%–90% |

## Supported Sites

- `*://bbb*/playback/*`
- `*/playback/presentation/*`

## Files

```
├── manifest.json          # Extension config (Manifest V3)
├── content.js             # BBB player UI injection
├── styles.css             # Player styles
├── popup.html/css/js      # Popup interface (Control + Download tabs)
├── background.js          # Native messaging bridge
├── bbb_dl_host.py         # Python native messaging host
├── bbb_dl_setup.bat       # One-time Windows setup script
└── icons/
```

## Requirements

- Python 3.9+ on PATH
- Brave or Chrome browser
- Windows (native messaging setup is Windows-specific)

## License

MIT
