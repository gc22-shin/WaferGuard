import React from "react";
import { Icon, Panel, StatusDot, Progress } from "./lib";
import { copilotMock } from "./mock";

export default function CopilotView() {
  const c = copilotMock;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
        {c.tools.map((t, i) => (
          <Panel key={i} dense pad={14}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span className="mono" style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{t.id}</span>
              <span className="chip" style={{ color: t.status === "ok" ? "var(--low)" : "var(--med)", borderColor: t.status === "ok" ? "var(--low)" : "var(--med)" }}>
                <StatusDot kind={t.status} />{t.status === "ok" ? "정상" : "주의"}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 11 }}>
              <span style={{ color: "var(--text-3)" }}>장비 헬스</span>
              <span className="mono" style={{ color: t.health > 0.85 ? "var(--low)" : "var(--med)", fontWeight: 600 }}>{(t.health * 100).toFixed(0)}%</span>
            </div>
            <Progress value={t.health} color={t.health > 0.85 ? "var(--low)" : "var(--med)"} />
            <div style={{ display: "flex", gap: 16, marginTop: 11, fontSize: 11 }} className="mono">
              <span style={{ color: "var(--text-3)" }}>최근 PM <span style={{ color: "var(--text-2)" }}>{t.lastPM}</span></span>
              <span style={{ color: "var(--text-3)" }}>이슈 <span style={{ color: t.openIssues ? "var(--med)" : "var(--text-2)" }}>{t.openIssues}</span></span>
            </div>
          </Panel>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "start" }}>
        <Panel title="장비 컨텍스트 메모리 · Context Memory" icon="cpu" dense>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {c.memory.map((m, i) => (
              <div key={i} style={{ background: "var(--panel-2)", border: "1px solid var(--border-soft)", borderLeft: "2px solid var(--accent)", borderRadius: 7, padding: "10px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                  <span className="mono" style={{ fontSize: 11, color: "var(--accent)", fontWeight: 600 }}>{m.tool}</span>
                  <span className="chip" style={{ fontSize: 9 }}>{m.tag}</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.55 }}>{m.note}</div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Near-miss 사례" icon="alert" dense>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {c.nearMiss.map((n, i) => (
              <div key={i} style={{ background: "var(--med-dim)", border: "1px solid var(--border-soft)", borderRadius: 7, padding: "10px 12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: "var(--text)", fontWeight: 500, lineHeight: 1.45 }}>{n.text}</span>
                  <span className="mono" style={{ fontSize: 10, color: "var(--text-3)", flex: "none", marginLeft: 8 }}>{n.date}</span>
                </div>
                <div style={{ fontSize: 11, color: "var(--med)", display: "flex", alignItems: "center", gap: 5 }}>
                  <Icon name="shield" size={11} />{n.impact}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="엔지니어 의사결정 요약 · Decision Log" icon="history" dense>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {c.decisions.map((d, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < c.decisions.length - 1 ? "1px solid var(--border-soft)" : "none" }}>
              <span className="mono" style={{ fontSize: 10.5, color: "var(--text-3)", width: 40, flex: "none" }}>{d.date}</span>
              <span className="chip" style={{ fontSize: 9.5, flex: "none" }}>{d.who}</span>
              <span style={{ fontSize: 12.5, color: "var(--text-2)", flex: 1 }}>{d.text}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--low)", fontWeight: 600, flex: "none" }}>
                <Icon name="check" size={12} />결과 양호
              </span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
