/** Pure zoom/pan math for the image lightbox. Offsets are in px relative to the viewport center. */
export type ZoomView = { readonly scale: number; readonly x: number; readonly y: number };

export const MIN_SCALE = 1;
export const MAX_SCALE = 8;
export const ZOOM_STEP = 1.25;
export const RESET_VIEW: ZoomView = { scale: MIN_SCALE, x: 0, y: 0 };

export const clampScale = (scale: number): number => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

/** Scale by `factor` keeping the point under `anchor` (offset from viewport center) fixed. */
export const zoomAt = (
  view: ZoomView,
  factor: number,
  anchor: { readonly x: number; readonly y: number },
): ZoomView => {
  const scale = clampScale(view.scale * factor);
  if (scale === MIN_SCALE) return RESET_VIEW;
  const ratio = scale / view.scale;
  return { scale, x: anchor.x - (anchor.x - view.x) * ratio, y: anchor.y - (anchor.y - view.y) * ratio };
};

/** Keep the image from being dragged fully out of `bounds` (viewport size): its edge may reach the viewport center at most. */
export const clampPan = (view: ZoomView, bounds: { readonly height: number; readonly width: number }): ZoomView => {
  if (view.scale <= MIN_SCALE) return RESET_VIEW;
  const maxX = (bounds.width * view.scale) / 2;
  const maxY = (bounds.height * view.scale) / 2;
  return { ...view, x: Math.min(maxX, Math.max(-maxX, view.x)), y: Math.min(maxY, Math.max(-maxY, view.y)) };
};
