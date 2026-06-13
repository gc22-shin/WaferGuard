import React, { createContext, useContext, useRef, useState } from "react";

// Holds the MLOps agent's monitoring state ABOVE the tab-switching boundary in
// App.jsx (which remounts views via `key={active}`), so the log survives tab
// navigation instead of resetting on every remount.
const MlopsAgentContext = createContext(null);

export function MlopsAgentProvider({ children }) {
  const [logs, setLogs] = useState([]);
  const [autonomy, setAutonomy] = useState("approval");
  const [autoMonitor, setAutoMonitor] = useState(false);
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);
  const idRef = useRef(0);

  const value = {
    logs, setLogs,
    autonomy, setAutonomy,
    autoMonitor, setAutoMonitor,
    running, setRunning,
    runningRef, idRef,
  };
  return <MlopsAgentContext.Provider value={value}>{children}</MlopsAgentContext.Provider>;
}

export function useMlopsAgent() {
  return useContext(MlopsAgentContext);
}
