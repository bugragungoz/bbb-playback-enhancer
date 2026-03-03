#!/usr/bin/env python3
"""
BBB-DL Native Messaging Host
Bridge between Brave/Chrome extension and bbb-dl.
Protocol: 4-byte LE length prefix + JSON body.
"""

import sys
import json
import struct
import subprocess
import threading
import os
import re
import shutil
import sysconfig

# ----- Protocol -----

def send_message(msg: dict):
    encoded = json.dumps(msg, ensure_ascii=False).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()

def read_message() -> dict:
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length or len(raw_length) < 4:
        return {}
    length = struct.unpack("<I", raw_length)[0]
    data = sys.stdin.buffer.read(length)
    return json.loads(data.decode("utf-8"))

# ----- ANSI / Control Code Stripping -----

_ANSI_RE = re.compile(
    r'\x1b\[[0-9;]*[A-Za-z]'   # ESC[ sequences
    r'|\[K'                      # [K clear-to-EOL
    r'|\[[0-9;]+m'              # bare [1;37m style
    r'|\[0m'                    # bare reset
    r'|\r'                       # carriage return
)

def strip_ansi(text: str) -> str:
    return _ANSI_RE.sub('', text).strip()

# ----- Line Classification -----

_CAPTURE_PROGRESS = re.compile(r'Done:\s*(\d+)\s*/\s*(\d+)\s*Frames')
_ENCODE_PROGRESS  = re.compile(r'Frame:\s*(\d+)\s+FPS:\s*([\d.]+).*?Time:\s*([\d:]+)')
_PARTITION        = re.compile(r'(\d+)/(\d+) Partition finished')

# Lines that are pure noise after ANSI strip — skip from log
_NOISE_RE = re.compile(
    r'^(Done:\s*\d+|Frame:\s*\d+|'
    r'\w[\w/]+\.(?:webm|mp4|png|json|xml|html) got \d|'
    r'Partition finished)'
)

_PHASE_MAP = {
    'Downloading meta information':     'Downloading metadata',
    'Downloading webcams':              'Downloading webcam audio',
    'Downloading slides':               'Downloading slides',
    'Start capturing frames':           'Capturing frames (Chromium)',
    'Start creating slideshow':         '[FFMPEG] Encoding video — this may take a few minutes',
    'Mux final slideshow':              '[FFMPEG] Muxing audio into video',
    'BBB-DL finished':                  'Done',
}

# ----- Find bbb-dl Executable -----

def find_bbb_dl() -> str | None:
    found = shutil.which("bbb-dl")
    if found:
        return found
    try:
        user_scripts = sysconfig.get_path("scripts", "nt_user")
        c = os.path.join(user_scripts, "bbb-dl.exe")
        if os.path.exists(c):
            return c
    except Exception:
        pass
    py_scripts = os.path.join(os.path.dirname(sys.executable), "Scripts", "bbb-dl.exe")
    if os.path.exists(py_scripts):
        return py_scripts
    appdata = os.environ.get("APPDATA", "")
    for ver in ["Python314", "Python313", "Python312", "Python311", "Python310", "Python39"]:
        c = os.path.join(appdata, "Python", ver, "Scripts", "bbb-dl.exe")
        if os.path.exists(c):
            return c
    return None

# ----- Download -----

def run_download(url: str, output_dir: str, extra_flags: list = None):
    os.makedirs(output_dir, exist_ok=True)

    if extra_flags is None:
        extra_flags = [
            "--skip-webcam", "--skip-cursor",
            "--force-width", "1280", "--force-height", "720",
            "--preset", "medium", "--crf", "22"
        ]

    bbb_dl_exe = find_bbb_dl()
    if bbb_dl_exe:
        command = [bbb_dl_exe] + extra_flags + ["--output-dir", output_dir, url]
        send_message({"type": "log", "text": f"bbb-dl: {bbb_dl_exe}"})
    else:
        send_message({"type": "log", "text": "bbb-dl not found in PATH, trying python -m bbb_dl..."})
        command = [sys.executable, "-m", "bbb_dl"] + extra_flags + ["--output-dir", output_dir, url]

    send_message({"type": "log", "text": f"Output: {output_dir}"})

    frame_total = 0  # learned from capture phase, reused for encode phase

    try:
        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1
        )

        for raw_line in process.stdout:
            clean = strip_ansi(raw_line)
            if not clean:
                continue

            # --- Capture progress ---
            m = _CAPTURE_PROGRESS.search(clean)
            if m:
                cur, tot = int(m.group(1)), int(m.group(2))
                frame_total = max(frame_total, tot)
                send_message({"type": "progress", "current": cur, "total": tot, "phase": "capture"})
                continue

            # --- Encode/mux progress ---
            m = _ENCODE_PROGRESS.search(clean)
            if m:
                cur, fps, timecode = int(m.group(1)), m.group(2), m.group(3)
                if frame_total > 0:
                    send_message({
                        "type": "progress",
                        "current": cur,
                        "total": frame_total,
                        "phase": "encode",
                        "fps": fps,
                        "time": timecode
                    })
                else:
                    send_message({
                        "type": "progress",
                        "current": cur,
                        "total": 0,
                        "phase": "encode",
                        "fps": fps,
                        "time": timecode
                    })
                continue

            # --- Partition milestone (concise) ---
            m = _PARTITION.search(clean)
            if m:
                send_message({"type": "log", "text": f"Partition {m.group(1)}/{m.group(2)} done"})
                continue

            # --- Phase change ---
            for key, label in _PHASE_MAP.items():
                if key in clean:
                    send_message({"type": "phase", "text": label})
                    break

            # --- Skip noise ---
            if _NOISE_RE.match(clean):
                continue

            # --- All done line ---
            if "All done!" in clean:
                # extract filename if possible
                mp4_match = re.search(r'Final video: (.+\.mp4)', clean)
                file_info = mp4_match.group(1) if mp4_match else output_dir
                send_message({"type": "log", "text": f"Saved: {file_info}"})
                continue

            # --- Took / duration lines (compact) ---
            if "finished and took:" in clean:
                send_message({"type": "log", "text": clean})
                continue

            # --- Recording info ---
            if any(x in clean for x in ["Recording title:", "Recording date:", "Recording duration:"]):
                send_message({"type": "log", "text": clean})
                continue

            # --- General log (skip if it looks like a raw spinner) ---
            if clean.startswith("[K") or ("/ 015 Parts" in clean):
                continue

            send_message({"type": "log", "text": clean})

        process.wait()

        if process.returncode == 0:
            send_message({"type": "done", "success": True,
                          "text": f"Download complete. Output: {output_dir}"})
        else:
            send_message({"type": "done", "success": False,
                          "text": f"bbb-dl exited with code {process.returncode}"})

    except FileNotFoundError:
        send_message({"type": "done", "success": False,
                      "text": "bbb-dl not found. Run bbb_dl_setup.bat again."})
    except Exception as e:
        send_message({"type": "done", "success": False, "text": f"Error: {e}"})


# ----- Main -----

def main():
    while True:
        try:
            msg = read_message()
        except Exception:
            break
        if not msg:
            break

        action = msg.get("action", "")

        if action == "download":
            url = msg.get("url", "").strip()
            output_dir = msg.get("outputDir") or r"C:\croxz"
            extra_flags = msg.get("flags", None)
            if not url:
                send_message({"type": "done", "success": False, "text": "URL cannot be empty."})
                continue
            send_message({"type": "log", "text": f"Starting: {url}"})
            thread = threading.Thread(target=run_download, args=(url, output_dir, extra_flags), daemon=True)
            thread.start()
            thread.join()

        elif action == "ping":
            bbb = find_bbb_dl()
            send_message({"type": "pong", "text": f"Host ready. bbb-dl: {bbb or 'NOT FOUND'}"})

        else:
            send_message({"type": "error", "text": f"Unknown action: {action}"})


if __name__ == "__main__":
    main()
