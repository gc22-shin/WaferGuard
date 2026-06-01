import React, { useState } from "react";
import { Icon, Panel, Metric, StatusDot, Progress } from "./lib";
import { DriftChart, RetrainEffect } from "./charts";
import { registry, driftSeries, driftThreshold, driftEvents, retrainJob, retrainEffect } from "./mock";

function StatusPill({ status }) {
  const map = {
    production: { c: "var(--low)",    t: "PRODUCTION" },
    staging:    { c: "var(--accent)", t: "STAGING" },
    rollback:   { c: "var(--med)",    t: "ROLLBACK" },
    archived:   { c: "var(--text-3)", t: "ARCHIVED" },
  };
  const m = map[status] || map.archived;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 700,
      letterSpacing: ".05em", color: m.c, border: `1px solid ${m.c}`, borderRadius: 5, padding: "2px 7px",
      background: `rgba(0,0,0,0.1)` }}>
      <StatusDot kind={status} />{m.t}
    </span>
  );
}

export default function MlopsView() {
  const [reg, setReg] = useState(registry);
  const [toast, setToast] = useState(null);

  function act(ver, kind) {
    setReg(rows => rows.map(r => {
      if (kind === "promote" && r.ver === ver) return { ...r, status: "production", traffic: 100 };
      if (kind === "promote" && r.status === "production") return { ...r, status: "archived", traffic: 0 };
      if (kind === "rollback" && r.ver === ver) return { ...r, status: "rollback", traffic: 0 };
      return r;
    }));
    setToast(`${ver} — ${kind === "promote" ? "Production 으로 프로모트됨" : "Rollback 처리됨"}`);
    setTimeout(() => setToast(null), 2600);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {toast && (
        <div className="toast-in" style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", zIndex: 50,
          background: "var(--panel-3)", border: "1px solid var(--accent-line)", color: "var(--text)", padding: "10px 16px",
          borderRadius: 8, fontSize: 12.5, boxShadow: "var(--shadow)", display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="check" size={14} style={{ color: "var(--low)" }} />{toast}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
        <Panel dense pad={13}><Metric label="Production 모델" value="v4.2.1" accent="var(--low)" sub="AUROC 0.987" /></Panel>
        <Panel dense pad={13}><Metric label="현재 PSI 드리프트" value="0.12" accent="var(--accent)" sub={`임계 ${driftThreshold} 대비 67%`} /></Panel>
        <Panel dense pad={13}><Metric label="재학습 잡" value="1" unit="active" accent="var(--amber)" sub={retrainJob.name} /></Panel>
        <Panel dense pad={13}><Metric label="자동 롤백 (7d)" value="1" accent="var(--med)" sub="v4.1.4 지표 하락" /></Panel>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 12, alignItems: "start" }}>
        <Panel title="모델 레지스트리 · Registry" icon="box" dense pad={0}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
            <thead>
              <tr style={{ color: "var(--text-3)" }}>
                {["버전", "아키텍처", "상태", "AUROC", "Acc", "트래픽", "액션"].map((h, i) => (
                  <th key={i} style={{ textAlign: i >= 3 && i <= 5 ? "right" : "left", padding: "8px 12px", fontWeight: 600, fontSize: 10, letterSpacing: ".05em", textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reg.map((r, i) => (
                <tr key={i} style={{ background: r.status === "production" ? "var(--low-dim)" : "transparent" }}>
                  <td className="mono" style={{ padding: "9px 12px", color: "var(--text)", fontWeight: 600, borderBottom: "1px solid var(--border-soft)" }}>{r.ver}</td>
                  <td className="mono" style={{ padding: "9px 12px", color: "var(--text-3)", borderBottom: "1px solid var(--border-soft)" }}>{r.arch}</td>
                  <td style={{ padding: "9px 12px", borderBottom: "1px solid var(--border-soft)" }}><StatusPill status={r.status} /></td>
                  <td className="mono" style={{ padding: "9px 12px", textAlign: "right", color: "var(--text-2)", borderBottom: "1px solid var(--border-soft)" }}>{r.auroc.toFixed(3)}</td>
                  <td className="mono" style={{ padding: "9px 12px", textAlign: "right", color: "var(--text-2)", borderBottom: "1px solid var(--border-soft)" }}>{r.acc.toFixed(3)}</td>
                  <td className="mono" style={{ padding: "9px 12px", textAlign: "right", color: r.traffic ? "var(--low)" : "var(--text-3)", borderBottom: "1px solid var(--border-soft)" }}>{r.traffic}%</td>
                  <td style={{ padding: "7px 12px", borderBottom: "1px solid var(--border-soft)" }}>
                    <div style={{ display: "flex", gap: 5 }}>
                      <button className="btn btn-ghost" title="Promote" disabled={r.status === "production"} onClick={() => act(r.ver, "promote")}
                        style={{ padding: "4px 7px", color: "var(--low)" }}><Icon name="promote" size={13} /></button>
                      <button className="btn btn-ghost" title="Rollback" disabled={r.status === "rollback" || r.status === "archived"} onClick={() => act(r.ver, "rollback")}
                        style={{ padding: "4px 7px", color: "var(--med)" }}><Icon name="rollback" size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="재학습 진행 · Retraining" icon="cpu" dense
          right={<span className="chip" style={{ color: "var(--amber)", borderColor: "var(--amber)" }}><StatusDot kind="running" />RUNNING</span>}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
                <span className="mono" style={{ fontSize: 12, color: "var(--text)" }}>{retrainJob.name}</span>
                <span className="mono" style={{ fontSize: 12, color: "var(--amber)", fontWeight: 600 }}>{Math.round(retrainJob.progress * 100)}%</span>
              </div>
              <Progress value={retrainJob.progress} color="var(--amber)" height={8} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Metric label="Epoch" value={retrainJob.epoch} sub={`샘플 ${retrainJob.samples.toLocaleString()}`} />
              <Metric label="ETA" value={retrainJob.etaMin} unit="min" sub={`${retrainJob.gpu} · ${retrainJob.started} 시작`} />
            </div>
            <div className="divider" />
            <div className="label-cap">재학습 효과 · Before / After</div>
            <RetrainEffect data={retrainEffect} />
          </div>
        </Panel>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 12, alignItems: "start" }}>
        <Panel title="드리프트 추세 · PSI (14d)" icon="pulse" dense
          right={<span className="mono" style={{ fontSize: 10.5, color: "var(--text-3)" }}>feature: edge_intensity</span>}>
          <DriftChart data={driftSeries} threshold={driftThreshold} />
        </Panel>

        <Panel title="드리프트 이벤트 · Timeline" icon="history" dense>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {driftEvents.map((e, i) => (
              <div key={i} style={{ display: "flex", gap: 11, padding: "9px 0", borderBottom: i < driftEvents.length - 1 ? "1px solid var(--border-soft)" : "none" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 3 }}>
                  <StatusDot kind={e.sev} />
                  {i < driftEvents.length - 1 && <div style={{ width: 1, flex: 1, background: "var(--border)", marginTop: 4 }} />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 12, color: "var(--text)", fontWeight: 500 }}>{e.text}</span>
                    <span className="mono" style={{ fontSize: 10, color: "var(--text-3)", whiteSpace: "nowrap" }}>{e.t}</span>
                  </div>
                  <span className="mono" style={{ fontSize: 10.5, color: "var(--text-3)" }}>{e.metric}</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
