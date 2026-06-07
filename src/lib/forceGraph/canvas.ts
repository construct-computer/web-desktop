export function resizeCanvasToContainer(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): number {
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return dpr;
}

export function drawHaloText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  font: string,
  fillColor: string,
  alpha = 1,
  haloWidth = 3,
): void {
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = haloWidth;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fillColor;
  ctx.fillText(text, x, y);
}
