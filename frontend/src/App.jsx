import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Gauge,
  GitBranch,
  Play,
  RefreshCcw,
  RotateCcw,
  ShieldCheck,
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
  const [form, setForm] = useState({
    wafer_id: "WF-DEMO-001",
    line_id: "LINE-7",
    equipment_id: "ETCH-02",
    defect_hint: "auto",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    const [m, rows, mlops] = await Promise.all([
      api("/api/v1/metrics"),
      api("/api/v1/inspections?limit=20"),
      api("/api/v1/mlops/state"),
    ]);
    setMetrics(m);
    setInspections(rows);
    setState(mlops);
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
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
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
