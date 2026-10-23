"use client";

import { useEffect, useRef } from "react";
import { paintOrb } from "@/lib/orb-renderer";

type CoreVisualProps = { animate: boolean; busy: boolean; engaged?: boolean };

/** Decorative, locally rendered particle core. It never represents device telemetry. */
export default function CoreVisual({ animate, busy, engaged = false }: CoreVisualProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const refreshStatic = useRef<() => void>(() => {});
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const engagedRef = useRef(engaged);
  engagedRef.current = engaged;

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
    let activity = busyRef.current ? 1 : 0;
    let attention = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    function draw() {
      if (context) paintOrb(context, width, height, { phase, activity, attention });
    }

    function tick(now: number) {
      if (disposed) return;
      if (now - previous >= 30) {
        const elapsed = previous ? Math.min((now - previous) / 1000, 0.08) : 0;
        activity += ((busyRef.current ? 1 : 0) - activity) * Math.min(1, elapsed * 5);
        attention += ((engagedRef.current ? 1 : 0) - attention) * Math.min(1, elapsed * 6);
        phase += elapsed * (1 + activity * 1.4 + attention * .35);
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
    refreshStatic.current = () => {
      if (!animate || reduced.matches) { activity = busyRef.current ? 1 : 0; draw(); }
      else if (busyRef.current) activity = Math.max(activity, .7);
    };
    const resize = new ResizeObserver(entries => {
      const bounds = entries[0]?.contentRect;
      if (!bounds) return;
      width = bounds.width;
      height = bounds.height;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
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

  useEffect(() => { refreshStatic.current(); }, [busy, engaged]);

  return <canvas ref={canvasRef} className="l-core-canvas" aria-hidden="true" />;
}
