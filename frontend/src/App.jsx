import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Clock,
  ClipboardList,
  Database,
  FileText,
  Gauge,
  GitBranch,
  History,
  MessageCircle,
  Play,
  RefreshCcw,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  ShieldAlert,
  Wrench,
  Workflow,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const defectOptions = ["auto", "Center", "Donut", "Edge-Loc", "Edge-Ring", "Loc", "Random", "Scratch", "Near-full", "None"];
const riskColor = { High: "#dc2626", Medium: "#d97706", Low: "#059669" };
const chartColors = ["#0f766e", "#2563eb", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#4d7c0f", "#9333ea", "#64748b"];

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `API error ${response.status}`);
  }
  return response.json();
}

async function apiOptional(path) {
  try {
    return await api(path);
  } catch {
    return null;
  }
}

function Stat({ icon: Icon, label, value, tone }) {
  return (
    <section className={`stat stat-${tone}`}>
      <div className="stat-icon"><Icon size={18} /></div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
    </section>
  );
}

function RiskPill({ value }) {
  return <span className={`risk-pill risk-${value}`}>{value}</span>;
}

export default function App() {
  const [metrics, setMetrics] = useState(null);
  const [inspections, setInspections] = useState([]);
  const [state, setState] = useState(null);
  const [latest, setLatest] = useState(null);
  const [handoff, setHandoff] = useState(null);
  const [handoffEdit, setHandoffEdit] = useState({ headline: "", operator_note: "", markdown: "", scrap_risk: "Low" });
  const [copilot, setCopilot] = useState(null);
  const [autoDraftEnabled, setAutoDraftEnabled] = useState(false);
  const [shiftDraftTime, setShiftDraftTime] = useState("17:00");
  const [lastAutoDraftKey, setLastAutoDraftKey] = useState("");
  const [chatMessages, setChatMessages] = useState([
    { role: "assistant", text: "교대 리포트 초안 생성, 설비 특이사항 확인, 전달 확인을 도와줄게요." },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [form, setForm] = useState({
    wafer_id: "WF-DEMO-001",
    line_id: "LINE-7",
    equipment_id: "ETCH-02",
    defect_hint: "auto",
  });
  const [handoffForm, setHandoffForm] = useState({
    shift_from: "day",
    shift_to: "night",
    line_id: "LINE-7",
    operator: "shift-lead",
    note: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    const [m, rows, mlops, report, ops] = await Promise.all([
      api("/api/v1/metrics"),
      api("/api/v1/inspections?limit=20"),
      api("/api/v1/mlops/state"),
      apiOptional("/api/v1/handoff/latest"),
      apiOptional(`/api/v1/copilot/ops?line_id=${encodeURIComponent(form.line_id || "ALL")}`),
    ]);
    setMetrics(m);
    setInspections(rows);
    setState(mlops);
    setHandoff(report);
    setCopilot(ops);
    setLatest((current) => current || rows[0] || null);
  }

  useEffect(() => {
    refresh().catch((err) => setError(err.message));
    const id = setInterval(() => refresh().catch(() => {}), 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!handoff) return;
    setHandoffEdit({
      headline: handoff.headline || "",
      operator_note: handoff.operator_note || "",
      markdown: handoff.markdown || "",
      scrap_risk: handoff.scrap_risk || "Low",
    });
  }, [handoff?.id]);

  useEffect(() => {
    const id = setInterval(async () => {
      if (!autoDraftEnabled || !shiftDraftTime) return;
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const hhmm = now.toTimeString().slice(0, 5);
      const draftKey = `${today}-${shiftDraftTime}-${handoffForm.line_id}`;
      if (hhmm >= shiftDraftTime && lastAutoDraftKey !== draftKey) {
        setLastAutoDraftKey(draftKey);
        try {
          const report = await api("/api/v1/handoff/report", {
            method: "POST",
            body: JSON.stringify({
              ...handoffForm,
              scheduled_for: shiftDraftTime,
              reuse_existing: true,
              note: handoffForm.note || `${shiftDraftTime} 교대 자동 초안`,
            }),
          });
          setHandoff(report);
          appendChat(
            "assistant",
            report.reused_existing
              ? `${shiftDraftTime} 교대 리포트 기존 초안을 다시 열었어요. 수정 후 '이대로 전달'을 눌러주세요.`
              : `${shiftDraftTime} 교대 리포트 초안을 자동 생성했어요. 수정 후 '이대로 전달'을 눌러주세요.`,
          );
        } catch (err) {
          setError(err.message);
        }
      }
    }, 15000);
    return () => clearInterval(id);
  }, [autoDraftEnabled, shiftDraftTime, handoffForm, lastAutoDraftKey]);

  const reviewQueue = useMemo(
    () => inspections.filter((item) => item.risk_level === "High" || item.status === "review_required").slice(0, 5),
    [inspections],
  );

  async function runAction(action) {
    setBusy(true);
    setError("");
    try {
      let result = null;
      if (action === "inspect") {
        result = await api("/api/v1/inspect", {
          method: "POST",
          body: JSON.stringify(form),
        });
        setLatest(result);
      }
      if (action === "drift") {
        await api("/api/v1/mlops/drift", {
          method: "POST",
          body: JSON.stringify({ intensity: "strong", line_id: form.line_id }),
        });
      }
      if (action === "retrain") {
        await api("/api/v1/mlops/retrain", {
          method: "POST",
          body: JSON.stringify({ trigger_type: "manual" }),
        });
      }
      if (action === "promote") {
        await api("/api/v1/models/promote", {
          method: "POST",
          body: JSON.stringify({}),
        });
      }
      if (action === "rollback") {
        await api("/api/v1/models/rollback", {
          method: "POST",
          body: JSON.stringify({ reason: "demo performance degradation" }),
        });
      }
      if (action === "handoff") {
        const report = await api("/api/v1/handoff/report", {
          method: "POST",
          body: JSON.stringify({ ...handoffForm, scheduled_for: shiftDraftTime }),
        });
        setHandoff(report);
      }
      if (action === "seedDemo") {
        result = await api("/api/v1/demo/seed", {
          method: "POST",
          body: JSON.stringify({
            line_id: handoffForm.line_id || form.line_id,
            reviewer: handoffForm.operator || "demo-engineer",
            include_reviews: true,
          }),
        });
        const seededRows = result.reviewed?.length ? result.reviewed : result.inspections;
        if (seededRows?.length) {
          setLatest(seededRows[seededRows.length - 1]);
        }
        appendChat(
          "assistant",
          `시연 데이터 ${result.created_count}건과 엔지니어 리뷰 ${result.reviewed_count}건을 생성했어요. 결함 분포와 Human Decision Trace를 확인해보세요.`,
        );
      }
      if (action === "saveHandoff" && handoff) {
        const savePayload = {
          headline: handoffEdit.headline,
          operator_note: handoffEdit.operator_note,
          scrap_risk: handoffEdit.scrap_risk,
          markdown: handoffEdit.markdown !== handoff.markdown ? handoffEdit.markdown : null,
        };
        const report = await api(`/api/v1/handoff/${handoff.id}`, {
          method: "PUT",
          body: JSON.stringify(savePayload),
        });
        setHandoff(report);
      }
      if (action === "sendHandoff" && handoff) {
        const report = await api(`/api/v1/handoff/${handoff.id}/send`, {
          method: "POST",
          body: JSON.stringify({ sender: handoffForm.operator, message: "이대로 전달합니다." }),
        });
        setHandoff(report);
      }
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function appendChat(role, text) {
    setChatMessages((messages) => [...messages, { role, text }]);
  }

  async function handleChatSubmit(event) {
    event.preventDefault();
    const text = chatInput.trim();
    if (!text) return;
    setChatInput("");
    appendChat("user", text);
    try {
      if (text.includes("리포트") || text.includes("초안")) {
        const report = await api("/api/v1/handoff/report", {
          method: "POST",
          body: JSON.stringify({ ...handoffForm, scheduled_for: shiftDraftTime }),
        });
        setHandoff(report);
        appendChat("assistant", "교대 리포트 초안을 만들었어요. 오른쪽에서 수정하고 '이대로 전달'을 눌러주세요.");
        return;
      }
      if (text.includes("전달")) {
        if (!handoff) {
          appendChat("assistant", "전달할 리포트 초안이 아직 없어요. 먼저 초안을 생성해 주세요.");
          return;
        }
        const report = await api(`/api/v1/handoff/${handoff.id}/send`, {
          method: "POST",
          body: JSON.stringify({ sender: handoffForm.operator, message: "채팅에서 전달 확인" }),
        });
        setHandoff(report);
        appendChat("assistant", `${report.id} 리포트를 전달 완료 상태로 기록했어요.`);
        return;
      }
      if (text.includes("설비") || text.includes("특이")) {
        const memory = copilot?.equipment_memory?.[0];
        appendChat(
          "assistant",
          memory
            ? `${memory.equipment_id}에서 ${memory.main_pattern} 패턴이 중요해요. 먼저 ${memory.first_check}를 확인하세요.`
            : "현재 반복 설비 패턴은 아직 없어요.",
        );
        return;
      }
      appendChat("assistant", copilot?.headline || "현재 검사와 인수인계 데이터를 기준으로 위험 항목을 확인 중입니다.");
    } catch (err) {
      appendChat("assistant", `처리 중 오류가 났어요: ${err.message}`);
    }
  }

  async function review(decision) {
    if (!latest) return;
    setBusy(true);
    try {
      const updated = await api(`/api/v1/review/${latest.id}`, {
        method: "POST",
        body: JSON.stringify({
          decision,
          reviewer: "demo-engineer",
          note: decision === "approved" ? "Grad-CAM 근거 확인" : "추가 현장 확인 필요",
        }),
      });
      setLatest(updated);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const model = metrics?.production_model || {};
  const trend = metrics?.risk_trend || [];
  const distribution = metrics?.defect_distribution || [];

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">WaferGuard MLOps</p>
          <h1>반도체 결함 검사 운영 콘솔</h1>
        </div>
        <div className="topbar-actions">
          <button className="icon-button" onClick={refresh} disabled={busy} title="새로고침">
            <RefreshCcw size={18} />
          </button>
          <button onClick={() => runAction("seedDemo")} disabled={busy}>
            <Database size={17} /> 시연 데이터
          </button>
          <button className="primary" onClick={() => runAction("inspect")} disabled={busy}>
            <Play size={17} /> 샘플 검사 실행
          </button>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <section className="stats-grid">
        <Stat icon={Activity} label="총 검사" value={metrics?.total_inspections ?? 0} tone="blue" />
        <Stat icon={AlertTriangle} label="High Risk" value={metrics?.high_risk_count ?? 0} tone="red" />
        <Stat icon={Workflow} label="검토 큐" value={metrics?.review_queue_count ?? 0} tone="amber" />
        <Stat icon={Gauge} label="운영 모델 F1" value={model.f1_score ? model.f1_score.toFixed(3) : "0.872"} tone="green" />
      </section>

      <section className="main-grid">
        <section className="panel control-panel">
          <div className="panel-title">
            <div>
              <p>Inspection</p>
              <h2>웨이퍼 검사 요청</h2>
            </div>
            <ShieldCheck size={21} />
          </div>
          <div className="field-grid">
            <label>
              Wafer ID
              <input value={form.wafer_id} onChange={(e) => setForm({ ...form, wafer_id: e.target.value })} />
            </label>
            <label>
              Line
              <input value={form.line_id} onChange={(e) => setForm({ ...form, line_id: e.target.value })} />
            </label>
            <label>
              Equipment
              <input value={form.equipment_id} onChange={(e) => setForm({ ...form, equipment_id: e.target.value })} />
            </label>
            <label>
              Defect
              <select value={form.defect_hint} onChange={(e) => setForm({ ...form, defect_hint: e.target.value })}>
                {defectOptions.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
          </div>
          <div className="button-row">
            <button className="primary wide" onClick={() => runAction("inspect")} disabled={busy}>
              <Play size={17} /> 검사 실행
            </button>
            <button onClick={() => runAction("drift")} disabled={busy}>
              <GitBranch size={17} /> 드리프트
            </button>
          </div>
        </section>

        <section className="panel result-panel">
          <div className="panel-title">
            <div>
              <p>Latest Result</p>
              <h2>{latest ? latest.id : "검사 대기"}</h2>
            </div>
            {latest && <RiskPill value={latest.risk_level} />}
          </div>
          {latest ? (
            <>
              <div className="image-strip">
                <figure>
                  <img src={`${API_BASE}${latest.image_url}`} alt="Wafer map" />
                  <figcaption>Wafer</figcaption>
                </figure>
                <figure>
                  <img src={`${API_BASE}${latest.overlay_url}`} alt="Grad-CAM overlay" />
                  <figcaption>Grad-CAM</figcaption>
                </figure>
              </div>
              <div className="result-meta">
                <span>{latest.defect_type}</span>
                <span>{Math.round(latest.confidence * 100)}% confidence</span>
                <span>{latest.model_version}</span>
              </div>
              <p className="report">{latest.report}</p>
              <div className="button-row">
                <button onClick={() => review("approved")} disabled={busy}>
                  <CheckCircle2 size={17} /> 승인
                </button>
                <button onClick={() => review("needs_review")} disabled={busy}>
                  <AlertTriangle size={17} /> 추가 검토
                </button>
              </div>
            </>
          ) : (
            <div className="empty-state">샘플 검사를 실행하면 이미지, 히트맵, 리포트가 표시됩니다.</div>
          )}
        </section>

        <section className="panel queue-panel">
          <div className="panel-title">
            <div>
              <p>Action Queue</p>
              <h2>고위험 검토 대기</h2>
            </div>
            <AlertTriangle size={21} />
          </div>
          <div className="queue-list">
            {reviewQueue.length === 0 && <div className="empty-state compact">현재 긴급 검토 항목 없음</div>}
            {reviewQueue.map((item) => (
              <button key={item.id} className="queue-item" onClick={() => setLatest(item)}>
                <span>{item.wafer_id}</span>
                <strong>{item.defect_type}</strong>
                <RiskPill value={item.risk_level} />
              </button>
            ))}
          </div>
        </section>
      </section>

      <section className="panel chat-panel">
        <div className="panel-title">
          <div>
            <p>Shift Copilot Chat</p>
            <h2>교대 리포트 작업 채팅</h2>
          </div>
          <MessageCircle size={21} />
        </div>
        <div className="chat-layout">
          <div className="chat-stream">
            {chatMessages.map((message, index) => (
              <div className={`chat-bubble chat-${message.role}`} key={`${message.role}-${index}`}>
                {message.text}
              </div>
            ))}
          </div>
          <form className="chat-form" onSubmit={handleChatSubmit}>
            <input
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder="예: 교대 리포트 초안 만들어줘 / 이대로 전달해 / 설비 특이사항 알려줘"
            />
            <button className="primary" type="submit">
              <Send size={16} /> 전송
            </button>
          </form>
        </div>
      </section>

      <section className="panel handoff-panel">
        <div className="panel-title">
          <div>
            <p>Daily Report</p>
            <h2>교대 인수인계 표준 리포트</h2>
          </div>
          <FileText size={21} />
        </div>
        <div className="handoff-layout">
          <div className="handoff-controls">
            <div className="field-grid">
              <label>
                From
                <select
                  value={handoffForm.shift_from}
                  onChange={(e) => setHandoffForm({ ...handoffForm, shift_from: e.target.value })}
                >
                  <option value="day">오전 근무</option>
                  <option value="swing">오후 근무</option>
                  <option value="night">야간 근무</option>
                </select>
              </label>
              <label>
                To
                <select
                  value={handoffForm.shift_to}
                  onChange={(e) => setHandoffForm({ ...handoffForm, shift_to: e.target.value })}
                >
                  <option value="day">오전 근무</option>
                  <option value="swing">오후 근무</option>
                  <option value="night">야간 근무</option>
                </select>
              </label>
              <label>
                Line
                <input
                  value={handoffForm.line_id}
                  onChange={(e) => setHandoffForm({ ...handoffForm, line_id: e.target.value })}
                />
              </label>
              <label>
                Operator
                <input
                  value={handoffForm.operator}
                  onChange={(e) => setHandoffForm({ ...handoffForm, operator: e.target.value })}
                />
              </label>
            </div>
            <label className="note-field">
              근무자 특이사항
              <textarea
                value={handoffForm.note}
                onChange={(e) => setHandoffForm({ ...handoffForm, note: e.target.value })}
                placeholder="예: ETCH-02 edge ring 증가, 다음 근무자가 PM 이력 확인"
              />
            </label>
            <div className="schedule-row">
              <label>
                자동 초안 시간
                <input
                  type="time"
                  value={shiftDraftTime}
                  onChange={(event) => setShiftDraftTime(event.target.value)}
                />
              </label>
              <label className="toggle-field">
                <input
                  type="checkbox"
                  checked={autoDraftEnabled}
                  onChange={(event) => setAutoDraftEnabled(event.target.checked)}
                />
                <span><Clock size={15} /> 자동 초안</span>
              </label>
            </div>
            <button className="primary wide" onClick={() => runAction("handoff")} disabled={busy}>
              <ClipboardList size={17} /> Daily Report 초안 생성
            </button>
          </div>

          <div className="handoff-output">
            {handoff ? (
              <>
                <div className="handoff-summary">
                  <div className="handoff-status-row">
                    <span className={`scrap-risk scrap-${handoffEdit.scrap_risk}`}>Scrap Risk {handoffEdit.scrap_risk}</span>
                    <span className={`report-status status-${handoff.status || "draft"}`}>{handoff.status === "sent" ? "전달 완료" : "초안"}</span>
                  </div>
                  <label>
                    핵심 인수인계
                    <input
                      value={handoffEdit.headline}
                      onChange={(event) => setHandoffEdit({ ...handoffEdit, headline: event.target.value })}
                    />
                  </label>
                  <label>
                    Scrap Risk
                    <select
                      value={handoffEdit.scrap_risk}
                      onChange={(event) => setHandoffEdit({ ...handoffEdit, scrap_risk: event.target.value })}
                    >
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                    </select>
                  </label>
                </div>
                <div className="handoff-sections">
                  <section>
                    <h3>설비 특이사항</h3>
                    {handoff.equipment_watch.length === 0 ? (
                      <p>현재 특이 설비 없음</p>
                    ) : (
                      handoff.equipment_watch.map((item) => (
                        <div className="handoff-item" key={`${item.equipment_id}-${item.main_defect}`}>
                          <strong>{item.equipment_id} / {item.main_defect}</strong>
                          <span>{item.required_action}</span>
                        </div>
                      ))
                    )}
                  </section>
                  <section>
                    <h3>다음 근무자 체크리스트</h3>
                    <ul>
                      {handoff.next_shift_checklist.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </section>
                </div>
                <label className="note-field">
                  작성자 메모
                  <textarea
                    value={handoffEdit.operator_note}
                    onChange={(event) => setHandoffEdit({ ...handoffEdit, operator_note: event.target.value })}
                  />
                </label>
                <label className="note-field">
                  리포트 본문
                  <textarea
                    className="handoff-editor"
                    value={handoffEdit.markdown}
                    onChange={(event) => setHandoffEdit({ ...handoffEdit, markdown: event.target.value })}
                  />
                </label>
                <div className="confirm-box">
                  {handoff.status === "sent" ? (
                    <strong>{handoff.sent_by || handoffForm.operator}가 {handoff.sent_at || "방금"} 전달 완료로 기록했습니다.</strong>
                  ) : (
                    <strong>이대로 다음 근무자에게 전달하시겠습니까?</strong>
                  )}
                  <div className="button-row">
                    <button onClick={() => runAction("saveHandoff")} disabled={busy || !handoff}>
                      <Save size={16} /> 수정 저장
                    </button>
                    <button className="primary" onClick={() => runAction("sendHandoff")} disabled={busy || !handoff || handoff.status === "sent"}>
                      <Send size={16} /> 이대로 전달
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="empty-state compact">Daily Report를 생성하면 교대 인수인계 내용이 여기에 저장됩니다.</div>
            )}
          </div>
        </div>
      </section>

      <section className="panel ops-panel">
        <div className="panel-title">
          <div>
            <p>Fab Ops Copilot</p>
            <h2>설비 메모리와 Scrap 방지 조치</h2>
          </div>
          <BrainCircuit size={21} />
        </div>
        {copilot ? (
          <>
            <div className="ops-headline">
              <ShieldAlert size={18} />
              <strong>{copilot.headline}</strong>
            </div>
            <div className="ops-grid">
              <section>
                <h3><Wrench size={15} /> Equipment Memory</h3>
                <div className="ops-list">
                  {copilot.equipment_memory.length === 0 ? (
                    <p>아직 반복 설비 패턴 없음</p>
                  ) : (
                    copilot.equipment_memory.map((item) => (
                      <div className="ops-item" key={item.equipment_id}>
                        <strong>{item.equipment_id} / {item.main_pattern}</strong>
                        <span>{item.memory_note}</span>
                      </div>
                    ))
                  )}
                </div>
              </section>
              <section>
                <h3><ClipboardList size={15} /> Action Recommendation</h3>
                <div className="ops-list">
                  {copilot.action_recommendations.slice(0, 3).map((item) => (
                    <div className="ops-item" key={`${item.priority}-${item.inspection_id || item.equipment_id}`}>
                      <strong>{item.priority} / {item.owner}</strong>
                      <span>{item.recommended_action}</span>
                    </div>
                  ))}
                </div>
              </section>
              <section>
                <h3><ShieldAlert size={15} /> Near-miss Log</h3>
                <div className="ops-list">
                  {copilot.near_miss_log.length === 0 ? (
                    <p>현재 near-miss 기록 없음</p>
                  ) : (
                    copilot.near_miss_log.slice(0, 3).map((item) => (
                      <div className="ops-item" key={item.inspection_id}>
                        <strong>{item.wafer_id} / {item.defect_type}</strong>
                        <span>{item.scrap_prevention_note}</span>
                      </div>
                    ))
                  )}
                </div>
              </section>
              <section>
                <h3><History size={15} /> Human Decision Trace</h3>
                <div className="ops-list">
                  {copilot.human_decision_trace.slice(0, 3).map((item) => (
                    <div className="ops-item" key={item.inspection_id}>
                      <strong>{item.ai_prediction} {"->"} {item.engineer_decision}</strong>
                      <span>{item.review_note}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </>
        ) : (
          <div className="empty-state compact">검사 데이터가 쌓이면 운영 Copilot 요약이 표시됩니다.</div>
        )}
      </section>

      <section className="analytics-grid">
        <section className="panel">
          <div className="panel-title">
            <div>
              <p>Defect Mix</p>
              <h2>결함 유형 분포</h2>
            </div>
          </div>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={distribution} dataKey="count" nameKey="defect_type" outerRadius={88} innerRadius={48}>
                  {distribution.map((entry, index) => <Cell key={entry.defect_type} fill={chartColors[index % chartColors.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="panel">
          <div className="panel-title">
            <div>
              <p>Risk Trend</p>
              <h2>최근 위험도 추이</h2>
            </div>
          </div>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d7dee8" />
                <XAxis dataKey="id" hide />
                <YAxis domain={[0, 1]} />
                <Tooltip />
                <Area type="monotone" dataKey="risk_score" stroke="#0f766e" fill="#99f6e4" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="panel">
          <div className="panel-title">
            <div>
              <p>MLOps</p>
              <h2>파이프라인 상태</h2>
            </div>
            <Workflow size={21} />
          </div>
          <div className="pipeline-actions">
            <button onClick={() => runAction("retrain")} disabled={busy}>재학습</button>
            <button onClick={() => runAction("promote")} disabled={busy}>승급</button>
            <button onClick={() => runAction("rollback")} disabled={busy}><RotateCcw size={16} /> 롤백</button>
          </div>
          <div className="state-list">
            <div><span>Production</span><strong>{model.version || "wg-local-v1.0.0"}</strong></div>
            <div><span>p95 latency</span><strong>{model.latency_p95_ms || 84}ms</strong></div>
            <div><span>Latest drift</span><strong>{metrics?.latest_drift_event?.drift_score ?? "N/A"}</strong></div>
            <div><span>Recent jobs</span><strong>{state?.recent_retraining_jobs?.length ?? 0}</strong></div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-title">
            <div>
              <p>Top Defects</p>
              <h2>빈도 비교</h2>
            </div>
          </div>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d7dee8" />
                <XAxis dataKey="defect_type" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </section>

      <section className="panel ledger-panel">
        <div className="panel-title">
          <div>
            <p>Ledger</p>
            <h2>최근 검사 이력</h2>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Wafer</th>
                <th>Line</th>
                <th>Defect</th>
                <th>Confidence</th>
                <th>Risk</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {inspections.map((item) => (
                <tr key={item.id} onClick={() => setLatest(item)}>
                  <td>{item.id}</td>
                  <td>{item.wafer_id}</td>
                  <td>{item.line_id}</td>
                  <td>{item.defect_type}</td>
                  <td>{Math.round(item.confidence * 100)}%</td>
                  <td><RiskPill value={item.risk_level} /></td>
                  <td>{item.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
