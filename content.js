/**
 * BBB Playback Enhancer
 * BigBlueButton kayıt oynatma sayfaları için modern medya kontrol arayüzü
 */

(function () {
    'use strict';

    // ============================================
    // CONFIGURATION
    // ============================================
    const CONFIG = {
        seekTime: 10,           // Seconds to skip forward/backward
        hideDelay: 3000,        // Auto-hide controls after ms
        playbackRates: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5, 6, 8, 10, 16],
        defaultRate: 1,
        volumeStep: 0.1,
        debug: false
    };

    // ============================================
    // UTILITIES
    // ============================================
    const log = (...args) => {
        if (CONFIG.debug) console.log('[BBB Enhancer]', ...args);
    };

    const formatTime = (seconds) => {
        if (isNaN(seconds) || seconds < 0) return '0:00';
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        if (hrs > 0) {
            return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const debounce = (func, wait) => {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    };

    const throttle = (func, limit) => {
        let inThrottle;
        return function executedFunction(...args) {
            if (!inThrottle) {
                func(...args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    };

    // ============================================
    // VIDEO PLAYER CONTROLLER
    // ============================================
    class VideoController {
        constructor() {
            this.player = null;
            this.videoElement = null;
            this.isReady = false;
        }

        init() {
            return new Promise((resolve, reject) => {
                const checkPlayer = () => {
                    // Try to find video-js player
                    if (typeof videojs !== 'undefined') {
                        const players = videojs.getPlayers();
                        const playerKeys = Object.keys(players);

                        if (playerKeys.length > 0) {
                            this.player = players[playerKeys[0]];
                            this.videoElement = this.player.el().querySelector('video');
                            this.isReady = true;
                            log('Video.js player found:', playerKeys[0]);
                            resolve(this);
                            return;
                        }
                    }

                    // Fallback: find video element directly
                    const video = document.querySelector('video');
                    if (video) {
                        this.videoElement = video;
                        this.isReady = true;
                        log('Native video element found');
                        resolve(this);
                        return;
                    }

                    // Retry
                    setTimeout(checkPlayer, 500);
                };

                checkPlayer();

                // Timeout after 10 seconds
                setTimeout(() => {
                    if (!this.isReady) {
                        reject(new Error('Video player not found'));
                    }
                }, 10000);
            });
        }

        // Playback controls
        play() {
            if (this.player) {
                this.player.play();
            } else if (this.videoElement) {
                this.videoElement.play();
            }
        }

        pause() {
            if (this.player) {
                this.player.pause();
            } else if (this.videoElement) {
                this.videoElement.pause();
            }
        }

        togglePlay() {
            if (this.isPaused()) {
                this.play();
            } else {
                this.pause();
            }
        }

        isPaused() {
            if (this.player) {
                return this.player.paused();
            }
            return this.videoElement?.paused ?? true;
        }

        // Time controls
        getCurrentTime() {
            if (this.player) {
                return this.player.currentTime();
            }
            return this.videoElement?.currentTime ?? 0;
        }

        setCurrentTime(time) {
            const duration = this.getDuration();
            const clampedTime = Math.max(0, Math.min(time, duration));

            if (this.player) {
                this.player.currentTime(clampedTime);
            } else if (this.videoElement) {
                this.videoElement.currentTime = clampedTime;
            }
        }

        getDuration() {
            if (this.player) {
                return this.player.duration();
            }
            return this.videoElement?.duration ?? 0;
        }

        seekForward(seconds = CONFIG.seekTime) {
            this.setCurrentTime(this.getCurrentTime() + seconds);
        }

        seekBackward(seconds = CONFIG.seekTime) {
            this.setCurrentTime(this.getCurrentTime() - seconds);
        }

        // Playback rate
        getPlaybackRate() {
            if (this.player) {
                return this.player.playbackRate();
            }
            return this.videoElement?.playbackRate ?? 1;
        }

        setPlaybackRate(rate) {
            if (this.player) {
                this.player.playbackRate(rate);
            } else if (this.videoElement) {
                this.videoElement.playbackRate = rate;
            }
        }

        cyclePlaybackRate() {
            const currentRate = this.getPlaybackRate();
            const currentIndex = CONFIG.playbackRates.indexOf(currentRate);
            const nextIndex = (currentIndex + 1) % CONFIG.playbackRates.length;
            this.setPlaybackRate(CONFIG.playbackRates[nextIndex]);
            return CONFIG.playbackRates[nextIndex];
        }

        // Volume
        getVolume() {
            if (this.player) {
                return this.player.volume();
            }
            return this.videoElement?.volume ?? 1;
        }

        setVolume(volume) {
            const clampedVolume = Math.max(0, Math.min(1, volume));
            if (this.player) {
                this.player.volume(clampedVolume);
            } else if (this.videoElement) {
                this.videoElement.volume = clampedVolume;
            }
        }

        isMuted() {
            if (this.player) {
                return this.player.muted();
            }
            return this.videoElement?.muted ?? false;
        }

        toggleMute() {
            if (this.player) {
                this.player.muted(!this.player.muted());
            } else if (this.videoElement) {
                this.videoElement.muted = !this.videoElement.muted;
            }
        }

        // Fullscreen
        toggleFullscreen() {
            const container = document.querySelector('.bbb-enhancer-container') || document.documentElement;

            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else {
                container.requestFullscreen();
            }
        }

        // Event listeners
        on(event, callback) {
            if (this.player) {
                this.player.on(event, callback);
            } else if (this.videoElement) {
                this.videoElement.addEventListener(event, callback);
            }
        }
    }

    // ============================================
    // UI CONTROLLER
    // ============================================
    class UIController {
        constructor(videoController) {
            this.video = videoController;
            this.controlsVisible = true;
            this.hideTimeout = null;
            this.elements = {};
        }

        getVideoTitle() {
            // Try different selectors for BBB video title
            const selectors = [
                '.recording-title',
                '.vjs-title-bar-title',
                'h1',
                '.title',
                '[class*="title"]',
                'title'
            ];

            for (const selector of selectors) {
                const el = document.querySelector(selector);
                if (el) {
                    const text = el.textContent || el.innerText;
                    if (text && text.trim() && text.trim() !== 'Playback') {
                        return text.trim().substring(0, 60); // Limit length
                    }
                }
            }

            // Fallback to document title, clean it up
            let title = document.title || '';
            title = title.replace(/- BigBlueButton/i, '').replace(/Playback/i, '').trim();

            if (title) {
                return title.substring(0, 60);
            }

            return 'Video';
        }

        init() {
            this.hideOriginalElements();
            this.restructureLayout();
            this.createControlBar();
            this.bindEvents();
            this.startTimeUpdate();
            log('UI initialized');
        }

        hideOriginalElements() {
            const selectorsToHide = [
                '.application',           // Chat panel
                '.webcams-wrapper',       // Webcam area
                '#webcams',
                '.thumbnails-wrapper',    // Thumbnail bar
                '#thumbnails',
                '.top-bar',               // Top navigation bar
                '.bottom-bar',            // Bottom bar if exists
                '.vjs-control-bar',       // Original video-js controls
                '.fullscreen-button'      // Original fullscreen button
            ];

            selectorsToHide.forEach(selector => {
                const elements = document.querySelectorAll(selector);
                elements.forEach(el => {
                    el.classList.add('bbb-enhancer-hidden');
                });
            });

            log('Original elements hidden');
        }

        restructureLayout() {
            const playerWrapper = document.querySelector('.player-wrapper') || document.querySelector('#player');
            if (!playerWrapper) return;

            // Add enhancer class to body
            document.body.classList.add('bbb-enhancer-active');

            // Create main container
            const container = document.createElement('div');
            container.className = 'bbb-enhancer-container';

            // Find presentation area
            const presentation = document.querySelector('.presentation-wrapper') ||
                document.querySelector('#presentation') ||
                document.querySelector('.content');

            // Find screenshare if exists
            const screenshare = document.querySelector('.screenshare-wrapper') ||
                document.querySelector('#screenshare');

            if (presentation) {
                presentation.classList.add('bbb-enhancer-fullscreen-content');
            }
            if (screenshare) {
                screenshare.classList.add('bbb-enhancer-fullscreen-content');
            }

            this.elements.container = container;
            this.elements.presentation = presentation;

            log('Layout restructured');
        }

        createControlBar() {
            // Get video title from page
            const videoTitle = this.getVideoTitle();

            const controlBar = document.createElement('div');
            controlBar.className = 'bbb-enhancer-controls';
            controlBar.innerHTML = `
                <div class="bbb-enhancer-progress-container">
                    <div class="bbb-enhancer-progress-bar">
                        <div class="bbb-enhancer-progress-buffered"></div>
                        <div class="bbb-enhancer-progress-played"></div>
                        <div class="bbb-enhancer-progress-handle"></div>
                    </div>
                    <div class="bbb-enhancer-progress-tooltip">0:00</div>
                </div>
                
                <div class="bbb-enhancer-controls-bottom">
                    <div class="bbb-enhancer-controls-left">
                        <button class="bbb-enhancer-btn bbb-enhancer-btn-play" id="bbb-play-btn" title="Oynat/Duraklat (Boşluk)">
                            <svg class="bbb-icon bbb-icon-play" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z"/>
                            </svg>
                            <svg class="bbb-icon bbb-icon-pause" viewBox="0 0 24 24" style="display:none">
                                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                            </svg>
                        </button>
                        
                        <button class="bbb-enhancer-btn bbb-enhancer-btn-seek" id="bbb-backward-btn" title="10 Saniye Geri (←)">
                            <svg class="bbb-icon" viewBox="0 0 24 24">
                                <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
                                <text x="12" y="15.5" text-anchor="middle" font-size="7" font-weight="700" font-family="sans-serif" fill="currentColor">10</text>
                            </svg>
                        </button>
                        
                        <button class="bbb-enhancer-btn bbb-enhancer-btn-seek" id="bbb-forward-btn" title="10 Saniye İleri (→)">
                            <svg class="bbb-icon" viewBox="0 0 24 24">
                                <path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"/>
                                <text x="12" y="15.5" text-anchor="middle" font-size="7" font-weight="700" font-family="sans-serif" fill="currentColor">10</text>
                            </svg>
                        </button>
                        
                        <div class="bbb-enhancer-volume-container">
                            <button class="bbb-enhancer-btn" id="bbb-mute-btn" title="Ses Aç/Kapat (M)">
                                <svg class="bbb-icon bbb-icon-volume" viewBox="0 0 24 24">
                                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                                </svg>
                                <svg class="bbb-icon bbb-icon-muted" viewBox="0 0 24 24" style="display:none">
                                    <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                                </svg>
                            </button>
                            <div class="bbb-enhancer-volume-slider">
                                <input type="range" id="bbb-volume-slider" min="0" max="100" value="100">
                            </div>
                        </div>
                        
                        <div class="bbb-enhancer-time">
                            <span id="bbb-current-time">0:00</span>
                            <span class="bbb-time-separator">/</span>
                            <span id="bbb-duration">0:00</span>
                        </div>
                    </div>
                    
                    <div class="bbb-enhancer-branding-container">
                        <span class="bbb-enhancer-branding">croxz</span>
                        <span class="bbb-enhancer-video-title" id="bbb-video-title">${videoTitle}</span>
                    </div>
                    
                    <div class="bbb-enhancer-controls-right">
                        <div class="bbb-enhancer-rate-container">
                            <button class="bbb-enhancer-btn bbb-enhancer-rate-btn" id="bbb-rate-btn" title="Oynatma Hızı">
                                <span id="bbb-rate-label">1x</span>
                            </button>
                            <div class="bbb-enhancer-rate-menu" id="bbb-rate-menu">
                                <div class="bbb-enhancer-rate-menu-title">Oynatma Hızı</div>
                                <div class="bbb-enhancer-rate-menu-items" id="bbb-rate-menu-items">
                                </div>
                            </div>
                        </div>
                        
                        <button class="bbb-enhancer-btn" id="bbb-fullscreen-btn" title="Tam Ekran (F)">
                            <svg class="bbb-icon bbb-icon-fullscreen" viewBox="0 0 24 24">
                                <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                            </svg>
                            <svg class="bbb-icon bbb-icon-fullscreen-exit" viewBox="0 0 24 24" style="display:none">
                                <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
                            </svg>
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(controlBar);
            this.elements.controlBar = controlBar;

            // Cache element references
            this.elements.playBtn = document.getElementById('bbb-play-btn');
            this.elements.backwardBtn = document.getElementById('bbb-backward-btn');
            this.elements.forwardBtn = document.getElementById('bbb-forward-btn');
            this.elements.muteBtn = document.getElementById('bbb-mute-btn');
            this.elements.volumeSlider = document.getElementById('bbb-volume-slider');
            this.elements.currentTime = document.getElementById('bbb-current-time');
            this.elements.duration = document.getElementById('bbb-duration');
            this.elements.rateBtn = document.getElementById('bbb-rate-btn');
            this.elements.rateLabel = document.getElementById('bbb-rate-label');
            this.elements.fullscreenBtn = document.getElementById('bbb-fullscreen-btn');
            this.elements.progressBar = controlBar.querySelector('.bbb-enhancer-progress-bar');
            this.elements.progressPlayed = controlBar.querySelector('.bbb-enhancer-progress-played');
            this.elements.progressHandle = controlBar.querySelector('.bbb-enhancer-progress-handle');
            this.elements.progressTooltip = controlBar.querySelector('.bbb-enhancer-progress-tooltip');
            this.elements.rateMenu = document.getElementById('bbb-rate-menu');
            this.elements.rateMenuItems = document.getElementById('bbb-rate-menu-items');

            // Populate rate menu
            this.populateRateMenu();

            log('Control bar created');
        }

        populateRateMenu() {
            const currentRate = this.video.getPlaybackRate();
            this.elements.rateMenuItems.innerHTML = '';

            CONFIG.playbackRates.forEach(rate => {
                const item = document.createElement('button');
                item.className = 'bbb-enhancer-rate-menu-item';
                if (rate === currentRate) {
                    item.classList.add('active');
                }
                item.textContent = rate + 'x';
                item.dataset.rate = rate;
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.video.setPlaybackRate(rate);
                    this.elements.rateLabel.textContent = rate + 'x';
                    this.closeRateMenu();
                    this.updateRateMenuSelection(rate);
                });
                this.elements.rateMenuItems.appendChild(item);
            });
        }

        updateRateMenuSelection(selectedRate) {
            const items = this.elements.rateMenuItems.querySelectorAll('.bbb-enhancer-rate-menu-item');
            items.forEach(item => {
                if (parseFloat(item.dataset.rate) === selectedRate) {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
            });
        }

        toggleRateMenu() {
            const isOpen = this.elements.rateMenu.classList.contains('open');
            if (isOpen) {
                this.closeRateMenu();
            } else {
                this.openRateMenu();
            }
        }

        openRateMenu() {
            this.updateRateMenuSelection(this.video.getPlaybackRate());
            this.elements.rateMenu.classList.add('open');
        }

        closeRateMenu() {
            this.elements.rateMenu.classList.remove('open');
        }

        bindEvents() {
            // Play/Pause
            this.elements.playBtn.addEventListener('click', () => {
                this.video.togglePlay();
            });

            // Seek buttons
            this.elements.backwardBtn.addEventListener('click', () => {
                this.video.seekBackward();
                this.showSeekIndicator('backward');
            });

            this.elements.forwardBtn.addEventListener('click', () => {
                this.video.seekForward();
                this.showSeekIndicator('forward');
            });

            // Volume
            this.elements.muteBtn.addEventListener('click', () => {
                this.video.toggleMute();
                this.updateVolumeUI();
            });

            this.elements.volumeSlider.addEventListener('input', (e) => {
                this.video.setVolume(e.target.value / 100);
                this.updateVolumeUI();
            });

            // Playback rate menu
            this.elements.rateBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleRateMenu();
            });

            // Close menu when clicking outside
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.bbb-enhancer-rate-container')) {
                    this.closeRateMenu();
                }
            });

            // Fullscreen
            this.elements.fullscreenBtn.addEventListener('click', () => {
                this.video.toggleFullscreen();
            });

            // Progress bar - click and drag support
            let isDragging = false;

            const seekToPosition = (e) => {
                const rect = this.elements.progressBar.getBoundingClientRect();
                const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                this.video.setCurrentTime(percent * this.video.getDuration());
            };

            this.elements.progressBar.addEventListener('mousedown', (e) => {
                isDragging = true;
                seekToPosition(e);
            });

            document.addEventListener('mousemove', (e) => {
                if (isDragging) {
                    seekToPosition(e);
                }
                // Show tooltip on progress bar hover
                if (this.elements.progressBar.matches(':hover') || isDragging) {
                    const rect = this.elements.progressBar.getBoundingClientRect();
                    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    const time = percent * this.video.getDuration();
                    this.elements.progressTooltip.textContent = formatTime(time);
                    this.elements.progressTooltip.style.left = `${percent * 100}%`;
                    this.elements.progressTooltip.classList.add('visible');
                }
            });

            document.addEventListener('mouseup', () => {
                isDragging = false;
            });

            this.elements.progressBar.addEventListener('mouseleave', () => {
                if (!isDragging) {
                    this.elements.progressTooltip.classList.remove('visible');
                }
            });

            // Video events
            this.video.on('play', () => this.updatePlayButtonUI(false));
            this.video.on('pause', () => this.updatePlayButtonUI(true));
            this.video.on('volumechange', () => this.updateVolumeUI());
            this.video.on('ratechange', () => {
                this.elements.rateLabel.textContent = this.video.getPlaybackRate() + 'x';
            });
            this.video.on('loadedmetadata', () => {
                this.elements.duration.textContent = formatTime(this.video.getDuration());
            });

            // Keyboard shortcuts
            document.addEventListener('keydown', (e) => this.handleKeyboard(e));

            // Auto-hide controls - only in fullscreen
            document.addEventListener('mousemove', debounce(() => {
                if (document.fullscreenElement) {
                    this.showControls();
                    this.scheduleHideControls();
                }
            }, 100));

            // Fullscreen change
            document.addEventListener('fullscreenchange', () => {
                this.updateFullscreenUI();
            });

            // Double-click on presentation to toggle fullscreen
            const presentation = document.querySelector('.presentation-wrapper') ||
                document.querySelector('#presentation') ||
                document.querySelector('.content');
            if (presentation) {
                presentation.addEventListener('dblclick', () => {
                    this.video.toggleFullscreen();
                });
            }

            // Click on presentation to play/pause
            if (presentation) {
                presentation.addEventListener('click', (e) => {
                    // Only toggle if not clicking on controls
                    if (!e.target.closest('.bbb-enhancer-controls')) {
                        this.video.togglePlay();
                    }
                });
            }

            log('Events bound');
        }

        handleKeyboard(e) {
            // Ignore if user is typing in an input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            switch (e.key) {
                case ' ':
                case 'k':
                    e.preventDefault();
                    this.video.togglePlay();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    this.video.seekBackward();
                    this.showSeekIndicator('backward');
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    this.video.seekForward();
                    this.showSeekIndicator('forward');
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    this.video.setVolume(this.video.getVolume() + CONFIG.volumeStep);
                    this.updateVolumeUI();
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    this.video.setVolume(this.video.getVolume() - CONFIG.volumeStep);
                    this.updateVolumeUI();
                    break;
                case 'm':
                case 'M':
                    this.video.toggleMute();
                    this.updateVolumeUI();
                    break;
                case 'f':
                case 'F':
                    this.video.toggleFullscreen();
                    break;
                case '<':
                case ',':
                    this.decreasePlaybackRate();
                    break;
                case '>':
                case '.':
                    this.increasePlaybackRate();
                    break;
                case '0':
                case '1':
                case '2':
                case '3':
                case '4':
                case '5':
                case '6':
                case '7':
                case '8':
                case '9':
                    e.preventDefault();
                    const percent = parseInt(e.key) / 10;
                    this.video.setCurrentTime(percent * this.video.getDuration());
                    break;
            }
        }

        decreasePlaybackRate() {
            const currentRate = this.video.getPlaybackRate();
            const currentIndex = CONFIG.playbackRates.indexOf(currentRate);
            if (currentIndex > 0) {
                this.video.setPlaybackRate(CONFIG.playbackRates[currentIndex - 1]);
            }
        }

        increasePlaybackRate() {
            const currentRate = this.video.getPlaybackRate();
            const currentIndex = CONFIG.playbackRates.indexOf(currentRate);
            if (currentIndex < CONFIG.playbackRates.length - 1) {
                this.video.setPlaybackRate(CONFIG.playbackRates[currentIndex + 1]);
            }
        }

        startTimeUpdate() {
            // Use throttled interval instead of requestAnimationFrame for better performance
            // 100ms interval = 10 updates per second (smooth enough for progress bar)
            let lastTime = -1;

            const update = () => {
                const current = this.video.getCurrentTime();
                const duration = this.video.getDuration();

                // Only update DOM if time changed (avoid unnecessary repaints)
                if (Math.floor(current) !== lastTime) {
                    this.elements.currentTime.textContent = formatTime(current);
                    lastTime = Math.floor(current);
                }

                if (duration > 0) {
                    const percent = (current / duration) * 100;
                    this.elements.progressPlayed.style.width = `${percent}%`;
                    this.elements.progressHandle.style.left = `${percent}%`;
                }
            };

            // Initial update
            update();

            // Use setInterval with 100ms for smoother progress bar without high CPU usage
            this.timeUpdateInterval = setInterval(update, 100);
        }

        updatePlayButtonUI(isPaused) {
            const playIcon = this.elements.playBtn.querySelector('.bbb-icon-play');
            const pauseIcon = this.elements.playBtn.querySelector('.bbb-icon-pause');

            if (isPaused) {
                playIcon.style.display = '';
                pauseIcon.style.display = 'none';
            } else {
                playIcon.style.display = 'none';
                pauseIcon.style.display = '';
            }
        }

        updateVolumeUI() {
            const isMuted = this.video.isMuted();
            const volume = this.video.getVolume();

            const volumeIcon = this.elements.muteBtn.querySelector('.bbb-icon-volume');
            const mutedIcon = this.elements.muteBtn.querySelector('.bbb-icon-muted');

            if (isMuted || volume === 0) {
                volumeIcon.style.display = 'none';
                mutedIcon.style.display = '';
            } else {
                volumeIcon.style.display = '';
                mutedIcon.style.display = 'none';
            }

            this.elements.volumeSlider.value = isMuted ? 0 : volume * 100;
        }

        updateFullscreenUI() {
            const isFullscreen = !!document.fullscreenElement;
            const fsIcon = this.elements.fullscreenBtn.querySelector('.bbb-icon-fullscreen');
            const fsExitIcon = this.elements.fullscreenBtn.querySelector('.bbb-icon-fullscreen-exit');

            if (isFullscreen) {
                fsIcon.style.display = 'none';
                fsExitIcon.style.display = '';
            } else {
                fsIcon.style.display = '';
                fsExitIcon.style.display = 'none';
            }
        }

        showSeekIndicator(direction) {
            // Create seek indicator if not exists
            let indicator = document.querySelector('.bbb-seek-indicator');
            if (!indicator) {
                indicator = document.createElement('div');
                indicator.className = 'bbb-seek-indicator';
                document.body.appendChild(indicator);
            }

            indicator.textContent = direction === 'forward' ? '+10s' : '-10s';
            indicator.className = 'bbb-seek-indicator ' + direction + ' show';

            setTimeout(() => {
                indicator.classList.remove('show');
            }, 500);
        }

        showControls() {
            this.elements.controlBar.classList.remove('hidden');
            this.controlsVisible = true;
        }

        hideControls() {
            // Only hide controls in fullscreen mode
            if (document.fullscreenElement && !this.video.isPaused()) {
                this.elements.controlBar.classList.add('hidden');
                this.controlsVisible = false;
            }
        }

        scheduleHideControls() {
            clearTimeout(this.hideTimeout);
            this.hideTimeout = setTimeout(() => {
                this.hideControls();
            }, CONFIG.hideDelay);
        }
    }

    // ============================================
    // INITIALIZATION
    // ============================================
    let videoController = null;
    let uiController = null;

    // Hide original BBB elements immediately (before DOM is fully loaded)
    const hideOriginalElementsEarly = () => {
        // Add class to body immediately for CSS to work
        document.body.classList.add('bbb-enhancer-active');

        // Hide elements that might flash
        const style = document.createElement('style');
        style.id = 'bbb-enhancer-early-hide';
        style.textContent = `
            .application, .webcams-wrapper, #webcams, .thumbnails-wrapper, 
            #thumbnails, .top-bar, .bottom-bar, .vjs-control-bar, 
            .fullscreen-button, .vjs-big-play-button {
                display: none !important;
                visibility: hidden !important;
            }
        `;
        document.head.appendChild(style);
    };

    const init = async () => {
        log('Initializing BBB Enhancer...');

        try {
            videoController = new VideoController();
            await videoController.init();

            uiController = new UIController(videoController);
            uiController.init();

            // Update duration once loaded
            const updateDuration = () => {
                const duration = videoController.getDuration();
                if (duration > 0) {
                    document.getElementById('bbb-duration').textContent = formatTime(duration);
                }
            };

            // Try immediately and after a short delay
            updateDuration();
            setTimeout(updateDuration, 500);

            log('BBB Enhancer initialized successfully');
        } catch (error) {
            console.error('[BBB Enhancer] Initialization failed:', error);
        }
    };

    // ============================================
    // MESSAGE API (for popup communication)
    // ============================================
    if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            // Make sure controllers are available
            if (!videoController || !videoController.isReady) {
                sendResponse({ error: 'Video not ready' });
                return true;
            }

            switch (message.action) {
                case 'getState':
                    // Get video title from UIController method
                    const title = uiController ? uiController.getVideoTitle() : document.title;
                    sendResponse({
                        isPlaying: !videoController.isPaused(),
                        currentTime: videoController.getCurrentTime(),
                        duration: videoController.getDuration(),
                        playbackRate: videoController.getPlaybackRate(),
                        volume: videoController.getVolume(),
                        muted: videoController.isMuted(),
                        title: title
                    });
                    break;

                case 'togglePlay':
                    videoController.togglePlay();
                    sendResponse({ success: true });
                    break;

                case 'seekForward':
                    videoController.seekForward(message.seconds || 10);
                    sendResponse({ success: true });
                    break;

                case 'seekBackward':
                    videoController.seekBackward(message.seconds || 10);
                    sendResponse({ success: true });
                    break;

                case 'seek':
                    videoController.setCurrentTime(message.time);
                    sendResponse({ success: true });
                    break;

                case 'setPlaybackRate':
                    videoController.setPlaybackRate(message.rate);
                    sendResponse({ success: true });
                    break;

                case 'setVolume':
                    videoController.setVolume(message.volume);
                    sendResponse({ success: true });
                    break;

                case 'toggleMute':
                    videoController.toggleMute();
                    sendResponse({ success: true });
                    break;

                default:
                    sendResponse({ error: 'Unknown action' });
            }
            return true; // Keep channel open for async response
        });
    }

    // ============================================
    // START - Instant load without delay
    // ============================================
    // Hide original elements immediately
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            hideOriginalElementsEarly();
            init();
        });
    } else {
        hideOriginalElementsEarly();
        // Start init immediately - video-js polling in VideoController handles waiting
        init();
    }
})();
