const get = (id) => document.getElementById(id);

export function createUI({ showDebug = false } = {}) {
  const elements = {
    app: get('app'),
    landing: get('landing-screen'),
    arStage: get('ar-stage'),
    error: get('error-screen'),
    loading: get('loading-screen'),
    loadingMessage: get('loading-message'),
    scanner: get('scanner-ui'),
    scanMessage: get('scan-message'),
    trackingBadge: get('tracking-badge'),
    instruction: document.querySelector('.ar-instruction'),
    controls: get('ar-controls'),
    debug: get('debug-panel'),
    debugFps: get('debug-fps'),
    debugTarget: get('debug-target'),
    debugVideo: get('debug-video'),
    debugCamera: get('debug-camera'),
    errorMessage: get('error-message'),
    soundToggle: get('sound-toggle'),
  };

  if (showDebug) elements.debug.hidden = false;

  const setStage = (visible) => {
    elements.arStage.hidden = !visible;
    elements.landing.hidden = visible;
    if (!visible) elements.app.classList.remove('is-tracking');
  };

  return {
    showStarting(message = 'Đang chuẩn bị trải nghiệm…') {
      setStage(true);
      elements.error.hidden = true;
      elements.loading.hidden = false;
      elements.loadingMessage.textContent = message;
      elements.scanner.hidden = true;
      elements.trackingBadge.hidden = true;
      elements.controls.classList.remove('is-visible');
    },

    showScanning(message = 'Đưa camera vào hình ảnh trên thẻ') {
      setStage(true);
      elements.loading.hidden = true;
      elements.scanner.hidden = false;
      elements.trackingBadge.hidden = true;
      elements.scanMessage.textContent = message;
      elements.controls.classList.add('is-visible');
      elements.app.classList.remove('is-tracking');
    },

    showTracking() {
      elements.loading.hidden = true;
      elements.scanner.hidden = true;
      elements.trackingBadge.hidden = false;
      elements.controls.classList.add('is-visible');
      elements.app.classList.add('is-tracking');
    },

    showPlaybackHint() {
      elements.scanMessage.textContent = 'Chạm nút âm thanh để tiếp tục phát';
    },

    showError(message) {
      elements.loading.hidden = true;
      elements.error.hidden = false;
      elements.arStage.hidden = true;
      elements.landing.hidden = true;
      elements.errorMessage.textContent = message;
    },

    showLanding() {
      elements.error.hidden = true;
      elements.arStage.hidden = true;
      elements.landing.hidden = false;
      elements.loading.hidden = true;
      elements.scanner.hidden = true;
      elements.trackingBadge.hidden = true;
      elements.controls.classList.remove('is-visible');
      elements.app.classList.remove('is-tracking');
    },

    setSoundState(muted) {
      const icon = elements.soundToggle.querySelector('.control-icon');
      elements.soundToggle.setAttribute('aria-label', muted ? 'Bật âm thanh' : 'Tắt âm thanh');
      elements.soundToggle.classList.toggle('is-active', !muted);
      icon.textContent = muted ? '⌁' : '◖';
    },

    updateDebug(state) {
      if (!showDebug || !state) return;
      elements.debugFps.textContent = `${state.fps}`;
      elements.debugTarget.textContent = state.targetVisible ? 'yes' : 'no';
      elements.debugVideo.textContent = state.videoPlaying ? 'yes' : 'no';
      elements.debugCamera.textContent = `${state.cameraResolution}${state.cameraFrameRate ? ` @ ${state.cameraFrameRate} fps` : ''}`;
    },

    get soundButton() {
      return elements.soundToggle;
    },
  };
}
