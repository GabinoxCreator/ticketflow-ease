/** Snap a value to a grid. grid=0 disables snapping. */
export const snap = (value: number, grid: number) =>
  grid > 0 ? Math.round(value / grid) * grid : value;
