import React from "react";
import { Icon, Panel, StatusDot } from "./lib";
import { ANOMALY_DEFECT_OPTIONS, useStream } from "./SettingsContext";

const STEP_OPTIONS = ["Lithography", "Etch", "Deposition", "CMP", "Cleaning", "Inspection"];

const inputStyle = {
  background: "var(--panel-2)", border: "1px solid var(--border-strong)",
  borderRadius: 6, padding: "6px 9px", color: "var(--text)",
  font: "inherit", fontSize: 12,
};

function Field({ label, children }) {
  return (
    <label style={{ display: "grid", gap: 4 }}>
      <span className="label-cap">{label}</span>
      {children}
    </label>
  );
}

export default function SettingsView() {
  const { settings, updateSettings, tick, inFlight, runOnce } = useStream();

  const setBase = (key, value) => updateSettings({ basePayload: { [key]: value } });
  const toggleDefect = (d) => {
    const has = settings.anomalyTypes.includes(d);
    const next = has ? settings.anomalyTypes.filter(x => x !== d) : [...settings.anomalyTypes, d];
    updateSettings({ anomalyTypes: next.length > 0 ? next : [d] });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Panel title="실시간 스트림 · Inspection Stream" icon="pulse" dense
        right={
          <span className="chip" style={{ color: settings.enabled ? "var(--low)" : "var(--text-3)", borderColor: settings.enabled ? "var(--low)" : "var(--border-strong)" }}>
            <StatusDot kind={settings.enabled ? "ok" : "idle"} />{settings.enabled ? "스트리밍" : "일시정지"}
          </span>
        }>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, alignItems: "start" }}>
          <Field label="스트림 활성화">
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                className={`btn ${settings.enabled ? "btn-accent" : ""}`}
                onClick={() => updateSettings({ enabled: !settings.enabled })}
                style={{ minWidth: 110 }}>
                <Icon name={settings.enabled ? "pause" : "play"} size={13} />
                {settings.enabled ? "일시정지" : "재개"}
              </button>
              <button className="btn btn-ghost" onClick={runOnce} disabled={inFlight} title="수동 1회 실행">
                <Icon name="refresh" size={13} style={inFlight ? { animation: "spin 1s linear infinite" } : undefined} />
                1회 실행
              </button>
            </div>
            <span style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 4 }}>누적 검사 {tick}건</span>
          </Field>

          <Field label={`스트림 주기 · ${settings.intervalMs} ms`}>
            <input type="range" min="500" max="10000" step="250"
              value={settings.intervalMs}
              onChange={e => updateSettings({ intervalMs: Number(e.target.value) })} />
            <span className="mono" style={{ fontSize: 10.5, color: "var(--text-3)" }}>0.5s — 10s</span>
          </Field>

          <Field label={`비정상 발생 확률 · ${(settings.anomalyRate * 100).toFixed(0)}%`}>
            <input type="range" min="0" max="1" step="0.01"
              value={settings.anomalyRate}
              onChange={e => updateSettings({ anomalyRate: Number(e.target.value) })} />
            <span className="mono" style={{ fontSize: 10.5, color: "var(--text-3)" }}>0% (전부 정상) — 100% (전부 비정상)</span>
          </Field>

          <Field label="Agent LLM 분석">
            <button
              className={`btn ${settings.useLlm ? "btn-accent" : ""}`}
              onClick={() => updateSettings({ useLlm: !settings.useLlm })}
              style={{ minWidth: 130 }}>
              <Icon name={settings.useLlm ? "bot" : "gauge"} size={13} />
              {settings.useLlm ? "실제 LLM 호출" : "룰 기반 폴백"}
            </button>
            <span style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 4, lineHeight: 1.5 }}>
              {settings.useLlm
                ? "Medium/High 검사마다 GPT-4o-mini 분석 (검사당 5초 내외)"
                : "LLM 호출 없이 즉시 처리 — 빠르지만 룰 기반 판단만 수행"}
            </span>
          </Field>
        </div>

        <div style={{ marginTop: 18 }}>
          <div className="label-cap" style={{ marginBottom: 8 }}>비정상 결함 유형 (선택된 유형만 주입됨)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {ANOMALY_DEFECT_OPTIONS.map(d => {
              const on = settings.anomalyTypes.includes(d);
              return (
                <button key={d} onClick={() => toggleDefect(d)}
                  className="focusable"
                  style={{
                    fontSize: 11.5, padding: "5px 10px", borderRadius: 99, cursor: "pointer",
                    border: `1px solid ${on ? "var(--accent)" : "var(--border-strong)"}`,
                    background: on ? "var(--accent-dim)" : "transparent",
                    color: on ? "var(--accent)" : "var(--text-2)",
                    font: "inherit",
                  }}>
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      </Panel>

      <Panel title="공정 기본값 · Base Process Context" icon="layers" dense>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 14 }}>
          {[
            ["Lot ID", "lot_id"],
            ["Line", "line_id"],
            ["Equipment", "equipment_id"],
            ["Recipe", "recipe_id"],
          ].map(([label, key]) => (
            <Field key={key} label={label}>
              <input type="text" value={settings.basePayload[key]}
                onChange={e => setBase(key, e.target.value)} style={inputStyle} />
            </Field>
          ))}
          <Field label="Step">
            <select value={settings.basePayload.process_step}
              onChange={e => setBase("process_step", e.target.value)} style={inputStyle}>
              {STEP_OPTIONS.map(o => <option key={o}>{o}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
          {[
            ["CD (nm)", "cd_nm"],
            ["Overlay (nm)", "overlay_nm"],
            ["Thickness (nm)", "film_thickness_nm"],
            ["Roughness (nm)", "roughness_nm"],
            ["Yield Proxy", "yield_proxy"],
          ].map(([label, key]) => (
            <Field key={key} label={label}>
              <input type="number" step="0.1" value={settings.basePayload[key]}
                onChange={e => setBase(key, Number(e.target.value))} style={inputStyle} />
            </Field>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 12, lineHeight: 1.6 }}>
          정상 데이터는 <span className="mono">defect_hint=None</span> 으로 주입되며, 비정상은 위에서 선택된 결함 유형에서 무작위로 선택됩니다.
          계측값은 매 검사마다 ±수% 지터를 가하여 자연스러운 변동을 만듭니다.
        </div>
      </Panel>
    </div>
  );
}
