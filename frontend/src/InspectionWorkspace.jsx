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
  // a deep-link target raised from inside the Results view (the High-risk banner)
  const [localFocus, setLocalFocus] = useState(null);

  // toast "분석 보러 가기" deep-links to a specific inspection → jump to the agent
  useEffect(() => {
    if (focusId) setSub("agent");
  }, [focusId]);

  // Results view → "검사 에이전트에서 확인" jumps to the agent on this inspection
  function openAgent(inspectionId) {
    setLocalFocus(inspectionId);
    setSub("agent");
  }

  const effectiveFocus = focusId || localFocus;

  return (
    <div>
      <SubTabs tabs={SUBS} active={sub} onChange={setSub} />
      {sub === "results" ? (
        <InspectionView onOpenAgent={openAgent} />
      ) : (
        <AgentView
          focusId={effectiveFocus}
          onFocusHandled={() => { setLocalFocus(null); onFocusHandled && onFocusHandled(); }}
        />
      )}
    </div>
  );
}
