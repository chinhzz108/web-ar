import * as THREE from 'three';
import { MindARThree } from 'mind-ar/dist/mindar-image-three.prod.js';
import { AR_CONFIG } from './config.js';
import { VideoTarget } from './VideoTarget.js';

export class ARControllerError extends Error {
  constructor(code, cause) {
    super(code);
    this.name = 'ARControllerError';
    this.code = code;
    this.cause = cause;
  }
}

function isLocalhost() {
  return ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
}

export function getSupportError() {
  if (!window.isSecureContext && !isLocalhost()) {
    return new ARControllerError('INSECURE_CONTEXT');
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    return new ARControllerError('UNSUPPORTED_BROWSER');
  }

  const canvas = document.createElement('canvas');
  const hasWebGL = Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  if (!hasWebGL) {
    return new ARControllerError('WEBGL_UNSUPPORTED');
  }

  if (typeof HTMLVideoElement === 'undefined') {
    return new ARControllerError('UNSUPPORTED_BROWSER');
  }

  return null;
}

async function ensureTargetExists(targetUrl) {
  try {
    const response = await fetch(targetUrl, { method: 'HEAD', cache: 'no-store' });
    if (response.status === 404) {
      throw new ARControllerError('TARGET_NOT_FOUND');
    }
    // Some static hosts do not implement HEAD. MindAR will perform the real
    // GET below, so only block an explicit 404 here.
  } catch (error) {
    if (error instanceof ARControllerError) throw error;
  }
}

function getVideoConstraints(cameraConfig, shouldFaceUser = false) {
  const video = { ...cameraConfig };
  video.facingMode = shouldFaceUser ? 'user' : cameraConfig.facingMode;
  return video;
}

async function openCameraStream(cameraConfig, shouldFaceUser = false) {
  const constraints = {
    audio: false,
    video: getVideoConstraints(cameraConfig, shouldFaceUser),
  };

  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (error) {
    // A low-end device may reject one of the ideal/minimum quality hints. Keep
    // AR usable by retrying only that case; permission and busy-camera errors
    // still surface immediately with their original cause.
    if (error?.name !== 'OverconstrainedError') throw error;
    return navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: shouldFaceUser ? 'user' : { ideal: 'environment' },
      },
    });
  }
}

async function applyContinuousCameraControls(track) {
  if (!track?.getCapabilities || !track.applyConstraints) return;

  const capabilities = track.getCapabilities();
  const advanced = {};
  if (capabilities.focusMode?.includes('continuous')) advanced.focusMode = 'continuous';
  if (capabilities.exposureMode?.includes('continuous')) advanced.exposureMode = 'continuous';
  if (capabilities.whiteBalanceMode?.includes('continuous')) {
    advanced.whiteBalanceMode = 'continuous';
  }

  if (!Object.keys(advanced).length) return;
  try {
    await track.applyConstraints({ advanced: [advanced] });
  } catch {
    // These controls are optional across Android camera implementations. The
    // negotiated resolution remains valid if a focus/exposure hint is rejected.
  }
}

/**
 * Ask for the rear camera once so the browser can report a useful permission
 * error. MindAR opens its own environment-facing stream immediately after
 * this stream is released; it remains the owner of the AR camera session.
 */
async function requestRearCameraPermission(cameraConfig) {
  let stream;
  try {
    stream = await openCameraStream(cameraConfig);
  } catch (error) {
    throw new ARControllerError('CAMERA_ACCESS_FAILED', error);
  } finally {
    stream?.getTracks().forEach((track) => track.stop());
  }
}

/**
 * MindAR 1.2.5 exposes no public camera-resolution option: its own
 * _startVideo() calls getUserMedia({ video: {} }). Override that one internal
 * hook with the same official startup sequence plus explicit constraints. The
 * fallback keeps this app compatible if a future MindAR build removes that
 * hook, while the current pinned version gets a real 720p-class camera stream.
 */
function installHighQualityCamera(mindar, cameraConfig) {
  if (typeof mindar?._startVideo !== 'function') return;

  mindar._startVideo = function startVideoWithQuality() {
    return new Promise((resolve, reject) => {
      this.video = document.createElement('video');
      this.video.setAttribute('autoplay', '');
      this.video.setAttribute('muted', '');
      this.video.setAttribute('playsinline', '');
      this.video.muted = true;
      this.video.autoplay = true;
      this.video.playsInline = true;
      this.video.style.position = 'absolute';
      this.video.style.top = '0px';
      this.video.style.left = '0px';
      this.video.style.zIndex = '-2';
      this.container.appendChild(this.video);

      if (!navigator.mediaDevices?.getUserMedia) {
        reject(new ARControllerError('UNSUPPORTED_BROWSER'));
        return;
      }

      let stream;
      let settled = false;
      const fail = (error) => {
        if (settled) return;
        settled = true;
        stream?.getTracks().forEach((track) => track.stop());
        reject(error);
      };
      const handleMetadata = () => {
        if (settled) return;
        settled = true;
        this.video.setAttribute('width', this.video.videoWidth);
        this.video.setAttribute('height', this.video.videoHeight);
        resolve();
      };

      this.video.addEventListener('loadedmetadata', handleMetadata, { once: true });
      openCameraStream(cameraConfig, this.shouldFaceUser)
        .then(async (nextStream) => {
          stream = nextStream;
          await applyContinuousCameraControls(stream.getVideoTracks()[0]);
          this.video.srcObject = stream;
          this.video.play().catch(() => {});
        })
        .catch(fail);
    });
  };
}

function classifyStartError(error) {
  if (error instanceof ARControllerError) return error;

  const name = error?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return new ARControllerError('CAMERA_ACCESS_FAILED', error);
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return new ARControllerError('CAMERA_NOT_FOUND', error);
  }
  if (name === 'NotReadableError' || name === 'AbortError') {
    return new ARControllerError('CAMERA_BUSY', error);
  }
  if (error?.message === 'VIDEO_LOAD_FAILED') {
    return new ARControllerError('VIDEO_LOAD_FAILED', error);
  }

  return new ARControllerError('AR_INITIALIZATION_FAILED', error);
}

export class ARController {
  constructor({ container, config = AR_CONFIG, callbacks = {} }) {
    this.container = container;
    this.config = config;
    this.callbacks = callbacks;
    this.mindar = null;
    this.anchor = null;
    this.videoTarget = null;
    this.targetVisible = false;
    this.fps = 0;
    this.frameCount = 0;
    this.lastFpsAt = performance.now();
    this.active = false;
  }

  async start() {
    if (this.active) return;

    const supportError = getSupportError();
    if (supportError) throw supportError;

    try {
      await ensureTargetExists(this.config.target);

      this.videoTarget = new VideoTarget({
        posterUrl: this.config.poster,
        videoUrl: this.config.video,
        planeWidth: this.config.planeWidth,
        planeHeight: this.config.planeHeight,
        cropX: this.config.videoCropX,
        overscan: this.config.planeOverscan,
        zOffset: this.config.planeZOffset,
      });
      await this.videoTarget.load();
      await requestRearCameraPermission(this.config.camera);

      this.mindar = new MindARThree({
        container: this.container,
        imageTargetSrc: this.config.target,
        maxTrack: this.config.maxTrack,
        uiLoading: 'no',
        uiScanning: 'no',
        uiError: 'no',
        filterMinCF: this.config.filterMinCF,
        filterBeta: this.config.filterBeta,
        warmupTolerance: this.config.warmupTolerance,
        missTolerance: this.config.missTolerance,
      });

      installHighQualityCamera(this.mindar, this.config.camera);

      this.anchor = this.mindar.addAnchor(this.config.targetIndex);
      this.anchor.group.add(this.videoTarget.mesh);
      this.anchor.group.add(this.videoTarget.posterMesh);
      this.anchor.onTargetFound = () => this.handleTargetFound();
      this.anchor.onTargetLost = () => this.handleTargetLost();

      const { renderer } = this.mindar;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      if ('outputColorSpace' in renderer) {
        renderer.outputColorSpace = THREE.SRGBColorSpace;
      }

      await this.mindar.start();
      renderer.setAnimationLoop(() => {
        this.recordFrame();
        renderer.render(this.mindar.scene, this.mindar.camera);
      });

      this.active = true;
      this.callbacks.onReady?.();
    } catch (error) {
      await this.stop();
      throw classifyStartError(error);
    }
  }

  handleTargetFound() {
    this.targetVisible = true;
    this.videoTarget.show();
    this.callbacks.onTargetFound?.();

    // Muted playback is allowed by mobile browsers. If a browser still
    // rejects the promise, the AR session continues and the user can retry
    // from the sound control after a gesture.
    this.videoTarget.play().catch((error) => {
      this.callbacks.onPlaybackBlocked?.(error);
    });
  }

  handleTargetLost() {
    this.targetVisible = false;
    this.videoTarget.pause();
    this.videoTarget.hide();
    // Intentionally keep currentTime. A short occlusion should not restart
    // the animation when MindAR fires the loss event after missTolerance.
    this.callbacks.onTargetLost?.();
  }

  toggleSound() {
    if (!this.videoTarget) return true;
    const muted = this.videoTarget.setMuted(!this.videoTarget.isMuted);
    if (!muted && this.videoTarget.video.paused && this.targetVisible) {
      this.videoTarget.play().catch((error) => this.callbacks.onPlaybackBlocked?.(error));
    }
    return muted;
  }

  resetAnimation() {
    if (!this.videoTarget) return;
    this.videoTarget.reset();
    if (this.targetVisible) {
      this.videoTarget.play().catch((error) => this.callbacks.onPlaybackBlocked?.(error));
    }
  }

  getDebugState() {
    const cameraVideo = this.container.querySelector('video');
    const trackSettings = cameraVideo?.srcObject?.getVideoTracks?.()[0]?.getSettings?.();
    return {
      fps: this.fps,
      targetVisible: this.targetVisible,
      videoPlaying: Boolean(this.videoTarget?.isPlaying),
      cameraResolution: cameraVideo?.videoWidth && cameraVideo?.videoHeight
        ? `${cameraVideo.videoWidth} × ${cameraVideo.videoHeight}`
        : '—',
      cameraFrameRate: trackSettings?.frameRate ? Math.round(trackSettings.frameRate) : null,
    };
  }

  recordFrame() {
    this.frameCount += 1;
    const now = performance.now();
    if (now - this.lastFpsAt >= 500) {
      this.fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsAt));
      this.frameCount = 0;
      this.lastFpsAt = now;
    }
  }

  async stop() {
    this.active = false;
    this.targetVisible = false;

    if (this.mindar) {
      try {
        this.mindar.renderer.setAnimationLoop(null);
        this.mindar.stop();
      } catch {
        // A partially initialized MindAR instance may not have a video yet.
      }
    }

    this.videoTarget?.dispose();
    this.container.replaceChildren();
    this.videoTarget = null;
    this.anchor = null;
    this.mindar = null;
  }
}
