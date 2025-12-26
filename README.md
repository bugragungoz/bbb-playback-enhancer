# BBB Playback Enhancer

Browser extension for BigBlueButton playback pages. Provides modern media controls with Material You design.

## Features

- YouTube-style media control interface
- Keyboard shortcuts for playback control
- Variable playback speed (0.25x - 16x)
- Popup media controls
- Lesson start/end markers for skipping empty portions
- Progress bar with seek preview
- Instant UI load (no flash of default interface)

## Installation

1. Clone or download this repository
2. Open `chrome://extensions` (Chrome/Edge) or `about:addons` (Firefox)
3. Enable Developer mode
4. Click "Load unpacked" and select the extension folder

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Space / K | Play/Pause |
| ← / → | Seek -/+ 5 seconds |
| J / L | Seek -/+ 10 seconds |
| ↑ / ↓ | Volume +/- 10% |
| M | Mute/Unmute |
| F | Toggle fullscreen |
| < / > | Decrease/Increase speed |
| 0-9 | Seek to 0%-90% |

## Lesson Markers

Mark lesson start and end points to skip empty portions at the beginning and end of recordings:

- Open popup menu by clicking extension icon
- Click "Ders Başı" to mark where lesson content starts
- Click "Ders Sonu" to mark where lesson content ends
- Markers are saved per video URL in localStorage
- Click on markers in progress bar to jump to that position

## Supported Sites

The extension activates on BigBlueButton playback URLs:

- `*://*bbb*.*/playback/*`
- `*.bigbluebutton.org/playback/*`
- `*/playback/presentation/*`

## Technical Details

- Manifest V3 Chrome extension
- Content script injects custom UI over default BBB player
- Service worker handles popup-content script communication
- Material You (Material 3) pastel color theme
- localStorage for persistent marker storage

## Files

```
├── manifest.json      # Extension configuration
├── content.js         # Main content script
├── styles.css         # UI styles
├── popup.html         # Popup interface
├── popup.css          # Popup styles
├── popup.js           # Popup logic
├── background.js      # Service worker
└── icons/
    ├── icon.svg       # Source icon
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## License

MIT
