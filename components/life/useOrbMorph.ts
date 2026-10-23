"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import { orbAppearance, paintOrb, type OrbAppearance } from "@/lib/orb-renderer";

type Snapshot = { rect: DOMRect; coreRect: DOMRect; scrollY: number; appearance: OrbAppearance; opening: boolean };

/** A decorative shared-element transition. It never delays navigation or input. */
export default function useOrbMorph(board: RefObject<HTMLDivElement | null>) {
  const previousView = useRef("Today");
  const pending = useRef<Snapshot | null>(null);
  const active = useRef<{ stop: () => void } | null>(null);

  const stop = useCallback(() => { active.current?.stop(); active.current = null; }, []);
  const prepare = useCallback((next: string) => {
    if (next === previousView.current) return;
    stop(); pending.current = null;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || (next !== "Assistant" && previousView.current !== "Assistant")) return;
    const opening = next === "Assistant";
    const candidates = opening ? [".l-core-launch", ".l-summary-assistant"] : [".l-core-chat"];
    const element = candidates.map(selector => board.current?.querySelector<HTMLElement>(selector)).find(item => item && item.getBoundingClientRect().width > 0);
    if (!element) return;
    const core = (opening ? [element.querySelector<HTMLElement>(".l-orb-visual")] : [element.querySelector<HTMLElement>(".l-chat-welcome-orb .l-orb-visual"), element.querySelector<HTMLElement>(".l-chat-avatar .l-orb-visual")]).find(item => item && item.getBoundingClientRect().width > 0);
    const canvas = core?.querySelector<HTMLCanvasElement>("canvas");
    pending.current = { opening, rect: element.getBoundingClientRect(), coreRect: core?.getBoundingClientRect() || element.getBoundingClientRect(), scrollY: window.scrollY, appearance: orbAppearance(canvas) };
  }, [board, stop]);

  const play = useCallback((next: string) => {
    previousView.current = next;
    const snapshot = pending.current; pending.current = null;
    if (!snapshot || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    const candidates = snapshot.opening ? [".l-core-chat"] : [".l-core-launch", ".l-summary-assistant"];
    const target = candidates.map(selector => board.current?.querySelector<HTMLElement>(selector)).find(item => item && item.getBoundingClientRect().width > 0);
    if (!target || typeof target.animate !== "function") return false;
    const end = target.getBoundingClientRect(), start = snapshot.rect;
    if (!end.width || !end.height || !start.width || !start.height) return false;
    const frame = document.createElement("div"); frame.className = "l-orb-morph";
    frame.setAttribute("aria-hidden", "true"); frame.dataset.direction = snapshot.opening ? "opening" : "closing";
    const base = snapshot.opening ? end : { ...start, top: start.top + snapshot.scrollY - window.scrollY, left: start.left, width: start.width, height: start.height };
    Object.assign(frame.style, { top: `${base.top}px`, left: `${base.left}px`, width: `${base.width}px`, height: `${base.height}px` });
    document.body.appendChild(frame);
    const animations: Animation[] = [];
    const small = snapshot.opening ? start : end;
    const x = small.left - base.left, y = small.top + (snapshot.opening ? snapshot.scrollY - window.scrollY : 0) - base.top;
    const collapsed = `translate(${x}px, ${y}px) scale(${small.width / base.width}, ${small.height / base.height})`;
    const duration = 1250;
    const keys = snapshot.opening ? [
      { transform: collapsed, borderRadius: "50%", offset: 0 },
      { transform: collapsed, borderRadius: "50%", offset: .08 },
      { transform: "translate(0, 0) scale(1, 1)", borderRadius: "14px", offset: .8 },
      { transform: "translate(0, 0) scale(1, 1)", borderRadius: "12px", offset: 1 },
    ] : [
      { transform: "none", borderRadius: "12px", offset: 0 },
      { transform: collapsed, borderRadius: "50%", offset: .85 },
      { transform: collapsed, borderRadius: "50%", offset: 1 },
    ];
    const morph = frame.animate(keys, { duration, easing: "cubic-bezier(.65,0,.2,1)", fill: "both" }); animations.push(morph);
    animations.push(frame.animate([{ opacity: 1 }, { opacity: 1, offset: .86 }, { opacity: 0 }], { duration, fill: "both" }));
    // The particle core lives outside the stretching surface and only scales uniformly.
    const targetCore = (snapshot.opening ? [target.querySelector<HTMLElement>(".l-chat-welcome-orb .l-orb-visual"), target.querySelector<HTMLElement>(".l-chat-avatar .l-orb-visual")] : [target.querySelector<HTMLElement>(".l-orb-visual"), target]).find(item => item && item.getBoundingClientRect().width > 0);
    let floatingCore: HTMLDivElement | null = null;
    if (targetCore) {
      const destination = targetCore.getBoundingClientRect(), origin = snapshot.coreRect;
      const size = Math.min(origin.width, origin.height);
      const top = origin.top + snapshot.scrollY - window.scrollY;
      const dx = destination.left + destination.width / 2 - origin.left - origin.width / 2;
      const dy = destination.top + destination.height / 2 - top - origin.height / 2;
      const scale = Math.min(destination.width, destination.height) / size;
      floatingCore = document.createElement("div"); floatingCore.className = "l-orb-morph-core";
      floatingCore.setAttribute("aria-hidden", "true");
      Object.assign(floatingCore.style, { top: `${top}px`, left: `${origin.left}px`, width: `${size}px`, height: `${size}px` });
      // Paint for the largest endpoint. Never magnify the chat avatar's tiny bitmap.
      const resolution = Math.max(size, destination.width, destination.height);
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const image = document.createElement("canvas");
      image.width = Math.ceil(resolution * ratio); image.height = image.width;
      const context = image.getContext("2d");
      if (context) { context.setTransform(ratio, 0, 0, ratio, 0, 0); paintOrb(context, resolution, resolution, snapshot.appearance); }
      image.className = "l-orb-morph-image"; floatingCore.appendChild(image);
      document.body.appendChild(floatingCore);
      animations.push(floatingCore.animate([
        { transform: "translate(0, 0) scale(1)", offset: 0 },
        { transform: "translate(0, -5px) scale(1.018)", offset: .16 },
        { transform: `translate(${dx * .35}px, ${dy * .35 - 12}px) scale(${1 + (scale - 1) * .2})`, offset: .48 },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, offset: .84 },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, offset: 1 },
      ], { duration, easing: "cubic-bezier(.35,0,.25,1)", fill: "both" }));
      animations.push(floatingCore.animate([{ opacity: 1 }, { opacity: 1, offset: .82 }, { opacity: 0 }], { duration, fill: "both" }));
      const direction = snapshot.opening ? 1 : -1;
      const turn = 360;
      animations.push(image.animate([
        { transform: "rotate(0deg)", filter: "brightness(1)", offset: 0, easing: "ease-out" },
        { transform: `rotate(${-direction * 8}deg)`, filter: "brightness(1.04)", offset: .12, easing: "cubic-bezier(.4,0,.2,1)" },
        { transform: `rotate(${direction * (turn + 8)}deg)`, filter: "brightness(1.12)", offset: .86, easing: "ease-out" },
        { transform: `rotate(${direction * turn}deg)`, filter: "brightness(1)", offset: 1 },
      ], { duration, easing: "linear", fill: "both" }));
      const orbit = document.createElement("span"); orbit.className = "l-orb-morph-orbit";
      floatingCore.appendChild(orbit);
      animations.push(orbit.animate([
        { transform: "rotate(30deg) scale(.98)", opacity: 0 },
        { transform: "rotate(-15deg) scale(1.04)", opacity: .55, offset: .3 },
        { transform: "rotate(-80deg) scale(1.02)", opacity: .35, offset: .7 },
        { transform: "rotate(-120deg) scale(1)", opacity: 0 },
      ], { duration, easing: "ease-in-out", fill: "both" }));
      animations.push(targetCore.animate([{ opacity: 0 }, { opacity: 0, offset: .78 }, { opacity: 1 }], { duration, fill: "backwards" }));
    }
    if (snapshot.opening) {
      const panel = target.closest(".l-assistant-panel");
      if (panel) animations.push(panel.animate([{ opacity: 0 }, { opacity: 0, offset: .58 }, { opacity: 1, offset: .9 }, { opacity: 1 }], { duration, fill: "backwards" }));
      [".l-chat-header", ".l-chat-messages", ".l-chat-composer"].forEach((selector, index) => {
        const element = target.querySelector(selector);
        if (element) animations.push(element.animate([{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "none" }], { duration: 440, delay: 620 + index * 65, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" }));
      });
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const cleanup = () => {
      animations.forEach(animation => animation.cancel()); frame.remove(); floatingCore?.remove();
      window.removeEventListener("resize", cleanup); window.removeEventListener("scroll", cleanup); reduced.removeEventListener("change", cleanup);
      if (active.current?.stop === cleanup) active.current = null;
    };
    active.current = { stop: cleanup };
    window.addEventListener("resize", cleanup, { once: true }); window.addEventListener("scroll", cleanup, { once: true }); reduced.addEventListener("change", cleanup, { once: true });
    void morph.finished.then(cleanup, () => {});
    return true;
  }, [board]);
  useEffect(() => () => { stop(); pending.current = null; }, [stop]);
  return { prepare, play };
}
