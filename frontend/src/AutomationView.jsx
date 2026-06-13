import React from "react";
import { Icon, Panel, Metric, StatusDot } from "./lib";
import { automationMock } from "./mock";

export default function AutomationView() {
  const a = automationMock;
  const resultColor = { success: "var(--low)", running: "var(--accent)", failed: "var(--high)", escalated: "var(--med)" };
  const resultLabel = { success: "성공", running: "실행중", failed: "실패", escalated: "에스컬레이션" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
        <Panel dense pad={13}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="pulse-high" style={{ width: 9, height: 9, borderRadius: 99, background: "var(--low)" }} />
            <Metric label="Agent 상태" value="ACTIVE" mono={false} accent="var(--low)"
              sub={`자율성: ${a.autonomy === "supervised" ? "감독형" : "완전자동"}`} />
          </div>
        </Panel>
        <Panel dense pad={13}><Metric label="성공률 (24h)" value={(a.successRate * 100).toFixed(1)} unit="%"
          accent="var(--low)" sub={`${a.last24.success}/${a.last24.triggered} 액션`} /></Panel>
        <Panel dense pad={13}><Metric label="트리거됨 (24h)" value={a.last24.triggered} accent="var(--accent)"
          sub={`실패 ${a.last24.failed} · 에스컬 ${a.last24.escalated}`} /></Panel>
        <Panel dense pad={13}><Metric label="알람 볼륨 (24h)" value="118" accent="var(--text)" sub="High 3 · Med 21" /></Panel>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 12, alignItems: "start" }}>
        <Panel title="최근 자동화 액션 로그 · Action Log" icon="bot" dense pad={0}>
          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
              <thead style={{ position: "sticky", top: 0, background: "var(--panel)", zIndex: 1 }}>
                <tr style={{ color: "var(--text-3)" }}>
                  {["시각", "액션", "대상", "결과"].map((h, i) => (
                    <th key={i} style={{ textAlign: i === 3 ? "right" : "left", padding: "8px 12px", fontWeight: 600, fontSize: 10, letterSpacing: ".05em", textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {a.log.map((r, i) => (
                  <tr key={i}>
                    <td className="mono" style={{ padding: "9px 12px", color: "var(--text-3)", borderBottom: "1px solid var(--border-soft)", whiteSpace: "nowrap" }}>{r.t}</td>
                    <td style={{ padding: "9px 12px", color: "var(--text-2)", borderBottom: "1px solid var(--border-soft)" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        {r.auto && <span className="chip" style={{ fontSize: 8.5, padding: "1px 5px", color: "var(--accent)", borderColor: "var(--accent-line)" }}>AUTO</span>}
                        {r.action}
                      </span>
                    </td>
                    <td className="mono" style={{ padding: "9px 12px", color: "var(--text-3)", borderBottom: "1px solid var(--border-soft)", whiteSpace: "nowrap" }}>{r.target}</td>
                    <td style={{ padding: "9px 12px", textAlign: "right", borderBottom: "1px solid var(--border-soft)" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, color: resultColor[r.result] }}>
                        <StatusDot kind={r.result} />{resultLabel[r.result]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="성공 / 실패율" icon="activity" dense>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", gap: 4, height: 26, borderRadius: 6, overflow: "hidden", border: "1px solid var(--border-soft)" }}>
              <div style={{ flex: a.last24.success, background: "var(--low)", opacity: .85 }} />
              <div style={{ flex: a.last24.escalated, background: "var(--med)", opacity: .85 }} />
              <div style={{ flex: a.last24.failed, background: "var(--high)", opacity: .85 }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {[["성공", a.last24.success, "var(--low)"], ["에스컬레이션", a.last24.escalated, "var(--med)"], ["실패", a.last24.failed, "var(--high)"]].map(([l, v, c], i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: c }} />
                  <span style={{ fontSize: 12, color: "var(--text-2)", flex: 1 }}>{l}</span>
                  <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: c }}>{v}</span>
                </div>
              ))}
            </div>
            <div className="divider" />
            <div style={{ fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.6 }}>
              실패 2건은 모두 <span style={{ color: "var(--high)" }}>자동 롤백</span> 과정에서 발생했으며, 후속 수동 처리로 종결되었습니다. 에스컬레이션 3건은 사람 승인 대기 중입니다.
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
