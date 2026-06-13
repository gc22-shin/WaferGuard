import React, { useState } from "react";
import { Icon, Panel, Markdown } from "./lib";
import { useStream } from "./SettingsContext";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const MODE_CHIP = {
  llm:   { color: "var(--accent)", label: "LLM (GPT-4o-mini)" },
  stub:  { color: "var(--med)",    label: "룰 기반 폴백" },
  error: { color: "var(--high)",   label: "오류" },
};

const TOOL_META = {
  get_mlops_state:       { icon: "cpu",      label: "MLOps 상태 조회" },
  get_metrology_trend:   { icon: "activity", label: "계측 추세 조회" },
  get_equipment_history: { icon: "layers",   label: "설비 이력 조회" },
  recommend_retrain:     { icon: "refresh",  label: "재학습 권고" },
};

function argSnippet(args) {
  if (!args || !Object.keys(args).length) return "";
  return Object.entries(args).map(([k, v]) => `${k}=${v}`).join(", ");
}

function TraceStep({ idx, call }) {
  const meta = TOOL_META[call.name] || { icon: "cpu", label: call.name };
  const isWrite = call.name === "recommend_retrain";
  const running = call.status === "running";
  return (
    <div className="panel-inset fade-in" style={{ padding: "9px 11px", display: "flex", gap: 9, alignItems: "flex-start" }}>
      <span className="mono" style={{
        fontSize: 10, fontWeight: 700, color: "var(--accent)", background: "var(--accent-dim)",
        borderRadius: 5, padding: "1px 6px", flex: "none", marginTop: 1,
      }}>{idx + 1}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name={running ? "refresh" : meta.icon} size={12}
            style={running ? { animation: "spin 1s linear infinite", color: "var(--accent)" } : { color: isWrite ? "var(--med)" : "var(--accent)" }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{meta.label}</span>
          {isWrite && <span className="chip" style={{ fontSize: 8.5, color: "var(--med)", borderColor: "var(--med)" }}>승인 필요</span>}
        </div>
        {argSnippet(call.args) && (
          <div className="mono" style={{ fontSize: 9.5, color: "var(--text-3)", marginTop: 2 }}>{argSnippet(call.args)}</div>
        )}
        <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 3, lineHeight: 1.5 }}>
          {running ? "실행 중…" : (call.summary || "완료")}
        </div>
      </div>
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

  function applyEvent(ev) {
    if (ev.type === "tool_call") {
      setSteps(s => [...s, { name: ev.name, args: ev.args, status: "running" }]);
    } else if (ev.type === "tool_result") {
      setSteps(s => {
        const copy = s.slice();
        for (let i = copy.length - 1; i >= 0; i--) {
          if (copy[i].status === "running") { copy[i] = { ...copy[i], status: "done", summary: ev.summary }; break; }
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
    if (running || !settings.useLlm) return;
    setSteps([]); setFinalText(""); setMode(null); setStarted(true); setRunning(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/mlops/agent/run/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line_id: "ALL", use_llm: settings.useLlm }),
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
      setRunning(false);
    }
  }

  const m = mode ? (MODE_CHIP[mode] || MODE_CHIP.stub) : null;
  const recommended = steps.some(s => s.name === "recommend_retrain");
  const thinking = running && !finalText && steps.length === 0;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 12, alignItems: "start" }}>
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
        {!started ? (
          <div style={{ minHeight: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, textAlign: "center" }}>
            <Icon name="box" size={28} style={{ color: "var(--accent)" }} />
            <div style={{ fontSize: 13.5, fontWeight: 650, color: "var(--text)" }}>모델·드리프트 트리아지</div>
            <div style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.7 }}>
              '분석 실행'을 누르면 에이전트가 모델 성능·드리프트·계측 추세를<br />
              직접 조회해 재학습 필요 여부를 실시간으로 판단합니다.
            </div>
          </div>
        ) : (
          <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {m && <span className="chip" style={{ color: m.color, borderColor: m.color, fontSize: 9 }}>
                <Icon name="bot" size={10} /> {m.label}
              </span>}
              {!running && (
                <span className="chip" style={{
                  fontSize: 9,
                  color: recommended ? "var(--med)" : "var(--low)",
                  borderColor: recommended ? "var(--med)" : "var(--low)",
                }}>
                  {recommended ? "재학습 권고됨" : "현 상태 유지"}
                </span>
              )}
              {running && (
                <span className="chip" style={{ fontSize: 9, color: "var(--accent)", borderColor: "var(--accent-line)" }}>
                  <Icon name="refresh" size={10} style={{ animation: "spin 1s linear infinite" }} /> 추론 중
                </span>
              )}
            </div>
            {thinking ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-3)", fontSize: 12, padding: "8px 0" }}>
                <Icon name="refresh" size={14} style={{ animation: "spin 1s linear infinite" }} />운영 상태를 분석하는 중…
              </div>
            ) : (
              <div style={{ fontSize: 12.5, color: "var(--text)" }}>
                <Markdown text={finalText} />
                {running && finalText && <span className="blink-cursor">▍</span>}
              </div>
            )}
          </div>
        )}
      </Panel>

      <Panel title="에이전트 추론 과정 · Tool Trace" icon="activity" dense
        right={<span className="chip" style={{ fontSize: 9, color: "var(--text-3)" }}>{steps.length} steps</span>}>
        {steps.length === 0 ? (
          <div style={{ padding: "26px 12px", textAlign: "center", fontSize: 11.5, color: "var(--text-3)" }}>
            분석을 실행하면 에이전트가 호출한 도구와 결과가 실시간으로 표시됩니다.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 7, maxHeight: 460, overflowY: "auto" }}>
            {steps.map((c, i) => <TraceStep key={i} idx={i} call={c} />)}
          </div>
        )}
      </Panel>
    </div>
  );
}
