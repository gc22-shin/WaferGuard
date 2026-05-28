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
  Target,
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

function compactTime(value) {
  if (!value) return "N/A";
  return new Date(value).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

function AgentSimulationFlow({ autoMonitorEnabled }) {
  const steps = [
    {
      label: "1",
      title: "데이터 유입",
      detail: "검사 장비/MES/API 대신 서버 tick이 wafer defect와 계측 이벤트를 생성",
    },
    {
      label: "2",
      title: "자동 감시",
      detail: "Auto Monitor가 주기적으로 이상 여부, drift, review 필요 여부를 확인",
    },
    {
      label: "3",
      title: "Agent 판단",
      detail: "ROI/Grad-CAM, 계측 rule, RAG 사례를 묶어 품질 리스크로 해석",
    },
    {
      label: "4",
      title: "조치/인수인계",
      detail: "검토 큐, drift 대응, Action Card, Daily Report 초안으로 연결",
    },
  ];
  return (
    <section className="agent-flow-panel">
      <div className="agent-flow-title">
        <div>
          <p className="eyebrow">Professor Feedback Applied</p>
          <h2>서버 배포 후에도 tick 기반 자동 감시 흐름으로 설명됩니다</h2>
        </div>
        <span className={`flow-status ${autoMonitorEnabled ? "status-on" : "status-ready"}`}>
          {autoMonitorEnabled ? "Auto Monitor ON" : "Server Tick Ready"}
        </span>
      </div>
      <div className="agent-flow-grid">
        {steps.map((step) => (
          <div className="agent-flow-step" key={step.label}>
            <span>{step.label}</span>
            <strong>{step.title}</strong>
            <p>{step.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function AutomationPanel({
  automation,
  enabled,
  intervalSeconds,
  onEnabledChange,
  onIntervalChange,
  onTick,
  busy,
  log,
}) {
  const latest = automation?.latest_inspection;
  const handoff = automation?.latest_handoff;
  return (
    <section className="panel automation-panel">
      <div className="panel-title">
        <div>
          <p>Auto Monitor</p>
          <h2>서버 자동 감시 실행 흐름</h2>
        </div>
        <Activity size={21} />
      </div>
      <div className="automation-layout">
        <div className="automation-controls">
          <div className="automation-control-row">
            <label className="toggle-field">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => onEnabledChange(event.target.checked)}
              />
              <span><Clock size={15} /> 자동 감시</span>
            </label>
            <label>
              Tick 주기
              <select value={intervalSeconds} onChange={(event) => onIntervalChange(Number(event.target.value))}>
                <option value={8}>8초</option>
                <option value={12}>12초</option>
                <option value={20}>20초</option>
                <option value={30}>30초</option>
              </select>
            </label>
            <button className="primary" onClick={onTick} disabled={busy}>
              <RefreshCcw size={16} /> 1회 Tick 실행
            </button>
          </div>
          <div className="server-hook">
            <strong>{automation?.mode === "server_tick_ready" ? "Server/Cron Ready" : "Local Monitor Ready"}</strong>
            <span>{automation?.tick_endpoint || "/api/v1/automation/tick"}</span>
          </div>
        </div>
        <div className="automation-stage-grid">
          <div>
            <span>Data Ingress</span>
            <strong>{latest?.wafer_id || "대기 중"}</strong>
            <small>{latest ? `${latest.equipment_id} / ${latest.defect_type}` : "tick 실행 시 신규 이벤트 생성"}</small>
          </div>
          <div>
            <span>Agent Trigger</span>
            <strong>{automation?.open_review_count ?? 0} open</strong>
            <small>High Risk 또는 review_required 자동 큐 등록</small>
          </div>
          <div>
            <span>Drift Check</span>
            <strong>{automation?.latest_drift_event?.status || "normal"}</strong>
            <small>{automation?.latest_drift_event ? `score ${automation.latest_drift_event.drift_score}` : "주기 감시 대기"}</small>
          </div>
          <div>
            <span>Handoff</span>
            <strong>{handoff?.status || "no draft"}</strong>
            <small>{handoff ? `Scrap Risk ${handoff.scrap_risk}` : "위험 감지 시 초안 생성"}</small>
          </div>
        </div>
        <div className="automation-log">
          {log.length === 0 ? (
            <div className="empty-state compact">Auto Monitor를 켜거나 1회 Tick을 실행하면 이벤트 로그가 표시됩니다.</div>
          ) : (
            log.slice(0, 4).map((entry) => (
              <div className="automation-log-item" key={entry.id}>
                <strong>{compactTime(entry.created_at)} / {entry.source}</strong>
                {entry.events.map((event) => <span key={`${entry.id}-${event.type}`}>{event.message}</span>)}
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function SourceBoundary({ evaluation, ragEvaluation }) {
  const sources = [
    {
      label: "Real",
      title: "Workflow records",
      detail: "SQLite 검사 이력, 엔지니어 리뷰, handoff 상태는 앱에서 실제로 저장됩니다.",
    },
    {
      label: "Fixture",
      title: evaluation?.dataset?.name || "WM-811K",
      detail: evaluation?.dataset?.source_boundary || "WM-811K 평가는 실제 학습 결과가 아니라 리스크 분석 fixture입니다.",
    },
    {
      label: "Synthetic",
      title: "Wafer + metrology context",
      detail: "wafer image, Grad-CAM overlay, process/metrology 값은 로컬 구조 검증용 synthetic 입력입니다.",
    },
    {
      label: "Eval",
      title: `${ragEvaluation?.summary?.question_count ?? 0} RAG checks`,
      detail: ragEvaluation?.summary?.required_answer_style || "RAG/Agent 답변은 근거 기반, 원인 단정 금지, 추가 확인 항목 제시를 기준으로 평가합니다.",
    },
  ];
  return (
    <section className="source-boundary">
      {sources.map((item) => (
        <div className={`boundary-card boundary-${item.label.toLowerCase()}`} key={item.label}>
          <span>{item.label}</span>
          <strong>{item.title}</strong>
          <p>{item.detail}</p>
        </div>
      ))}
    </section>
  );
}

function ActionCardPanel({ card }) {
  if (!card?.defect_type) {
    return <div className="empty-state compact">새 검사를 실행하면 Defect Action Card가 표시됩니다.</div>;
  }
  const process = card.process_context || {};
  const metrology = card.metrology || {};
  const ruleHits = card.metrology_rule_hits || [];
  return (
    <section className="action-card">
      <div className="action-card-head">
        <div>
          <p>Defect Action Card</p>
          <h3>{card.title}</h3>
        </div>
        <RiskPill value={card.risk_level} />
      </div>
      <p className="action-statement">{card.risk_statement}</p>
      <div className="context-grid">
        <div><span>Lot</span><strong>{process.lot_id || "N/A"}</strong></div>
        <div><span>Step</span><strong>{process.process_step || "N/A"}</strong></div>
        <div><span>Tool</span><strong>{process.tool_id || "N/A"}</strong></div>
        <div><span>Recipe</span><strong>{process.recipe_id || "N/A"}</strong></div>
        <div><span>CD</span><strong>{metrology.cd_nm ?? "N/A"}nm</strong></div>
        <div><span>Overlay</span><strong>{metrology.overlay_nm ?? "N/A"}nm</strong></div>
        <div><span>Thickness</span><strong>{metrology.film_thickness_nm ?? "N/A"}nm</strong></div>
        <div><span>Roughness</span><strong>{metrology.roughness_nm ?? "N/A"}nm</strong></div>
        <div><span>Defects</span><strong>{metrology.defect_count ?? "N/A"}</strong></div>
      </div>
      {ruleHits.length > 0 && (
        <div className="rule-hit-list">
          <div className="rule-hit-head">
            <strong>Metrology Rule Hits</strong>
            <span>Risk +{card.metrology_risk_delta ?? 0}</span>
          </div>
          {ruleHits.map((hit, index) => (
            <div className={`rule-hit rule-hit-${hit.severity}`} key={`${hit.signal}-${index}`}>
              <div>
                <strong>{hit.signal}</strong>
                <span>{hit.owner} / {hit.severity}</span>
              </div>
              <p>{hit.evidence}</p>
              <small>{hit.action}</small>
            </div>
          ))}
        </div>
      )}
      <div className="action-card-grid">
        <MiniList title="Possible Cause" items={card.possible_causes} />
        <MiniList title="Metrology Check" items={card.metrology_checks} />
        <MiniList title="Process Check" items={card.process_checks} />
        <MiniList title="Next Action" items={card.next_actions} />
      </div>
      <div className="review-rule">
        <strong>{card.human_review_rule}</strong>
        <span>{card.source_boundary}</span>
        {card.threshold_basis && <span>{card.threshold_basis}</span>}
      </div>
    </section>
  );
}

function fallbackActionCard(inspection) {
  if (!inspection) return null;
  const process = inspection.process_context || {
    lot_id: inspection.lot_id || "LOT-LEGACY",
    wafer_id: inspection.wafer_id,
    line_id: inspection.line_id,
    process_step: inspection.process_step || "Inspection",
    tool_id: inspection.equipment_id,
    recipe_id: inspection.recipe_id || "RCP-LEGACY",
  };
  const metrology = inspection.metrology || {
    cd_nm: "N/A",
    overlay_nm: "N/A",
    film_thickness_nm: "N/A",
    roughness_nm: "N/A",
    defect_count: inspection.hotspot_ratio ? Math.round(Number(inspection.hotspot_ratio) * 1200) : "N/A",
  };
  return {
    title: `${inspection.defect_type || "Unknown"} Defect Action Card`,
    defect_type: inspection.defect_type || "Unknown",
    risk_level: inspection.risk_level || "Medium",
    confidence: inspection.confidence || 0,
    risk_statement: "이전 형식의 검사 결과입니다. 결함 유형, 이미지, hotspot 근거를 기준으로 엔지니어 검토 흐름에 연결합니다.",
    process_context: process,
    metrology,
    metrology_rule_hits: [],
    metrology_risk_delta: 0,
    possible_causes: ["legacy inspection result", "process/metrology context missing"],
    metrology_checks: ["원본 wafer map", "Grad-CAM overlay", "필요 시 CD/overlay/thickness 재확인"],
    process_checks: ["tool history", "recipe history", "same lot repeat trend"],
    next_actions: ["새 검사 실행 또는 상세 계측값 입력 후 Action Card 재생성", "High risk면 engineer review queue에서 확인"],
    human_review_rule: inspection.status === "review_required" ? "엔지니어 2차 확인 필요" : "이전 이력은 자동 승인하지 말고 근거 확인",
    source_boundary: "legacy fallback card입니다. 새 검사부터 process/metrology 기반 Action Card가 저장됩니다.",
  };
}

function MiniList({ title, items = [] }) {
  return (
    <div className="mini-list">
      <h4>{title}</h4>
      <ul>
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

function EvaluationPanel({ evaluation }) {
  const evalSummary = evaluation?.summary || {};
  const matrixRows = evaluation?.confusion_matrix?.rows || [];
  const matrixLabels = evaluation?.confusion_matrix?.labels || [];
  const criticalMisses = evaluation?.critical_misses || [];
  const classMetrics = evaluation?.per_class || [];
  const [showEvaluationDetails, setShowEvaluationDetails] = useState(false);

  return (
    <section className="panel evaluation-panel">
      <div className="panel-title">
        <div>
          <p>WM-811K Evaluation</p>
          <h2>Defect Pattern 분류 리스크 분석</h2>
        </div>
        <Target size={21} />
      </div>
      {evaluation ? (
        <>
          <div className="eval-summary-grid">
            <div>
              <span>Dataset</span>
              <strong>{evaluation.dataset.name}</strong>
              <small>{evaluation.dataset.mode}</small>
            </div>
            <div>
              <span>Accuracy</span>
              <strong>{Math.round(evalSummary.overall_accuracy * 1000) / 10}%</strong>
              <small>전체 정확도</small>
            </div>
            <div>
              <span>Macro F1</span>
              <strong>{evalSummary.macro_f1}</strong>
              <small>class imbalance 보정 관점</small>
            </div>
            <div>
              <span>Critical Miss</span>
              <strong>{evalSummary.critical_missed_as_normal}</strong>
              <small>critical defect가 None으로 간 건수</small>
            </div>
          </div>
          <p className="eval-note">{evaluation.dataset.note}</p>

          <div className="eval-brief-grid">
            {criticalMisses.slice(0, 3).map((item) => (
              <div className="critical-item" key={`${item.actual}-${item.predicted}`}>
                <div>
                  <strong>{item.actual} {"->"} {item.predicted}</strong>
                  <span>{item.severity}</span>
                </div>
                <p>{item.why_problem}</p>
                <small>{item.operator_action}</small>
              </div>
            ))}
          </div>

          <button className="detail-toggle" onClick={() => setShowEvaluationDetails((value) => !value)}>
            {showEvaluationDetails ? "평가 상세 숨기기" : "Confusion Matrix / Drift 상세 보기"}
          </button>

          {showEvaluationDetails && (
            <>
              <div className="eval-layout">
                <section>
                  <h3>Confusion Matrix</h3>
                  <div className="matrix-scroll">
                    <table className="matrix-table">
                      <thead>
                        <tr>
                          <th>Actual \ Pred</th>
                          {matrixLabels.map((label) => <th key={label}>{label}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {matrixRows.map((row) => (
                          <tr key={row.actual}>
                            <th>
                              {row.actual}
                              <small>{row.support.toLocaleString()}건</small>
                            </th>
                            {row.cells.map((cell) => (
                              <td
                                key={`${row.actual}-${cell.predicted}`}
                                className={cell.correct ? "matrix-correct" : cell.count ? "matrix-miss" : ""}
                                style={{
                                  backgroundColor: cell.correct
                                    ? `rgba(5, 150, 105, ${0.12 + Math.min(cell.rate, 1) * 0.42})`
                                    : cell.count
                                      ? `rgba(220, 38, 38, ${0.05 + Math.min(cell.rate, 1) * 0.46})`
                                      : undefined,
                                }}
                              >
                                <span>{cell.count}</span>
                                <small>{Math.round(cell.rate * 100)}%</small>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section>
                  <h3>Critical Defect 미검출 분석</h3>
                  <div className="critical-list">
                    {criticalMisses.map((item) => (
                      <div className="critical-item" key={`${item.actual}-${item.predicted}`}>
                        <div>
                          <strong>{item.actual} {"->"} {item.predicted}</strong>
                          <span>{item.count}건 / {item.severity}</span>
                        </div>
                        <p>{item.why_problem}</p>
                        <small>{item.operator_action}</small>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <div className="eval-grid">
                <section>
                  <h3>Class Imbalance 대응</h3>
                  <div className="eval-list">
                    {evaluation.imbalance_response.map((item) => (
                      <div key={item.title}>
                        <strong>{item.title}</strong>
                        <span>{item.detail}</span>
                      </div>
                    ))}
                  </div>
                </section>
                <section>
                  <h3>Drift 시나리오</h3>
                  <div className="eval-list">
                    {evaluation.drift_scenarios.map((item) => (
                      <div key={item.scenario}>
                        <strong>{item.scenario}</strong>
                        <span>{item.signal}</span>
                        <small>{item.response}</small>
                      </div>
                    ))}
                  </div>
                </section>
                <section>
                  <h3>Grad-CAM 판단 근거</h3>
                  <div className="eval-list">
                    {evaluation.grad_cam_evidence.map((item) => (
                      <div key={item.pattern}>
                        <strong>{item.pattern}</strong>
                        <span>{item.expected_focus}</span>
                        <small>{item.bad_sign}</small>
                      </div>
                    ))}
                  </div>
                </section>
                <section>
                  <h3>품질 리스크 설명</h3>
                  <div className="eval-list">
                    {evaluation.quality_risk_explanations.map((item) => (
                      <div key={item.case}>
                        <strong>{item.case}</strong>
                        <span>{item.explanation}</span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <div className="class-metric-strip">
                {classMetrics.map((item) => (
                  <div key={item.class_name}>
                    <span>{item.class_name}</span>
                    <strong>{Math.round(item.recall * 100)}%</strong>
                    <small>recall / {item.risk_role}</small>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <div className="empty-state compact">WM-811K 평가 리포트를 불러오지 못했습니다.</div>
      )}
    </section>
  );
}

export default function App() {
  const [metrics, setMetrics] = useState(null);
  const [inspections, setInspections] = useState([]);
  const [state, setState] = useState(null);
  const [latest, setLatest] = useState(null);
  const [handoff, setHandoff] = useState(null);
  const [handoffEdit, setHandoffEdit] = useState({ headline: "", operator_note: "", markdown: "", scrap_risk: "Low" });
  const [copilot, setCopilot] = useState(null);
  const [evaluation, setEvaluation] = useState(null);
  const [ragEvaluation, setRagEvaluation] = useState(null);
  const [automation, setAutomation] = useState(null);
  const [autoMonitorEnabled, setAutoMonitorEnabled] = useState(false);
  const [autoTickSeconds, setAutoTickSeconds] = useState(12);
  const [automationLog, setAutomationLog] = useState([]);
  const [autoDraftEnabled, setAutoDraftEnabled] = useState(false);
  const [shiftDraftTime, setShiftDraftTime] = useState("17:00");
  const [lastAutoDraftKey, setLastAutoDraftKey] = useState("");
  const [chatMessages, setChatMessages] = useState([
    { role: "assistant", text: "교대 리포트 초안 생성, 설비 특이사항 확인, 전달 확인을 도와줄게요." },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [form, setForm] = useState({
    lot_id: "LOT-DEMO-042",
    wafer_id: "WF-DEMO-001",
    line_id: "LINE-7",
    equipment_id: "ETCH-02",
    process_step: "Etch",
    recipe_id: "RCP-ETCH-EDGE-02",
    image_source: "synthetic_wafer",
    proxy_dataset: "mvtec-ad",
    defect_hint: "auto",
    cd_nm: 32.5,
    overlay_nm: 4.2,
    film_thickness_nm: 88.0,
    roughness_nm: 1.2,
    defect_count: "",
    yield_proxy: 0.982,
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
    const [m, rows, mlops, report, ops, evalReport, ragEval, automationStatus] = await Promise.all([
      api("/api/v1/metrics"),
      api("/api/v1/inspections?limit=20"),
      api("/api/v1/mlops/state"),
      apiOptional("/api/v1/handoff/latest"),
      apiOptional(`/api/v1/copilot/ops?line_id=${encodeURIComponent(form.line_id || "ALL")}`),
      apiOptional("/api/v1/evaluation/wm811k"),
      apiOptional("/api/v1/rag/evaluation"),
      apiOptional(`/api/v1/automation/status?line_id=${encodeURIComponent(form.line_id || "LINE-7")}`),
    ]);
    setMetrics(m);
    setInspections(rows);
    setState(mlops);
    setHandoff(report);
    setCopilot(ops);
    setEvaluation(evalReport);
    setRagEvaluation(ragEval);
    setAutomation(automationStatus);
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

  useEffect(() => {
    if (!autoMonitorEnabled) return undefined;
    let cancelled = false;
    async function tick() {
      try {
        const result = await triggerAutomationTick("auto");
        if (!cancelled && result.handoff_report) {
          appendChat(
            "assistant",
            `Auto Monitor가 ${result.inspection.equipment_id} ${result.inspection.defect_type} 이벤트를 감지해서 Daily Report 초안을 만들었어요.`,
          );
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }
    tick();
    const id = setInterval(tick, autoTickSeconds * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [autoMonitorEnabled, autoTickSeconds, form.line_id, handoffForm.operator, handoffForm.shift_from, handoffForm.shift_to]);

  const reviewQueue = useMemo(
    () => inspections.filter((item) => item.risk_level === "High" || item.status === "review_required").slice(0, 5),
    [inspections],
  );

  async function runAction(action) {
    setBusy(true);
    setError("");
    try {
      let result = null;
      if (action === "automationTick") {
        result = await triggerAutomationTick("manual");
      }
      if (action === "inspect") {
        const inspectPayload = {
          ...form,
          cd_nm: Number(form.cd_nm),
          overlay_nm: Number(form.overlay_nm),
          film_thickness_nm: Number(form.film_thickness_nm),
          roughness_nm: Number(form.roughness_nm),
          defect_count: form.defect_count === "" ? null : Number(form.defect_count),
          yield_proxy: Number(form.yield_proxy),
        };
        result = await api("/api/v1/inspect", {
          method: "POST",
          body: JSON.stringify(inspectPayload),
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

  async function triggerAutomationTick(source = "manual") {
    const result = await api("/api/v1/automation/tick", {
      method: "POST",
      body: JSON.stringify({
        line_id: form.line_id,
        operator: handoffForm.operator,
        shift_from: handoffForm.shift_from,
        shift_to: handoffForm.shift_to,
        auto_handoff: true,
        drift_check: true,
      }),
    });
    setLatest(result.inspection);
    if (result.handoff_report) {
      setHandoff(result.handoff_report);
    }
    setAutomation(result.status);
    setAutomationLog((items) => [
      {
        id: result.tick_id,
        source,
        created_at: result.created_at,
        events: result.events,
      },
      ...items,
    ].slice(0, 10));
    return result;
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
          <p className="eyebrow">WaferGuard Agent Simulation</p>
          <h1>공정 이상 대응 Agent 시뮬레이션</h1>
        </div>
        <div className="topbar-actions">
          <button className="icon-button" onClick={refresh} disabled={busy} title="새로고침">
            <RefreshCcw size={18} />
          </button>
          <button onClick={() => runAction("seedDemo")} disabled={busy}>
            <Database size={17} /> 시연 데이터
          </button>
          <button className="primary" onClick={() => runAction("automationTick")} disabled={busy}>
            <RefreshCcw size={17} /> Auto Tick 1회
          </button>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <section className="stats-grid">
        <Stat icon={Activity} label="시뮬레이션 이력" value={metrics?.total_inspections ?? 0} tone="blue" />
        <Stat icon={AlertTriangle} label="High Risk" value={metrics?.high_risk_count ?? 0} tone="red" />
        <Stat icon={Workflow} label="검토 큐" value={metrics?.review_queue_count ?? 0} tone="amber" />
        <Stat icon={Gauge} label="자동 감시" value={autoMonitorEnabled ? `${autoTickSeconds}s` : "Ready"} tone="green" />
      </section>

      <AgentSimulationFlow autoMonitorEnabled={autoMonitorEnabled} />

      <AutomationPanel
        automation={automation}
        enabled={autoMonitorEnabled}
        intervalSeconds={autoTickSeconds}
        onEnabledChange={setAutoMonitorEnabled}
        onIntervalChange={setAutoTickSeconds}
        onTick={() => runAction("automationTick")}
        busy={busy}
        log={automationLog}
      />

      <section className="main-grid operation-grid">
        <section className="panel control-panel">
          <div className="panel-title">
            <div>
              <p>Manual Scenario</p>
              <h2>수동 시나리오 주입</h2>
            </div>
            <ShieldCheck size={21} />
          </div>
          <div className="field-grid">
            <label>
              Wafer ID
              <input value={form.wafer_id} onChange={(e) => setForm({ ...form, wafer_id: e.target.value })} />
            </label>
            <label>
              Step
              <select value={form.process_step} onChange={(e) => setForm({ ...form, process_step: e.target.value })}>
                {["Lithography", "Etch", "Deposition", "CMP", "Cleaning", "Inspection"].map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
            <label>
              Defect
              <select value={form.defect_hint} onChange={(e) => setForm({ ...form, defect_hint: e.target.value })}>
                {defectOptions.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
            <label>
              Image Source
              <select value={form.image_source} onChange={(e) => setForm({ ...form, image_source: e.target.value })}>
                <option value="synthetic_wafer">Synthetic wafer</option>
                <option value="public_proxy">Public proxy</option>
              </select>
            </label>
          </div>
          <details className="advanced-controls">
            <summary>공정/계측 상세 입력</summary>
            <div className="field-grid">
              <label>
                Lot ID
                <input value={form.lot_id} onChange={(e) => setForm({ ...form, lot_id: e.target.value })} />
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
                Recipe
                <input value={form.recipe_id} onChange={(e) => setForm({ ...form, recipe_id: e.target.value })} />
              </label>
              <label>
                Proxy Dataset
                <select value={form.proxy_dataset} onChange={(e) => setForm({ ...form, proxy_dataset: e.target.value })}>
                  <option value="mvtec-ad">MVTec AD</option>
                  <option value="mvtec-loco">MVTec LOCO</option>
                  <option value="wafer-map-public">Public wafer map</option>
                </select>
              </label>
            </div>
            <div className="field-grid metrology-grid">
              <label>
                CD nm
                <input type="number" step="0.1" value={form.cd_nm} onChange={(e) => setForm({ ...form, cd_nm: e.target.value })} />
              </label>
              <label>
                Overlay nm
                <input type="number" step="0.1" value={form.overlay_nm} onChange={(e) => setForm({ ...form, overlay_nm: e.target.value })} />
              </label>
              <label>
                Thickness nm
                <input type="number" step="0.1" value={form.film_thickness_nm} onChange={(e) => setForm({ ...form, film_thickness_nm: e.target.value })} />
              </label>
              <label>
                Roughness nm
                <input type="number" step="0.1" value={form.roughness_nm} onChange={(e) => setForm({ ...form, roughness_nm: e.target.value })} />
              </label>
              <label>
                Defect Count
                <input type="number" value={form.defect_count} placeholder="auto" onChange={(e) => setForm({ ...form, defect_count: e.target.value })} />
              </label>
              <label>
                Yield Proxy
                <input type="number" step="0.001" value={form.yield_proxy} onChange={(e) => setForm({ ...form, yield_proxy: e.target.value })} />
              </label>
            </div>
          </details>
          <div className="button-row">
            <button className="primary wide" onClick={() => runAction("inspect")} disabled={busy}>
              <Play size={17} /> 수동 Agent 실행
            </button>
            <button onClick={() => runAction("drift")} disabled={busy}>
              <GitBranch size={17} /> 성능저하/Drift
            </button>
          </div>
        </section>

        <section className="panel result-panel">
          <div className="panel-title">
            <div>
              <p>Agent Decision</p>
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
                {latest.roi_url && (
                  <figure>
                    <img src={`${API_BASE}${latest.roi_url}`} alt="Defect ROI crop" />
                    <figcaption>ROI crop</figcaption>
                  </figure>
                )}
              </div>
              <div className="result-meta">
                <span>{latest.defect_type}</span>
                <span>{Math.round(latest.confidence * 100)}% confidence</span>
                <span>{latest.model_version}</span>
                <span>{latest.image_source || "synthetic_wafer"}</span>
                {latest.proxy_status && <span>{latest.proxy_status}</span>}
                <span>{latest.process_context?.process_step || "Inspection"}</span>
                <span>{latest.process_context?.recipe_id || "RCP"}</span>
              </div>
              <ActionCardPanel card={latest.action_card?.defect_type ? latest.action_card : fallbackActionCard(latest)} />
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
            <div className="empty-state">
              <div>
                <strong>아직 선택된 검사 결과가 없습니다.</strong>
                <span>왼쪽 또는 상단의 검사 실행을 누르면 Action Card가 바로 표시됩니다.</span>
              </div>
            </div>
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

      <SourceBoundary evaluation={evaluation} ragEvaluation={ragEvaluation} />

      <EvaluationPanel evaluation={evaluation} />

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
              <p>Agent Actions</p>
              <h2>대응 action 실행 상태</h2>
            </div>
            <Workflow size={21} />
          </div>
          <div className="pipeline-actions">
            <button onClick={() => runAction("retrain")} disabled={busy}>재학습 요청</button>
            <button onClick={() => runAction("promote")} disabled={busy}>대응 기준 적용</button>
            <button onClick={() => runAction("rollback")} disabled={busy}><RotateCcw size={16} /> 이전 기준 복구</button>
          </div>
          <div className="state-list">
            <div><span>Current Rule Set</span><strong>{model.version || "wg-local-v1.0.0"}</strong></div>
            <div><span>API latency p95</span><strong>{model.latency_p95_ms || 84}ms</strong></div>
            <div><span>Latest drift signal</span><strong>{metrics?.latest_drift_event?.drift_score ?? "N/A"}</strong></div>
            <div><span>Action jobs</span><strong>{state?.recent_retraining_jobs?.length ?? 0}</strong></div>
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
                <th>Lot</th>
                <th>Wafer</th>
                <th>Line</th>
                <th>Step</th>
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
                  <td>{item.process_context?.lot_id || item.lot_id || "N/A"}</td>
                  <td>{item.wafer_id}</td>
                  <td>{item.line_id}</td>
                  <td>{item.process_context?.process_step || item.process_step || "N/A"}</td>
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
