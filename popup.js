// BBB Playback Enhancer - Popup Script

class PopupController {
    constructor() {
        this.tabId = null;
        this.state = null;
        this.updateInterval = null;
        this.isBBBTab = false;
        this.init();
    }

    async init() {
        // Get active tab
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]) {
            this.tabId = tabs[0].id;
            const url = tabs[0].url || '';

            // Check if this is a BBB playback page
            this.isBBBTab = this.checkIfBBBPage(url);

            if (this.isBBBTab) {
                try {
                    const hostname = new URL(url).hostname;
                    document.getElementById('popup-domain').textContent = hostname;
                } catch (e) {
                    document.getElementById('popup-domain').textContent = 'BBB Playback';
                }

                // Try to fetch state
                await this.fetchState();

                // Bind events
                this.bindEvents();

                // Start update interval
                this.startUpdateInterval();
            } else {
                // Not a BBB page
                this.showNoVideo('Bu sayfada BBB video bulunamadı');
            }
        } else {
            this.showNoVideo('Aktif sekme bulunamadı');
        }
    }

    checkIfBBBPage(url) {
        if (!url) return false;

        // Check for BBB playback URLs
        const bbbPatterns = [
            /bbb.*\/playback/i,
            /bigbluebutton.*\/playback/i,
            /\/playback\/presentation/i
        ];

        return bbbPatterns.some(pattern => pattern.test(url));
    }

    async fetchState() {
        if (!this.tabId || !this.isBBBTab) {
            return;
        }

        try {
            const response = await chrome.tabs.sendMessage(this.tabId, { action: 'getState' });
            if (response && !response.error) {
                this.state = response;
                this.updateUI();
            } else {
                this.showNoVideo('Video henüz yüklenmedi');
            }
        } catch (error) {
            console.log('Cannot communicate with content script:', error);
            this.showNoVideo('Video kaynağı bulunamadı');
        }
    }

    showNoVideo(message = 'Video kaynağı bulunamadı') {
        document.querySelector('.popup-container').classList.add('no-video');
        const noVideoText = document.querySelector('.popup-no-video p');
        if (noVideoText) {
            noVideoText.textContent = message;
        }

        // Stop update interval
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    updateUI() {
        if (!this.state) return;

        // Remove no-video class if present
        document.querySelector('.popup-container').classList.remove('no-video');

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
    }

    async sendAction(action, data = {}) {
        if (!this.tabId || !this.isBBBTab) return;

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
