import React from "react";
import { Panel, Metric, RiskBadge, StatusDot } from "./lib";
import { ragCases, ragMetrics } from "./mock";

export default function RagView() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
        {[
          ["Recall@3",   (ragMetrics.recallAt3 * 100).toFixed(0) + "%", "var(--low)"],
          ["Recall@5",   (ragMetrics.recallAt5 * 100).toFixed(0) + "%", "var(--low)"],
          ["Precision",  (ragMetrics.precision * 100).toFixed(0) + "%", "var(--accent)"],
          ["Index size", ragMetrics.indexed.toLocaleString(),           "var(--text)"],
        ].map(([l, v, c], i) => (
          <Panel key={i} dense pad={13}><Metric label={l} value={v} accent={c} /></Panel>
        ))}
      </div>

      <Panel title="유사 과거 케이스 · Top-3 (RAG)" icon="history" dense
        right={<span className="mono" style={{ fontSize: 10.5, color: "var(--text-3)" }}>검색 {ragMetrics.latencyMs}ms · cosine</span>}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
          {ragCases.map((c, i) => (
            <div key={i} className="panel-inset" style={{ padding: 13, display: "flex", flexDirection: "column", gap: 9 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>{c.id}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="mono" style={{ fontSize: 14, fontWeight: 600, color: "var(--accent)" }}>{(c.sim * 100).toFixed(0)}%</span>
                  <span className="label-cap" style={{ fontSize: 8.5 }}>유사</span>
                </span>
              </div>
              <div style={{ height: 3, background: "var(--panel-3)", borderRadius: 99 }}>
                <div style={{ width: `${c.sim * 100}%`, height: "100%", background: "var(--accent)", borderRadius: 99 }} />
              </div>
              <div style={{ fontSize: 12.5, color: "var(--text)", fontWeight: 600, lineHeight: 1.4 }}>{c.title}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 10.5 }} className="mono">
                <span style={{ color: "var(--text-3)" }}>{c.date}</span>
                <span style={{ color: "var(--text-3)" }}>· {c.tool}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span className="chip" style={{ fontSize: 9.5 }}>{c.device}</span>
                <RiskBadge level={c.riskThen} />
              </div>
              <div className="divider" style={{ margin: "2px 0" }} />
              <div>
                <div className="label-cap" style={{ fontSize: 8.5, marginBottom: 3 }}>당시 조치</div>
                <div style={{ fontSize: 11.5, color: "var(--text-2)", lineHeight: 1.45 }}>{c.action}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                <StatusDot kind={c.result} />
                <span style={{ fontSize: 11, color: c.result === "resolved" ? "var(--low)" : "var(--accent)", fontWeight: 600 }}>{c.resultLabel}</span>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
