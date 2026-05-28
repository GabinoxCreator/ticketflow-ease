interface Bounds { minX: number; minY: number; maxX: number; maxY: number; }
interface FitViewResult { zoom: number; panX: number; panY: number; }
interface ItemWithPosition { x: number; y: number; width?: number; height?: number; }

export function calculateBounds(items: ItemWithPosition[]): Bounds {
  if (items.length === 0) return { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  return items.reduce(
    (acc, item) => ({
      minX: Math.min(acc.minX, item.x),
      minY: Math.min(acc.minY, item.y),
      maxX: Math.max(acc.maxX, item.x + (item.width || 60)),
      maxY: Math.max(acc.maxY, item.y + (item.height || 60)),
    }),
    { minX: Infinity, minY: Infinity, maxX: 0, maxY: 0 }
  );
}

export function calculateFitView(
  bounds: Bounds, containerWidth: number, containerHeight: number,
  padding = 60, minZoom = 0.2, maxZoom = 1
): FitViewResult {
  const contentWidth = bounds.maxX - bounds.minX || 100;
  const contentHeight = bounds.maxY - bounds.minY || 100;
  const centerX = bounds.minX + contentWidth / 2;
  const centerY = bounds.minY + contentHeight / 2;
  const availableWidth = containerWidth - padding;
  const availableHeight = containerHeight - padding;
  const zoomToFit = Math.min(availableWidth / contentWidth, availableHeight / contentHeight);
  const zoom = Math.max(minZoom, Math.min(maxZoom, zoomToFit));
  const panX = containerWidth / 2 - centerX * zoom;
  const panY = containerHeight / 2 - centerY * zoom;
  return { zoom, panX, panY };
}
