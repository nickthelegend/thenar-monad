// On-device object detection: MediaPipe's EfficientDet-Lite0 (COCO, 80 classes),
// served from this app so a headset on a closed network still has it.
// Nothing is fetched from a third party at scan time.
import { FilesetResolver, ObjectDetector } from "@mediapipe/tasks-vision";

// Both are copied into public/vision by `pnpm vision` (run before dev and build).
const WASM = new URL("vision/wasm", document.baseURI).href;
const MODEL = new URL("vision/efficientdet_lite0.tflite", document.baseURI).href;

let detector = null;

// The wasm runtime writes its own INFO lines ("Created TensorFlow Lite XNNPACK
// delegate") to stderr, which the browser shows as errors. Demote exactly
// those while it runs; anything else it prints stays an error.
async function quietInfo(fn) {
  const error = console.error;
  console.error = (...a) => (typeof a[0] === "string" && a[0].startsWith("INFO: ") ? console.info(...a) : error(...a));
  try {
    return await fn();
  } finally {
    console.error = error;
  }
}

export async function loadDetector() {
  if (detector) return detector;
  detector = await quietInfo(async () => {
    const fileset = await FilesetResolver.forVisionTasks(WASM);
    return ObjectDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL, delegate: "CPU" },
      runningMode: "IMAGE",
      scoreThreshold: 0.35,
      maxResults: 12,
    });
  });
  return detector;
}

/**
 * Detect objects in an image, video frame or canvas. Returns boxes in the
 * source's pixel coordinates, best first. People are dropped: the operator
 * is not a task object.
 */
export async function detect(source) {
  const d = await loadDetector();
  const out = await quietInfo(() => d.detect(source));
  return out.detections
    .map((x) => ({
      label: x.categories[0].categoryName,
      score: x.categories[0].score,
      box: { x: x.boundingBox.originX, y: x.boundingBox.originY, w: x.boundingBox.width, h: x.boundingBox.height },
    }))
    .filter((x) => x.label !== "person" && x.label !== "dining table")
    .sort((a, b) => b.score - a.score);
}

/** The dominant colour inside a box, as a hex string: what the virtual stand-in is painted. */
export function sampleColour(canvas, box) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const x = Math.max(0, Math.round(box.x + box.w * 0.3)), y = Math.max(0, Math.round(box.y + box.h * 0.3));
  const w = Math.max(1, Math.round(box.w * 0.4)), h = Math.max(1, Math.round(box.h * 0.4));
  const d = ctx.getImageData(x, y, Math.min(w, canvas.width - x), Math.min(h, canvas.height - y)).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) (r += d[i]), (g += d[i + 1]), (b += d[i + 2]), n++;
  const hex = (v) => Math.round(v / Math.max(1, n)).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}
