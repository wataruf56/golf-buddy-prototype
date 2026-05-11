'use client';

// Lazy MediaPipe Pose Landmarker singleton.
//
// We dynamically import @mediapipe/tasks-vision and load the pose model the
// first time a snapshot card asks for a pose. Subsequent calls reuse the
// same instance (~6MB model + ~3MB WASM, served from Google's CDN).
//
// Public API:
//   detectPose(imageBitmap | HTMLVideoElement) → Point[] (33 normalised landmarks)
//
// Caller is responsible for loading the frame onto a canvas / providing a
// video source. We accept anything that PoseLandmarker.detect() accepts.

import type { Point } from './poseLandmarks';

let landmarkerPromise: Promise<any> | null = null;

async function getLandmarker(): Promise<any> {
  if (landmarkerPromise) return landmarkerPromise;
  landmarkerPromise = (async () => {
    const vision = await import('@mediapipe/tasks-vision');
    const fileset = await vision.FilesetResolver.forVisionTasks(
      // Pulls the WASM runtime from Google's CDN. Keeps our bundle small.
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm',
    );
    const landmarker = await vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: {
        // Lightweight model — ~6MB, fast enough for one-shot frame inference
        // on phones. The "full" model is more accurate but ~25MB.
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
        delegate: 'GPU',
      },
      runningMode: 'IMAGE',
      numPoses: 1,
      minPoseDetectionConfidence: 0.4,
      minPosePresenceConfidence: 0.4,
      minTrackingConfidence: 0.4,
    });
    return landmarker;
  })();
  return landmarkerPromise;
}

/**
 * Run pose detection on a single frame. Returns 33 normalised landmarks
 * ({x, y} each in 0..1 of the source frame), or null if no pose was found.
 */
export async function detectPose(source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | ImageBitmap): Promise<Point[] | null> {
  try {
    const landmarker = await getLandmarker();
    const result = landmarker.detect(source as any);
    const first = result?.landmarks?.[0];
    if (!first || !Array.isArray(first)) return null;
    return first.map((p: any) => ({ x: p.x, y: p.y }));
  } catch (e) {
    console.warn('[poseDetector] detection failed', e);
    return null;
  }
}
