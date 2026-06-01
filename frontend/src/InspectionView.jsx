import React, { useState, useEffect } from "react";
import { Icon, RiskBadge, RiskGauge, Panel, Metric, StatusDot } from "./lib";
import { WaferMap, GradCAM, ROIPatch, buildWaferMap } from "./wafer";
import { DefectCatBars, RiskHistogram } from "./charts";
import { riskHist, defectCats, defaultInspection } from "./mock";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const DEFECT_OPTIONS = ["auto","Center","Donut","Edge-Loc","Edge-Ring","Loc","Random","Scratch","Near-full","None"];
const STEP_OPTIONS   = ["Lithography","Etch","Deposition","CMP","Cleaning","Inspection"];

// Map backend result → display format
function mapResult(r) {
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

function ActionCard({ insp, onAction }) {
  const [done, setDone] = useState(() => insp.checks.map(c => c.done));
  const human = insp.riskLevel === "High";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Panel title="Action Card" icon="shield" dense
        right={<span className="chip" style={{ color: "var(--accent)", borderColor: "var(--accent-line)" }}>AI 권고</span>}>
        <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 14 }}>
          <RiskGauge score={insp.riskScore} level={insp.riskLevel} size={118} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
            <RiskBadge level={insp.riskLevel} size="lg" />
            <div style={{ display: "flex", gap: 14 }}>
              <Metric label="신뢰도" value={(insp.confidence * 100).toFixed(1)} unit="%" />
              <Metric label="추정 수율" value={insp.yieldEst} unit="%" accent="var(--low)" />
            </div>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5,
              color: human ? "var(--high)" : "var(--low)", fontWeight: 600, marginTop: 2,
            }}>
              <Icon name={human ? "alert" : "check"} size={13} />
              {human ? "사람 리뷰 필요" : "사람 리뷰 불필요"}
            </div>
          </div>
        </div>

        <div className="label-cap" style={{ marginBottom: 7 }}>추정 원인 · Probable Causes</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
          {insp.causes.map((c, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span className="mono" style={{ fontSize: 11, color: "var(--accent)", width: 34, flex: "none" }}>{(c.conf * 100).toFixed(0)}%</span>
              <div style={{ flex: 1, height: 4, background: "var(--panel-2)", borderRadius: 99, overflow: "hidden" }}>
                <div style={{ width: `${c.conf * 100}%`, height: "100%", background: "var(--accent)", opacity: .7, borderRadius: 99 }} />
              </div>
              <span style={{ fontSize: 11.5, color: "var(--text-2)", flex: "2 1 0", minWidth: 0 }}>{c.label}</span>
            </div>
          ))}
        </div>

        <div className="label-cap" style={{ marginBottom: 7 }}>추가 점검 항목 · Checks</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 14 }}>
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

        <div className="label-cap" style={{ marginBottom: 7 }}>권장 다음 액션 · Next</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {insp.nextActions.map((a, i) => (
            <button key={i} className={`btn ${a.kind === "primary" ? "btn-accent" : ""}`}
              onClick={() => onAction && onAction(a)}
              style={{ justifyContent: "flex-start", width: "100%" }}>
              <Icon name={i === 0 ? "play" : i === 1 ? "flag" : "note"} size={14} />{a.label}
            </button>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function MetrologyTable({ rows }) {
  return (
    <Panel title="계측 룰 · Metrology" icon="gauge" dense pad={0}
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
  const [insp, setInsp]       = useState(defaultInspection);
  const [scanning, setScanning] = useState(false);
  const [form, setForm]       = useState({
    lot_id: "LOT-DEMO-042", wafer_id: "WF-DEMO-001", line_id: "LINE-7",
    equipment_id: "ETCH-02", process_step: "Etch", recipe_id: "RCP-ETCH-EDGE-02",
    defect_hint: "auto",
    cd_nm: 32.5, overlay_nm: 4.2, film_thickness_nm: 88.0, roughness_nm: 1.2,
    defect_count: "", yield_proxy: 0.982,
  });
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/inspections?limit=1`);
        if (!res.ok) return;
        const data = await res.json();
        const latest = Array.isArray(data) ? data[0] : data?.inspections?.[0];
        if (!cancelled && latest) setInsp(mapResult(latest));
      } catch {
        // keep defaultInspection on failure
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function runInspect() {
    setBusy(true);
    setError("");
    setScanning(true);
    try {
      const payload = {
        ...form,
        cd_nm: Number(form.cd_nm), overlay_nm: Number(form.overlay_nm),
        film_thickness_nm: Number(form.film_thickness_nm), roughness_nm: Number(form.roughness_nm),
        defect_count: form.defect_count === "" ? null : Number(form.defect_count),
        yield_proxy: Number(form.yield_proxy),
        image_source: "synthetic_wafer", proxy_dataset: "mvtec-ad",
      };
      const res = await fetch(`${API_BASE}/api/v1/inspect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setInsp(mapResult(data));
      setShowForm(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      setTimeout(() => setScanning(false), 400);
    }
  }

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
          <div style={{ textAlign: "right" }}>
            <div className="label-cap" style={{ fontSize: 9 }}>검사 시각</div>
            <div className="mono" style={{ fontSize: 11.5, color: "var(--text-2)" }}>{insp.startedAt?.slice(0,19)}</div>
          </div>
          <button className="btn" onClick={() => setShowForm(v => !v)} style={{ gap: 6 }}>
            <Icon name="layers" size={14} />설정
          </button>
          <button className="btn btn-accent" onClick={runInspect} disabled={busy}>
            <Icon name="refresh" size={14} style={busy ? { animation: "spin 1s linear infinite" } : undefined} />
            {busy ? "검사 중…" : "재검사 실행"}
          </button>
        </div>
      </div>

      {/* inspection form (collapsible) */}
      {showForm && (
        <div className="panel slide-in" style={{ padding: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 12 }}>
            {[
              ["Wafer ID", "wafer_id", "text"],
              ["Lot ID", "lot_id", "text"],
              ["Line", "line_id", "text"],
              ["Equipment", "equipment_id", "text"],
              ["Recipe", "recipe_id", "text"],
            ].map(([label, key, type]) => (
              <label key={key} style={{ display: "grid", gap: 4 }}>
                <span className="label-cap">{label}</span>
                <input type={type} value={form[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  style={{ background: "var(--panel-2)", border: "1px solid var(--border-strong)", borderRadius: 6, padding: "6px 9px", color: "var(--text)", font: "inherit", fontSize: 12 }} />
              </label>
            ))}
            <label style={{ display: "grid", gap: 4 }}>
              <span className="label-cap">Step</span>
              <select value={form.process_step} onChange={e => setForm(f => ({ ...f, process_step: e.target.value }))}
                style={{ background: "var(--panel-2)", border: "1px solid var(--border-strong)", borderRadius: 6, padding: "6px 9px", color: "var(--text)", font: "inherit", fontSize: 12 }}>
                {STEP_OPTIONS.map(o => <option key={o}>{o}</option>)}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span className="label-cap">Defect Hint</span>
              <select value={form.defect_hint} onChange={e => setForm(f => ({ ...f, defect_hint: e.target.value }))}
                style={{ background: "var(--panel-2)", border: "1px solid var(--border-strong)", borderRadius: 6, padding: "6px 9px", color: "var(--text)", font: "inherit", fontSize: 12 }}>
                {DEFECT_OPTIONS.map(o => <option key={o}>{o}</option>)}
              </select>
            </label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 12 }}>
            {[
              ["CD (nm)", "cd_nm"], ["Overlay (nm)", "overlay_nm"],
              ["Thickness (nm)", "film_thickness_nm"], ["Roughness (nm)", "roughness_nm"],
              ["Yield Proxy", "yield_proxy"],
            ].map(([label, key]) => (
              <label key={key} style={{ display: "grid", gap: 4 }}>
                <span className="label-cap">{label}</span>
                <input type="number" value={form[key]} step="0.1"
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  style={{ background: "var(--panel-2)", border: "1px solid var(--border-strong)", borderRadius: 6, padding: "6px 9px", color: "var(--text)", font: "inherit", fontSize: 12 }} />
              </label>
            ))}
          </div>
          {error && <div style={{ marginTop: 10, padding: "8px 11px", background: "var(--high-dim)", border: "1px solid var(--high)", borderRadius: 6, color: "var(--high)", fontSize: 12 }}>{error}</div>}
        </div>
      )}

      {/* main grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 372px", gap: 12, alignItems: "start" }}>
        {/* left */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          {/* imagery */}
          <Panel title="검사 영상 · Wafer Map / Grad-CAM / ROI" icon="layers" dense
            right={<span className="mono" style={{ fontSize: 10.5, color: "var(--text-3)" }}>{insp.dieTotal} die · {insp.dieFail} flagged</span>}>
            <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
              <figure style={{ margin: 0, textAlign: "center" }}>
                {insp.imageUrl
                  ? <img src={`${imageBase}${insp.imageUrl}`} alt="wafer map"
                      style={{ width: 236, height: 236, objectFit: "contain", borderRadius: 8, background: "var(--panel-2)" }} />
                  : <WaferMap map={insp.waferMap} size={236} scanning={scanning} />}
                <figcaption style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 12 }}>Wafer Map · {insp.wafer}</figcaption>
              </figure>
              <figure style={{ margin: 0, textAlign: "center" }}>
                {insp.overlayUrl
                  ? <img src={`${imageBase}${insp.overlayUrl}`} alt="grad-cam"
                      style={{ width: 236, height: 236, objectFit: "contain", borderRadius: 8, background: "#0b1a2e" }} />
                  : <GradCAM size={236} hot={hot} />}
                <figcaption style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 6 }}>Grad-CAM 활성화 맵</figcaption>
              </figure>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span className="label-cap">ROI 확대 (3)</span>
                {insp.roiUrl
                  ? <>
                      <img src={`${imageBase}${insp.roiUrl}`} alt="roi"
                        style={{ width: 116, height: 116, objectFit: "contain", borderRadius: 6, background: "var(--panel-2)", border: "1px solid var(--border-strong)" }} />
                      <ROIPatch label="ROI-2" defect={insp.defectType} sev="low" />
                      <ROIPatch label="ROI-3" defect={insp.defectType} sev="med" />
                    </>
                  : <>
                      <ROIPatch label="ROI-1" defect={insp.defectType} sev="low" />
                      <ROIPatch label="ROI-2" defect={insp.defectType} sev="low" />
                      <ROIPatch label="ROI-3" defect={insp.defectType} sev="med" />
                    </>}
              </div>
            </div>
          </Panel>

          {/* AI report */}
          <Panel title="AI 분석 리포트" icon="bot" dense
            right={<><span className="chip" style={{ fontSize: 9.5 }}>{insp.modelVersion || "v4.2.1"}</span><span className="mono" style={{ fontSize: 10, color: "var(--text-3)" }}>ko-KR</span></>}>
            <div style={{ fontSize: 12.5, lineHeight: 1.72, color: "var(--text-2)", whiteSpace: "pre-wrap", textWrap: "pretty" }}>
              {(insp.report || "").split("**").map((seg, i) =>
                i % 2 ? <strong key={i} style={{ color: "var(--text)", fontWeight: 650 }}>{seg}</strong> : seg
              )}
            </div>
          </Panel>

          {/* metrology + defect bars */}
          <div style={{ display: "grid", gridTemplateColumns: "1.25fr 1fr", gap: 12, alignItems: "start" }}>
            <MetrologyTable rows={insp.metrology} />
            <Panel title="결함 카테고리 빈도 · 7d" icon="activity" dense>
              <DefectCatBars data={defectCats} />
            </Panel>
          </div>

          <Panel title="리스크 점수 분포 · 24h" icon="pulse" dense
            right={<span className="mono" style={{ fontSize: 10.5, color: "var(--text-3)" }}>595 inspections</span>}>
            <RiskHistogram data={riskHist} />
          </Panel>
        </div>

        {/* right — Action Card (sticky) */}
        <div style={{ position: "sticky", top: 0 }}>
          <ActionCard insp={insp} />
        </div>
      </div>
    </div>
  );
}
