import React, { useCallback, useEffect, useState } from "react";
import { Icon, Panel, Metric, StatusDot } from "./lib";
import { useStream } from "./SettingsContext";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const STAGE_META = {
  Production: { c: "var(--low)",    t: "PRODUCTION" },
  Staging:    { c: "var(--accent)", t: "STAGING" },
  Archived:   { c: "var(--text-3)", t: "ARCHIVED" },
};

function StagePill({ stage }) {
  const m = STAGE_META[stage] || { c: "var(--text-3)", t: String(stage || "").toUpperCase() };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 700,
      letterSpacing: ".05em", color: m.c, border: `1px solid ${m.c}`, borderRadius: 5, padding: "2px 7px",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 99, background: m.c }} />{m.t}
    </span>
  );
}

const SEV_COLOR = { critical: "var(--high)", warning: "var(--med)", info: "var(--accent)" };
const ts = s => (s || "").slice(5, 19).replace("T", " ");

export default function MlopsView() {
  const { tick } = useStream();
  const [state, setState] = useState(null);
  const [approvals, setApprovals] = useState([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2600); };

  const load = useCallback(async () => {
    try {
      const [s, a] = await Promise.all([
        fetch(`${API_BASE}/api/v1/mlops/state`).then(r => r.ok ? r.json() : null),
        fetch(`${API_BASE}/api/v1/pending-approvals?status=pending`).then(r => r.ok ? r.json() : []),
      ]);
      if (s) setState(s);
      setApprovals(Array.isArray(a) ? a : []);
    } catch { /* keep last */ }
  }, []);

  useEffect(() => { load(); }, [load, tick]);

  async function modelAction(version, kind) {
    if (busy) return;
    setBusy(true);
    try {
      if (kind === "promote") {
        await fetch(`${API_BASE}/api/v1/models/promote`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ version }),
        });
        flash(`${version} — Production 승급`);
      } else {
        await fetch(`${API_BASE}/api/v1/models/rollback`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: `수동 롤백 (${version})` }),
        });
        flash("이전 모델로 롤백");
      }
      await load();
    } finally { setBusy(false); }
  }

  async function resolveApproval(id, decision) {
    if (busy) return;
    setBusy(true);
    try {
      await fetch(`${API_BASE}/api/v1/approvals/${id}/${decision}`, { method: "POST" });
      flash(decision === "approve" ? "재학습 승인 — 실행됨" : "권고 거절됨");
      await load();
    } finally { setBusy(false); }
  }

  const allModels = state?.models || [];
  const prod = allModels.find(m => m.stage === "Production");
  // registry grows by one model per retraining — show Production + the most
  // recent few rather than the entire history.
  const REGISTRY_LIMIT = 8;
  const others = allModels.filter(m => m.stage !== "Production");
  const models = [...(prod ? [prod] : []), ...others.slice(0, REGISTRY_LIMIT - (prod ? 1 : 0))];
  const hiddenModels = allModels.length - models.length;
  const drift = state?.latest_drift_event;
  const jobs = state?.recent_retraining_jobs || [];
  const alerts = state?.recent_alerts || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {toast && (
        <div className="toast-in" style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", zIndex: 50,
          background: "var(--panel-3)", border: "1px solid var(--accent-line)", color: "var(--text)", padding: "10px 16px",
          borderRadius: 8, fontSize: 12.5, boxShadow: "var(--shadow)", display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="check" size={14} style={{ color: "var(--low)" }} />{toast}
        </div>
      )}

      {/* summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
        <Panel dense pad={13}><Metric label="Production 모델" value={prod?.version || "—"} accent="var(--low)" mono={false}
          sub={prod ? `F1 ${prod.f1_score} · p95 ${prod.latency_p95_ms}ms` : "없음"} /></Panel>
        <Panel dense pad={13}><Metric label="최신 드리프트" value={drift ? drift.drift_score : "—"}
          accent={drift?.status === "detected" ? "var(--high)" : "var(--accent)"}
          sub={drift ? `${drift.status} · ${ts(drift.created_at)}` : "이벤트 없음"} /></Panel>
        <Panel dense pad={13}><Metric label="재학습 잡 (최근)" value={jobs.length} accent="var(--amber)"
          sub={jobs[0] ? jobs[0].candidate_version : "없음"} /></Panel>
        <Panel dense pad={13}><Metric label="승인 대기" value={approvals.length}
          accent={approvals.length ? "var(--med)" : "var(--low)"} sub={approvals.length ? "검토 필요" : "없음"} /></Panel>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 12, alignItems: "start" }}>
        {/* model registry */}
        <Panel title="모델 레지스트리 · Registry" icon="box" dense pad={0}
          right={<span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span className="chip" style={{ fontSize: 9.5, color: "var(--text-3)" }}>총 {allModels.length}개</span>
            <button className="btn btn-ghost" onClick={load} title="새로고침" style={{ padding: "4px 8px" }}>
              <Icon name="refresh" size={13} /></button>
          </span>}>
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
              <thead>
                <tr style={{ color: "var(--text-3)" }}>
                  {["버전", "상태", "F1", "p95(ms)", "등록", "액션"].map((h, i) => (
                    <th key={i} style={{ textAlign: i >= 2 && i <= 3 ? "right" : "left", padding: "8px 12px", fontWeight: 600, fontSize: 10, letterSpacing: ".05em", textTransform: "uppercase", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, background: "var(--panel)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {models.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: "20px 12px", textAlign: "center", color: "var(--text-3)" }}>모델이 없습니다.</td></tr>
                )}
                {models.map((r, i) => (
                  <tr key={i} style={{ background: r.stage === "Production" ? "var(--low-dim)" : "transparent" }}>
                    <td className="mono" style={{ padding: "9px 12px", color: "var(--text)", fontWeight: 600, borderBottom: "1px solid var(--border-soft)" }}>{r.version}</td>
                    <td style={{ padding: "9px 12px", borderBottom: "1px solid var(--border-soft)" }}><StagePill stage={r.stage} /></td>
                    <td className="mono" style={{ padding: "9px 12px", textAlign: "right", color: "var(--text-2)", borderBottom: "1px solid var(--border-soft)" }}>{r.f1_score}</td>
                    <td className="mono" style={{ padding: "9px 12px", textAlign: "right", color: "var(--text-2)", borderBottom: "1px solid var(--border-soft)" }}>{r.latency_p95_ms}</td>
                    <td className="mono" style={{ padding: "9px 12px", color: "var(--text-3)", fontSize: 10, borderBottom: "1px solid var(--border-soft)" }}>{ts(r.registered_at)}</td>
                    <td style={{ padding: "7px 12px", borderBottom: "1px solid var(--border-soft)" }}>
                      <div style={{ display: "flex", gap: 5 }}>
                        <button className="btn btn-ghost" title="Promote" disabled={busy || r.stage === "Production"} onClick={() => modelAction(r.version, "promote")}
                          style={{ padding: "4px 7px", color: "var(--low)" }}><Icon name="promote" size={13} /></button>
                        <button className="btn btn-ghost" title="Rollback" disabled={busy} onClick={() => modelAction(r.version, "rollback")}
                          style={{ padding: "4px 7px", color: "var(--med)" }}><Icon name="rollback" size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {hiddenModels > 0 && (
              <div style={{ padding: "8px 12px", fontSize: 10.5, color: "var(--text-3)", textAlign: "center", borderTop: "1px solid var(--border-soft)" }}>
                Production + 최근 {models.length - (prod ? 1 : 0)}개 표시 · 이전 모델 {hiddenModels}개 숨김
              </div>
            )}
          </div>
        </Panel>

        {/* pending approvals — where agent retrain recommendations land */}
        <Panel title="승인 대기 · Pending Approvals" icon="flag" dense
          right={<span className="chip" style={{ fontSize: 9.5, color: approvals.length ? "var(--med)" : "var(--low)", borderColor: approvals.length ? "var(--med)" : "var(--low)" }}>{approvals.length}건</span>}>
          {approvals.length === 0 ? (
            <div style={{ padding: "26px 12px", textAlign: "center", fontSize: 11.5, color: "var(--text-3)" }}>
              대기 중인 승인 요청이 없습니다.<br />
              <span style={{ fontSize: 10.5 }}>MLOps 에이전트가 '승인 요청' 모드로 재학습을 권고하면 여기에 표시됩니다.</span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 300, overflowY: "auto" }}>
              {approvals.map(a => (
                <div key={a.id} className="panel-inset" style={{ padding: "9px 11px", display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span className="chip" style={{ fontSize: 8.5, color: "var(--accent)", borderColor: "var(--accent-line)" }}>
                      {a.tool_name === "recommend_retrain" ? "재학습 권고" : a.tool_name}
                    </span>
                    <span className="mono" style={{ fontSize: 9.5, color: "var(--text-3)", marginLeft: "auto" }}>{ts(a.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--text-2)", lineHeight: 1.5 }}>{a.reason}</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn btn-accent" disabled={busy} onClick={() => resolveApproval(a.id, "approve")}
                      style={{ padding: "4px 10px", fontSize: 11 }}><Icon name="check" size={11} />승인 · 실행</button>
                    <button className="btn btn-ghost" disabled={busy} onClick={() => resolveApproval(a.id, "reject")}
                      style={{ padding: "4px 10px", fontSize: 11, color: "var(--text-3)" }}><Icon name="x" size={11} />거절</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "start" }}>
        {/* retraining history */}
        <Panel title="재학습 이력 · Retraining Jobs" icon="cpu" dense>
          {jobs.length === 0 ? (
            <div style={{ padding: "22px 12px", textAlign: "center", fontSize: 11.5, color: "var(--text-3)" }}>재학습 잡이 없습니다.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {jobs.map((j, i) => (
                <div key={i} className="panel-inset" style={{ padding: "9px 11px", display: "flex", alignItems: "center", gap: 9 }}>
                  <Icon name="cpu" size={13} style={{ color: "var(--amber)" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="mono" style={{ fontSize: 11.5, color: "var(--text)", fontWeight: 600 }}>{j.candidate_version}</div>
                    <div style={{ fontSize: 10, color: "var(--text-3)" }}>trigger: {j.trigger_type} · {ts(j.created_at)}</div>
                  </div>
                  <span className="mono" style={{ fontSize: 11, color: "var(--accent)", fontWeight: 600 }}>F1 {j.f1_score}</span>
                  <span className="chip" style={{ fontSize: 8.5, color: "var(--low)", borderColor: "var(--low)" }}>{j.status}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* recent activity / alerts */}
        <Panel title="최근 활동 · Alerts & Drift" icon="history" dense>
          {alerts.length === 0 ? (
            <div style={{ padding: "22px 12px", textAlign: "center", fontSize: 11.5, color: "var(--text-3)" }}>최근 활동이 없습니다.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {alerts.map((e, i) => (
                <div key={i} style={{ display: "flex", gap: 11, padding: "9px 0", borderBottom: i < alerts.length - 1 ? "1px solid var(--border-soft)" : "none" }}>
                  <div style={{ width: 7, height: 7, borderRadius: 99, background: SEV_COLOR[e.severity] || "var(--text-3)", marginTop: 5, flex: "none" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.5 }}>{e.content}</span>
                      <span className="mono" style={{ fontSize: 10, color: "var(--text-3)", whiteSpace: "nowrap" }}>{ts(e.created_at)}</span>
                    </div>
                    <span className="mono" style={{ fontSize: 10, color: "var(--text-3)" }}>{e.severity} · {e.channel}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
