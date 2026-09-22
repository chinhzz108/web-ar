import * as THREE from 'three';
import * as ZapparThree from '@zappar/zappar-threejs';
import { ARControllerError, getSupportError } from './ARController.js';
import { VideoTarget } from './VideoTarget.js';

async function ensureTargetExists(targetUrl) {
  const response = await fetch(targetUrl, { method: 'HEAD', cache: 'no-store' });
  if (response.status === 404) {
    throw new ARControllerError('TARGET_NOT_FOUND');
  }
}

function cameraConstraints(cameraConfig) {
  return {
    audio: false,
    video: {
      ...cameraConfig,
      facingMode: { ideal: 'environment' },
    },
  };
}

function requestCamera(constraints, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      settled = true;
      const error = new Error('CAMERA_PERMISSION_TIMEOUT');
      error.name = 'NotAllowedError';
      reject(error);
    }, timeoutMs);

    navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
      if (settled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      settled = true;
      window.clearTimeout(timeoutId);
      resolve(stream);
    }).catch((error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      reject(error);
    });
  });
}

async function openRearCamera(cameraConfig) {
  try {
    return await requestCamera(cameraConstraints(cameraConfig));
  } catch (error) {
    // Some Android camera HALs reject quality hints even when they can open
    // the camera. Retry with only the essential rear-camera constraint.
    if (error?.name !== 'OverconstrainedError') throw error;
    return requestCamera({
      audio: false,
      video: { facingMode: { ideal: 'environment' } },
    });
  }
}

async function createCameraVideo(stream, container) {
  const video = document.createElement('video');
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.setAttribute('aria-hidden', 'true');
  video.style.position = 'absolute';
  video.style.width = '1px';
  video.style.height = '1px';
  video.style.opacity = '0';
  video.style.pointerEvents = 'none';
  video.srcObject = stream;
  container.appendChild(video);
  try {
    await video.play();
  } catch (error) {
    video.remove();
    throw error;
  }
  return video;
}

function classifyZapparError(error) {
  if (error instanceof ARControllerError) return error;
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
    return new ARControllerError('CAMERA_ACCESS_FAILED', error);
  }
  if (error?.name === 'NotReadableError' || error?.name === 'AbortError') {
    return new ARControllerError('CAMERA_BUSY', error);
  }
  if (error?.message === 'VIDEO_LOAD_FAILED') {
    return new ARControllerError('VIDEO_LOAD_FAILED', error);
  }
  return new ARControllerError('AR_INITIALIZATION_FAILED', error);
}

/**
 * Zappar's Universal AR image tracker is the current A/B engine. It owns the
 * camera processing pipeline and exposes a pose-aware ImageAnchorGroup, so
 * there is no second canvas/video transform for us to reconcile manually.
 */
export class ZapparARController {
  constructor({ container, config, callbacks = {} }) {
    this.container = container;
    this.config = config;
    this.callbacks = callbacks;
    this.pipeline = null;
    this.camera = null;
    this.tracker = null;
    this.anchorGroup = null;
    this.renderer = null;
    this.scene = null;
    this.videoTarget = null;
    this.targetVisible = false;
    this.fps = 0;
    this.frameCount = 0;
    this.lastFpsAt = performance.now();
    this.active = false;
    this.resizeHandler = null;
    this.cameraStream = null;
    this.cameraVideo = null;
  }

  async start() {
    if (this.active) return;

    const supportError = getSupportError();
    if (supportError) throw supportError;

    try {
      // Ask for the native browser camera immediately from the user's tap.
      // Passing this stream to Zappar avoids a second permission flow that
      // can stall on Android Chrome.
      this.cameraStream = await openRearCamera(this.config.camera);
      this.cameraVideo = await createCameraVideo(this.cameraStream, this.container);
      await ensureTargetExists(this.config.zapparTarget);

      this.videoTarget = new VideoTarget({
        posterUrl: this.config.poster,
        videoUrl: this.config.video,
        // Zappar's image-anchor coordinates run from -1 to +1 vertically.
        planeWidth: 2 * this.config.targetWidth / this.config.targetHeight,
        planeHeight: 2,
        cropX: this.config.videoCropX,
        overscan: this.config.planeOverscan,
        zOffset: this.config.planeZOffset,
      });
      await this.videoTarget.load();

      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
      if ('outputColorSpace' in this.renderer) {
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      }
      this.renderer.domElement.style.position = 'absolute';
      this.renderer.domElement.style.inset = '0';
      this.container.appendChild(this.renderer.domElement);
      this.resizeHandler = () => {
        if (!this.renderer) return;
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        if (width > 0 && height > 0) this.renderer.setSize(width, height);
      };
      window.addEventListener('resize', this.resizeHandler, { passive: true });
      window.visualViewport?.addEventListener('resize', this.resizeHandler, { passive: true });

      this.pipeline = new ZapparThree.Pipeline();
      this.pipeline.glContextSet(this.renderer.getContext());
      this.camera = new ZapparThree.Camera({
        pipeline: this.pipeline,
        rearCameraSource: this.cameraVideo,
      });
      this.camera.profile = ZapparThree.CameraProfile.High;
      this.camera.rearCameraMirrorMode = ZapparThree.CameraMirrorMode.None;
      this.camera.handleColorSpace(this.renderer);

      this.scene = new THREE.Scene();
      this.scene.background = this.camera.backgroundTexture;

      this.tracker = new ZapparThree.ImageTracker(undefined, this.pipeline);
      await this.tracker.loadTarget(this.config.zapparTarget);
      this.anchorGroup = new ZapparThree.ImageAnchorGroup(this.camera, this.tracker);
      this.anchorGroup.add(this.videoTarget.mesh);
      this.anchorGroup.add(this.videoTarget.posterMesh);
      this.scene.add(this.anchorGroup);

      this.tracker.onVisible.bind(() => this.handleTargetFound());
      this.tracker.onNotVisible.bind(() => this.handleTargetLost());

      this.camera.start(false);

      this.renderer.setAnimationLoop(() => {
        this.recordFrame();
        this.camera.updateFrame(this.renderer);
        this.renderer.render(this.scene, this.camera);
      });

      this.active = true;
      this.callbacks.onReady?.();
    } catch (error) {
      await this.stop();
      throw classifyZapparError(error);
    }
  }

  handleTargetFound() {
    if (this.targetVisible) return;
    this.targetVisible = true;
    this.videoTarget.show();
    this.callbacks.onTargetFound?.();
    this.videoTarget.play().catch((error) => this.callbacks.onPlaybackBlocked?.(error));
  }

  handleTargetLost() {
    if (!this.targetVisible) return;
    this.targetVisible = false;
    this.videoTarget.pause();
    this.videoTarget.hide();
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
    return {
      fps: this.fps,
      targetVisible: this.targetVisible,
      videoPlaying: Boolean(this.videoTarget?.isPlaying),
      cameraResolution: this.pipeline?.cameraDataSize?.().join(' × ') || 'Zappar High',
      cameraFrameRate: null,
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
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
      window.visualViewport?.removeEventListener('resize', this.resizeHandler);
      this.resizeHandler = null;
    }
    this.renderer?.setAnimationLoop(null);
    this.videoTarget?.dispose();
    this.tracker?.destroy();
    this.camera?.stop();
    this.camera?.dispose();
    this.cameraVideo?.pause();
    if (this.cameraVideo) this.cameraVideo.srcObject = null;
    this.cameraStream?.getTracks().forEach((track) => track.stop());
    this.pipeline?.destroy();
    this.renderer?.dispose();
    this.container.replaceChildren();
    this.pipeline = null;
    this.camera = null;
    this.tracker = null;
    this.anchorGroup = null;
    this.renderer = null;
    this.scene = null;
    this.videoTarget = null;
    this.cameraStream = null;
    this.cameraVideo = null;
  }
}
