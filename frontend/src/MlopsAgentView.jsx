import React, { useEffect, useRef, useState } from "react";
import { Icon, Panel, Markdown, ToolCalls } from "./lib";
import { useStream } from "./SettingsContext";
import { useMlopsAgent } from "./MlopsAgentContext";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const MODE_CHIP = {
  llm:   { color: "var(--accent)", label: "LLM" },
  stub:  { color: "var(--med)",    label: "룰 기반" },
  error: { color: "var(--high)",   label: "오류" },
};

// two autonomy modes for the retrain trigger
const AUTONOMY = [
  { id: "auto",     label: "자동 실행", icon: "play",  color: "var(--high)", desc: "재학습 트리거를 사람 승인 없이 즉시 실행합니다." },
  { id: "approval", label: "승인 요청", icon: "check", color: "var(--med)",  desc: "재학습을 승인 대기열에 등록하고 엔지니어 승인 후 실행합니다." },
];
const MONITOR_INTERVAL_MS = 90000;
const MAX_LOGS = 30;

function AutonomyPicker({ value, onChange, disabled }) {
  return (
    <div style={{ display: "inline-flex", gap: 3, padding: 3, background: "var(--panel-2)", border: "1px solid var(--border-soft)", borderRadius: 9 }}>
      {AUTONOMY.map(a => {
        const on = a.id === value;
        return (
          <button key={a.id} onClick={() => onChange(a.id)} disabled={disabled} className="focusable"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, cursor: disabled ? "default" : "pointer",
              padding: "5px 11px", borderRadius: 7, border: "1px solid transparent", font: "inherit",
              fontSize: 12, fontWeight: on ? 650 : 500, opacity: disabled ? 0.55 : 1,
              background: on ? "var(--panel)" : "transparent",
              color: on ? a.color : "var(--text-2)",
              boxShadow: on ? "var(--shadow)" : "none",
            }}>
            <Icon name={a.icon} size={12} />{a.label}
          </button>
        );
      })}
    </div>
  );
}

function outcomeFor(entry) {
  const recommended = (entry.steps || []).some(s => s.name === "recommend_retrain");
  if (!recommended) return { label: "현 상태 유지", color: "var(--low)" };
  return entry.autonomy === "auto"
    ? { label: "재학습 자동 실행됨", color: "var(--high)" }
    : { label: "재학습 승인 대기", color: "var(--med)" };
}

function LogEntry({ entry }) {
  const running = entry.status === "running";
  const [open, setOpen] = useState(running);
  const prevRunning = useRef(running);
  // auto-collapse a run once it finishes; user can re-open by clicking
  useEffect(() => {
    if (prevRunning.current && !running) setOpen(false);
    prevRunning.current = running;
  }, [running]);

  const am = AUTONOMY.find(a => a.id === entry.autonomy);
  const m = entry.mode ? (MODE_CHIP[entry.mode] || MODE_CHIP.stub) : null;
  const outcome = outcomeFor(entry);
  const toolCount = (entry.steps || []).length;
  const thinking = running && !entry.finalText && toolCount === 0;

  return (
    <div style={{ display: "flex", gap: 9, padding: "8px 0", borderBottom: "1px solid var(--border-soft)" }}>
      <span className="mono" style={{ fontSize: 10, color: "var(--text-3)", flex: "none", paddingTop: 4, width: 58 }}>
        {entry.ts}
      </span>
      <div style={{
        flex: 1, minWidth: 0, borderLeft: `2px solid ${running ? "var(--accent)" : outcome.color}`,
        paddingLeft: 10, display: "flex", flexDirection: "column", gap: 6,
      }}>
        {/* collapsed header — shows only the final decision */}
        <button onClick={() => setOpen(o => !o)} className="focusable"
          style={{
            display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", width: "100%",
            textAlign: "left", background: "transparent", border: "none", font: "inherit",
            cursor: "pointer", padding: 0,
          }}>
          <Icon name={running ? "refresh" : "bot"} size={12}
            style={running ? { animation: "spin 1s linear infinite", color: "var(--accent)" } : { color: "var(--accent)" }} />
          {am && <span className="chip" style={{ fontSize: 8.5, color: am.color, borderColor: am.color }}>{am.label}</span>}
          {running ? (
            <span style={{ fontSize: 12, fontWeight: 650, color: "var(--accent)" }}>분석 진행 중…</span>
          ) : (
            <span className="chip" style={{ fontSize: 9, fontWeight: 700, color: outcome.color, borderColor: outcome.color }}>
              {outcome.label}
            </span>
          )}
          {m && !running && <span className="chip" style={{ fontSize: 8.5, color: m.color, borderColor: m.color }}>{m.label}</span>}
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "var(--text-3)" }}>
            {toolCount > 0 && <span>툴 {toolCount}회</span>}
            <span>{open ? "접기" : "상세"}</span>
            <Icon name={open ? "chevD" : "chevR"} size={12} />
          </span>
        </button>

        {/* expanded — tools used + analysis result */}
        {open && (
          <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 2 }}>
            {toolCount > 0 && <ToolCalls calls={entry.steps} />}
            {thinking ? (
              <div style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--text-3)", fontSize: 11.5 }}>
                <Icon name="refresh" size={12} style={{ animation: "spin 1s linear infinite" }} />운영 상태를 분석하는 중…
              </div>
            ) : entry.finalText ? (
              <div style={{ fontSize: 12, color: "var(--text)" }}>
                <Markdown text={entry.finalText} />
                {running && <span className="blink-cursor">▍</span>}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

export default function MlopsAgentView() {
  const { settings } = useStream();
  // state lives in a root-level context so the log survives tab navigation
  const {
    logs, setLogs,
    autonomy, setAutonomy,
    autoMonitor, setAutoMonitor,
    running, setRunning,
    runningRef, idRef,
  } = useMlopsAgent();
  const logRef = useRef(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = 0; // newest entry is on top
  }, [logs]);

  // auto monitoring — available in BOTH modes; re-runs on an interval
  useEffect(() => {
    if (!(autoMonitor && settings.useLlm)) return;
    const id = setInterval(() => { if (!runningRef.current) run(); }, MONITOR_INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoMonitor, settings.useLlm]);

  // patch the active (front) log entry
  const patchFront = (fn) => setLogs(l => {
    if (!l.length) return l;
    const c = l.slice();
    c[0] = fn(c[0]);
    return c;
  });

  function applyEvent(ev) {
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
  }

  async function run() {
    if (runningRef.current || !settings.useLlm) return;
    runningRef.current = true;
    setRunning(true);
    const ts = new Date().toTimeString().slice(0, 8);
    const id = ++idRef.current;
    setLogs(l => [{ id, ts, autonomy, steps: [], finalText: "", mode: null, status: "running" }, ...l].slice(0, MAX_LOGS));
    try {
      const res = await fetch(`${API_BASE}/api/v1/mlops/agent/run/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line_id: "ALL", use_llm: settings.useLlm, autonomy }),
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
  }

  const activeMode = AUTONOMY.find(a => a.id === autonomy);

  return (
    <Panel title="MLOps 에이전트 · 모니터링 로그" icon="bot" dense
      right={
        <button className="btn btn-accent" onClick={run} disabled={running || !settings.useLlm}
          style={{ padding: "5px 12px", fontSize: 11.5 }}>
          <Icon name={running ? "refresh" : "play"} size={12} style={running ? { animation: "spin 1s linear infinite" } : undefined} />
          {running ? "분석 중…" : "지금 분석"}
        </button>
      }>
      {!settings.useLlm && (
        <div className="panel-inset" style={{ padding: "9px 11px", marginBottom: 10, fontSize: 11, color: "var(--med)" }}>
          설정에서 'Agent LLM 분석'이 꺼져 있어 자율 판단을 실행할 수 없습니다.
        </div>
      )}

      {/* control strip — autonomy mode + auto-monitoring (both available inline) */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span className="label-cap">자율 모드</span>
        <AutonomyPicker value={autonomy} onChange={setAutonomy} disabled={running} />
        <button onClick={() => setAutoMonitor(v => !v)} disabled={!settings.useLlm} className="focusable"
          style={{
            display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", font: "inherit", fontSize: 11.5,
            padding: "5px 10px", borderRadius: 7,
            border: `1px solid ${autoMonitor ? "var(--accent-line)" : "var(--border-soft)"}`,
            background: autoMonitor ? "var(--accent-dim)" : "transparent",
            color: autoMonitor ? "var(--accent)" : "var(--text-2)",
          }}>
          <span style={{ width: 7, height: 7, borderRadius: 99, background: autoMonitor ? "var(--accent)" : "var(--text-3)" }}
            className={autoMonitor ? "pulse-high" : ""} />
          자동 모니터링 {autoMonitor ? "켜짐" : "꺼짐"}
        </button>
      </div>
      <div className="panel-inset" style={{ padding: "8px 11px", marginBottom: 12, fontSize: 11, color: "var(--text-3)", lineHeight: 1.5 }}>
        <span style={{ color: activeMode?.color, fontWeight: 600 }}>{activeMode?.label}</span> · {activeMode?.desc}
        {autoMonitor && <> 켜진 동안 90초마다 자동으로 재분석해 아래 로그에 기록합니다.</>}
      </div>

      {/* monitoring log */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
        <Icon name="activity" size={12} style={{ color: "var(--accent)" }} />
        <span className="label-cap">모니터링 로그</span>
        {logs.length > 0 && <span className="chip" style={{ fontSize: 9, color: "var(--text-3)" }}>{logs.length}건</span>}
        {autoMonitor && (
          <span className="chip" style={{ fontSize: 9, color: "var(--accent)", borderColor: "var(--accent-line)" }}>
            <span className="pulse-high" style={{ width: 6, height: 6, borderRadius: 99, background: "var(--accent)", display: "inline-block" }} /> LIVE
          </span>
        )}
      </div>
      <div ref={logRef} style={{
        border: "1px solid var(--border-soft)", borderRadius: 9, padding: "4px 14px",
        minHeight: 260, maxHeight: 540, overflowY: "auto",
      }}>
        {logs.length === 0 ? (
          <div style={{ minHeight: 240, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, textAlign: "center" }}>
            <Icon name="box" size={26} style={{ color: "var(--accent)" }} />
            <div style={{ fontSize: 13, fontWeight: 650, color: "var(--text)" }}>모델·드리프트 모니터링</div>
            <div style={{ fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.7 }}>
              '지금 분석'을 누르거나 자동 모니터링을 켜면<br />
              에이전트가 운영 상태를 점검한 기록이 여기에 로그로 쌓입니다.
            </div>
          </div>
        ) : (
          logs.map(entry => <LogEntry key={entry.id} entry={entry} />)
        )}
      </div>
    </Panel>
  );
}
