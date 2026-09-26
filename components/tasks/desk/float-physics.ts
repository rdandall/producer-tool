export interface FloatState { x: number; y: number; vx: number; vy: number }

/** Damped wall rebounds. Destination actions deliberately never run in this loop. */
export function stepFloat(state: FloatState, seconds: number, maxX: number, maxY: number): FloatState {
  const dt = Math.max(0, Math.min(seconds, .032));
  const friction = Math.exp(-.65 * dt);
  let { vx, vy } = state;
  let x = state.x + vx * dt;
  let y = state.y + vy * dt;
  if (x < 0 || x > maxX) { x = Math.max(0, Math.min(x, maxX)); vx *= -.82; }
  if (y < 0 || y > maxY) { y = Math.max(0, Math.min(y, maxY)); vy *= -.82; }
  return { x, y, vx: maxX <= 0 ? 0 : vx * friction, vy: maxY <= 0 ? 0 : vy * friction };
}
