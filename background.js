// Background service worker for BBB Playback Enhancer
// Handles communication between popup and content scripts

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getActiveTab') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                sendResponse({ tabId: tabs[0].id, url: tabs[0].url });
            } else {
                sendResponse({ error: 'No active tab' });
            }
        });
        return true; // Keep channel open for async response
    }
});

// Handle extension icon click when popup is not available
chrome.action.onClicked.addListener((tab) => {
    // This only fires if there's no popup defined
    // With popup defined, this won't be called
});
