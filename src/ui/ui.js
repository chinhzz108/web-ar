const get = (id) => document.getElementById(id);

export function createUI() {
  const elements = {
    app: get('app'),
    landing: get('landing-screen'),
    arStage: get('ar-stage'),
    error: get('error-screen'),
    loading: get('loading-screen'),
    loadingMessage: get('loading-message'),
    scanner: get('scanner-ui'),
    scanMessage: get('scan-message'),
    controls: get('ar-controls'),
    errorMessage: get('error-message'),
    soundToggle: get('sound-toggle'),
  };

  const setStage = (visible) => {
    elements.arStage.hidden = !visible;
    elements.landing.hidden = visible;
  };

  return {
    showStarting(message = 'Đang chuẩn bị trải nghiệm…') {
      setStage(true);
      elements.error.hidden = true;
      elements.loading.hidden = false;
      elements.loadingMessage.textContent = message;
      elements.scanner.hidden = true;
      elements.controls.classList.remove('is-visible');
    },

    showScanning(message = 'Đưa camera vào hình ảnh trên thẻ') {
      setStage(true);
      elements.loading.hidden = true;
      elements.scanner.hidden = false;
      elements.scanMessage.textContent = message;
      elements.controls.classList.add('is-visible');
    },

    showTracking() {
      elements.loading.hidden = true;
      elements.scanner.hidden = true;
      elements.controls.classList.add('is-visible');
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
      elements.controls.classList.remove('is-visible');
    },

    setSoundState(muted) {
      const icon = elements.soundToggle.querySelector('.control-icon');
      elements.soundToggle.setAttribute('aria-label', muted ? 'Bật âm thanh' : 'Tắt âm thanh');
      elements.soundToggle.classList.toggle('is-active', !muted);
      icon.textContent = muted ? '⌁' : '◖';
    },

    get soundButton() {
      return elements.soundToggle;
    },
  };
}
