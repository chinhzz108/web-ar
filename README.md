# Mầm Book · WebAR image target prototype

This is a Vite + Three.js WebAR image-tracking experience. The default engine is Zappar Universal AR 4.3, which owns the camera/CV pipeline and exposes a pose-aware image anchor. MindAR 1.2.5 remains available as an A/B fallback. The printed card is the only target; the animation is a `THREE.VideoTexture` attached to the tracked planar anchor instead of CSS screen coordinates.

## Architecture

```text
index.html
└── src/main.js
    ├── src/ar/config.js       target/video dimensions and tracking tuning
    ├── src/ar/ARController.js MindAR lifecycle, camera, anchor events
    ├── src/ar/ZapparARController.js current Zappar image-tracking engine
    ├── src/ar/VideoTarget.js   poster/video textures, crop, target plane
    ├── src/ui/ui.js            landing/scanning/tracking/error states
    └── src/styles/main.css     responsive premium UI

public/assets/
├── target.jpg                  1374 × 1145 reference image
├── targets.mind                precompiled MindAR feature data
├── target.zpt                  Zappar trained image target
└── animation.mp4               AR animation video
```

Zappar `@zappar/zappar-threejs@4.3.0` is the default engine and `@zappar/imagetraining@4.3.2` generates the `.zpt` target locally. MindAR 1.2.5 is kept for comparison with `?engine=mindar`. Three.js is pinned to `0.160.0`, supported by both integrations.

## Install and run

```powershell
npm install
npm run dev
```

The Vite config enables a local HTTPS certificate through `@vitejs/plugin-basic-ssl`, because camera access requires a secure context. Open the HTTPS localhost URL shown by Vite. A deployed Vercel or Cloudflare Pages URL is HTTPS automatically.

Create a production bundle with:

```powershell
npm run build
npm run preview
```

`dist/` is the deployment directory.

The default URL uses Zappar:

```text
http://localhost:5173/?engine=zappar
```

To compare the old engine:

```text
http://localhost:5173/?engine=mindar
```

### Node 24 note

MindAR declares the native `canvas` package because its repository also includes a Node-side compiler. The browser runtime does not use that native compiler path. This project includes `.npmrc` with `ignore-scripts=true` so installation does not attempt to compile `canvas` on Node 24/Windows; the Vite bundle builds and runs using MindAR’s prebuilt browser distribution. If you remove that setting, use a Node version with a matching `canvas` prebuilt binary or install the Visual Studio C++ build tools.

## Compile `target.jpg` into `targets.mind`

This is a build-time operation. The app never compiles targets while a user is scanning.

The supplied `targets.mind` was generated from the supplied `public/assets/target.jpg` with the official MindAR `Compiler` in a local browser page. To regenerate it locally:

```powershell
python tools\target-compiler-server.py
```

Open `http://127.0.0.1:8000/tools/compile-target.html`, choose `public/assets/target.jpg`, and click **Compile target**. The local helper writes the compiled binary to `public/assets/targets.mind`.

The official online alternative is [MindAR’s Image Targets Compiler](https://hiukim.github.io/mind-ar-js-doc/tools/compile/): upload the complete target image, click **Start**, inspect the feature visualization, download `targets.mind`, and place it at `public/assets/targets.mind`. Use the complete rectangular card, not a cropped face or hat.

## Compile the Zappar target

The Zappar target is generated locally from the same source image, so both engines receive identical artwork geometry:

```powershell
npm run train:zappar
```

This writes `public/assets/target.zpt`. The current Zappar engine uses its `CameraProfile.High` path, a single WebGL camera pipeline, and `ImageAnchorGroup`; it does not open a second camera stream or reconcile two independent camera transforms.

## User flow

1. Tap **Trải nghiệm AR**.
2. The app checks secure-context/WebGL support and makes an environment-facing `getUserMedia()` permission request.
3. Zappar starts its rear-camera WebGL pipeline using the high camera profile and searches the trained flat image target.
4. When the image anchor is visible, `onVisible` reveals the video plane and calls `video.play()` while muted.
5. A short interruption is tolerated by the anchor visibility lifecycle; the video is only paused when the tracker reports the anchor not visible.
6. Sound, replay, and close controls remain available. Replay is the only action that resets `currentTime`.

The target plane is `PlaneGeometry(1, 1145 / 1374)`. The supplied target is 1.20:1 but `animation.mp4` is 1280 × 720 (16:9), so `VideoTarget.fitVideoToTarget()` crops the longer texture dimension with `repeat` and `offset` rather than stretching it. `videoCropX: 0.56` keeps the right-hand “Ghế làng” sign visible; a final 1.20:1 master encode is still recommended because it removes crop ambiguity and gives the cleanest pixel alignment.

## Asset check

`tools/compare-assets.html` is a local-only utility for comparing the target with frame 0 and checking crop choices. It is not part of the user-facing AR screen.

## Mobile testing

- Android Chrome: use a deployed HTTPS preview or the USB localhost path; allow camera access; use the rear camera. Start with the default Zappar URL, then compare `?engine=mindar` on the same phone.
- iPhone Safari: use HTTPS, allow camera access, keep the full card visible, and use a recent iOS version with WebGL support.
- Use diffuse light, avoid glare, and keep the complete card inside the scanning frame. The target has natural texture and local contrast, which are useful for planar tracking.
- If the camera still looks soft, clean the rear lens, use diffuse light, and keep the target fully inside the frame; browser/device camera constraints can still fall back on older or busy phones.
- If the phone is on the same Wi-Fi as the computer, run `npm run dev -- --host` and expose the HTTPS Vite port through a trusted HTTPS tunnel or a locally trusted certificate. A plain LAN HTTP URL is not a valid camera origin.

### Android over USB

USB is the fastest local path when the Android phone has Developer options and USB debugging enabled. Install [Android Platform-Tools](https://developer.android.com/tools/releases/platform-tools), connect the phone, accept the RSA prompt, then run:

```powershell
adb devices
adb reverse tcp:5173 tcp:5173
npm run dev:usb
```

Open `http://localhost:5173` on the phone. `localhost` is treated as a trustworthy origin by the browser, while `http://192.168.x.x:5173` over Wi-Fi is not. USB debugging is Android-only; for iPhone use an HTTPS deployment or tunnel.

For one-click startup on Windows, double-click [`start-ar-usb.bat`](start-ar-usb.bat). It checks ADB, starts the USB Vite server, creates the reverse port, and asks Android to open the WebAR URL. Keep the Vite window open while testing.

## Deploy

### Vercel

```powershell
npm install -g vercel
npm run build
vercel
```

Use `dist` as the output directory if Vercel asks. The default Vite build command is `npm run build`.

### Cloudflare Pages

```powershell
npm install -g wrangler
npm run build
wrangler pages deploy dist
```

Set the production build command to `npm run build` and the output directory to `dist` if configuring the project in the Cloudflare dashboard.

## Performance choices and limitations

- One target keeps feature matching bounded in both engines; Zappar's `ImageAnchorGroup` owns the tracked pose and the WebGL camera background.
- The default Zappar engine owns GPU/WASM camera processing; the app does not add another ML model or process camera frames through OpenCV, YOLO, TensorFlow detection, or MediaPipe.
- The overlay is one `PlaneGeometry` with `MeshBasicMaterial`, no lights, shadows, models, post-processing, or unnecessary scene objects.
- The animation pauses after a confirmed target loss and keeps its current time through short occlusions.
- `VideoTexture` is linear-filtered without mipmaps; the MP4 is muted for reliable mobile autoplay.
- Camera access is browser-controlled and requires HTTPS (except localhost). Autoplay with audio is not guaranteed, so sound is enabled only after the user taps the sound control.
- The MindAR fallback still patches its official `_startVideo()` quality limitation. The Zappar path uses its supported `CameraProfile.High` instead of opening a second camera stream.
- One Euro values are retained only for the MindAR comparison path. Zappar is tested as the primary path so the tracker and camera pose come from one maintained engine.

## Research basis

- Artivive demonstrates the same established product pattern: recognize a physical artwork/trigger image and attach video or other digital layers so the artwork comes alive.
- MindAR documents the One Euro filter trade-off used here: lower `filterMinCF` reduces low-speed jitter, while higher `filterBeta` reduces motion lag.
- The One Euro paper formalizes that speed-dependent trade-off: low cutoff at low speed stabilizes the signal, while a higher cutoff during fast movement reduces lag.
- Planar-tracking literature consistently uses feature correspondences plus a homography for a flat target. That is why the physical card remains the single rectangular target and why preserving its aspect ratio matters more than adding visual effects.

## Official references

- [MindAR installation and Three.js ES-module API](https://hiukim.github.io/mind-ar-js-doc/installation/)
- [MindAR Three.js image-tracking example](https://github.com/hiukim/mind-ar-js/blob/master/examples/image-tracking/three.html)
- [MindAR tracking configuration](https://hiukim.github.io/mind-ar-js-doc/quick-start/tracking-config/)
- [MindAR target compilation guide](https://hiukim.github.io/mind-ar-js-doc/quick-start/compile/)
- [MindAR 1.2.5 source camera startup](https://raw.githubusercontent.com/hiukim/mind-ar-js/master/src/image-target/three.js)
- [Zappar Universal AR image tracking](https://docs.zap.works/universal-ar/javascript/tracking/image-tracking/)
- [Zappar Three.js SDK](https://www.npmjs.com/package/@zappar/zappar-threejs)
- [Zappar image training](https://www.npmjs.com/package/@zappar/imagetraining)
- [Zappar browser compatibility](https://docs.zap.works/universal-ar/javascript/getting-started/compatibility/)
- [W3C Media Capture and Streams constraints](https://www.w3.org/TR/mediacapture-streams/)
- [MDN `applyConstraints()`](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/applyConstraints)
- [Casiez, Roussel & Vogel, “1€ Filter”](https://3dvar.com/Casiez20121.pdf)
- [Artivive image-triggered artwork AR](https://www.artivive.com/resources/create-art)
- [Planar object tracking via weighted optical flow (WACV 2023)](https://openaccess.thecvf.com/content/WACV2023/papers/Serych_Planar_Object_Tracking_via_Weighted_Optical_Flow_WACV2023_paper.pdf)
- [Markerless augmented advertising using homography-based tracking](https://arxiv.org/abs/1907.09394)
