// MediaPipe Pose body landmark map.
//
// MediaPipe Pose returns 33 normalised landmarks (0..1 of frame width/height).
// Index reference: https://developers.google.com/mediapipe/solutions/vision/pose_landmarker
//   0  nose
//   1  left_eye_inner       2  left_eye           3  left_eye_outer
//   4  right_eye_inner      5  right_eye          6  right_eye_outer
//   7  left_ear             8  right_ear
//   9  mouth_left          10  mouth_right
//  11  left_shoulder       12  right_shoulder
//  13  left_elbow          14  right_elbow
//  15  left_wrist          16  right_wrist
//  17  left_pinky          18  right_pinky
//  19  left_index          20  right_index
//  21  left_thumb          22  right_thumb
//  23  left_hip            24  right_hip
//  25  left_knee           26  right_knee
//  27  left_ankle          28  right_ankle
//  29  left_heel           30  right_heel
//  31  left_foot_index     32  right_foot_index
//
// We intentionally don't expose every label to the AI prompt — we restrict it
// to the parts golfers actually talk about so MediaPipe can reliably resolve
// each label to a single landmark (or a midpoint of two).

export type LandmarkResolver =
  | { kind: 'single'; index: number }
  | { kind: 'midpoint'; a: number; b: number };

// Japanese body-part label → resolver. Keys are lowercased and we strip
// leading/trailing whitespace before lookup so AI quirks don't matter.
//
// Ordering note: longer / more specific keys come first because we do a
// "starts with" match too, e.g. "右手首" must match before "右手".
const RAW_MAP: Record<string, LandmarkResolver> = {
  // 頭部
  '頭': { kind: 'single', index: 0 },
  '頭の位置': { kind: 'single', index: 0 },
  '鼻': { kind: 'single', index: 0 },
  '顔': { kind: 'single', index: 0 },

  // 肩
  '右肩': { kind: 'single', index: 12 },
  '左肩': { kind: 'single', index: 11 },
  '両肩': { kind: 'midpoint', a: 11, b: 12 },
  '肩': { kind: 'midpoint', a: 11, b: 12 },

  // 肘
  '右肘': { kind: 'single', index: 14 },
  '左肘': { kind: 'single', index: 13 },
  '肘': { kind: 'midpoint', a: 13, b: 14 },

  // 手首 / グリップ
  '右手首': { kind: 'single', index: 16 },
  '左手首': { kind: 'single', index: 15 },
  '手首': { kind: 'midpoint', a: 15, b: 16 },
  // グリップ位置 ≒ 両手首の中点
  'グリップ': { kind: 'midpoint', a: 15, b: 16 },
  '右手': { kind: 'single', index: 16 },
  '左手': { kind: 'single', index: 15 },

  // 腰 / お尻
  '右腰': { kind: 'single', index: 24 },
  '左腰': { kind: 'single', index: 23 },
  '腰': { kind: 'midpoint', a: 23, b: 24 },
  'お尻': { kind: 'midpoint', a: 23, b: 24 },
  'ヒップ': { kind: 'midpoint', a: 23, b: 24 },

  // 膝
  '右膝': { kind: 'single', index: 26 },
  '左膝': { kind: 'single', index: 25 },
  '膝': { kind: 'midpoint', a: 25, b: 26 },

  // 足首 / 足元
  '右足首': { kind: 'single', index: 28 },
  '左足首': { kind: 'single', index: 27 },
  '足首': { kind: 'midpoint', a: 27, b: 28 },
  '足元': { kind: 'midpoint', a: 27, b: 28 },
  '右足': { kind: 'single', index: 28 },
  '左足': { kind: 'single', index: 27 },
  '足': { kind: 'midpoint', a: 27, b: 28 },

  // 体軸 (両肩中点と両腰中点の中央) — landmark 単体には無いので2点指定で代用
  '体': { kind: 'midpoint', a: 12, b: 24 },
  '体軸': { kind: 'midpoint', a: 12, b: 24 },
  '背骨': { kind: 'midpoint', a: 12, b: 24 },
};

// Build a quick lookup: lowercased key → resolver. We keep the original
// Japanese map above for readability and copy it down once.
const MAP_BY_KEY: Map<string, LandmarkResolver> = new Map(
  Object.entries(RAW_MAP).map(([k, v]) => [k.trim(), v]),
);

// Public list of label names the AI is allowed to use. Sent into the v3
// prompt so the model never asks for クラブヘッド / ボール (MediaPipe doesn't
// know clubs).
export const ALLOWED_BODY_PARTS: string[] = Object.keys(RAW_MAP);

/** Resolve a Japanese body-part label to a MediaPipe landmark resolver. */
export function resolveBodyPart(label: string | undefined): LandmarkResolver | null {
  if (!label) return null;
  const trimmed = label.trim();
  // Exact match first.
  if (MAP_BY_KEY.has(trimmed)) return MAP_BY_KEY.get(trimmed)!;
  // Try removing common decorations (parens, punctuation).
  const stripped = trimmed.replace(/[（()]/g, '').replace(/[。,、,]/g, '').trim();
  if (MAP_BY_KEY.has(stripped)) return MAP_BY_KEY.get(stripped)!;
  // Substring fallback: pick the LONGEST key that appears in the label.
  // (Stops "右手首" from being shadowed by "右手".)
  let best: { key: string; resolver: LandmarkResolver } | null = null;
  for (const [k, v] of MAP_BY_KEY.entries()) {
    if (stripped.includes(k) && (!best || k.length > best.key.length)) {
      best = { key: k, resolver: v };
    }
  }
  return best?.resolver || null;
}

export type Point = { x: number; y: number };

/** Compute the (x,y) for a resolver given a flat landmarks array. */
export function pointForResolver(
  resolver: LandmarkResolver,
  landmarks: Point[],
): Point | null {
  if (!Array.isArray(landmarks) || landmarks.length < 33) return null;
  if (resolver.kind === 'single') {
    const p = landmarks[resolver.index];
    return p ? { x: p.x, y: p.y } : null;
  }
  const a = landmarks[resolver.a];
  const b = landmarks[resolver.b];
  if (!a || !b) return null;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
