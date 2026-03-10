// Background service worker for BBB Playback Enhancer
// Handles communication between popup and content scripts
// Also bridges Native Messaging for bbb-dl downloads

const NATIVE_HOST = "com.bbbtool.downloader";

// ---- Download session state (persists across popup open/close) ----
let dlSession = {
    active: false,
    phase: '',
    pct: 0,
    fps: '',
    logs: [],
    url: '',
    done: false,
    success: false,
    doneText: ''
};

// Batch download state
let batchSession = {
    active: false,
    urls: [],
    currentIndex: 0,
    phase: '',
    pct: 0,
    fps: '',
    logs: [],
    done: false,
    success: false,
    doneText: ''
};

function resetDlSession() {
    dlSession = { active: false, phase: '', pct: 0, fps: '', logs: [], url: '', done: false, success: false, doneText: '' };
}

function resetBatchSession() {
    batchSession = { active: false, urls: [], currentIndex: 0, phase: '', pct: 0, fps: '', logs: [], done: false, success: false, doneText: '' };
}

function updateDlSession(data) {
    if (!data) return;
    if (data.type === 'phase') {
        dlSession.phase = data.text;
    } else if (data.type === 'progress') {
        const { current, total, fps, time } = data;
        if (total > 0) dlSession.pct = Math.min(100, Math.round((current / total) * 100));
        if (fps && time) dlSession.fps = `Frame ${current} | ${fps} FPS | ${time}`;
        else if (total > 0) dlSession.fps = `Frame ${current} / ${total}`;
    } else if (data.type === 'log') {
        if (dlSession.logs.length < 500) dlSession.logs.push(data.text);
    } else if (data.type === 'done') {
        dlSession.active = false;
        dlSession.done = true;
        dlSession.success = data.success;
        dlSession.doneText = data.text || '';
        if (data.success) { dlSession.phase = 'Download complete'; dlSession.pct = 100; }
        else dlSession.phase = 'Failed';
    } else if (data.type === 'error') {
        dlSession.active = false;
        dlSession.done = true;
        dlSession.success = false;
        dlSession.doneText = data.text || '';
        if (dlSession.logs.length < 500) dlSession.logs.push('Error: ' + (data.text || ''));
    }
}

function updateBatchSession(data) {
    if (!data) return;
    if (data.type === 'phase') {
        batchSession.phase = data.text;
    } else if (data.type === 'progress') {
        const { current, total, fps, time } = data;
        if (total > 0) batchSession.pct = Math.min(100, Math.round((current / total) * 100));
        if (fps && time) batchSession.fps = `Frame ${current} | ${fps} FPS | ${time}`;
        else if (total > 0) batchSession.fps = `Frame ${current} / ${total}`;
    } else if (data.type === 'log') {
        if (batchSession.logs.length < 500) batchSession.logs.push(data.text);
    } else if (data.type === 'done') {
        if (data.success) {
            batchSession.pct = 100;
            batchSession.currentIndex++;
            if (batchSession.currentIndex < batchSession.urls.length) {
                // Start next URL in batch
                startBatchNext();
                return;
            }
        }
        batchSession.active = false;
        batchSession.done = true;
        batchSession.success = data.success;
        batchSession.doneText = data.success
            ? `Batch complete: ${batchSession.urls.length} files downloaded`
            : (data.text || 'Batch download failed');
        batchSession.phase = data.success ? 'Batch complete' : 'Failed';
    } else if (data.type === 'error') {
        batchSession.active = false;
        batchSession.done = true;
        batchSession.success = false;
        batchSession.doneText = data.text || '';
    }
}

function startNativeDownload(url, outputDir, flags, sessionUpdater) {
    let port;
    try {
        port = chrome.runtime.connectNative(NATIVE_HOST);
    } catch (e) {
        sessionUpdater({ type: 'error', text: 'Native host connection failed: ' + e.message });
        broadcastUpdate(sessionUpdater === updateDlSession ? 'downloadUpdate' : 'batchUpdate',
            { type: 'error', text: 'Native host connection failed: ' + e.message });
        return false;
    }

    port.onMessage.addListener((hostMsg) => {
        sessionUpdater(hostMsg);
        broadcastUpdate(sessionUpdater === updateDlSession ? 'downloadUpdate' : 'batchUpdate', hostMsg);
    });

    port.onDisconnect.addListener(() => {
        const err = chrome.runtime.lastError;
        const msg = {
            type: 'done',
            success: false,
            text: err ? `Connection lost: ${err.message}` : 'Native host connection closed.'
        };
        sessionUpdater(msg);
        broadcastUpdate(sessionUpdater === updateDlSession ? 'downloadUpdate' : 'batchUpdate', msg);
    });

    port.postMessage({ action: 'download', url, outputDir, flags });
    return true;
}

function broadcastUpdate(action, data) {
    chrome.runtime.sendMessage({ action, data }).catch(() => { });
}

function startBatchNext() {
    const idx = batchSession.currentIndex;
    const url = batchSession.urls[idx];
    batchSession.phase = `Downloading ${idx + 1} of ${batchSession.urls.length}`;
    batchSession.pct = 0;
    batchSession.fps = '';
    broadcastUpdate('batchUpdate', { type: 'phase', text: batchSession.phase });
    startNativeDownload(url, '', batchSession.flags || [], updateBatchSession);
}

// ---- Message handler ----

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getActiveTab') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                sendResponse({ tabId: tabs[0].id, url: tabs[0].url });
            } else {
                sendResponse({ error: 'No active tab' });
            }
        });
        return true;
    }

    // ---- Download tab trigger (from content script download button) ----
    if (message.action === 'openDownloadTab') {
        chrome.storage.session.set({ openDownloadTab: true }).catch(() => { });
        if (chrome.action && chrome.action.openPopup) {
            chrome.action.openPopup().catch(() => { });
        }
        sendResponse({ ok: true });
        return true;
    }

    // ---- Get current download session state ----
    if (message.action === 'getDlSession') {
        sendResponse(dlSession);
        return true;
    }

    // ---- Get current batch session state ----
    if (message.action === 'getBatchSession') {
        sendResponse(batchSession);
        return true;
    }

    // ---- Start single download ----
    if (message.action === 'startDownload') {
        const { url, outputDir, flags } = message;
        resetDlSession();
        dlSession.active = true;
        dlSession.url = url;
        dlSession.phase = 'Starting...';

        const ok = startNativeDownload(url, outputDir || '', flags || [], updateDlSession);
        if (!ok) {
            sendResponse({ error: 'Native host connection failed. Did you run bbb_dl_setup.bat?' });
        } else {
            sendResponse({ ok: true });
        }
        return true;
    }

    // ---- Start batch download ----
    if (message.action === 'startBatch') {
        const { urls, flags } = message;
        if (!urls || urls.length === 0) {
            sendResponse({ error: 'No URLs provided' });
            return true;
        }
        resetBatchSession();
        batchSession.active = true;
        batchSession.urls = urls;
        batchSession.flags = flags || [];
        batchSession.currentIndex = 0;
        startBatchNext();
        sendResponse({ ok: true });
        return true;
    }

    // ---- Reset download session ----
    if (message.action === 'resetDlSession') {
        resetDlSession();
        sendResponse({ ok: true });
        return true;
    }

    // ---- Reset batch session ----
    if (message.action === 'resetBatchSession') {
        resetBatchSession();
        sendResponse({ ok: true });
        return true;
    }

    // ---- Ping native host ----
    if (message.action === 'pingNativeHost') {
        let port;
        try {
            port = chrome.runtime.connectNative(NATIVE_HOST);
        } catch (e) {
            sendResponse({ ok: false, error: e.message });
            return true;
        }

        port.onMessage.addListener((msg) => {
            sendResponse({ ok: true, text: msg.text });
            port.disconnect();
        });

        port.onDisconnect.addListener(() => {
            const err = chrome.runtime.lastError;
            sendResponse({ ok: false, error: err ? err.message : 'Connection failed' });
        });

        port.postMessage({ action: 'ping' });
        return true;
    }
});

// Handle extension icon click when popup is not available
chrome.action.onClicked.addListener((tab) => {
    // This only fires if there's no popup defined
});
