"use client";

import { useState } from "react";
import CoreVisual from "./CoreVisual";

/** A decorative assistant identity. Activity reflects real chat requests only. */
export default function AssistantVisual({ animate, busy }: { animate: boolean; busy: boolean }) {
  const [engaged, setEngaged] = useState(false);
  return <span className="l-orb-visual" data-activity={busy ? "working" : "idle"} onPointerEnter={() => setEngaged(true)} onPointerLeave={() => setEngaged(false)}><CoreVisual animate={animate} busy={busy} engaged={engaged}/></span>;
}
