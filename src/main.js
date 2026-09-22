import './styles/main.css';
import { AR_CONFIG } from './ar/config.js';
import { ARController, ARControllerError } from './ar/ARController.js';
import { ZapparARController } from './ar/ZapparARController.js';
import { createUI } from './ui/ui.js';

const ui = createUI();
const requestedEngine = new URLSearchParams(window.location.search).get('engine');
const engine = requestedEngine === 'mindar' ? 'mindar' : 'zappar';
const arContainer = document.getElementById('ar-container');
const startButton = document.getElementById('start-ar');
const retryButton = document.getElementById('retry-ar');
const backHomeButton = document.getElementById('back-home');
const resetButton = document.getElementById('reset-animation');
const closeButton = document.getElementById('close-ar');

let arController = null;
let isStarting = false;

function getErrorMessage(error) {
  if (!(error instanceof ARControllerError)) {
    return 'Đã có lỗi khi khởi động AR. Vui lòng tải lại trang và thử lại.';
  }

  switch (error.code) {
    case 'INSECURE_CONTEXT':
      return 'AR cần được mở trên HTTPS (hoặc localhost). Hãy dùng đường dẫn bảo mật rồi thử lại.';
    case 'UNSUPPORTED_BROWSER':
      return 'Trình duyệt này chưa hỗ trợ camera WebAR. Hãy thử Chrome trên Android hoặc Safari trên iPhone mới hơn.';
    case 'WEBGL_UNSUPPORTED':
      return 'Thiết bị chưa hỗ trợ WebGL cần thiết cho trải nghiệm AR.';
    case 'CAMERA_ACCESS_FAILED':
      return 'Camera chưa được cấp quyền hoặc chưa phản hồi. Hãy bấm Cho phép camera trong trình duyệt rồi thử lại.';
    case 'CAMERA_NOT_FOUND':
      return 'Không tìm thấy camera sau trên thiết bị này.';
    case 'CAMERA_BUSY':
      return 'Camera đang được ứng dụng khác sử dụng. Hãy đóng ứng dụng đó rồi thử lại.';
    case 'TARGET_NOT_FOUND':
      return 'Không tìm thấy dữ liệu nhận diện hình ảnh (targets.mind). Hãy kiểm tra thư mục public/assets.';
    case 'VIDEO_LOAD_FAILED':
      return 'Không thể tải animation.mp4. Hãy kiểm tra tệp video và thử tải lại trang.';
    case 'AR_INITIALIZATION_FAILED':
    default:
      return 'Không thể khởi động AR lúc này. Hãy kiểm tra kết nối mạng, camera và thử lại.';
  }
}

async function stopAR() {
  if (!arController) return;
  await arController.stop();
  arController = null;
}

async function startAR() {
  if (isStarting) return;
  isStarting = true;
  ui.showStarting('Đang xin quyền camera…');

  try {
    await stopAR();
    const Controller = engine === 'mindar' ? ARController : ZapparARController;
    arController = new Controller({
      container: arContainer,
      config: AR_CONFIG,
      callbacks: {
        onReady: () => ui.showScanning(),
        onTargetFound: () => ui.showTracking(),
        onTargetLost: () => ui.showScanning(),
        onPlaybackBlocked: () => ui.showPlaybackHint(),
      },
    });
    await arController.start();
    ui.setSoundState(true);
  } catch (error) {
    await stopAR();
    ui.showError(getErrorMessage(error));
  } finally {
    isStarting = false;
  }
}

startButton.addEventListener('click', startAR);
retryButton.addEventListener('click', startAR);

backHomeButton.addEventListener('click', async () => {
  await stopAR();
  ui.showLanding();
});

closeButton.addEventListener('click', async () => {
  await stopAR();
  ui.showLanding();
});

ui.soundButton.addEventListener('click', () => {
  if (!arController) return;
  const muted = arController.toggleSound();
  ui.setSoundState(muted);
});

resetButton.addEventListener('click', () => {
  arController?.resetAnimation();
});

window.addEventListener('pagehide', () => {
  void stopAR();
});
