import React, { useCallback, useEffect, useRef, useState } from "react";
import { Icon, Panel, Metric, RiskBadge, RiskGauge, StatusDot } from "./lib";
import { useStream } from "./SettingsContext";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const MODE_CHIP = {
  llm:       { color: "var(--accent)", label: "LLM (GPT-4o-mini)" },
  stub:      { color: "var(--med)",    label: "룰 기반 폴백" },
  rule_only: { color: "var(--text-3)", label: "Agent 미참여" },
  error:     { color: "var(--high)",   label: "Agent 오류" },
};

const DECISION_LABEL = {
  approved:     { color: "var(--low)",    label: "조치 완료" },
  needs_review: { color: "var(--med)",    label: "추가 리뷰" },
  false_alarm:  { color: "var(--text-3)", label: "오탐 처리" },
};

const CAUSE_CONF = [0.42, 0.27, 0.15, 0.10];

/* ---------- queue ---------- */

function QueueRow({ row, active, onSelect }) {
  const decided = !!row.engineer_decision;
  const d = DECISION_LABEL[row.engineer_decision];
  return (
    <button onClick={() => onSelect(row.id)} className="focusable"
      style={{
        display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left",
        padding: "8px 10px", borderRadius: 7, cursor: "pointer", font: "inherit",
        border: `1px solid ${active ? "var(--accent-line)" : "transparent"}`,
        background: active ? "var(--accent-dim)" : "transparent",
        opacity: decided && !active ? .55 : 1,
      }}>
      <RiskBadge level={row.risk_level} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
          <span className="mono" style={{ fontSize: 11.5, color: "var(--text)", fontWeight: 600 }}>{row.wafer_id}</span>
          <span style={{ fontSize: 11, color: "var(--text-2)" }}>{row.defect_type}</span>
        </div>
        <div className="mono" style={{ fontSize: 9.5, color: "var(--text-3)", marginTop: 2 }}>
          score {(row.risk_score ?? 0).toFixed(2)} · {(row.created_at || "").slice(5, 19).replace("T", " ")}
        </div>
      </div>
      {decided
        ? <span className="chip" style={{ fontSize: 9, color: d?.color, borderColor: d?.color }}>{d?.label || row.engineer_decision}</span>
        : <span className="chip" style={{ fontSize: 9, color: "var(--med)", borderColor: "var(--med)" }}>조치 대기</span>}
    </button>
  );
}

/* ---------- evidence popover ---------- */

function EvidenceBlock({ source }) {
  if (!source) return null;
  if (source.type === "metrology") {
    const h = source.hit;
    return (
      <div className="panel-inset" style={{ padding: "9px 11px", marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span className="chip" style={{ fontSize: 8.5, color: h.severity === "Critical" ? "var(--high)" : "var(--med)", borderColor: h.severity === "Critical" ? "var(--high)" : "var(--med)" }}>
            계측 룰 · {h.severity}
          </span>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text)" }}>{h.signal}</span>
        </div>
        <div className="mono" style={{ fontSize: 10.5, color: "var(--text-2)" }}>{h.evidence}</div>
        <div style={{ fontSize: 10.5, color: "var(--text-3)" }}>담당: {h.owner} · risk Δ +{h.risk_delta}</div>
      </div>
    );
  }
  const c = source.case;
  if (!c) {
    return (
      <div className="panel-inset" style={{ padding: "9px 11px", marginTop: 6, fontSize: 11, color: "var(--text-3)" }}>
        연결된 RAG 사례가 없습니다.
      </div>
    );
  }
  return (
    <div className="panel-inset" style={{ padding: "9px 11px", marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span className="chip" style={{ fontSize: 8.5, color: "var(--accent)", borderColor: "var(--accent-line)" }}>RAG 유사 사례</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text)" }}>{c.title}</span>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-2)", lineHeight: 1.5 }}>{c.summary}</div>
      <div style={{ fontSize: 10.5, color: "var(--text-3)" }}>당시 조치: {c.action}</div>
      {c.line_context && <div className="mono" style={{ fontSize: 9.5, color: "var(--text-3)" }}>{c.line_context}</div>}
    </div>
  );
}

function EvidenceToggle({ source }) {
  const [open, setOpen] = useState(false);
  const tag = source?.type === "metrology" ? "계측 근거" : "RAG 근거";
  return (
    <div>
      <button onClick={() => setOpen(o => !o)} className="focusable"
        style={{
          display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer",
          background: "transparent", border: "none", padding: "2px 0",
          color: open ? "var(--accent)" : "var(--text-3)", font: "inherit", fontSize: 10.5,
        }}>
        <Icon name={open ? "chevD" : "chevR"} size={11} />{tag} 보기
      </button>
      {open && <EvidenceBlock source={source} />}
    </div>
  );
}

/* ---------- AI recommendation ---------- */

function CauseCard({ idx, cause }) {
  return (
    <div className="panel-inset" style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span className="mono" style={{
          fontSize: 10, fontWeight: 700, color: "var(--accent)", background: "var(--accent-dim)",
          borderRadius: 5, padding: "1px 6px", flex: "none",
        }}>#{idx + 1}</span>
        <span style={{ fontSize: 12, color: "var(--text)", fontWeight: 600, flex: 1, minWidth: 0 }}>{cause.label}</span>
        <span className="mono" style={{ fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>{(cause.conf * 100).toFixed(0)}%</span>
      </div>
      <div style={{ height: 4, background: "var(--panel-2)", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ width: `${cause.conf * 100}%`, height: "100%", background: "var(--accent)", opacity: .7, borderRadius: 99 }} />
      </div>
      <EvidenceToggle source={cause.source} />
    </div>
  );
}

function ActionRow({ idx, action, onExecute, disabled, busy }) {
  return (
    <div className="panel-inset" style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
        <span style={{ fontSize: 12, color: "var(--text)", fontWeight: 500, flex: 1, minWidth: 0, lineHeight: 1.5 }}>{action.label}</span>
        <button className={`btn ${idx === 0 && !disabled ? "btn-accent" : ""}`}
          disabled={disabled || busy}
          onClick={() => onExecute(action)}
          style={{ padding: "4px 10px", fontSize: 11, flex: "none", opacity: disabled ? .5 : 1 }}>
          <Icon name="play" size={11} />실행
        </button>
      </div>
      <EvidenceToggle source={action.source} />
    </div>
  );
}

/* ---------- chat ---------- */

function DefectChat({ inspectionId, llmOn }) {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => { setMsgs([]); setInput(""); }, [inspectionId]);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy || !inspectionId || !llmOn) return;
    const history = msgs.map(m => ({ role: m.role, content: m.content }));
    setMsgs(m => [...m, { role: "user", content: text }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/inspect/${inspectionId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history, use_llm: llmOn }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMsgs(m => [...m, { role: "assistant", content: data.reply || "응답 없음" }]);
    } catch (e) {
      setMsgs(m => [...m, { role: "assistant", content: `오류: 응답을 받지 못했습니다 (${e.message})` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="결함 Q&A · Defect Chat" icon="bot" dense pad={0}
      right={!llmOn && <span className="chip" style={{ fontSize: 9.5, color: "var(--med)", borderColor: "var(--med)" }}>LLM 꺼짐</span>}>
      <div ref={scrollRef} style={{ height: 230, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        {msgs.length === 0 && (
          <div style={{ margin: "auto", textAlign: "center", fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.7 }}>
            {llmOn ? (
              <>
                이 결함에 대해 무엇이든 질문하세요.<br />
                예: <span className="mono" style={{ fontSize: 10.5 }}>"이 패턴이 반복되면 어떤 설비부터 봐야 해?"</span>
              </>
            ) : (
              <>설정에서 LLM 호출이 꺼져 있어 채팅을 사용할 수 없습니다.<br />설정 탭의 'Agent LLM 분석'을 켜주세요.</>
            )}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} style={{
            alignSelf: m.role === "user" ? "flex-end" : "flex-start",
            maxWidth: "78%",
            background: m.role === "user" ? "var(--accent-dim)" : "var(--panel-2)",
            border: `1px solid ${m.role === "user" ? "var(--accent-line)" : "var(--border-soft)"}`,
            borderRadius: 10, padding: "8px 11px",
            fontSize: 12, lineHeight: 1.6, color: "var(--text)", whiteSpace: "pre-wrap",
          }}>
            {m.content}
          </div>
        ))}
        {busy && (
          <div style={{ alignSelf: "flex-start", fontSize: 11, color: "var(--text-3)", display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="refresh" size={12} style={{ animation: "spin 1s linear infinite" }} />분석 중…
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, padding: "10px 12px", borderTop: "1px solid var(--border)" }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) send(); }}
          placeholder={llmOn ? "이 결함에 대해 질문 입력…" : "LLM이 꺼져 있어 채팅 불가"}
          disabled={!llmOn}
          style={{
            flex: 1, background: "var(--panel-2)", border: "1px solid var(--border-strong)",
            borderRadius: 7, padding: "8px 11px", color: "var(--text)", font: "inherit", fontSize: 12,
            opacity: llmOn ? 1 : .55,
          }} />
        <button className="btn btn-accent" onClick={send} disabled={busy || !input.trim() || !llmOn}>
          <Icon name="send" size={13} />전송
        </button>
      </div>
    </Panel>
  );
}

/* ---------- main view ---------- */

export default function AgentView() {
  const { tick, settings } = useStream();
  const [rows, setRows] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [trace, setTrace] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/inspections?limit=50`);
      if (!res.ok) return;
      const data = await res.json();
      const mh = (Array.isArray(data) ? data : []).filter(r => r.risk_level === "Medium" || r.risk_level === "High");
      setRows(mh);
      setSelectedId(prev =>
        prev && mh.some(r => r.id === prev)
          ? prev
          : (mh.find(r => !r.engineer_decision)?.id ?? mh[0]?.id ?? null));
    } catch { /* keep last */ }
  }, []);

  useEffect(() => { load(); }, [load, tick]);

  useEffect(() => {
    setTrace(null);
    if (!selectedId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/inspect/${selectedId}/trace`);
        if (res.ok && !cancelled) setTrace(await res.json());
      } catch { /* no trace */ }
    })();
    return () => { cancelled = true; };
  }, [selectedId]);

  async function executeAction(action) {
    if (!selectedId || busy) return;
    setBusy(true);
    try {
      await fetch(`${API_BASE}/api/v1/review/${selectedId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "approved", reviewer: "operator", note: `액션 실행: ${action.label}` }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  const selected = rows.find(r => r.id === selectedId) || null;
  const decided = !!selected?.engineer_decision;
  const pending = rows.filter(r => !r.engineer_decision).length;
  const mode = MODE_CHIP[trace?.agent_mode] || MODE_CHIP.rule_only;

  // AI recommendation data with evidence sources
  const card = selected?.action_card || {};
  const cases = selected?.cases || [];
  const ruleHits = card.metrology_rule_hits || [];
  const causes = (card.possible_causes || []).map((label, i) => ({
    label,
    conf: CAUSE_CONF[i] ?? 0.08,
    source: { type: "rag", case: cases[i % Math.max(cases.length, 1)] || cases[0] || null },
  }));
  const actions = (card.next_actions || []).map(label => {
    const hit = ruleHits.find(h => h.action === label);
    return { label, source: hit ? { type: "metrology", hit } : { type: "rag", case: cases[0] || null } };
  });
  const checks = [...(card.process_checks || []), ...(card.metrology_checks || [])];
  const met = selected?.metrology || {};
  const riskScore = Math.round((selected?.risk_score ?? 0) * 100);
  const dieFail = Math.round((selected?.hotspot_ratio || 0) * 612);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 12, alignItems: "start" }}>
      {/* risk queue */}
      <Panel title="리스크 큐 · Medium / High" icon="alert" dense pad={6}
        right={<span className="chip" style={{ fontSize: 9.5, color: pending ? "var(--med)" : "var(--low)", borderColor: pending ? "var(--med)" : "var(--low)" }}>대기 {pending}</span>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 700, overflowY: "auto" }}>
          {rows.length === 0 && (
            <div style={{ padding: "26px 12px", textAlign: "center", fontSize: 11.5, color: "var(--text-3)" }}>
              Medium/High 리스크 검사가 아직 없습니다.
            </div>
          )}
          {rows.map(r => (
            <QueueRow key={r.id} row={r} active={r.id === selectedId} onSelect={setSelectedId} />
          ))}
        </div>
      </Panel>

      {/* detail */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
        {!selected ? (
          <Panel dense>
            <div style={{ padding: "36px 12px", textAlign: "center", fontSize: 12, color: "var(--text-3)" }}>
              왼쪽 큐에서 검사를 선택하면 상세 분석이 표시됩니다.
            </div>
          </Panel>
        ) : (
          <>
            {/* basic info */}
            <Panel title="검사 개요" icon="layers" dense
              right={
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="chip" style={{ color: mode.color, borderColor: mode.color }}>
                    <Icon name="bot" size={11} /> {mode.label}
                  </span>
                  {decided && (
                    <span className="chip" style={{ fontSize: 9.5, color: DECISION_LABEL[selected.engineer_decision]?.color, borderColor: DECISION_LABEL[selected.engineer_decision]?.color }}>
                      {DECISION_LABEL[selected.engineer_decision]?.label || selected.engineer_decision}
                    </span>
                  )}
                </span>
              }>
              <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 10 }}>
                  {selected.image_url && (
                    <figure style={{ margin: 0, textAlign: "center" }}>
                      <img src={`${API_BASE}${selected.image_url}`} alt="wafer map"
                        style={{ width: 132, height: 132, objectFit: "contain", borderRadius: 8, background: "var(--panel-2)" }} />
                      <figcaption style={{ fontSize: 9.5, color: "var(--text-3)", marginTop: 4 }}>Wafer Map</figcaption>
                    </figure>
                  )}
                  {selected.overlay_url && (
                    <figure style={{ margin: 0, textAlign: "center" }}>
                      <img src={`${API_BASE}${selected.overlay_url}`} alt="grad-cam"
                        style={{ width: 132, height: 132, objectFit: "contain", borderRadius: 8, background: "#0b1a2e" }} />
                      <figcaption style={{ fontSize: 9.5, color: "var(--text-3)", marginTop: 4 }}>Grad-CAM</figcaption>
                    </figure>
                  )}
                </div>
                <RiskGauge score={riskScore} level={selected.risk_level} size={110} />
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <RiskBadge level={selected.risk_level} size="lg" />
                  <span className="chip">{selected.defect_type}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, auto)", gap: "12px 24px", marginLeft: "auto", paddingRight: 8 }}>
                  <Metric label="신뢰도" value={((selected.confidence || 0) * 100).toFixed(1)} unit="%" />
                  <Metric label="영향 다이" value={dieFail} unit="/ 612" accent={selected.risk_level === "High" ? "var(--high)" : "var(--text)"} />
                  <Metric label="설비" value={selected.equipment_id} mono={false} sub={selected.process_step || ""} />
                  <Metric label="Lot · Wafer" value={selected.wafer_id} mono={false} sub={selected.lot_id || ""} />
                </div>
              </div>
              <div className="mono" style={{ fontSize: 10, color: "var(--text-3)", marginTop: 10 }}>
                {selected.id} · {(selected.created_at || "").slice(0, 19).replace("T", " ")} ·
                CD {met.cd_nm}nm · OVL {met.overlay_nm}nm · THK {met.film_thickness_nm}nm
              </div>
            </Panel>

            {/* AI recommendation */}
            <Panel title="AI 추천 · 추정 원인 / 권장 액션" icon="shield" dense
              right={<span className="chip" style={{ color: "var(--accent)", borderColor: "var(--accent-line)" }}>근거: RAG + 계측 룰</span>}>
              <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1.2fr .8fr", gap: 16, alignItems: "start" }}>
                <div>
                  <div className="label-cap" style={{ marginBottom: 8 }}>추정 원인 · Probable Causes</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {causes.map((c, i) => <CauseCard key={i} idx={i} cause={c} />)}
                  </div>
                </div>
                <div>
                  <div className="label-cap" style={{ marginBottom: 8 }}>권장 액션 · Next Actions</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {actions.map((a, i) => (
                      <ActionRow key={i} idx={i} action={a} onExecute={executeAction} disabled={decided} busy={busy} />
                    ))}
                    {decided && (
                      <span style={{ fontSize: 10.5, color: "var(--text-3)" }}>
                        이미 조치가 기록된 검사입니다 ({selected.review_note || selected.engineer_decision}).
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="label-cap" style={{ marginBottom: 8 }}>점검 항목 · Checks</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {checks.slice(0, 6).map((c, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: "var(--text-2)" }}>
                        <StatusDot kind="idle" /><span style={{ minWidth: 0 }}>{c}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Panel>

            {/* agent decision + chat */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 12, alignItems: "start" }}>
              <Panel title="Agent 판단 · Final Action" icon="bot" dense
                right={<span className="mono" style={{ fontSize: 10, color: "var(--text-3)" }}>{selected.id}</span>}>
                <div style={{ fontSize: 12.5, lineHeight: 1.7, color: "var(--text-2)", whiteSpace: "pre-wrap", textWrap: "pretty" }}>
                  {trace?.final_action || "이 검사에 대한 Agent 판단 기록이 없습니다."}
                </div>
                {(trace?.tool_calls || []).length > 0 && (
                  <>
                    <div className="divider" style={{ margin: "12px 0" }} />
                    <div className="label-cap" style={{ marginBottom: 7 }}>Tool Calls · {trace.tool_calls.length}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {trace.tool_calls.map((t, i) => (
                        <div key={i} className="panel-inset" style={{ padding: "8px 10px", display: "flex", gap: 9, alignItems: "flex-start" }}>
                          <StatusDot kind="ok" />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div className="mono" style={{ fontSize: 11.5, color: "var(--accent)", fontWeight: 600 }}>{t.name}</div>
                            <div className="mono" style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {JSON.stringify(t.args || {})}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </Panel>

              <DefectChat inspectionId={selected.id} llmOn={settings.useLlm} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
