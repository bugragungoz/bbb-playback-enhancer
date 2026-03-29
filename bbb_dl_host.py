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
import atexit
import signal
from urllib.parse import urlsplit, urlunsplit, parse_qs, urlencode

MAX_LOG_LINE_LENGTH = 200
SUBPROCESS_KILL_TIMEOUT = 3

# Global reference to the running subprocess, for cleanup on exit
_current_process = None

def _cleanup():
    """Kill the bbb-dl subprocess if it is still running when the host exits."""
    p = _current_process
    if p and p.poll() is None:
        try:
            p.terminate()
            p.wait(timeout=SUBPROCESS_KILL_TIMEOUT)
        except Exception:
            try:
                p.kill()
            except Exception:
                pass

atexit.register(_cleanup)

# Also handle SIGTERM (sent by Chrome on port disconnect)
def _sigterm_handler(signum, frame):
    _cleanup()
    sys.exit(0)

try:
    signal.signal(signal.SIGTERM, _sigterm_handler)
except (OSError, ValueError):
    pass  # signal not available on this platform

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
    r'Partition finished|'
    r'Downloading:|'
    r'Setting up|'
    r'Launch headless|'
    r'goto URL|'
    r'waitForSelector|'
    r'scrollTo|'
    r'evaluate|'
    r'screenshot|'
    r'close page|'
    r'Chromium|'
    r'Using |'
    r'\[headless|'
    r'Fetching|'
    r'Saving |'
    r'Processing |'
    r'Extracting )'
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

# ----- URL Normalization -----

def normalize_bbb_playback_url(url: str) -> str:
    """
    Normalize BBB playback URL variants for bbb-dl.
    Converts:
      .../playback/presentation/<ver>/<meetingId>
    to:
      .../playback/presentation/<ver>/playback.html?meetingId=<meetingId>
    """
    if not url:
        return url

    raw = url.strip()
    try:
        parts = urlsplit(raw)
    except ValueError:
        return raw

    if not parts.scheme or not parts.netloc:
        return raw

    path = parts.path or ""
    path_lower = path.lower()
    if "/playback/presentation/" not in path_lower:
        return raw

    query = parse_qs(parts.query, keep_blank_values=True)
    existing = query.get("meetingId", [])
    # Keep already-populated meetingId; intentionally replace blank meetingId values.
    if existing and any(v.strip() for v in existing):
        return raw

    segments = [seg for seg in path.split("/") if seg]
    if not segments:
        return raw

    meeting_id = segments[-1]
    if meeting_id.lower() == "playback.html":
        return raw

    prefix_segments = segments[:-1]
    if not prefix_segments:
        return raw
    absolute_path = path.startswith("/")
    if absolute_path:
        base_path = "/" + "/".join(prefix_segments) + "/playback.html"
    else:
        base_path = "/".join(prefix_segments) + "/playback.html"
    query["meetingId"] = [meeting_id]

    return urlunsplit((
        parts.scheme,
        parts.netloc,
        base_path,
        urlencode(query, doseq=True),
        parts.fragment
    ))

# ----- Download -----

def run_download(url: str, output_dir: str, extra_flags: list = None, emit_done: bool = True):
    global _current_process
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
    else:
        command = [sys.executable, "-m", "bbb_dl"] + extra_flags + ["--output-dir", output_dir, url]

    frame_total = 0  # learned from capture phase, reused for encode phase

    success = False
    done_text = "Unknown error."

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
        _current_process = process

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

            # --- General log (skip raw spinner and verbose lines) ---
            if clean.startswith("[K") or ("/ 015 Parts" in clean):
                continue
            # Skip very long lines (typically raw data or base64 content)
            if len(clean) > MAX_LOG_LINE_LENGTH:
                continue

            send_message({"type": "log", "text": clean})

        process.wait()

        if process.returncode == 0:
            success = True
            done_text = f"Download complete. Output: {output_dir}"
        else:
            done_text = f"bbb-dl exited with code {process.returncode}"

    except FileNotFoundError:
        done_text = "bbb-dl not found. Run bbb_dl_setup.bat again."
    except Exception as e:
        done_text = f"Error: {e}"
    finally:
        _current_process = None

    if emit_done:
        send_message({"type": "done", "success": success, "text": done_text})

    return success, done_text


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
            normalized_url = normalize_bbb_playback_url(url)
            if normalized_url != url:
                send_message({"type": "log", "text": "Normalized BBB playback URL format."})
            result = {"success": False, "text": "Unknown error."}

            def _download_with_fallback():
                send_message({"type": "log", "text": f"Starting: {normalized_url}"})
                success, text = run_download(normalized_url, output_dir, extra_flags, emit_done=False)
                if (not success) and normalized_url != url:
                    send_message({"type": "log", "text": "Retrying with original BBB playback URL format."})
                    send_message({"type": "log", "text": f"Retrying: {url}"})
                    success, text = run_download(url, output_dir, extra_flags, emit_done=False)
                result["success"] = success
                result["text"] = text

            thread = threading.Thread(target=_download_with_fallback, daemon=True)
            thread.start()
            thread.join()
            send_message({"type": "done", "success": result["success"], "text": result["text"]})

        elif action == "ping":
            bbb = find_bbb_dl()
            send_message({"type": "pong", "text": f"Host ready. bbb-dl: {bbb or 'NOT FOUND'}"})

        else:
            send_message({"type": "error", "text": f"Unknown action: {action}"})


if __name__ == "__main__":
    main()
