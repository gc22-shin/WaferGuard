import React, { useState } from "react";
import { Icon, Panel, Metric, RiskBadge, RiskGauge, StatusDot } from "./lib";
import { defaultInspection } from "./mock";
import { mapResult } from "./InspectionView";
import { useStream } from "./SettingsContext";

const MODE_CHIP = {
  llm:       { color: "var(--accent)", label: "LLM (GPT-4o-mini)" },
  stub:      { color: "var(--med)",    label: "룰 기반 폴백" },
  rule_only: { color: "var(--text-3)", label: "Agent 미참여 (Low)" },
  error:     { color: "var(--high)",   label: "Agent 오류" },
};

function ActionCard({ insp, onAction }) {
  const [done, setDone] = useState(() => insp.checks.map(c => c.done));
  const human = insp.riskLevel === "High";
  const showDetails = insp.riskLevel === "Medium" || insp.riskLevel === "High";

  return (
    <Panel title="Action Card" icon="shield" dense
      right={<span className="chip" style={{ color: "var(--accent)", borderColor: "var(--accent-line)" }}>AI 권고</span>}>
      {/* summary row — vertically padded when Low, slides up when details open */}
      <div style={{
        display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap",
        padding: showDetails ? "0 0 14px" : "26px 0",
        transition: "padding .45s ease",
      }}>
        <RiskGauge score={insp.riskScore} level={insp.riskLevel} size={132} />
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <RiskBadge level={insp.riskLevel} size="lg" />
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5,
            color: human ? "var(--high)" : "var(--low)", fontWeight: 600,
          }}>
            <Icon name={human ? "alert" : "check"} size={13} />
            {human ? "사람 리뷰 필요" : "사람 리뷰 불필요"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 26, marginLeft: "auto", paddingRight: 6, flexWrap: "wrap" }}>
          <Metric label="신뢰도" value={(insp.confidence * 100).toFixed(1)} unit="%" />
          <Metric label="추정 수율" value={insp.yieldEst} unit="%" accent="var(--low)" />
          <Metric label="영향 다이" value={insp.dieFail} unit={`/ ${insp.dieTotal}`}
            accent={human ? "var(--high)" : "var(--text)"} />
        </div>
      </div>

      {/* details — collapsed at Low risk, expands for Medium/High */}
      <div style={{
        display: "grid", gridTemplateRows: showDetails ? "1fr" : "0fr",
        transition: "grid-template-rows .45s ease",
      }}>
      <div style={{ overflow: "hidden", opacity: showDetails ? 1 : 0, transition: "opacity .4s ease .12s" }}>
      <div className="divider" style={{ marginBottom: 14 }} />

      {/* three-column body */}
      <div style={{ display: "grid", gridTemplateColumns: "1.15fr 1.15fr 1fr", gap: 20, alignItems: "start" }}>
        <div>
          <div className="label-cap" style={{ marginBottom: 8 }}>추정 원인 · Probable Causes</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {insp.causes.map((c, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="mono" style={{ fontSize: 11, color: "var(--accent)", width: 34, flex: "none" }}>{(c.conf * 100).toFixed(0)}%</span>
                  <span style={{ fontSize: 11.5, color: "var(--text-2)", minWidth: 0 }}>{c.label}</span>
                </div>
                <div style={{ height: 4, background: "var(--panel-2)", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ width: `${c.conf * 100}%`, height: "100%", background: "var(--accent)", opacity: .7, borderRadius: 99 }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="label-cap" style={{ marginBottom: 8 }}>추가 점검 항목 · Checks</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {insp.checks.slice(0, 5).map((c, i) => (
              <button key={i} onClick={() => setDone(d => d.map((v, j) => j === i ? !v : v))}
                className="focusable" style={{
                  display: "flex", alignItems: "center", gap: 8, textAlign: "left", cursor: "pointer",
                  background: "var(--panel-2)", border: "1px solid var(--border-soft)", borderRadius: 6,
                  padding: "7px 9px", color: "var(--text-2)", font: "inherit",
                }}>
                <span style={{
                  width: 15, height: 15, borderRadius: 4, border: `1.5px solid ${done[i] ? "var(--low)" : "var(--border-strong)"}`,
                  background: done[i] ? "var(--low)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flex: "none",
                  color: "#04140b",
                }}>{done[i] && <Icon name="check" size={10} />}</span>
                <span style={{ fontSize: 11.5, flex: 1, textDecoration: done[i] ? "line-through" : "none", opacity: done[i] ? .6 : 1 }}>{c.label}</span>
                {c.priority === "info" && <span className="chip" style={{ fontSize: 9 }}>선택</span>}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="label-cap" style={{ marginBottom: 8 }}>권장 다음 액션 · Next</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {insp.nextActions.map((a, i) => (
              <button key={i} className={`btn ${a.kind === "primary" ? "btn-accent" : ""}`}
                onClick={() => onAction && onAction(a)}
                style={{ justifyContent: "flex-start", width: "100%" }}>
                <Icon name={i === 0 ? "play" : i === 1 ? "flag" : "note"} size={14} />{a.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      </div>
      </div>
    </Panel>
  );
}

export default function AgentView() {
  const { latest, settings } = useStream();
  const insp = latest ? mapResult(latest) : defaultInspection;
  const mode = MODE_CHIP[insp.agentMode] || MODE_CHIP.rule_only;
  const toolCalls = insp.agentToolCalls || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* context strip */}
      <div className="panel" style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", flexWrap: "wrap" }}>
        <span className="mono" style={{ fontSize: 12.5, color: "var(--text)", fontWeight: 600 }}>{insp.lot} · {insp.wafer}</span>
        <span className="chip">{insp.defectType}</span>
        <span className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>{insp.tool}</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <span className="chip" style={{ color: mode.color, borderColor: mode.color }}>
            <Icon name="bot" size={12} /> {mode.label}
          </span>
          {!settings.useLlm && (
            <span style={{ fontSize: 10.5, color: "var(--text-3)" }}>설정에서 LLM 호출이 꺼져 있음</span>
          )}
          <RiskBadge level={insp.riskLevel} score={insp.riskScore} />
        </div>
      </div>

      <ActionCard insp={insp} />

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12, alignItems: "start" }}>
        {/* Agent final decision */}
        <Panel title="Agent 판단 · Final Action" icon="bot" dense
          right={<span className="mono" style={{ fontSize: 10, color: "var(--text-3)" }}>{insp.inspectionId || ""}</span>}>
          <div style={{ fontSize: 12.5, lineHeight: 1.72, color: "var(--text-2)", whiteSpace: "pre-wrap", textWrap: "pretty" }}>
            {insp.agentFinalAction
              || "Low 리스크 — Agent가 개입하지 않은 검사입니다. 룰 기반으로 자동 통과 처리되었습니다."}
          </div>
          {toolCalls.length > 0 && (
            <>
              <div className="divider" style={{ margin: "12px 0" }} />
              <div className="label-cap" style={{ marginBottom: 7 }}>Tool Calls · {toolCalls.length}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {toolCalls.map((t, i) => (
                  <div key={i} className="panel-inset" style={{ padding: "8px 10px", display: "flex", gap: 9, alignItems: "flex-start" }}>
                    <StatusDot kind="ok" />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="mono" style={{ fontSize: 11.5, color: "var(--accent)", fontWeight: 600 }}>{t.name}</div>
                      <div className="mono" style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {JSON.stringify(t.args || {})}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Panel>

        {/* AI report */}
        <Panel title="AI 분석 리포트" icon="file" dense
          right={<><span className="chip" style={{ fontSize: 9.5 }}>{insp.modelVersion || "v4.2.1"}</span><span className="mono" style={{ fontSize: 10, color: "var(--text-3)" }}>ko-KR</span></>}>
          <div style={{ fontSize: 12.5, lineHeight: 1.72, color: "var(--text-2)", whiteSpace: "pre-wrap", textWrap: "pretty" }}>
            {(insp.report || "").split("**").map((seg, i) =>
              i % 2 ? <strong key={i} style={{ color: "var(--text)", fontWeight: 650 }}>{seg}</strong> : seg
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
