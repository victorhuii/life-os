"use client";

import CoreVisual from "./CoreVisual";
export type AssistantAppearance = "orb" | "buddy";

/** A decorative assistant identity. Activity reflects real chat requests only. */
export default function AssistantVisual({ appearance, animate, busy }: { appearance: AssistantAppearance; animate: boolean; busy: boolean }) {
  if (appearance === "orb") return <span className="l-orb-visual"><CoreVisual animate={animate} busy={busy}/></span>;
  return <span className="l-buddy-visual" data-animate={animate ? "on" : "off"} data-busy={busy ? "true" : "false"} aria-hidden="true">
    <svg viewBox="0 0 240 240" fill="none">
      <ellipse className="l-buddy-shadow" cx="120" cy="205" rx="49" ry="7" fill="#253e35" fillOpacity=".08"/>
      <g className="l-buddy-body">
        <path className="l-buddy-arm l-buddy-arm-left" d="M66 135c-17-1-28 11-25 23 2 8 10 11 15 6" stroke="#a6b3a8" strokeWidth="13" strokeLinecap="round"/>
        <path className="l-buddy-arm l-buddy-arm-right" d="M174 134c18-3 29-18 26-28-2-8-11-10-15-3" stroke="#a6b3a8" strokeWidth="13" strokeLinecap="round"/>
        <path d="M120 57V41" stroke="#97a99c" strokeWidth="5" strokeLinecap="round"/>
        <circle className="l-buddy-light" cx="120" cy="34" r="7" fill="#8bbba8"/>
        <path d="M73 165v14c0 8 7 13 15 13h7v-22m50 0v22h7c8 0 15-5 15-13v-14" fill="#9aa99d"/>
        <rect x="59" y="58" width="122" height="122" rx="45" fill="#bdc8bc"/>
        <path d="M77 80c10-13 28-17 44-17" stroke="#e0e7dc" strokeWidth="4" strokeLinecap="round"/>
        <rect x="69" y="83" width="102" height="65" rx="28" fill="#263d37"/>
        <g className="l-buddy-eyes" fill="#b0dfca">
          <rect x="91" y="103" width="9" height="18" rx="4.5"/>
          <rect x="140" y="103" width="9" height="18" rx="4.5"/>
        </g>
        <path d="M112 125c5 5 11 5 16 0" stroke="#9fc5b3" strokeWidth="3" strokeLinecap="round"/>
        <circle cx="120" cy="163" r="4" fill="#e7ece0"/>
      </g>
    </svg>
  </span>;
}
