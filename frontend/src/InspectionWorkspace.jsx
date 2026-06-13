import React, { useEffect, useState } from "react";
import { SubTabs } from "./lib";
import InspectionView from "./InspectionView";
import AgentView from "./AgentView";

const SUBS = [
  { id: "results", label: "검사 결과", en: "Results · DB", icon: "layers" },
  { id: "agent",   label: "검사 에이전트", en: "Inspection Agent", icon: "bot" },
];

// Live Inspection tab = the operational floor: inspection results / DB lookup,
// and the per-wafer inspection agent that acts on them — side by side.
export default function InspectionWorkspace({ focusId, onFocusHandled }) {
  const [sub, setSub] = useState("results");

  // toast "분석 보러 가기" deep-links to a specific inspection → jump to the agent
  useEffect(() => {
    if (focusId) setSub("agent");
  }, [focusId]);

  return (
    <div>
      <SubTabs tabs={SUBS} active={sub} onChange={setSub} />
      {sub === "results" ? (
        <InspectionView />
      ) : (
        <AgentView focusId={focusId} onFocusHandled={onFocusHandled} />
      )}
    </div>
  );
}
