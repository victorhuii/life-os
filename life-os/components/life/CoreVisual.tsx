"use client";

import { useEffect, useRef } from "react";

type CoreVisualProps = { animate: boolean; busy: boolean };

/** Decorative, locally rendered particle core. It never represents device telemetry. */
export default function CoreVisual({ animate, busy }: CoreVisualProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let width = 360;
    let height = 300;
    let frame = 0;
    let active = true;
    let phase = 0;
    let previous = 0;
    let disposed = false;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const points = Array.from({ length: 680 }, (_, index) => {
      const y = 1 - (index / 679) * 2;
      const radial = Math.sqrt(1 - y * y);
      const angle = index * Math.PI * (3 - Math.sqrt(5));
      return { x: Math.cos(angle) * radial, y, z: Math.sin(angle) * radial };
    });

    function draw() {
      if (!canvas || !context) return;
      const cx = width / 2;
      const cy = height / 2;
      const radius = Math.min(width * 0.36, height * 0.36);
      context.clearRect(0, 0, width, height);
      const ambient = context.createRadialGradient(cx, cy, 0, cx, cy, radius * 1.5);
      ambient.addColorStop(0, "rgba(46, 185, 211, 0.085)");
      ambient.addColorStop(0.55, "rgba(31, 130, 158, 0.04)");
      ambient.addColorStop(1, "rgba(13, 24, 33, 0)");
      context.fillStyle = ambient;
      context.fillRect(0, 0, width, height);

      // Fine radial ticks and restrained, segmented orbital arcs.
      for (let i = 0; i < 120; i++) {
        const a = i * Math.PI / 60;
        const inner = radius * (i % 5 === 0 ? 1.05 : 1.075);
        const outer = radius * 1.10;
        context.beginPath();
        context.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
        context.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
        context.strokeStyle = i % 5 === 0 ? "rgba(113, 199, 219, .35)" : "rgba(113, 199, 219, .10)";
        context.lineWidth = 0.7;
        context.stroke();
      }
      for (let orbit = 0; orbit < 4; orbit++) {
        const orbitRadius = radius * (0.67 + orbit * 0.10);
        const offset = phase * (orbit % 2 ? 0.11 : -0.07) + orbit * 1.4;
        context.beginPath();
        context.arc(cx, cy, orbitRadius, 0, Math.PI * 2);
        context.strokeStyle = "rgba(66, 155, 181, .12)";
        context.lineWidth = 0.65;
        context.stroke();
        for (let segment = 0; segment < 3; segment++) {
          const start = offset + segment * Math.PI * 2 / 3;
          context.beginPath();
          context.arc(cx, cy, orbitRadius, start, start + 0.38 + orbit * 0.12);
          context.strokeStyle = orbit % 2 ? "rgba(87, 153, 217, .55)" : "rgba(92, 222, 235, .72)";
          context.lineWidth = orbit === 1 ? 2.5 : 1.2;
          context.stroke();
        }
      }

      // Two gently undulating point rings surround the core.
      for (let ring = 0; ring < 2; ring++) {
        const count = 290;
        for (let i = 0; i < count; i++) {
          const a = i / count * Math.PI * 2;
          const ripple = Math.sin(a * 5 + phase * 0.44 + ring) * 2.9
            + Math.cos(a * 3 - phase * 0.28) * 1.7;
          const r = radius * (0.79 + ring * 0.12) + ripple;
          const alpha = 0.20 + (Math.sin(a + phase * 0.2) + 1) * 0.16;
          context.beginPath();
          context.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0.65, 0, Math.PI * 2);
          context.fillStyle = `rgba(116, 229, 238, ${alpha})`;
          context.fill();
        }
      }

      // Fibonacci-sphere points rotate as a single lightweight 3D form.
      const turn = phase * 0.13;
      const tilt = -0.22;
      const sphereRadius = radius * 0.48;
      const projected = points.map(point => {
        const x = point.x * Math.cos(turn) - point.z * Math.sin(turn);
        const z0 = point.x * Math.sin(turn) + point.z * Math.cos(turn);
        const y = point.y * Math.cos(tilt) - z0 * Math.sin(tilt);
        const z = point.y * Math.sin(tilt) + z0 * Math.cos(tilt);
        return { x, y, z };
      }).sort((a, b) => a.z - b.z);
      for (const point of projected) {
        const depth = (point.z + 1) / 2;
        const size = 0.45 + depth * 0.65;
        const scale = 1 + point.z * 0.13;
        context.beginPath();
        context.arc(cx + point.x * sphereRadius * scale, cy + point.y * sphereRadius * scale, size, 0, Math.PI * 2);
        context.fillStyle = `rgba(127, 230, 239, ${0.08 + depth * 0.65})`;
        context.fill();
      }
      const innerGlow = context.createRadialGradient(cx, cy, 0, cx, cy, radius * .19);
      innerGlow.addColorStop(0, "rgba(138, 242, 248, .13)");
      innerGlow.addColorStop(1, "rgba(138, 242, 248, 0)");
      context.fillStyle = innerGlow;
      context.beginPath();
      context.arc(cx, cy, radius * .19, 0, Math.PI * 2);
      context.fill();
      // Four quiet alignment marks anchor the composition.
      context.strokeStyle = "rgba(105, 195, 218, .38)";
      context.lineWidth = 0.8;
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        context.beginPath();
        context.moveTo(cx + Math.cos(a) * radius * 1.18, cy + Math.sin(a) * radius * 1.18);
        context.lineTo(cx + Math.cos(a) * radius * 1.30, cy + Math.sin(a) * radius * 1.30);
        context.stroke();
      }
    }

    function tick(now: number) {
      if (disposed) return;
      if (now - previous >= 30) {
        const elapsed = previous ? Math.min((now - previous) / 1000, 0.08) : 0;
        phase += elapsed * (busyRef.current ? 2.2 : 1);
        previous = now;
        draw();
      }
      frame = window.requestAnimationFrame(tick);
    }
    function resume() {
      window.cancelAnimationFrame(frame);
      previous = 0;
      if (animate && !reduced.matches && active && !document.hidden && !disposed) {
        frame = window.requestAnimationFrame(tick);
      } else draw();
    }
    const resize = new ResizeObserver(entries => {
      const bounds = entries[0]?.contentRect;
      if (!bounds) return;
      width = bounds.width;
      height = bounds.height;
      const ratio = Math.min(window.devicePixelRatio || 1, 1.75);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      draw();
    });
    const intersection = new IntersectionObserver(entries => {
      active = entries[0]?.isIntersecting ?? false;
      resume();
    });
    resize.observe(canvas);
    intersection.observe(canvas);
    document.addEventListener("visibilitychange", resume);
    reduced.addEventListener("change", resume);
    resume();
    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      resize.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", resume);
      reduced.removeEventListener("change", resume);
    };
  }, [animate]);

  return <canvas ref={canvasRef} className="l-core-canvas" aria-hidden="true" />;
}
