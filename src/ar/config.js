const targetWidth = 1374;
const targetHeight = 1145;

/**
 * Single source of truth for the physical target and the AR session.
 * MindAR's image-tracking defaults are kept here explicitly so the values
 * can be tuned in one place without scattering tracking constants.
 */
export const AR_CONFIG = Object.freeze({
  targetIndex: 0,
  targetWidth,
  targetHeight,
  planeWidth: 1,
  get planeHeight() {
    return targetHeight / targetWidth;
  },
  // Let the rendered artwork run a little past the tracked target edge. A
  // tiny bleed hides sub-pixel pose/corner quantisation on real cameras.
  planeOverscan: 0.018,
  planeZOffset: 0.001,
  target: '/assets/targets.mind',
  zapparTarget: '/assets/target.zpt',
  poster: '/assets/target.jpg',
  video: '/assets/animation.mp4',
  // animation.mp4 is 16:9 while the physical target is 1.20:1. This is a
  // normalized horizontal crop position: 0 = left, .5 = centre, 1 = right.
  // The supplied target matches the first video frame best at a slight
  // right-of-centre crop, so we keep the crop deterministic instead of
  // stretching the artwork.
  videoCropX: 0.56,
  maxTrack: 1,
  // One Euro tuning: a little more low-speed smoothing than MindAR's default,
  // while the higher beta keeps the overlay responsive during a fast move.
  filterMinCF: 0.0007,
  filterBeta: 1400,
  // Avoid a flash on brief occlusion without making initial detection feel
  // sluggish.
  warmupTolerance: 4,
  missTolerance: 7,
  camera: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1280, min: 640 },
    height: { ideal: 720, min: 480 },
    frameRate: { ideal: 30, max: 30 },
    resizeMode: 'crop-and-scale',
  },
});
