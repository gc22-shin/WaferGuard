import React, { useState } from "react";
import { ChartFrame } from "./lib";

const BAND_COLOR = {
  low: "var(--low)", med: "var(--med)", high: "var(--high)", accent: "var(--accent)",
};

export function RiskHistogram({ data }) {
  const [hover, setHover] = useState(-1);
  return (
    <ChartFrame height={158}>{(W, H) => {
      const padL = 30, padB = 26, padT = 8, padR = 6;
      const cw = W - padL - padR, ch = H - padB - padT;
      const max = Math.max(...data.map(d => d.n));
      const bw = cw / data.length;
      const yt = [0, Math.round(max / 2), max];
      return (
        <svg width={W} height={H} className="fade-in">
          {yt.map((v, i) => {
            const y = padT + ch - (v / max) * ch;
            return (<g key={i}>
              <line x1={padL} x2={W - padR} y1={y} y2={y} stroke="var(--border)" strokeWidth="1" strokeDasharray={i ? "2 4" : ""} />
              <text x={padL - 6} y={y + 3} textAnchor="end" fontSize="9" fill="var(--text-3)" fontFamily="monospace">{v}</text>
            </g>);
          })}
          {data.map((d, i) => {
            const bh = (d.n / max) * ch;
            const x = padL + i * bw + bw * 0.16;
            const bwi = bw * 0.68;
            const y = padT + ch - bh;
            const c = BAND_COLOR[d.band];
            return (
              <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(-1)} style={{ cursor: "default" }}>
                <rect x={padL + i * bw} y={padT} width={bw} height={ch} fill="transparent" />
                <rect x={x} y={y} width={bwi} height={bh} rx="2" fill={c}
                  opacity={hover === -1 || hover === i ? 0.92 : 0.4}
                  style={{ transformOrigin: `center ${padT + ch}px`, animation: `barGrow .4s ${i * 0.03}s ease both`, transition: "opacity .15s" }} />
                {hover === i && (
                  <text x={x + bwi / 2} y={y - 5} textAnchor="middle" fontSize="10" fontFamily="monospace" fill="var(--text)" fontWeight="600">{d.n}</text>
                )}
                <text x={padL + i * bw + bw / 2} y={H - padB + 12} textAnchor="middle" fontSize="8" fill="var(--text-3)" fontFamily="monospace">{d.bin}</text>
              </g>
            );
          })}
        </svg>
      );
    }}</ChartFrame>
  );
}

export function DriftChart({ data, threshold }) {
  return (
    <ChartFrame height={158}>{(W, H) => {
      const padL = 30, padB = 22, padT = 10, padR = 8;
      const cw = W - padL - padR, ch = H - padB - padT;
      const max = 0.22;
      const X = i => padL + (i / (data.length - 1)) * cw;
      const Y = v => padT + ch - (v / max) * ch;
      const line = data.map((d, i) => `${X(i)},${Y(d.psi)}`).join(" ");
      const area = `${padL},${padT + ch} ${line} ${X(data.length - 1)},${padT + ch}`;
      const yThr = Y(threshold);
      return (
        <svg width={W} height={H} className="fade-in">
          <defs>
            <linearGradient id="driftFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 0.11, 0.22].map((v, i) => {
            const y = Y(v);
            return (<g key={i}>
              <line x1={padL} x2={W - padR} y1={y} y2={y} stroke="var(--border)" strokeWidth="1" strokeDasharray={i ? "2 4" : ""} />
              <text x={padL - 6} y={y + 3} textAnchor="end" fontSize="9" fill="var(--text-3)" fontFamily="monospace">{v.toFixed(2)}</text>
            </g>);
          })}
          <line x1={padL} x2={W - padR} y1={yThr} y2={yThr} stroke="var(--high)" strokeWidth="1.3" strokeDasharray="5 3" />
          <text x={W - padR} y={yThr - 5} textAnchor="end" fontSize="9" fontFamily="monospace" fill="var(--high)" fontWeight="600">임계 {threshold}</text>
          <polygon points={area} fill="url(#driftFill)" />
          <polyline points={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {data.map((d, i) => (
            <circle key={i} cx={X(i)} cy={Y(d.psi)} r={i === data.length - 1 ? 3.4 : 2}
              fill={i === data.length - 1 ? "var(--accent)" : "var(--bg)"} stroke="var(--accent)" strokeWidth="1.5" />
          ))}
          {data.map((d, i) => i % 3 === 0 && (
            <text key={i} x={X(i)} y={H - 6} textAnchor="middle" fontSize="8" fill="var(--text-3)" fontFamily="monospace">{d.d}</text>
          ))}
        </svg>
      );
    }}</ChartFrame>
  );
}

export function AlarmVolumeChart({ data }) {
  const [hover, setHover] = useState(-1);
  return (
    <ChartFrame height={150}>{(W, H) => {
      const padL = 24, padB = 22, padT = 10, padR = 6;
      const cw = W - padL - padR, ch = H - padB - padT;
      const max = Math.max(...data.map(d => d.n + d.high));
      const bw = cw / data.length;
      return (
        <svg width={W} height={H} className="fade-in">
          {[0, max].map((v, i) => {
            const y = padT + ch - (v / max) * ch;
            return (<g key={i}>
              <line x1={padL} x2={W - padR} y1={y} y2={y} stroke="var(--border)" strokeWidth="1" strokeDasharray={i ? "" : "2 4"} />
              <text x={padL - 5} y={y + 3} textAnchor="end" fontSize="9" fill="var(--text-3)" fontFamily="monospace">{v}</text>
            </g>);
          })}
          {data.map((d, i) => {
            const total = d.n + d.high;
            const bh = (total / max) * ch;
            const hh = (d.high / max) * ch;
            const x = padL + i * bw + bw * 0.18, bwi = bw * 0.64;
            const yBase = padT + ch;
            return (
              <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(-1)}>
                <rect x={x} y={yBase - bh} width={bwi} height={bh - hh} rx="1.5" fill="var(--accent)"
                  opacity={hover === -1 || hover === i ? 0.78 : 0.35} style={{ transition: "opacity .15s" }} />
                {d.high > 0 && <rect x={x} y={yBase - hh} width={bwi} height={hh} rx="1.5" fill="var(--high)" opacity="0.95" />}
                {i % 4 === 0 && <text x={x + bwi / 2} y={H - 6} textAnchor="middle" fontSize="8" fill="var(--text-3)" fontFamily="monospace">{d.h}</text>}
                {hover === i && <text x={x + bwi / 2} y={yBase - bh - 4} textAnchor="middle" fontSize="9.5" fontFamily="monospace" fontWeight="600" fill="var(--text)">{total}</text>}
              </g>
            );
          })}
        </svg>
      );
    }}</ChartFrame>
  );
}

export function DefectCatBars({ data }) {
  const max = Math.max(...data.map(d => d.n));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }} className="fade-in">
      {data.map((d, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "108px 1fr 38px", alignItems: "center", gap: 9 }}>
          <span style={{ fontSize: 11.5, color: "var(--text-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.cat}</span>
          <div style={{ height: 14, background: "var(--panel-2)", borderRadius: 4, overflow: "hidden", border: "1px solid var(--border-soft)" }}>
            <div style={{ width: `${(d.n / max) * 100}%`, height: "100%", background: BAND_COLOR[d.color] || "var(--accent)",
              borderRadius: 4, opacity: 0.85, transformOrigin: "left", animation: `barGrow .4s ${i * 0.04}s ease both` }} />
          </div>
          <span className="mono" style={{ fontSize: 11, color: "var(--text-2)", textAlign: "right" }}>{d.n}</span>
        </div>
      ))}
    </div>
  );
}

export function RetrainEffect({ data }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }} className="fade-in">
      {data.map((d, i) => {
        const norm = v => d.invert ? (1 - v) : v;
        const b = norm(d.before), a = norm(d.after);
        const fmt = v => d.metric === "AUROC" || d.metric === "Recall" || d.metric.includes("F1")
          ? v.toFixed(3) : (v * 100).toFixed(1) + "%";
        const improved = d.invert ? d.after < d.before : d.after > d.before;
        return (
          <div key={i}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
              <span style={{ fontSize: 11.5, color: "var(--text-2)" }}>{d.metric}</span>
              <span className="mono" style={{ fontSize: 11 }}>
                <span style={{ color: "var(--text-3)" }}>{fmt(d.before)}</span>
                <span style={{ color: "var(--text-3)", margin: "0 5px" }}>→</span>
                <span style={{ color: improved ? "var(--low)" : "var(--high)", fontWeight: 600 }}>{fmt(d.after)}</span>
              </span>
            </div>
            <div style={{ position: "relative", height: 8, background: "var(--panel-2)", borderRadius: 99, border: "1px solid var(--border-soft)" }}>
              <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${b * 100}%`,
                background: "var(--text-3)", borderRadius: 99, opacity: .5 }} />
              <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${a * 100}%`,
                background: "var(--low)", borderRadius: 99, animation: `barGrow .5s ${i * 0.05}s ease both`, transformOrigin: "left" }} />
            </div>
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 14, marginTop: 2, fontSize: 10 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--text-3)" }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: "var(--text-3)", opacity: .5 }} />v4.2.1 (before)
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--text-3)" }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: "var(--low)" }} />v4.3.0 (after)
        </span>
      </div>
    </div>
  );
}
