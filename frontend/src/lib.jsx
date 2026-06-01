import React, { useLayoutEffect, useRef, useState } from "react";

// ── Icon ─────────────────────────────────────────────────────────────────────
const PATHS = {
  play:    "M5 4l13 8-13 8V4z",
  flag:    "M5 3v18 M5 4h12l-2.5 4L17 12H5",
  note:    "M5 3h10l4 4v14H5z M15 3v4h4 M8 11h8 M8 15h8 M8 19h5",
  check:   "M4 12l5 5L20 6",
  alert:   "M12 3l9 16H3z M12 9v5 M12 17v.5",
  chevR:   "M9 6l6 6-6 6",
  chevD:   "M6 9l6 6 6-6",
  search:  "M11 4a7 7 0 105 12l4 4",
  refresh: "M3 11a8 8 0 0114-5l3 3 M21 5v4h-4 M21 13a8 8 0 01-14 5l-3-3 M3 19v-4h4",
  send:    "M4 12l16-8-6 16-3-6-7-2z",
  bot:     "M9 4h6 M12 4v3 M5 7h14v11H5z M9 12v2 M15 12v2 M3 12h2 M19 12h2",
  activity:"M3 12h4l3 8 4-16 3 8h4",
  layers:  "M12 3l9 5-9 5-9-5 9-5z M3 13l9 5 9-5 M3 17l9 5 9-5",
  file:    "M6 3h8l5 5v13H6z M14 3v5h5 M9 13h6 M9 17h6",
  cpu:     "M7 7h10v10H7z M9 9h6v6H9z M4 10v4 M20 10v4 M10 4h4 M10 20h4",
  shield:  "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4",
  x:       "M6 6l12 12 M18 6L6 18",
  sun:     "M12 7a5 5 0 100 10 5 5 0 000-10z M12 2v2 M12 20v2 M4 12H2 M22 12h-2 M5 5l1.5 1.5 M17.5 17.5L19 19 M19 5l-1.5 1.5 M6.5 17.5L5 19",
  moon:    "M20 14a8 8 0 11-9-11 6.5 6.5 0 009 11z",
  gauge:   "M5 18a9 9 0 1114 0 M12 18l4-6",
  box:     "M3 7l9-4 9 4v10l-9 4-9-4z M3 7l9 4 9-4 M12 11v10",
  pulse:   "M3 12h4l2-6 4 14 2-8h6",
  history: "M3 12a9 9 0 109-9 9 9 0 00-7 3.5 M3 4v4h4 M12 8v4l3 2",
  flask:   "M9 3h6 M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3 M7 16h10",
  radio:   "M12 11a1.5 1.5 0 100 3 1.5 1.5 0 000-3z M8 8a6 6 0 000 9 M16 8a6 6 0 010 9 M5 5a10 10 0 000 15 M19 5a10 10 0 010 15",
  promote: "M12 19V6 M6 12l6-6 6 6",
  rollback:"M12 5v13 M6 12l6 6 6-6",
  handoff: "M3 12h12 M11 8l4 4-4 4 M21 5v14",
  zoom:    "M11 4a7 7 0 105 12l4 4 M8 11h6 M11 8v6",
};

export function Icon({ name, size = 15, style }) {
  const p = PATHS[name] || "M12 12h.01";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"
         strokeLinejoin="round" style={style} aria-hidden="true">
      {p.split(" M").map((seg, i) => <path key={i} d={(i ? "M" : "") + seg} />)}
    </svg>
  );
}

// ── Status helpers ────────────────────────────────────────────────────────────
export const RISK_META = {
  Low:    { c: "var(--low)",  bg: "var(--low-dim)",  label: "LOW",  ko: "안정" },
  Medium: { c: "var(--med)",  bg: "var(--med-dim)",  label: "MED",  ko: "주의" },
  High:   { c: "var(--high)", bg: "var(--high-dim)", label: "HIGH", ko: "위험" },
};

export function RiskBadge({ level, score, size = "md" }) {
  const m = RISK_META[level] || RISK_META.Low;
  const big = size === "lg";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: big ? 8 : 6,
      padding: big ? "5px 11px" : "3px 8px", borderRadius: 7,
      background: m.bg, border: `1px solid ${m.c}`, color: m.c,
      fontWeight: 700, fontSize: big ? 13 : 11, letterSpacing: ".04em",
    }}>
      <span style={{ width: big ? 8 : 6, height: big ? 8 : 6, borderRadius: 99, background: m.c,
        boxShadow: `0 0 8px ${m.c}` }} />
      {m.label}
      {score != null && <span className="mono" style={{ opacity: .85 }}>{score}</span>}
    </span>
  );
}

export function StatusDot({ kind }) {
  const map = {
    production: "var(--low)", staging: "var(--accent)", rollback: "var(--med)",
    archived: "var(--text-3)", success: "var(--low)", running: "var(--accent)",
    failed: "var(--high)", escalated: "var(--med)", ok: "var(--low)", watch: "var(--med)",
    active: "var(--low)", warn: "var(--med)", info: "var(--accent)",
    resolved: "var(--low)", monitored: "var(--accent)",
  };
  const c = map[kind] || "var(--text-3)";
  return (
    <span style={{ width: 7, height: 7, borderRadius: 99, background: c,
      display: "inline-block", boxShadow: `0 0 6px ${c}`, flex: "none" }} />
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────
export function Panel({ title, icon, right, children, pad = 14, className = "", style, dense }) {
  return (
    <section className={`panel ${className}`} style={style}>
      {title && (
        <header style={{
          display: "flex", alignItems: "center", gap: 9,
          padding: dense ? "9px 12px" : "11px 14px",
          borderBottom: "1px solid var(--border)",
        }}>
          {icon && <span style={{ color: "var(--accent)", display: "flex" }}><Icon name={icon} size={15} /></span>}
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 650, letterSpacing: "-.01em", color: "var(--text)", whiteSpace: "nowrap" }}>{title}</h3>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>{right}</div>
        </header>
      )}
      <div style={{ padding: pad }}>{children}</div>
    </section>
  );
}

// ── Metric ────────────────────────────────────────────────────────────────────
export function Metric({ label, value, unit, sub, accent, mono = true }) {
  return (
    <div>
      <div className="label-cap" style={{ marginBottom: 3 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
        <span className={mono ? "mono" : ""} style={{ fontSize: 22, fontWeight: 600, color: accent || "var(--text)", lineHeight: 1 }}>{value}</span>
        {unit && <span className="mono" style={{ fontSize: 12, color: "var(--text-3)" }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

// ── RiskGauge ─────────────────────────────────────────────────────────────────
export function RiskGauge({ score, level, size = 132 }) {
  const m = RISK_META[level] || RISK_META.Low;
  const r = size / 2 - 11;
  const sweep = 0.75;
  const circ = 2 * Math.PI * r;
  const arcLen = circ * sweep;
  const filled = arcLen * (score / 100);
  const cx = size / 2, cy = size / 2;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size}>
        <g transform={`rotate(135 ${cx} ${cy})`}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth="9"
            strokeDasharray={`${arcLen} ${circ}`} strokeLinecap="round" />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={m.c} strokeWidth="9"
            strokeDasharray={`${filled} ${circ}`} strokeLinecap="round"
            style={{ transition: "stroke-dasharray .4s ease, stroke .3s ease", filter: `drop-shadow(0 0 5px ${m.c}66)` }} />
        </g>
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span className="mono" style={{ fontSize: 34, fontWeight: 600, color: m.c, lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 2, letterSpacing: ".06em" }}>RISK / 100</span>
      </div>
    </div>
  );
}

// ── Progress ──────────────────────────────────────────────────────────────────
export function Progress({ value, color = "var(--accent)", height = 6 }) {
  return (
    <div style={{ background: "var(--panel-2)", borderRadius: 99, height, overflow: "hidden", border: "1px solid var(--border-soft)" }}>
      <div style={{ width: `${Math.min(100, Math.round(value * 100))}%`, height: "100%", background: color,
        borderRadius: 99, transition: "width .4s ease" }} />
    </div>
  );
}

// ── useWidth ─────────────────────────────────────────────────────────────────
export function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(320);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    setW(ref.current.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export function ChartFrame({ children, height = 150 }) {
  const [ref, w] = useWidth();
  return <div ref={ref} style={{ width: "100%" }}>{w > 0 && children(w, height)}</div>;
}
