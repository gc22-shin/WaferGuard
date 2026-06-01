import React from "react";
import { Icon, Panel, RiskBadge } from "./lib";
import { AlarmVolumeChart } from "./charts";
import { alarmVolume } from "./mock";

const RECENT = [
  { t: "02:14:07", lvl: "High",   lot: "LOT-2D49-118 / W04", text: "패턴 브릿지 클러스터 — 자동 격리", status: "종결" },
  { t: "01:32:50", lvl: "Medium", lot: "LOT-2D49-115 / W21", text: "엣지 파티클 증가 추세",             status: "모니터" },
  { t: "00:48:11", lvl: "Medium", lot: "LOT-2D48-093 / W08", text: "CD Uniformity 경계값 근접",         status: "종결" },
  { t: "23:50:14", lvl: "Low",    lot: "LOT-2D48-090 / W12", text: "엣지 비드 미세 변동",               status: "정상" },
];

export default function AlertCenterView({ onSimulate }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Panel title="알람 시뮬레이션 · Critical Alert" icon="alert" dense>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.6 }}>
              High 리스크 검출 시 전역 상단에 사이렌 컬러 토스트가 표시됩니다. 아래 버튼으로 오버레이를 시연하세요.
              <span style={{ color: "var(--text-3)" }}> (사운드 비활성)</span>
            </div>
          </div>
          <button className="btn btn-danger" onClick={onSimulate}>
            <Icon name="alert" size={14} />High 알람 시뮬레이션
          </button>
        </div>
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 12, alignItems: "start" }}>
        <Panel title="최근 알람 · Recent Alerts" icon="radio" dense pad={0}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
            <thead>
              <tr style={{ color: "var(--text-3)" }}>
                {["시각", "레벨", "Lot / Wafer", "내용", "상태"].map((h, i) => (
                  <th key={i} style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600, fontSize: 10, letterSpacing: ".05em", textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {RECENT.map((r, i) => (
                <tr key={i}>
                  <td className="mono" style={{ padding: "9px 12px", color: "var(--text-3)", borderBottom: "1px solid var(--border-soft)" }}>{r.t}</td>
                  <td style={{ padding: "9px 12px", borderBottom: "1px solid var(--border-soft)" }}><RiskBadge level={r.lvl} /></td>
                  <td className="mono" style={{ padding: "9px 12px", color: "var(--text-2)", borderBottom: "1px solid var(--border-soft)", whiteSpace: "nowrap" }}>{r.lot}</td>
                  <td style={{ padding: "9px 12px", color: "var(--text-2)", borderBottom: "1px solid var(--border-soft)" }}>{r.text}</td>
                  <td style={{ padding: "9px 12px", color: "var(--text-3)", borderBottom: "1px solid var(--border-soft)" }}>{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="시간대별 알람 볼륨 · 24h" icon="pulse" dense
          right={<span className="mono" style={{ fontSize: 10, color: "var(--high)" }}>■ High</span>}>
          <AlarmVolumeChart data={alarmVolume} />
        </Panel>
      </div>
    </div>
  );
}
