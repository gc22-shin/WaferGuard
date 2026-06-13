import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useStream } from "./SettingsContext";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const MONITOR_INTERVAL_MS = 90000;
const MAX_LOGS = 30;

// Holds the MLOps agent's monitoring state — and now the run loop + auto-monitor
// timer — ABOVE the tab-switching boundary in App.jsx. Keeping the timer here (not
// in MlopsAgentView) means auto-monitoring keeps running even when you're on a
// different tab; it only stops when the toggle is off or the app is closed.
const MlopsAgentContext = createContext(null);

export function MlopsAgentProvider({ children }) {
  const { settings } = useStream();
  const [logs, setLogs] = useState([]);
  const [autonomy, setAutonomy] = useState("approval");
  const [autoMonitor, setAutoMonitor] = useState(false);
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);
  const idRef = useRef(0);
  // read the latest autonomy inside the interval/async run without re-creating them
  const autonomyRef = useRef(autonomy);
  useEffect(() => { autonomyRef.current = autonomy; }, [autonomy]);

  const patchFront = useCallback((fn) => setLogs(l => {
    if (!l.length) return l;
    const c = l.slice();
    c[0] = fn(c[0]);
    return c;
  }), []);

  const applyEvent = useCallback((ev) => {
    if (ev.type === "tool_call") {
      patchFront(e => ({ ...e, steps: [...e.steps, { name: ev.name, args: ev.args, status: "running" }] }));
    } else if (ev.type === "tool_result") {
      patchFront(e => {
        const steps = e.steps.slice();
        for (let i = steps.length - 1; i >= 0; i--) {
          if (steps[i].status === "running") { steps[i] = { ...steps[i], status: "done", summary: ev.summary, result: ev.result }; break; }
        }
        return { ...e, steps };
      });
    } else if (ev.type === "token") {
      patchFront(e => ({ ...e, finalText: e.finalText + ev.text }));
    } else if (ev.type === "done") {
      patchFront(e => ({ ...e, finalText: ev.final_action || e.finalText, mode: ev.agent_mode || "llm" }));
    }
  }, [patchFront]);

  const run = useCallback(async () => {
    if (runningRef.current || !settings.useLlm) return;
    runningRef.current = true;
    setRunning(true);
    const ts = new Date().toTimeString().slice(0, 8);
    const id = ++idRef.current;
    const autonomyNow = autonomyRef.current;
    setLogs(l => [{ id, ts, autonomy: autonomyNow, steps: [], finalText: "", mode: null, status: "running" }, ...l].slice(0, MAX_LOGS));
    try {
      const res = await fetch(`${API_BASE}/api/v1/mlops/agent/run/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line_id: "ALL", use_llm: settings.useLlm, autonomy: autonomyNow }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const blocks = buf.split("\n\n");
        buf = blocks.pop() || "";
        for (const block of blocks) {
          const line = block.split("\n").find(l => l.startsWith("data:"));
          if (!line) continue;
          try { applyEvent(JSON.parse(line.slice(5).trim())); } catch { /* skip */ }
        }
      }
    } catch (e) {
      patchFront(en => ({ ...en, finalText: `오류: 분석을 실행하지 못했습니다 (${e.message})`, mode: "error" }));
    } finally {
      patchFront(en => ({ ...en, status: "done" }));
      runningRef.current = false;
      setRunning(false);
    }
  }, [settings.useLlm, applyEvent, patchFront]);

  // auto-monitoring: runs at the provider level so it survives tab navigation.
  // Fires once immediately when enabled, then re-runs every 90s.
  useEffect(() => {
    if (!(autoMonitor && settings.useLlm)) return;
    if (!runningRef.current) run();                 // immediate first run
    const id = setInterval(() => { if (!runningRef.current) run(); }, MONITOR_INTERVAL_MS);
    return () => clearInterval(id);
  }, [autoMonitor, settings.useLlm, run]);

  const value = {
    logs, setLogs,
    autonomy, setAutonomy,
    autoMonitor, setAutoMonitor,
    running, setRunning,
    runningRef, idRef,
    run,
  };
  return <MlopsAgentContext.Provider value={value}>{children}</MlopsAgentContext.Provider>;
}

export function useMlopsAgent() {
  return useContext(MlopsAgentContext);
}
