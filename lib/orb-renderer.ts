export type OrbAppearance = { phase: number; activity: number; attention: number };
const frames = new WeakMap<HTMLCanvasElement, OrbAppearance>();
export function orbAppearance(canvas?: HTMLCanvasElement | null): OrbAppearance {
  return (canvas && frames.get(canvas)) || { phase: 0, activity: 0, attention: 0 };
}

const points = Array.from({ length: 680 }, (_, index) => {
  const y = 1 - (index / 679) * 2;
  const radial = Math.sqrt(1 - y * y);
  const angle = index * Math.PI * (3 - Math.sqrt(5));
  return { x: Math.cos(angle) * radial, y, z: Math.sin(angle) * radial };
});

/** The same vector artwork is painted at the live or transition canvas resolution. */
export function paintOrb(context: CanvasRenderingContext2D, width: number, height: number, appearance: OrbAppearance) {
  if (width <= 0 || height <= 0) return;
  const { phase, activity, attention } = appearance;
  frames.set(context.canvas, appearance);
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width * 0.36, height * 0.36);
  const small = width < 90;
  const breathe = 1 + Math.sin(phase * 1.25) * (.015 + activity * .035) + attention * .035;
  context.clearRect(0, 0, width, height);
  const ambient = context.createRadialGradient(cx, cy, 0, cx, cy, radius * 1.5);
  ambient.addColorStop(0, `rgba(229, 170, 94, ${.085 + activity * .09 + attention * .035})`);
  ambient.addColorStop(0.55, "rgba(169, 108, 60, 0.04)");
  ambient.addColorStop(1, "rgba(43, 33, 28, 0)");
  context.fillStyle = ambient;
  context.fillRect(0, 0, width, height);

  // Fine radial ticks and restrained, segmented orbital arcs.
  const ticks = small ? 40 : 120;
  for (let i = 0; i < ticks; i++) {
    const a = i * Math.PI * 2 / ticks;
    const inner = radius * (i % 5 === 0 ? 1.05 : 1.075);
    const outer = radius * 1.10;
    context.beginPath();
    context.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    context.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
    context.strokeStyle = i % 5 === 0 ? "rgba(205, 167, 119, .35)" : "rgba(205, 167, 119, .10)";
    context.lineWidth = 0.7;
    context.stroke();
  }
  for (let orbit = 0; orbit < 4; orbit++) {
    const orbitRadius = radius * (0.67 + orbit * 0.10) * (1 + Math.sin(phase * .8 + orbit) * activity * .025);
    const offset = phase * (orbit % 2 ? 0.11 : -0.07) + orbit * 1.4;
    context.beginPath();
    context.arc(cx, cy, orbitRadius, 0, Math.PI * 2);
    context.strokeStyle = "rgba(171, 124, 77, .12)";
    context.lineWidth = 0.65;
    context.stroke();
    for (let segment = 0; segment < 3; segment++) {
      const start = offset + segment * Math.PI * 2 / 3;
      context.beginPath();
      context.arc(cx, cy, orbitRadius, start, start + 0.38 + orbit * 0.12);
      context.strokeStyle = orbit % 2 ? "rgba(193, 139, 88, .55)" : "rgba(237, 196, 135, .72)";
      context.lineWidth = orbit === 1 ? 2.5 : 1.2;
      context.stroke();
    }
  }

  // Two gently undulating point rings surround the core.
  for (let ring = 0; ring < 2; ring++) {
    const count = small ? 80 : 290;
    for (let i = 0; i < count; i++) {
      const a = i / count * Math.PI * 2;
      const ripple = (Math.sin(a * 5 + phase * (.44 + activity * .5) + ring) * 2.9
        + Math.cos(a * 3 - phase * .28) * 1.7) * (1 + activity * 1.7 + attention * .6) * Math.min(1, Math.min(width, height) / 180);
      const r = radius * (0.79 + ring * 0.12) + ripple;
      const alpha = 0.20 + (Math.sin(a + phase * .2) + 1) * (.16 + activity * .12);
      context.beginPath();
      context.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0.65, 0, Math.PI * 2);
      context.fillStyle = `rgba(238, 197, 137, ${alpha})`;
      context.fill();
    }
  }

  // Fibonacci-sphere points rotate as a single lightweight 3D form.
  const turn = phase * 0.13;
  const tilt = -0.22;
  const sphereRadius = radius * (.48 + activity * .13) * breathe;
  // Busy work opens the sphere into a flowing torus, then settles back.
  const projected = points.filter((_, index) => !small || index % 4 === 0).map(point => {
    const longitude = Math.atan2(point.z, point.x);
    const latitude = Math.acos(Math.max(-1, Math.min(1, point.y))) * 2 + phase * .7;
    const ring = .72 + .25 * Math.cos(latitude);
    const blend = activity * .92;
    const px = point.x * (1 - blend) + Math.cos(longitude) * ring * blend;
    const py = point.y * (1 - blend) + Math.sin(latitude) * .38 * blend;
    const pz = point.z * (1 - blend) + Math.sin(longitude) * ring * blend;
    const x = px * Math.cos(turn) - pz * Math.sin(turn);
    const z0 = px * Math.sin(turn) + pz * Math.cos(turn);
    const activeTilt = tilt + activity * (.45 + Math.sin(phase * .3) * .4);
    const y = py * Math.cos(activeTilt) - z0 * Math.sin(activeTilt);
    const z = py * Math.sin(activeTilt) + z0 * Math.cos(activeTilt);
    return { x, y, z };
  }).sort((a, b) => a.z - b.z);
  for (const point of projected) {
    const depth = (point.z + 1) / 2;
    const size = (small ? .4 : .45) + depth * (.65 + activity * .24);
    const scale = 1 + point.z * 0.13;
    context.beginPath();
    context.arc(cx + point.x * sphereRadius * scale, cy + point.y * sphereRadius * scale, size, 0, Math.PI * 2);
    context.fillStyle = `rgba(249, 215, 164, ${0.08 + depth * (.65 + activity * .18)})`;
    context.fill();
  }
  if (activity > .01) {
    for (let wave = 0; wave < 2; wave++) {
      const progress = (phase * .19 + wave * .5) % 1;
      context.beginPath();
      context.arc(cx, cy, radius * (.2 + progress * .55), 0, Math.PI * 2);
      context.strokeStyle = `rgba(247, 202, 139, ${activity * (1 - progress) * .18})`;
      context.lineWidth = small ? .5 : .8; context.stroke();
    }
  }
  const innerGlow = context.createRadialGradient(cx, cy, 0, cx, cy, radius * .19);
  innerGlow.addColorStop(0, "rgba(255, 224, 178, .13)");
  innerGlow.addColorStop(1, "rgba(255, 224, 178, 0)");
  context.fillStyle = innerGlow;
  context.beginPath();
  context.arc(cx, cy, radius * .19, 0, Math.PI * 2);
  context.fill();
  // Four quiet alignment marks anchor the composition.
  context.strokeStyle = "rgba(218, 175, 124, .38)";
  context.lineWidth = 0.8;
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    context.beginPath();
    context.moveTo(cx + Math.cos(a) * radius * 1.18, cy + Math.sin(a) * radius * 1.18);
    context.lineTo(cx + Math.cos(a) * radius * 1.30, cy + Math.sin(a) * radius * 1.30);
    context.stroke();
  }
}
