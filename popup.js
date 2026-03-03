// BBB Playback Enhancer - Popup Script

// ===== CONTROL TAB =====

class PopupController {
    constructor() {
        this.tabId = null;
        this.state = null;
        this.updateInterval = null;
        this.isBBBTab = false;
        this.init();
    }

    async init() {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]) {
            this.tabId = tabs[0].id;
            const url = tabs[0].url || '';
            this.isBBBTab = this.checkIfBBBPage(url);
            if (this.isBBBTab) {
                try {
                    document.getElementById('popup-domain').textContent = new URL(url).hostname;
                } catch (e) {
                    document.getElementById('popup-domain').textContent = 'BBB Playback';
                }
                await this.fetchState();
                this.bindEvents();
                this.startUpdateInterval();
            } else {
                this.showNoVideo('No BBB video found on this page');
            }
        } else {
            this.showNoVideo('No active tab found');
        }
    }

    checkIfBBBPage(url) {
        if (!url) return false;
        return [/bbb.*\/playback/i, /bigbluebutton.*\/playback/i, /\/playback\/presentation/i]
            .some(p => p.test(url));
    }

    async fetchState() {
        if (!this.tabId || !this.isBBBTab) return;
        try {
            const response = await chrome.tabs.sendMessage(this.tabId, { action: 'getState' });
            if (response && !response.error) {
                this.state = response;
                this.updateUI();
            } else {
                this.showNoVideo('Video not loaded yet');
            }
        } catch (error) {
            this.showNoVideo('Video source not found');
        }
    }

    showNoVideo(message) {
        document.querySelector('.popup-container').classList.add('no-video');
        const p = document.querySelector('.popup-no-video p');
        if (p) p.textContent = message;
        if (this.updateInterval) { clearInterval(this.updateInterval); this.updateInterval = null; }
    }

    updateUI() {
        if (!this.state) return;
        document.querySelector('.popup-container').classList.remove('no-video');
        document.getElementById('popup-title').textContent = this.state.title || 'Video';
        const playIcon = document.querySelector('.icon-play');
        const pauseIcon = document.querySelector('.icon-pause');
        if (this.state.isPlaying) { playIcon.style.display = 'none'; pauseIcon.style.display = ''; }
        else { playIcon.style.display = ''; pauseIcon.style.display = 'none'; }
        document.getElementById('popup-current').textContent = this.formatTime(this.state.currentTime);
        document.getElementById('popup-duration').textContent = this.formatTime(this.state.duration);
        if (this.state.duration > 0) {
            document.getElementById('popup-progress-played').style.width =
                `${(this.state.currentTime / this.state.duration) * 100}%`;
        }
        document.getElementById('popup-speed').value = this.state.playbackRate;
    }

    formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    bindEvents() {
        document.getElementById('popup-play').addEventListener('click', () => this.sendAction('togglePlay'));
        document.getElementById('popup-backward').addEventListener('click', () => this.sendAction('seekBackward'));
        document.getElementById('popup-forward').addEventListener('click', () => this.sendAction('seekForward'));
        document.getElementById('popup-speed').addEventListener('change', (e) =>
            this.sendAction('setPlaybackRate', { rate: parseFloat(e.target.value) }));
        document.getElementById('popup-progress').addEventListener('click', (e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            this.sendAction('seek', { time: pct * (this.state?.duration || 0) });
        });
    }

    async sendAction(action, data = {}) {
        if (!this.tabId || !this.isBBBTab) return;
        try {
            await chrome.tabs.sendMessage(this.tabId, { action, ...data });
            setTimeout(() => this.fetchState(), 100);
        } catch (e) { /* tab may have navigated */ }
    }

    startUpdateInterval() {
        this.updateInterval = setInterval(() => this.fetchState(), 500);
    }
}

// ===== DOWNLOAD TAB =====

class DownloadController {
    constructor() {
        this.isDownloading = false;
        this.currentTabUrl = '';
        this.simTimer = null;       // simulated progress timer
        this.simPct = 0;            // current simulated %
        this.init();
    }

    async init() {
        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs[0] && tabs[0].url) {
                this.currentTabUrl = tabs[0].url;
                if (/\/playback\/presentation/i.test(this.currentTabUrl) ||
                    /bbb.*\/playback/i.test(this.currentTabUrl)) {
                    document.getElementById('dl-url').value = this.currentTabUrl;
                }
            }
        } catch (e) { /* ignore */ }
        this.bindEvents();
        this.listenForUpdates();
    }

    bindEvents() {
        document.getElementById('dl-use-current').addEventListener('click', () => {
            if (this.currentTabUrl) document.getElementById('dl-url').value = this.currentTabUrl;
        });
        document.getElementById('dl-start').addEventListener('click', () => this.startDownload());
    }

    listenForUpdates() {
        chrome.runtime.onMessage.addListener((msg) => {
            if (msg.action === 'downloadUpdate') this.handleHostMessage(msg.data);
        });
    }

    handleHostMessage(data) {
        if (!data) return;

        if (data.type === 'log') {
            this.appendLog(data.text);

        } else if (data.type === 'phase') {
            this.setPhase(data.text);

        } else if (data.type === 'progress') {
            this.updateProgress(data);

        } else if (data.type === 'done') {
            this.stopSimProgress(true);
            this.setDownloading(false);
            this.appendLog(data.text || '');
            if (data.success) {
                this.showNotice(data.text, 'success');
                this.setPhase('Download complete');
            } else {
                this.stopSimProgress(false);
                this.setPhase('Failed');
            }

        } else if (data.type === 'error') {
            this.setDownloading(false);
            this.appendLog('Error: ' + (data.text || ''));

        }
    }

    startSimProgress() {
        this.stopSimProgress(false);
        this.simPct = 0;
        let step = 0;
        // ~240s / 0.8s per tick = 300 ticks to reach 99%
        const STEPS = 300;
        this.simTimer = setInterval(() => {
            step++;
            const eased = Math.sqrt(step / STEPS);         // sqrt easing: fast then slow
            this.simPct = Math.min(99, Math.round(eased * 99));
            this.setProgressBar(this.simPct);
        }, 800);
    }

    stopSimProgress(snapTo100 = false) {
        if (this.simTimer) {
            clearInterval(this.simTimer);
            this.simTimer = null;
        }
        if (snapTo100) this.setProgressBar(100);
    }

    setPhase(text) {
        const el = document.getElementById('dl-phase');
        if (el) el.textContent = text;
        document.getElementById('dl-progress-section').style.display = 'flex';
    }

    updateProgress(data) {
        document.getElementById('dl-progress-section').style.display = 'flex';
        const { current, total, phase, fps, time } = data;

        if (total > 0) {
            const pct = Math.min(100, Math.round((current / total) * 100));
            this.setProgressBar(pct);
        }

        // FPS / time info
        const fpsEl = document.getElementById('dl-fps');
        if (fps && time) {
            fpsEl.textContent = `Frame ${current} | ${fps} FPS | ${time}`;
        } else if (total > 0) {
            fpsEl.textContent = `Frame ${current} / ${total}`;
        }

        // Update phase label on first encode line
        if (phase === 'encode' && document.getElementById('dl-phase').textContent.startsWith('[FFMPEG]')) {
            // already set by phase message
        }
    }

    setProgressBar(pct) {
        document.getElementById('dl-bar-fill').style.width = `${pct}%`;
        document.getElementById('dl-pct').textContent = `${pct}%`;
    }

    appendLog(text) {
        if (!text) return;
        const logEl = document.getElementById('dl-log');
        const logWrap = document.getElementById('dl-log-wrap');
        logWrap.style.display = 'flex';
        logEl.textContent += text + '\n';
        logEl.scrollTop = logEl.scrollHeight;
    }

    getPresetFlags() {
        const preset = document.getElementById('dl-preset').value;
        switch (preset) {
            case '1080p': return [
                '--skip-webcam', '--skip-cursor',
                '--force-width', '1920', '--force-height', '1080',
                '--preset', 'medium', '--crf', '20'];
            case '480p': return [
                '--skip-webcam', '--skip-cursor',
                '--force-width', '854', '--force-height', '480',
                '--preset', 'fast', '--crf', '24'];
            default: return [
                '--skip-webcam', '--skip-cursor',
                '--force-width', '1280', '--force-height', '720',
                '--preset', 'medium', '--crf', '22'];
        }
    }

    async startDownload() {
        if (this.isDownloading) return;
        const url = document.getElementById('dl-url').value.trim();
        if (!url) { this.showNotice('Please enter a BBB URL.', 'warn'); return; }

        this.hideNotice();
        this.setDownloading(true);

        // Reset progress UI
        this.stopSimProgress(false);
        this.setProgressBar(0);
        this.setPhase('Starting...');
        document.getElementById('dl-fps').textContent = '';
        document.getElementById('dl-log').textContent = '';
        document.getElementById('dl-log-wrap').style.display = 'none';
        this.startSimProgress();   // begin simulated fill

        try {
            const flags = this.getPresetFlags();
            const resp = await chrome.runtime.sendMessage({
                action: 'startDownload',
                url,
                outputDir: '',
                flags
            });
            if (resp && resp.error) {
                this.setDownloading(false);
                this.showNotice('Connection error: ' + resp.error + '\n\nDid you run bbb_dl_setup.bat?', 'warn');
            }
        } catch (e) {
            this.setDownloading(false);
            this.showNotice('Connection error: ' + e.message, 'warn');
        }
    }

    setDownloading(active) {
        this.isDownloading = active;
        document.getElementById('dl-start').disabled = active;
        document.getElementById('dl-spinner').style.display = active ? 'flex' : 'none';
        document.getElementById('dl-btn-text').textContent = active ? 'Downloading...' : 'Download';
    }

    showNotice(text, type = 'warn') {
        const notice = document.getElementById('dl-notice');
        const span = document.getElementById('dl-notice-text');
        notice.style.display = 'flex';
        span.textContent = text;
        notice.style.background = type === 'success' ? '#003B1F' : '#3B2A00';
        notice.style.color = type === 'success' ? '#60FF9A' : '#FFD060';
    }

    hideNotice() { document.getElementById('dl-notice').style.display = 'none'; }
}

// ===== TAB SWITCHER =====

class TabManager {
    constructor() { this.init(); }

    async init() {
        this.bindTabs();
        // If content-script download button was pressed, open directly on Download tab
        try {
            const result = await chrome.storage.session.get('openDownloadTab');
            if (result && result.openDownloadTab) {
                this.switchTo('download');
                await chrome.storage.session.remove('openDownloadTab');
            }
        } catch (e) { /* storage unavailable, ignore */ }
    }

    bindTabs() {
        document.getElementById('tab-control').addEventListener('click', () => this.switchTo('control'));
        document.getElementById('tab-download').addEventListener('click', () => this.switchTo('download'));
    }
    switchTo(tab) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(`tab-${tab}`).classList.add('active');
        document.getElementById('panel-control').style.display = tab === 'control' ? '' : 'none';
        document.getElementById('panel-download').style.display = tab === 'download' ? '' : 'none';
    }
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
    new TabManager();
    new PopupController();
    new DownloadController();
});
