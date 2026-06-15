import React, { useCallback, useEffect, useRef, useState } from "react";
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
  const step = (entry.steps || []).find(s => s.name === "recommend_retrain");
  if (!step) return { label: "현 상태 유지", color: "var(--low)" };
  // reflect what actually happened, not just that the tool was called
  const r = step.result || {};
  if (r.skipped) return { label: "재학습 보류 · 진행 중 후보 있음", color: "var(--text-3)" };
  if (entry.autonomy === "auto") return { label: "재학습 자동 실행됨", color: "var(--high)" };
  if (r.deduped) return { label: "재학습 승인 대기 · 기존 요청에 합침", color: "var(--med)" };
  return { label: "재학습 승인 대기", color: "var(--med)" };
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
          {entry.delegated && (
            <span className="chip" title={entry.source ? `위임 출처: ${entry.source}` : "검사 에이전트가 위임"}
              style={{ fontSize: 8.5, color: "var(--accent)", borderColor: "var(--accent-line)" }}>
              <Icon name="handoff" size={10} />검사→위임
            </span>
          )}
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

// summarize the on-screen monitoring log so the chat is grounded in exactly what
// the engineer is looking at (the backend also injects the persisted log)
function buildLogContext(logs) {
  if (!logs?.length) return "";
  const lines = ["화면의 모니터링 로그 (최신순):"];
  logs.slice(0, 10).forEach(e => {
    const step = (e.steps || []).find(s => s.name === "recommend_retrain");
    const r = step?.result || {};
    const outcome = !step
      ? "현 상태 유지"
      : r.skipped
        ? "재학습 보류(진행 중 후보 있음)"
        : e.autonomy === "auto"
          ? "재학습 자동 실행"
          : "재학습 권고/승인 대기";
    const tools = (e.steps || []).map(s => s.name).join(", ") || "없음";
    const final = (e.finalText || "").trim().replace(/\s+/g, " ").slice(0, 200);
    lines.push(`- ${e.ts} · 자율=${e.autonomy} · ${outcome} · 툴=[${tools}]${final ? ` · 판단: ${final}` : ""}`);
  });
  return lines.join("\n");
}

const CHAT_SUGGESTIONS = ["지금 재학습이 필요해?", "왜 그렇게 판단했어?", "최근 드리프트 추세 어때?"];

function MlopsAgentChat() {
  const { settings } = useStream();
  const llmOn = settings.useLlm;
  const { chat, setChat, logs } = useMlopsAgent();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (chat.length > 0 && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [chat, sending]);

  const patchLast = (fn) => setChat(m => {
    if (!m.length) return m;
    const copy = m.slice();
    copy[copy.length - 1] = fn(copy[copy.length - 1]);
    return copy;
  });

  function applyEvent(ev) {
    if (ev.type === "tool_call") {
      patchLast(a => ({ ...a, tools: [...(a.tools || []), { name: ev.name, args: ev.args, status: "running" }] }));
    } else if (ev.type === "tool_result") {
      patchLast(a => {
        const tools = (a.tools || []).slice();
        for (let i = tools.length - 1; i >= 0; i--) {
          if (tools[i].status === "running") { tools[i] = { ...tools[i], status: "done", summary: ev.summary, result: ev.result }; break; }
        }
        return { ...a, tools };
      });
    } else if (ev.type === "token") {
      patchLast(a => ({ ...a, content: (a.content || "") + ev.text }));
    } else if (ev.type === "done") {
      patchLast(a => ({ ...a, content: ev.reply || a.content || "응답 없음", streaming: false }));
    }
  }

  async function send(text) {
    const q = (text ?? input).trim();
    if (!q || sending || !llmOn) return;
    const history = chat.map(m => ({ role: m.role, content: m.content }));
    setChat(m => [...m,
      { role: "user", content: q },
      { role: "assistant", content: "", tools: [], streaming: true },
    ]);
    setInput("");
    setSending(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/mlops/agent/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q, history, use_llm: llmOn, extra_context: buildLogContext(logs) }),
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
          try { applyEvent(JSON.parse(line.slice(5).trim())); } catch { /* skip partial */ }
        }
      }
    } catch (e) {
      patchLast(a => ({ ...a, content: `오류: 응답을 받지 못했습니다 (${e.message})`, streaming: false }));
    } finally {
      patchLast(a => ({ ...a, streaming: false }));
      setSending(false);
    }
  }

  return (
    <Panel title="MLOps 에이전트와 대화 · 모니터링 로그 기반" icon="bot" dense pad={0}
      right={chat.length > 0 && (
        <button className="btn btn-ghost" onClick={() => setChat([])} disabled={sending}
          style={{ padding: "4px 8px", fontSize: 10.5, color: "var(--text-3)" }}>
          <Icon name="x" size={11} />대화 비우기
        </button>
      )}>
      <div ref={scrollRef} style={{ maxHeight: 460, minHeight: 200, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 9 }}>
        {chat.length === 0 && (
          <div className="panel-inset" style={{ padding: "11px 13px", fontSize: 11.5, color: "var(--text-2)", lineHeight: 1.6 }}>
            지금까지의 모니터링 로그({logs.length}건)와 현재 모델·드리프트 상태를 근거로 답합니다.
            재학습 필요 여부, 판단 이유, 추세를 물어보세요.
          </div>
        )}
        {chat.length === 0 && llmOn && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "2px 1px" }}>
            {CHAT_SUGGESTIONS.map(s => (
              <button key={s} onClick={() => send(s)} disabled={sending} className="focusable"
                style={{
                  fontSize: 10.5, padding: "4px 9px", borderRadius: 99, cursor: "pointer", font: "inherit",
                  border: "1px solid var(--border-soft)", background: "var(--panel)", color: "var(--text-2)",
                }}>
                {s}
              </button>
            ))}
          </div>
        )}
        {chat.length === 0 && !llmOn && (
          <div style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.6, padding: "2px 1px" }}>
            설정 탭의 'Agent LLM 분석'을 켜면 모니터링 로그에 대해 질문할 수 있습니다.
          </div>
        )}

        {chat.map((m, i) => {
          const isUser = m.role === "user";
          const hasTools = !isUser && m.tools && m.tools.length > 0;
          const showCursor = !isUser && m.streaming && (m.content || "").length > 0;
          const thinking = !isUser && m.streaming && !hasTools && !(m.content || "").length;
          return (
            <div key={i} style={{
              alignSelf: isUser ? "flex-end" : "flex-start",
              maxWidth: "82%",
              background: isUser ? "var(--accent-dim)" : "var(--panel-2)",
              border: `1px solid ${isUser ? "var(--accent-line)" : "var(--border-soft)"}`,
              borderRadius: 10, padding: "8px 11px",
              fontSize: 12, lineHeight: 1.6, color: "var(--text)",
              whiteSpace: isUser ? "pre-wrap" : "normal",
            }}>
              {hasTools && <ToolCalls calls={m.tools} />}
              {thinking ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-3)" }}>
                  <Icon name="refresh" size={12} style={{ animation: "spin 1s linear infinite" }} />분석 중…
                </span>
              ) : isUser ? (
                m.content
              ) : (
                <>{m.content && <Markdown text={m.content} />}{showCursor && <span className="blink-cursor">▍</span>}</>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, padding: "10px 12px", borderTop: "1px solid var(--border)" }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) send(); }}
          placeholder={llmOn ? "모니터링 로그·모델 상태에 대해 질문하세요…" : "LLM이 꺼져 있어 채팅 불가"}
          disabled={!llmOn}
          style={{
            flex: 1, background: "var(--panel-2)", border: "1px solid var(--border-strong)",
            borderRadius: 7, padding: "8px 11px", color: "var(--text)", font: "inherit", fontSize: 12,
            opacity: llmOn ? 1 : .55,
          }} />
        <button className="btn btn-accent" onClick={() => send()} disabled={sending || !input.trim() || !llmOn}>
          <Icon name="send" size={13} />전송
        </button>
      </div>
    </Panel>
  );
}

export default function MlopsAgentView() {
  const { settings, tick } = useStream();
  // state + run loop + auto-monitor timer live in a root-level context, so the log
  // and auto-monitoring survive tab navigation (see MlopsAgentContext)
  const {
    logs, setLogs,
    autonomy, setAutonomy,
    autoMonitor, setAutoMonitor,
    running, run,
  } = useMlopsAgent();
  const logRef = useRef(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = 0; // newest entry is on top
  }, [logs]);

  // surface MLOps runs triggered by delegation (escalate_to_mlops from the
  // inspection agent). These happen server-side, so poll for them and merge any
  // new ones into the log — manual/auto runs are already shown live, so we only
  // pull the delegation-triggered ones to avoid duplicates.
  const loadDelegations = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/v1/mlops/agent/traces?limit=20`);
      if (!r.ok) return;
      const data = await r.json();
      const dels = (Array.isArray(data) ? data : []).filter(t => t.trigger === "delegation");
      if (dels.length === 0) return;
      setLogs(prev => {
        const have = new Set(prev.map(e => e.id));
        const fresh = dels
          .filter(t => !have.has(t.trace_id))
          .map(t => ({
            id: t.trace_id,
            ts: (t.created_at || "").slice(11, 19),
            autonomy: t.autonomy || "approval",
            steps: (t.tool_calls || []).map(tc => ({ name: tc.name, args: tc.args, status: "done", result: tc.result })),
            finalText: t.final_action || "",
            mode: t.agent_mode || "llm",
            status: "done",
            delegated: true,
            source: t.source,
          }));
        if (fresh.length === 0) return prev;
        return [...fresh, ...prev].slice(0, MAX_LOGS);
      });
    } catch { /* ignore */ }
  }, [setLogs]);

  useEffect(() => { loadDelegations(); }, [loadDelegations, tick]);

  const activeMode = AUTONOMY.find(a => a.id === autonomy);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "start" }}>
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

    <MlopsAgentChat />
    </div>
  );
}
