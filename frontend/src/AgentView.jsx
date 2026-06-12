import React, { useCallback, useEffect, useRef, useState } from "react";
import { Icon, Panel, Metric, RiskBadge, RiskGauge } from "./lib";
import { useStream } from "./SettingsContext";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const MODE_CHIP = {
  llm:       { color: "var(--accent)", label: "LLM (GPT-4o-mini)" },
  stub:      { color: "var(--med)",    label: "룰 기반 폴백" },
  rule_only: { color: "var(--text-3)", label: "Agent 미참여" },
  pending:   { color: "var(--med)",    label: "AI 분석 중…" },
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
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <Icon name="bot" size={13} style={{ color: "var(--accent)" }} />
        <span className="label-cap">결함 Q&A · Defect Chat</span>
        {!llmOn && <span className="chip" style={{ fontSize: 9, color: "var(--med)", borderColor: "var(--med)" }}>LLM 꺼짐</span>}
      </div>
      <div style={{ border: "1px solid var(--border-soft)", borderRadius: 9, overflow: "hidden" }}>
      <div ref={scrollRef} style={{ height: 210, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
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
      </div>
    </div>
  );
}

/* ---------- main view ---------- */

export default function AgentView({ focusId, onFocusHandled }) {
  const { tick, settings } = useStream();
  const [rows, setRows] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [listOpen, setListOpen] = useState(true);
  const [trace, setTrace] = useState(null);
  const [traceLoading, setTraceLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  // picking a case collapses the left list; the collapsed bar re-expands it
  function selectRow(id) {
    setSelectedId(id);
    setListOpen(false);
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/inspections?limit=50`);
      if (!res.ok) return;
      const data = await res.json();
      const mh = (Array.isArray(data) ? data : []).filter(r => r.risk_level === "Medium" || r.risk_level === "High");
      setRows(mh);
      // keep the current selection if it is still in the list; never auto-select
      setSelectedId(prev => (prev && mh.some(r => r.id === prev) ? prev : null));
    } catch { /* keep last */ }
  }, []);

  useEffect(() => { load(); }, [load, tick]);

  // toast "분석 보러 가기" hands us the case to open directly
  useEffect(() => {
    if (!focusId) return;
    if (rows.some(r => r.id === focusId)) {
      setSelectedId(focusId);
      setListOpen(false);
      onFocusHandled && onFocusHandled();
    }
  }, [focusId, rows, onFocusHandled]);

  // the agent runs in the background after an inspection, so the trace may
  // land a few seconds later — poll until it appears (or give up quietly)
  useEffect(() => {
    setTrace(null);
    if (!selectedId) return;
    let cancelled = false;
    let attempts = 0;
    setTraceLoading(true);
    async function poll() {
      try {
        const res = await fetch(`${API_BASE}/api/v1/inspect/${selectedId}/trace`);
        if (cancelled) return;
        if (res.ok) {
          setTrace(await res.json());
          setTraceLoading(false);
          return;
        }
      } catch { /* retry */ }
      attempts += 1;
      if (!cancelled && attempts < 8) setTimeout(poll, 3000);
      else if (!cancelled) setTraceLoading(false);
    }
    poll();
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
  const mode = trace
    ? (MODE_CHIP[trace.agent_mode] || MODE_CHIP.rule_only)
    : (traceLoading ? MODE_CHIP.pending : MODE_CHIP.rule_only);

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
  const met = selected?.metrology || {};
  const riskScore = Math.round((selected?.risk_score ?? 0) * 100);
  const dieFail = Math.round((selected?.hotspot_ratio || 0) * 612);

  const showList = listOpen || !selected;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 12, alignItems: "start" }}>
      {/* left column — queue (collapsible) + overview below it */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
        <Panel title="리스크 큐 · Medium / High" icon="alert" dense pad={6}
          right={<span className="chip" style={{ fontSize: 9.5, color: pending ? "var(--med)" : "var(--low)", borderColor: pending ? "var(--med)" : "var(--low)" }}>대기 {pending}</span>}>
          <div style={{ display: "grid", gridTemplateRows: showList ? "1fr" : "0fr", transition: "grid-template-rows .45s ease" }}>
            <div style={{ overflow: "hidden" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 480, overflowY: "auto" }}>
                {rows.length === 0 && (
                  <div style={{ padding: "26px 12px", textAlign: "center", fontSize: 11.5, color: "var(--text-3)" }}>
                    Medium/High 리스크 검사가 아직 없습니다.
                  </div>
                )}
                {rows.map(r => (
                  <QueueRow key={r.id} row={r} active={r.id === selectedId} onSelect={selectRow} />
                ))}
              </div>
            </div>
          </div>
          {!showList && (
            <button onClick={() => setListOpen(true)} className="focusable fade-in" title="리스크 큐 펼치기"
              style={{
                display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left",
                padding: "7px 10px", borderRadius: 7, cursor: "pointer", font: "inherit",
                border: "1px solid var(--border-soft)", background: "var(--panel-2)",
              }}>
              <RiskBadge level={selected.risk_level} />
              <span className="mono" style={{ fontSize: 11.5, color: "var(--text)", fontWeight: 600 }}>{selected.wafer_id}</span>
              <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, color: "var(--text-3)" }}>
                다른 케이스 <Icon name="chevD" size={12} />
              </span>
            </button>
          )}
        </Panel>

        {/* basic info — appears under the collapsed queue */}
        {selected && (
          <div key={`ov-${selected.id}`} className="fade-in">
              <Panel title="검사 개요" icon="layers" dense
                right={decided && (
                  <span className="chip" style={{ fontSize: 9.5, color: DECISION_LABEL[selected.engineer_decision]?.color, borderColor: DECISION_LABEL[selected.engineer_decision]?.color }}>
                    {DECISION_LABEL[selected.engineer_decision]?.label || selected.engineer_decision}
                  </span>
                )}>
                <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                    {selected.image_url && (
                      <figure style={{ margin: 0, textAlign: "center" }}>
                        <img src={`${API_BASE}${selected.image_url}`} alt="wafer map"
                          style={{ width: 108, height: 108, objectFit: "contain", borderRadius: 8, background: "var(--panel-2)" }} />
                        <figcaption style={{ fontSize: 9.5, color: "var(--text-3)", marginTop: 4 }}>Wafer Map</figcaption>
                      </figure>
                    )}
                    {selected.overlay_url && (
                      <figure style={{ margin: 0, textAlign: "center" }}>
                        <img src={`${API_BASE}${selected.overlay_url}`} alt="grad-cam"
                          style={{ width: 108, height: 108, objectFit: "contain", borderRadius: 8, background: "#0b1a2e" }} />
                        <figcaption style={{ fontSize: 9.5, color: "var(--text-3)", marginTop: 4 }}>Grad-CAM</figcaption>
                      </figure>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                    <RiskGauge score={riskScore} level={selected.risk_level} size={100} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                      <RiskBadge level={selected.risk_level} size="lg" />
                      <span className="chip">{selected.defect_type}</span>
                      <span className="chip" style={{ color: mode.color, borderColor: mode.color, fontSize: 9 }}>
                        <Icon name="bot" size={10} /> {mode.label}
                      </span>
                    </div>
                  </div>
                  <div className="divider" style={{ width: "100%", margin: 0 }} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 18px", width: "100%" }}>
                    <Metric label="신뢰도" value={((selected.confidence || 0) * 100).toFixed(1)} unit="%" />
                    <Metric label="영향 다이" value={dieFail} unit="/ 612" accent={selected.risk_level === "High" ? "var(--high)" : "var(--text)"} />
                    <Metric label="설비" value={selected.equipment_id} mono={false} sub={selected.process_step || ""} />
                    <Metric label="Lot · Wafer" value={selected.wafer_id} mono={false} sub={selected.lot_id || ""} />
                  </div>
                  <div className="mono" style={{ fontSize: 9.5, color: "var(--text-3)", lineHeight: 1.6, width: "100%" }}>
                    {selected.id}<br />
                    {(selected.created_at || "").slice(0, 19).replace("T", " ")}<br />
                    CD {met.cd_nm}nm · OVL {met.overlay_nm}nm · THK {met.film_thickness_nm}nm
                  </div>
                </div>
              </Panel>
          </div>
        )}
      </div>

      {/* right column — prompt or AI recommendation + agent decision */}
      {!selected ? (
        <Panel dense>
          <div style={{ minHeight: 340, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 11, textAlign: "center" }}>
            <Icon name="bot" size={30} style={{ color: "var(--accent)" }} />
            <div style={{ fontSize: 14.5, fontWeight: 650, color: "var(--text)" }}>분석할 케이스를 선택하세요</div>
            <div style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.7 }}>
              왼쪽 리스크 큐에서 검사를 선택하면<br />
              검사 개요와 AI 추천(추정 원인 · 권장 액션), 결함 Q&A가 표시됩니다.
            </div>
            {pending > 0 && (
              <span className="chip" style={{ color: "var(--med)", borderColor: "var(--med)", marginTop: 4 }}>
                조치 대기 {pending}건
              </span>
            )}
          </div>
        </Panel>
      ) : (
      <div key={selected.id} className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
              {/* AI recommendation + chat */}
              <Panel title="AI 추천 · 추정 원인 / 권장 액션" icon="shield" dense
                right={<span className="chip" style={{ color: "var(--accent)", borderColor: "var(--accent-line)" }}>근거: RAG + 계측 룰</span>}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1.1fr", gap: 16, alignItems: "start" }}>
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
                </div>

                <div className="divider" style={{ margin: "14px 0" }} />
                <DefectChat inspectionId={selected.id} llmOn={settings.useLlm} />
              </Panel>
      </div>
      )}
    </div>
  );
}
