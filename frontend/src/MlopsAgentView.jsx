import React, { useEffect, useRef, useState } from "react";
import { Icon, Panel, Markdown, ToolCalls } from "./lib";
import { useStream } from "./SettingsContext";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const MODE_CHIP = {
  llm:   { color: "var(--accent)", label: "LLM (GPT-4o-mini)" },
  stub:  { color: "var(--med)",    label: "룰 기반 폴백" },
  error: { color: "var(--high)",   label: "오류" },
};

// autonomy modes for the retrain trigger
const AUTONOMY = [
  { id: "auto",     label: "자동",     icon: "play",  color: "var(--high)",   desc: "재학습 트리거를 사람 승인 없이 즉시 실행합니다." },
  { id: "approval", label: "승인 필요", icon: "check", color: "var(--med)",    desc: "재학습을 승인 대기열에 등록하고 엔지니어 승인 후 실행합니다." },
  { id: "notify",   label: "알림만",   icon: "radio", color: "var(--accent)", desc: "재학습 권고 알림만 발송하고 실행하지 않습니다." },
];
const MONITOR_INTERVAL_MS = 90000;

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

export default function MlopsAgentView() {
  const { settings } = useStream();
  const [steps, setSteps] = useState([]);
  const [finalText, setFinalText] = useState("");
  const [mode, setMode] = useState(null);
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [autonomy, setAutonomy] = useState("approval");
  const [autoMonitor, setAutoMonitor] = useState(false);
  const [lastRunAt, setLastRunAt] = useState(null);
  const runningRef = useRef(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [steps, finalText, running]);

  // auto mode can keep watching on an interval ("계속 확인하다가 알아서 실행")
  useEffect(() => {
    if (!(autonomy === "auto" && autoMonitor && settings.useLlm)) return;
    const id = setInterval(() => { if (!runningRef.current) run(); }, MONITOR_INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autonomy, autoMonitor, settings.useLlm]);

  function pickAutonomy(a) {
    setAutonomy(a);
    if (a !== "auto") setAutoMonitor(false);
  }

  function applyEvent(ev) {
    if (ev.type === "tool_call") {
      setSteps(s => [...s, { name: ev.name, args: ev.args, status: "running" }]);
    } else if (ev.type === "tool_result") {
      setSteps(s => {
        const copy = s.slice();
        for (let i = copy.length - 1; i >= 0; i--) {
          if (copy[i].status === "running") { copy[i] = { ...copy[i], status: "done", summary: ev.summary, result: ev.result }; break; }
        }
        return copy;
      });
    } else if (ev.type === "token") {
      setFinalText(t => t + ev.text);
    } else if (ev.type === "done") {
      if (ev.final_action) setFinalText(ev.final_action);
      setMode(ev.agent_mode || "llm");
    }
  }

  async function run() {
    if (runningRef.current || !settings.useLlm) return;
    runningRef.current = true;
    setSteps([]); setFinalText(""); setMode(null); setStarted(true); setRunning(true);
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
      setFinalText(`오류: 분석을 실행하지 못했습니다 (${e.message})`);
      setMode("error");
    } finally {
      runningRef.current = false;
      setRunning(false);
      setLastRunAt(new Date().toTimeString().slice(0, 8));
    }
  }

  const m = mode ? (MODE_CHIP[mode] || MODE_CHIP.stub) : null;
  const recommended = steps.some(s => s.name === "recommend_retrain");
  const activeMode = AUTONOMY.find(a => a.id === autonomy);
  const outcomeChip = recommended
    ? (autonomy === "auto" ? { label: "재학습 자동 실행됨", color: "var(--high)" }
      : autonomy === "notify" ? { label: "재학습 알림 발송", color: "var(--accent)" }
      : { label: "재학습 승인 대기", color: "var(--med)" })
    : { label: "현 상태 유지", color: "var(--low)" };
  const thinking = running && !finalText && steps.length === 0;

  return (
    <Panel title="MLOps 에이전트 · 모델 트리아지" icon="bot" dense
      right={
        <button className="btn btn-accent" onClick={run} disabled={running || !settings.useLlm}
          style={{ padding: "5px 12px", fontSize: 11.5 }}>
          <Icon name={running ? "refresh" : "play"} size={12} style={running ? { animation: "spin 1s linear infinite" } : undefined} />
          {running ? "분석 중…" : "분석 실행"}
        </button>
      }>
      {!settings.useLlm && (
        <div className="panel-inset" style={{ padding: "9px 11px", marginBottom: 10, fontSize: 11, color: "var(--med)" }}>
          설정에서 'Agent LLM 분석'이 꺼져 있어 자율 판단을 실행할 수 없습니다.
        </div>
      )}

      {/* autonomy mode control strip */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span className="label-cap">자율 모드</span>
        <AutonomyPicker value={autonomy} onChange={pickAutonomy} disabled={running} />
        {autonomy === "auto" && (
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
        )}
      </div>
      <div className="panel-inset" style={{ padding: "8px 11px", marginBottom: 12, fontSize: 11, color: "var(--text-3)", lineHeight: 1.5 }}>
        <span style={{ color: activeMode?.color, fontWeight: 600 }}>{activeMode?.label}</span> · {activeMode?.desc}
        {autonomy === "auto" && autoMonitor && (
          <> 90초마다 자동 재분석합니다{lastRunAt ? ` (마지막 실행 ${lastRunAt})` : ""}.</>
        )}
      </div>

      {/* chat-stream transcript */}
      <div ref={scrollRef} style={{
        border: "1px solid var(--border-soft)", borderRadius: 9, padding: "12px 14px",
        minHeight: 260, maxHeight: 520, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10,
      }}>
        {!started ? (
          <div style={{ margin: "auto", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <Icon name="box" size={28} style={{ color: "var(--accent)" }} />
            <div style={{ fontSize: 13.5, fontWeight: 650, color: "var(--text)" }}>모델·드리프트 트리아지</div>
            <div style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.7 }}>
              '분석 실행'을 누르면 에이전트가 모델 성능·드리프트·계측 추세를<br />
              직접 조회해 재학습 필요 여부를 실시간으로 판단합니다.
            </div>
          </div>
        ) : (
          <>
            {/* request line (user side) */}
            <div style={{
              alignSelf: "flex-end", maxWidth: "82%", fontSize: 11.5,
              background: "var(--accent-dim)", border: "1px solid var(--accent-line)",
              borderRadius: 10, padding: "7px 11px", color: "var(--text)",
            }}>
              운영 상태 분석 요청 · 자율모드 <strong style={{ color: activeMode?.color }}>{activeMode?.label}</strong>
            </div>

            {/* agent bubble (assistant side) */}
            <div className="fade-in" style={{
              alignSelf: "flex-start", maxWidth: "92%",
              background: "var(--panel-2)", border: "1px solid var(--border-soft)",
              borderRadius: 10, padding: "10px 12px", fontSize: 12.5, color: "var(--text)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                <Icon name="bot" size={13} style={{ color: "var(--accent)" }} />
                {m && <span className="chip" style={{ color: m.color, borderColor: m.color, fontSize: 9 }}>{m.label}</span>}
                {running ? (
                  <span className="chip" style={{ fontSize: 9, color: "var(--accent)", borderColor: "var(--accent-line)" }}>
                    <Icon name="refresh" size={10} style={{ animation: "spin 1s linear infinite" }} /> 추론 중
                  </span>
                ) : (
                  <span className="chip" style={{ fontSize: 9, color: outcomeChip.color, borderColor: outcomeChip.color }}>{outcomeChip.label}</span>
                )}
              </div>

              {steps.length > 0 && <ToolCalls calls={steps} />}

              {thinking ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-3)", fontSize: 12, padding: "4px 0" }}>
                  <Icon name="refresh" size={13} style={{ animation: "spin 1s linear infinite" }} />운영 상태를 분석하는 중…
                </div>
              ) : finalText ? (
                <div style={{ marginTop: steps.length ? 8 : 0 }}>
                  <Markdown text={finalText} />
                  {running && <span className="blink-cursor">▍</span>}
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}
