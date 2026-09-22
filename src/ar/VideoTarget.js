import * as THREE from 'three';

const clamp01 = (value) => Math.max(0, Math.min(1, value));

export class VideoTarget {
  constructor({
    posterUrl,
    videoUrl,
    planeWidth,
    planeHeight,
    cropX = 0.5,
    zOffset = 0,
    overscan = 0,
  }) {
    this.video = document.createElement('video');
    this.video.src = videoUrl;
    this.video.loop = true;
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.preload = 'auto';
    this.video.setAttribute('playsinline', '');
    this.video.setAttribute('webkit-playsinline', '');

    this.texture = new THREE.VideoTexture(this.video);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;

    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    this.geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    const overscanScale = 1 + Math.max(0, overscan);
    this.mesh.scale.set(overscanScale, overscanScale, 1);
    this.mesh.position.z = zOffset;
    this.mesh.visible = false;

    // Show the target image until the first decoded video frame is ready.
    // This prevents a black flash and makes the transition feel anchored to
    // the printed image rather than to the camera's first video frame.
    this.posterReady = false;
    this.hasPresentedFrame = false;
    this.posterMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 1,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.posterMesh = new THREE.Mesh(this.geometry, this.posterMaterial);
    this.posterMesh.scale.set(overscanScale, overscanScale, 1);
    this.posterMesh.position.z = zOffset + 0.0005;
    this.posterMesh.renderOrder = 1;
    this.posterMesh.visible = false;
    this.posterTexture = null;

    if (posterUrl) {
      this.posterTexture = new THREE.TextureLoader().load(posterUrl, (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        this.posterMaterial.map = texture;
        this.posterMaterial.needsUpdate = true;
        this.posterReady = true;
      });
    }

    this.targetAspect = planeWidth / planeHeight;
    this.cropX = clamp01(cropX);
    this.readyPromise = null;
    this.video.addEventListener('loadedmetadata', () => this.fitVideoToTarget());
  }

  load() {
    if (this.readyPromise) return this.readyPromise;

    this.readyPromise = new Promise((resolve, reject) => {
      const cleanup = () => {
        this.video.removeEventListener('loadedmetadata', handleReady);
        this.video.removeEventListener('error', handleError);
      };
      const handleReady = () => {
        cleanup();
        this.fitVideoToTarget();
        resolve();
      };
      const handleError = () => {
        cleanup();
        reject(new Error('VIDEO_LOAD_FAILED'));
      };

      if (this.video.readyState >= HTMLMediaElement.HAVE_METADATA) {
        handleReady();
        return;
      }

      this.video.addEventListener('loadedmetadata', handleReady, { once: true });
      this.video.addEventListener('error', handleError, { once: true });
      this.video.load();
    });

    return this.readyPromise;
  }

  /**
   * Preserve the target's 1.20:1 plane without stretching the video. The
   * supplied MP4 is 16:9, so the longer horizontal dimension is cropped. A
   * configurable crop position is important here: centre-cropping this
   * particular shot removes the right-hand "Ghế làng" sign from the target.
   */
  fitVideoToTarget() {
    if (!this.video.videoWidth || !this.video.videoHeight) return;

    const videoAspect = this.video.videoWidth / this.video.videoHeight;
    let repeatX = 1;
    let repeatY = 1;

    if (videoAspect > this.targetAspect) {
      repeatX = this.targetAspect / videoAspect;
    } else if (videoAspect < this.targetAspect) {
      repeatY = videoAspect / this.targetAspect;
    }

    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.repeat.set(repeatX, repeatY);
    this.texture.offset.set(
      (1 - repeatX) * this.cropX,
      (1 - repeatY) * 0.5,
    );
    this.texture.needsUpdate = true;
  }

  show() {
    this.mesh.visible = true;
    this.posterMesh.visible = this.posterReady && !this.hasPresentedFrame;
    if (this.posterMesh.visible) this.posterMaterial.opacity = 1;
  }

  hide() {
    this.mesh.visible = false;
    this.posterMesh.visible = false;
    this.posterMaterial.opacity = 1;
  }

  async revealVideo() {
    this.hasPresentedFrame = true;
    if (!this.posterMesh.visible) return;

    await new Promise((resolve) => {
      const startedAt = performance.now();
      const duration = 180;
      const step = (now) => {
        if (!this.posterMesh.visible) {
          resolve();
          return;
        }
        const progress = Math.min(1, (now - startedAt) / duration);
        this.posterMaterial.opacity = 1 - progress;
        if (progress < 1) {
          window.requestAnimationFrame(step);
        } else {
          this.posterMesh.visible = false;
          this.posterMaterial.opacity = 1;
          resolve();
        }
      };
      window.requestAnimationFrame(step);
    });
  }

  async play() {
    const result = this.video.play();
    if (result && typeof result.catch === 'function') {
      await result;
    }

    if (this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      await this.revealVideo();
      return;
    }

    await new Promise((resolve) => {
      let settled = false;
      let timeoutId;
      const finish = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        this.video.removeEventListener('loadeddata', finish);
        this.video.removeEventListener('canplay', finish);
        this.revealVideo().then(resolve);
      };

      this.video.addEventListener('loadeddata', finish, { once: true });
      this.video.addEventListener('canplay', finish, { once: true });
      timeoutId = window.setTimeout(finish, 500);
      if (typeof this.video.requestVideoFrameCallback === 'function') {
        this.video.requestVideoFrameCallback(finish);
      }
    });
  }

  pause() {
    this.video.pause();
  }

  reset() {
    this.video.currentTime = 0;
    this.hasPresentedFrame = false;
    if (this.mesh.visible) {
      this.posterMesh.visible = this.posterReady;
      this.posterMaterial.opacity = 1;
    }
  }

  setMuted(muted) {
    this.video.muted = muted;
    return this.video.muted;
  }

  get isMuted() {
    return this.video.muted;
  }

  get isPlaying() {
    return !this.video.paused && !this.video.ended;
  }

  dispose() {
    this.pause();
    this.video.removeAttribute('src');
    this.video.load();
    this.texture.dispose();
    this.posterTexture?.dispose();
    this.material.dispose();
    this.posterMaterial.dispose();
    this.geometry.dispose();
  }
}
