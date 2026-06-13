import React, { useState } from "react";
import { SubTabs } from "./lib";
import MlopsView from "./MlopsView";
import MlopsAgentView from "./MlopsAgentView";

const SUBS = [
  { id: "console", label: "모델·드리프트 콘솔", en: "Console", icon: "box" },
  { id: "agent",   label: "MLOps 에이전트", en: "MLOps Agent", icon: "bot" },
];

// MLOps tab = the model lifecycle: the rule-based registry/drift console, and
// the fleet-level MLOps agent that triages performance and recommends retraining.
export default function MlopsWorkspace() {
  const [sub, setSub] = useState("console");
  return (
    <div>
      <SubTabs tabs={SUBS} active={sub} onChange={setSub} />
      {sub === "console" ? <MlopsView /> : <MlopsAgentView />}
    </div>
  );
}
