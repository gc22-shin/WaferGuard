import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  ClipboardList,
  Database,
  FileText,
  GitBranch,
  Play,
  RefreshCcw,
  RotateCcw,
  ShieldCheck,
  ShieldAlert,
  Target,
  ThumbsDown,
  ThumbsUp,
  Wrench,
  Workflow,
  Zap,
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

// ── Agent Decision Panel ─────────────────────────────────────────────────────
function AgentDecisionPanel({ inspection, onReAgent, reAgentBusy }) {
  const [expanded, setExpanded] = useState(false);

  if (!inspection) {
    return (
      <section className="panel agent-decision-panel">
        <div className="panel-title">
          <div>
            <p>Agent Decision</p>
            <h2>Agent 판단 흐름</h2>
          </div>
          <Zap size={21} />
        </div>
        <div className="empty-state compact">검사 결과를 선택하면 Agent 판단 흐름이 표시됩니다.</div>
      </section>
    );
  }

  const trace = inspection.agent_trace || [];
  const finalAction = inspection.final_action || null;
  const isLowRisk = inspection.risk_level === "Low" && trace.length === 0;

  return (
    <section className="panel agent-decision-panel">
      <div className="panel-title">
        <div>
          <p>Agent Decision</p>
          <h2>Agent 판단 흐름 · {inspection.id}</h2>
        </div>
        <Zap size={21} />
      </div>

      {isLowRisk ? (
        <div className="empty-state compact">Agent가 참여하지 않은 검사입니다.</div>
      ) : trace.length === 0 ? (
        <div className="empty-state compact">Agent가 참여하지 않은 검사입니다.</div>
      ) : (
        <div className="agent-trace-timeline">
          {trace.map((step, i) => (
            <div className={`trace-step trace-${step.node}`} key={i}>
              <div className="trace-node-label">
                <span className="trace-index">{i + 1}</span>
                <strong>{step.node}</strong>
                {step.tool_name && <span className="trace-tool">{step.tool_name}</span>}
              </div>
              {step.message && <p className="trace-message">{step.message}</p>}
              {step.args && (
                <details className="trace-args">
                  <summary>인자 보기</summary>
                  <pre>{JSON.stringify(step.args, null, 2)}</pre>
                </details>
              )}
              {step.result && (
                <details className="trace-result">
                  <summary>결과 보기</summary>
                  <pre>{typeof step.result === "string" ? step.result : JSON.stringify(step.result, null, 2)}</pre>
                </details>
              )}
            </div>
          ))}
        </div>
      )}

      {finalAction && (
        <div className="agent-final-action">
          <strong>최종 판단</strong>
          <p>{finalAction}</p>
        </div>
      )}

      {/* RAG retrieved cases */}
      {(inspection.similar_cases?.length > 0) && (
        <div className="rag-cases-section">
          <button className="detail-toggle" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "RAG 유사 사례 숨기기" : `RAG 유사 사례 ${inspection.similar_cases.length}건 보기`}
          </button>
          {expanded && (
            <div className="rag-cases-list">
              {inspection.similar_cases.map((c, i) => (
                <div className="rag-case-item" key={i}>
                  <strong>{c.case_id || `Case ${i + 1}`} · {c.defect_type}</strong>
                  <p>{c.summary || c.action_taken}</p>
                  {c.similarity !== undefined && <small>유사도 {Math.round(c.similarity * 100)}%</small>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="button-row" style={{ marginTop: "0.75rem" }}>
        <button onClick={() => onReAgent(inspection.id)} disabled={reAgentBusy}>
          {reAgentBusy ? <RefreshCcw size={16} className="spin" /> : <Zap size={16} />}
          {reAgentBusy ? " Agent 재질의 중..." : " Agent 재질의"}
        </button>
      </div>
    </section>
  );
}

// ── Pending Approvals Panel ──────────────────────────────────────────────────
function PendingApprovalsPanel() {
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actingId, setActingId] = useState(null);
  const [unavailable, setUnavailable] = useState(false);

  const fetchApprovals = useCallback(async () => {
    try {
      const data = await api("/api/v1/pending-approvals");
      setApprovals(Array.isArray(data) ? data : []);
      setUnavailable(false);
    } catch {
      setUnavailable(true);
    }
  }, []);

  useEffect(() => {
    fetchApprovals();
    const id = setInterval(fetchApprovals, 10000);
    return () => clearInterval(id);
  }, [fetchApprovals]);

  async function act(id, action) {
    setActingId(id);
    try {
      await api(`/api/v1/approvals/${id}/${action}`, { method: "POST", body: JSON.stringify({}) });
      await fetchApprovals();
    } catch {
      // silently ignore — endpoint may not exist yet
      setUnavailable(true);
    } finally {
      setActingId(null);
    }
  }

  return (
    <section className="panel approvals-panel">
      <div className="panel-title">
        <div>
          <p>Pending Approvals</p>
          <h2>Agent 대기 승인 큐</h2>
        </div>
        <ShieldAlert size={21} />
      </div>
      {unavailable ? (
        <div className="empty-state compact">백엔드 엔드포인트 준비 중</div>
      ) : approvals.length === 0 ? (
        <div className="empty-state compact">현재 대기 중인 승인 항목 없음</div>
      ) : (
        <div className="approvals-list">
          {approvals.map((item) => (
            <div className="approval-card" key={item.id}>
              <div className="approval-header">
                <strong>{item.tool_name}</strong>
                <span className="approval-insp">검사 #{item.inspection_id}</span>
              </div>
              <p className="approval-reason">{item.reason}</p>
              {item.created_at && <small>{new Date(item.created_at).toLocaleString("ko-KR")}</small>}
              <div className="button-row">
                <button
                  className="primary"
                  onClick={() => act(item.id, "approve")}
                  disabled={actingId === item.id}
                >
                  <ThumbsUp size={15} /> 승인
                </button>
                <button
                  onClick={() => act(item.id, "reject")}
                  disabled={actingId === item.id}
                >
                  <ThumbsDown size={15} /> 거부
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <button className="detail-toggle" onClick={fetchApprovals} disabled={loading}>
        <RefreshCcw size={14} /> 새로고침
      </button>
    </section>
  );
}

export default function App() {
  const [metrics, setMetrics] = useState(null);
  const [inspections, setInspections] = useState([]);
  const [state, setState] = useState(null);
  const [latest, setLatest] = useState(null);
  const [handoff, setHandoff] = useState(null);
  const [copilot, setCopilot] = useState(null);
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
  const [reAgentBusy, setReAgentBusy] = useState(false);
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
          body: JSON.stringify({ ...handoffForm }),
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
    return result;
  }

  async function reAgent(id) {
    setReAgentBusy(true);
    setError("");
    try {
      const updated = await api(`/api/v1/inspect/${id}/re-agent`, { method: "POST", body: JSON.stringify({}) });
      setLatest(updated);
      await refresh();
    } catch (err) {
      if (err.message?.includes("404") || err.message?.includes("엔드포인트")) {
        setError("re-agent 엔드포인트 준비 중");
      } else {
        setError(err.message);
      }
    } finally {
      setReAgentBusy(false);
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
          <p className="eyebrow">WaferGuard</p>
          <h1>반도체 공정 품질 관리 시스템</h1>
        </div>
        <div className="topbar-actions">
          <button className="icon-button" onClick={refresh} disabled={busy} title="새로고침">
            <RefreshCcw size={18} />
          </button>
          <button onClick={() => runAction("seedDemo")} disabled={busy}>
            <Database size={17} /> 시연 데이터
          </button>
          <button className="primary" onClick={() => runAction("automationTick")} disabled={busy}>
            <RefreshCcw size={17} /> 새 검사 생성
          </button>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <section className="stats-grid">
        <Stat icon={Activity} label="검사 이력" value={metrics?.total_inspections ?? 0} tone="blue" />
        <Stat icon={AlertTriangle} label="High Risk" value={metrics?.high_risk_count ?? 0} tone="red" />
        <Stat icon={Workflow} label="검토 큐" value={metrics?.review_queue_count ?? 0} tone="amber" />
        <Stat icon={Activity} label="Drift 상태" value={metrics?.latest_drift_event?.status ?? "정상"} tone="green" />
      </section>

      <section className="main-grid operation-grid">
        <section className="panel control-panel">
          <div className="panel-title">
            <div>
              <p>검사 실행</p>
              <h2>새 검사</h2>
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
              <Play size={17} /> 검사 실행
            </button>
            <button onClick={() => runAction("drift")} disabled={busy}>
              <GitBranch size={17} /> 성능저하/Drift
            </button>
          </div>
        </section>

        <section className="panel result-panel">
          <div className="panel-title">
            <div>
              <p>Inspection Result</p>
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
                <button onClick={() => reAgent(latest.id)} disabled={reAgentBusy}>
                  {reAgentBusy ? <RefreshCcw size={16} className="spin" /> : <Zap size={16} />}
                  {reAgentBusy ? " 재질의 중..." : " Agent 재질의"}
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
              <div key={item.id} className="queue-item-wrap">
                <button className="queue-item" onClick={() => setLatest(item)}>
                  <span>{item.wafer_id}</span>
                  <strong>{item.defect_type}</strong>
                  <RiskPill value={item.risk_level} />
                </button>
                <button className="queue-reagent" onClick={() => reAgent(item.id)} disabled={reAgentBusy} title="Agent 재질의">
                  <Zap size={14} />
                </button>
              </div>
            ))}
          </div>
        </section>
      </section>

      <AgentDecisionPanel inspection={latest} onReAgent={reAgent} reAgentBusy={reAgentBusy} />

      <PendingApprovalsPanel />

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
            <button className="primary wide" onClick={() => runAction("handoff")} disabled={busy}>
              <ClipboardList size={17} /> Daily Report 초안 생성
            </button>
          </div>

          <div className="handoff-output">
            {handoff ? (
              <>
                <div className="handoff-summary">
                  <div className="handoff-status-row">
                    <span className={`scrap-risk scrap-${handoff.scrap_risk || "Low"}`}>Scrap Risk {handoff.scrap_risk || "Low"}</span>
                    <span className={`report-status status-${handoff.status || "draft"}`}>{handoff.status === "sent" ? "전달 완료" : "초안"}</span>
                  </div>
                  {handoff.headline && <strong className="handoff-headline">{handoff.headline}</strong>}
                </div>
                <div className="handoff-sections">
                  <section>
                    <h3>설비 특이사항</h3>
                    {handoff.equipment_watch?.length === 0 ? (
                      <p>현재 특이 설비 없음</p>
                    ) : (
                      handoff.equipment_watch?.map((item) => (
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
                      {handoff.next_shift_checklist?.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </section>
                </div>
                {handoff.operator_note && (
                  <div className="handoff-note-view">
                    <strong>작성자 메모</strong>
                    <p>{handoff.operator_note}</p>
                  </div>
                )}
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
