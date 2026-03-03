// Background service worker for BBB Playback Enhancer
// Handles communication between popup and content scripts
// Also bridges Native Messaging for bbb-dl downloads

const NATIVE_HOST = "com.bbbtool.downloader";

// ---- Existing: Active Tab Helper ----

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

    // ---- New: Start BBB-DL download ----
    if (message.action === 'startDownload') {
        const { url, outputDir, flags } = message;

        let port;
        try {
            port = chrome.runtime.connectNative(NATIVE_HOST);
        } catch (e) {
            sendResponse({ error: 'Native host bağlanamadı: ' + e.message });
            return true;
        }

        // Forward messages from host back to popup
        port.onMessage.addListener((hostMsg) => {
            chrome.runtime.sendMessage({ action: 'downloadUpdate', data: hostMsg })
                .catch(() => { }); // popup kapanmış olabilir
        });

        port.onDisconnect.addListener(() => {
            const err = chrome.runtime.lastError;
            chrome.runtime.sendMessage({
                action: 'downloadUpdate',
                data: {
                    type: 'done',
                    success: false,
                    text: err
                        ? `❌ Bağlantı koptu: ${err.message}`
                        : '❌ Native host bağlantısı kapandı.'
                }
            }).catch(() => { });
        });

        // Send the download command with preset flags
        port.postMessage({ action: 'download', url, outputDir, flags });
        sendResponse({ ok: true });
        return true;
    }

    // ---- New: Ping native host (kurulum kontrolü) ----
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
            sendResponse({ ok: false, error: err ? err.message : 'Bağlantı başarısız' });
        });

        port.postMessage({ action: 'ping' });
        return true;
    }
});

// Handle extension icon click when popup is not available
chrome.action.onClicked.addListener((tab) => {
    // This only fires if there's no popup defined
});
