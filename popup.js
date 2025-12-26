// BBB Playback Enhancer - Popup Script

class PopupController {
    constructor() {
        this.tabId = null;
        this.state = null;
        this.updateInterval = null;
        this.init();
    }

    async init() {
        // Get active tab
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]) {
            this.tabId = tabs[0].id;
            const url = new URL(tabs[0].url);
            document.getElementById('popup-domain').textContent = url.hostname;
        }

        // Initial state fetch
        await this.fetchState();

        // Bind events
        this.bindEvents();

        // Start update interval
        this.startUpdateInterval();
    }

    async fetchState() {
        if (!this.tabId) {
            this.showNoVideo();
            return;
        }

        try {
            const response = await chrome.tabs.sendMessage(this.tabId, { action: 'getState' });
            if (response) {
                this.state = response;
                this.updateUI();
            } else {
                this.showNoVideo();
            }
        } catch (error) {
            console.log('Cannot communicate with content script:', error);
            this.showNoVideo();
        }
    }

    showNoVideo() {
        document.querySelector('.popup-container').classList.add('no-video');
    }

    updateUI() {
        if (!this.state) return;

        // Title
        const title = this.state.title || 'Video';
        document.getElementById('popup-title').textContent = title;

        // Play/Pause button
        const playIcon = document.querySelector('.icon-play');
        const pauseIcon = document.querySelector('.icon-pause');
        if (this.state.isPlaying) {
            playIcon.style.display = 'none';
            pauseIcon.style.display = '';
        } else {
            playIcon.style.display = '';
            pauseIcon.style.display = 'none';
        }

        // Time
        document.getElementById('popup-current').textContent = this.formatTime(this.state.currentTime);
        document.getElementById('popup-duration').textContent = this.formatTime(this.state.duration);

        // Progress
        if (this.state.duration > 0) {
            const percent = (this.state.currentTime / this.state.duration) * 100;
            document.getElementById('popup-progress-played').style.width = `${percent}%`;
        }

        // Speed
        const speedSelect = document.getElementById('popup-speed');
        speedSelect.value = this.state.playbackRate;

        // Markers
        if (this.state.markers) {
            this.updateMarkers(this.state.markers);
        }
    }

    updateMarkers(markers) {
        const duration = this.state.duration;
        if (!duration) return;

        const startMarker = document.getElementById('popup-marker-start');
        const endMarker = document.getElementById('popup-marker-end');
        const startBtn = document.getElementById('popup-set-start');
        const endBtn = document.getElementById('popup-set-end');

        // Start marker
        if (markers.start !== null && markers.start !== undefined) {
            const startPercent = (markers.start / duration) * 100;
            startMarker.style.left = `${startPercent}%`;
            startMarker.style.display = 'block';
            startMarker.title = `Ders Başı: ${this.formatTime(markers.start)}`;
            startBtn.classList.add('active');
        } else {
            startMarker.style.display = 'none';
            startBtn.classList.remove('active');
        }

        // End marker
        if (markers.end !== null && markers.end !== undefined) {
            const endPercent = (markers.end / duration) * 100;
            endMarker.style.left = `${endPercent}%`;
            endMarker.style.display = 'block';
            endMarker.title = `Ders Sonu: ${this.formatTime(markers.end)}`;
            endBtn.classList.add('active');
        } else {
            endMarker.style.display = 'none';
            endBtn.classList.remove('active');
        }
    }

    formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    bindEvents() {
        // Play/Pause
        document.getElementById('popup-play').addEventListener('click', () => {
            this.sendAction('togglePlay');
        });

        // Seek
        document.getElementById('popup-backward').addEventListener('click', () => {
            this.sendAction('seekBackward');
        });

        document.getElementById('popup-forward').addEventListener('click', () => {
            this.sendAction('seekForward');
        });

        // Speed
        document.getElementById('popup-speed').addEventListener('change', (e) => {
            this.sendAction('setPlaybackRate', { rate: parseFloat(e.target.value) });
        });

        // Progress bar click
        document.getElementById('popup-progress').addEventListener('click', (e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            const time = percent * (this.state?.duration || 0);
            this.sendAction('seek', { time: time });
        });

        // Set markers
        document.getElementById('popup-set-start').addEventListener('click', () => {
            this.sendAction('setMarker', { type: 'start' });
        });

        document.getElementById('popup-set-end').addEventListener('click', () => {
            this.sendAction('setMarker', { type: 'end' });
        });

        // Click on markers to jump
        document.getElementById('popup-marker-start').addEventListener('click', (e) => {
            e.stopPropagation();
            this.sendAction('jumpToMarker', { marker: 'start' });
        });

        document.getElementById('popup-marker-end').addEventListener('click', (e) => {
            e.stopPropagation();
            this.sendAction('jumpToMarker', { marker: 'end' });
        });
    }

    async sendAction(action, data = {}) {
        if (!this.tabId) return;

        try {
            await chrome.tabs.sendMessage(this.tabId, { action, ...data });
            // Refresh state after action
            setTimeout(() => this.fetchState(), 100);
        } catch (error) {
            console.log('Failed to send action:', error);
        }
    }

    startUpdateInterval() {
        // Update every 500ms
        this.updateInterval = setInterval(() => this.fetchState(), 500);
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new PopupController();
});
