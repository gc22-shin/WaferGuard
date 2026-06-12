import React, { useState, useEffect, useRef } from "react";
import { Icon, RiskBadge, Panel, StatusDot } from "./lib";
import { WaferMap, GradCAM, buildWaferMap } from "./wafer";
import { DefectCatBars, RiskHistogram } from "./charts";
import { riskHist, defectCats, defaultInspection } from "./mock";
import { useStream } from "./SettingsContext";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

// Map backend result → display format (shared with AgentView)
export function mapResult(r) {
  const card = r.action_card || {};
  const pc   = r.process_context || {};
  const met  = r.metrology || {};
  const riskScore = Math.round((r.risk_score ?? 0) * 100);

  const causes = (card.possible_causes || []).map((label, i) => ({
    label, conf: [0.42, 0.27, 0.15, 0.10][i] ?? 0.08,
  }));

  const checks = [
    ...(card.process_checks || []),
    ...(card.metrology_checks || []),
  ].map(label => ({ label, priority: "low", done: false }));

  const nextActions = (card.next_actions || ["정상 처리 진행"]).map((label, i) => ({
    label, kind: i === 0 ? "primary" : "ghost",
  }));

  const metrologyRows = Object.entries(met).length > 0 ? [
    { id: "CD",      name: "CD (nm)",          value: met.cd_nm ?? "N/A",              spec: "≤ 35",    ok: (met.cd_nm ?? 0) <= 35,      delta: 0 },
    { id: "OVL",     name: "Overlay (nm)",     value: met.overlay_nm ?? "N/A",         spec: "≤ 6.0",   ok: (met.overlay_nm ?? 0) <= 6,   delta: 0 },
    { id: "THICK",   name: "Film Thickness",   value: met.film_thickness_nm ?? "N/A",  spec: "80–100",  ok: true, delta: 0 },
    { id: "ROUGH",   name: "Roughness (nm)",   value: met.roughness_nm ?? "N/A",       spec: "≤ 2.0",   ok: (met.roughness_nm ?? 0) <= 2,  delta: 0 },
    { id: "PART",    name: "Defect Count",     value: met.defect_count ?? "N/A",       spec: "≤ 12",    ok: (met.defect_count ?? 0) <= 12, delta: card.metrology_risk_delta ?? 0 },
  ] : defaultInspection.metrology;

  return {
    lot: pc.lot_id || r.lot_id || "LOT-DEMO",
    wafer: r.wafer_id || "W01",
    waferIdx: parseInt((r.wafer_id || "W01").replace(/\D/g, "")) || 1,
    waferTotal: 25,
    device: `${pc.process_step || "Etch"} · ${pc.recipe_id || "RCP-001"}`,
    recipe: pc.recipe_id || "RCP-001",
    tool: pc.tool_id || r.equipment_id || "ETCH-01",
    chamber: "C2",
    operator: "Demo Engineer",
    startedAt: r.created_at || new Date().toISOString().slice(0,19).replace("T", " "),
    riskLevel: r.risk_level || "Low",
    riskScore: riskScore,
    confidence: r.confidence || 0,
    yieldEst: ((1 - (r.hotspot_ratio || 0)) * 100).toFixed(1),
    dieTotal: 612,
    dieFail: Math.round((r.hotspot_ratio || 0.008) * 612),
    waferMap: buildWaferMap(r.hotspot_ratio ?? 0.045, r.risk_level === "High"),
    causes,
    checks,
    nextActions,
    metrology: metrologyRows,
    report: r.report || "",
    defectType: r.defect_type || "Unknown",
    imageUrl: r.image_url,
    overlayUrl: r.overlay_url,
    roiUrl: r.roi_url,
    modelVersion: r.model_version || "v4.2.1",
    status: r.status || "approved",
    inspectionId: r.id,
    agentMode: r.agent_mode || "rule_only",
    agentFinalAction: r.agent_final_action || null,
    agentToolCalls: r.agent_tool_calls || [],
  };
}

function MetaItem({ label, value, mono = true }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
      <span className="label-cap" style={{ fontSize: 9.5 }}>{label}</span>
      <span className={mono ? "mono" : ""} style={{ fontSize: 12.5, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</span>
    </div>
  );
}

function MetrologyTable({ rows }) {
  return (
    <Panel title="측정 결과" icon="gauge" dense pad={0}
      right={<span className="mono" style={{ fontSize: 10.5, color: "var(--text-3)" }}>{rows.filter(r => r.ok).length}/{rows.length} PASS</span>}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
        <thead>
          <tr style={{ color: "var(--text-3)" }}>
            {["항목", "측정값", "스펙", "Δrisk", ""].map((h, i) => (
              <th key={i} style={{ textAlign: i > 0 && i < 4 ? "right" : "left", padding: "7px 12px", fontWeight: 600, fontSize: 10, letterSpacing: ".05em", textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ background: r.ok ? "transparent" : "var(--high-dim)" }}>
              <td style={{ padding: "7px 12px", color: "var(--text-2)", borderBottom: "1px solid var(--border-soft)" }}>{r.name}</td>
              <td className="mono" style={{ padding: "7px 12px", textAlign: "right", color: r.ok ? "var(--text)" : "var(--high)", fontWeight: 600, borderBottom: "1px solid var(--border-soft)" }}>{r.value}</td>
              <td className="mono" style={{ padding: "7px 12px", textAlign: "right", color: "var(--text-3)", borderBottom: "1px solid var(--border-soft)" }}>{r.spec}</td>
              <td className="mono" style={{ padding: "7px 12px", textAlign: "right", color: r.delta ? "var(--high)" : "var(--text-3)", borderBottom: "1px solid var(--border-soft)" }}>{r.delta ? `+${r.delta}` : "—"}</td>
              <td style={{ padding: "7px 12px", borderBottom: "1px solid var(--border-soft)" }}><StatusDot kind={r.ok ? "ok" : "failed"} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

export default function InspectionView() {
  const { latest, tick, settings, updateSettings, inFlight, runOnce } = useStream();
  const [insp, setInsp]         = useState(defaultInspection);
  const [scanning, setScanning] = useState(false);
  const scanTimer = useRef(null);

  useEffect(() => {
    if (!latest) return;
    setInsp(mapResult(latest));
    setScanning(true);
    if (scanTimer.current) clearTimeout(scanTimer.current);
    scanTimer.current = setTimeout(() => setScanning(false), 350);
    return () => { if (scanTimer.current) clearTimeout(scanTimer.current); };
  }, [tick, latest]);

  const hot = insp.riskLevel === "High" ? "cluster" : "edge";
  const imageBase = `${API_BASE}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* meta strip */}
      <div className="panel" style={{ display: "flex", alignItems: "center", gap: 0, padding: "11px 14px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 22, flex: 1, flexWrap: "wrap" }}>
          <MetaItem label="Lot"            value={insp.lot} />
          <MetaItem label="Wafer"          value={`${insp.wafer} · ${insp.waferIdx}/${insp.waferTotal}`} />
          <MetaItem label="Defect"         value={insp.defectType} />
          <MetaItem label="Recipe"         value={insp.recipe} />
          <MetaItem label="Tool"           value={insp.tool} />
          <MetaItem label="Model"          value={insp.modelVersion || "v4.2.1"} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <RiskBadge level={insp.riskLevel} score={insp.riskScore} />
          <span className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>신뢰도 {(insp.confidence * 100).toFixed(1)}%</span>
          <div className="vdivider" style={{ height: 22 }} />
          <div style={{ textAlign: "right" }}>
            <div className="label-cap" style={{ fontSize: 9 }}>검사 시각</div>
            <div className="mono" style={{ fontSize: 11.5, color: "var(--text-2)" }}>{insp.startedAt?.slice(0,19)}</div>
          </div>
          <span className="chip" title={`주기 ${settings.intervalMs}ms · 비정상률 ${(settings.anomalyRate*100).toFixed(0)}%`}
            style={{ color: settings.enabled ? "var(--low)" : "var(--text-3)", borderColor: settings.enabled ? "var(--low)" : "var(--border-strong)" }}>
            <StatusDot kind={settings.enabled ? "ok" : "idle"} />
            {settings.enabled ? `스트림 ${(settings.intervalMs/1000).toFixed(1)}s` : "스트림 일시정지"}
          </span>
          <button className="btn" onClick={() => updateSettings({ enabled: !settings.enabled })} style={{ gap: 6 }}>
            <Icon name={settings.enabled ? "pause" : "play"} size={14} />
            {settings.enabled ? "일시정지" : "재개"}
          </button>
          <button className="btn btn-accent" onClick={runOnce} disabled={inFlight}>
            <Icon name="refresh" size={14} style={inFlight ? { animation: "spin 1s linear infinite" } : undefined} />
            {inFlight ? "검사 중…" : "1회 실행"}
          </button>
        </div>
      </div>

      {/* main grid — imagery and metrology split 50/50 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "start" }}>
        <Panel title="검사 영상" icon="layers" dense
          right={<span className="mono" style={{ fontSize: 10.5, color: "var(--text-3)" }}>{insp.dieTotal} die · {insp.dieFail} flagged</span>}>
          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
            <figure style={{ margin: 0, textAlign: "center" }}>
              {insp.imageUrl
                ? <img src={`${imageBase}${insp.imageUrl}`} alt="wafer map"
                    style={{ width: 220, height: 220, objectFit: "contain", borderRadius: 8, background: "var(--panel-2)" }} />
                : <WaferMap map={insp.waferMap} size={220} scanning={scanning} />}
              <figcaption style={{ fontSize: 10, color: "var(--text-3)", marginTop: 6 }}>Wafer Map · {insp.wafer}</figcaption>
            </figure>
            <figure style={{ margin: 0, textAlign: "center" }}>
              {insp.overlayUrl
                ? <img src={`${imageBase}${insp.overlayUrl}`} alt="grad-cam"
                    style={{ width: 220, height: 220, objectFit: "contain", borderRadius: 8, background: "#0b1a2e" }} />
                : <GradCAM size={220} hot={hot} />}
              <figcaption style={{ fontSize: 10, color: "var(--text-3)", marginTop: 6 }}>Grad-CAM 활성화 맵</figcaption>
            </figure>
          </div>
        </Panel>

        <MetrologyTable rows={insp.metrology} />
      </div>

      {/* defect bars + risk histogram */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.25fr", gap: 12, alignItems: "start" }}>
        <Panel title="결함 카테고리 빈도 · 7d" icon="activity" dense>
          <DefectCatBars data={defectCats} />
        </Panel>
        <Panel title="리스크 점수 분포 · 24h" icon="pulse" dense
          right={<span className="mono" style={{ fontSize: 10.5, color: "var(--text-3)" }}>595 inspections</span>}>
          <RiskHistogram data={riskHist} />
        </Panel>
      </div>
    </div>
  );
}
