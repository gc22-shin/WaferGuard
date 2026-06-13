import React from "react";

const DIE_COLOR = {
  good:     "var(--low)",
  marginal: "var(--med)",
  fail:     "#ce48d6",
};

export function buildWaferMap(failRate, clusterBias) {
  const N = 21;
  const cells = [];
  const R = N / 2 - 0.5;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const dx = c - (N - 1) / 2, dy = r - (N - 1) / 2;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > R) continue;
      let status = "good";
      const edge = dist > R - 1.15;
      const h = Math.abs(Math.sin((r * 928.3 + c * 71.7)) * 43758.5453) % 1;
      const clusterPull = clusterBias ? Math.max(0, 1 - Math.hypot(c - 15, r - 5) / 4) : 0;
      const p = failRate + clusterPull * 0.6;
      if (h < p * 0.55) status = "fail";
      else if (h < p) status = "marginal";
      else if (edge && h < 0.30) status = "marginal";
      cells.push({ r, c, status, dist, edge });
    }
  }
  return { N, cells };
}

export function WaferMap({ map, size = 240, scanning = false }) {
  const { N, cells } = map;
  const pad = 10;
  const inner = size - pad * 2;
  const cell = inner / N;
  const gap = cell * 0.14;
  const counts = cells.reduce((a, c) => (a[c.status] = (a[c.status] || 0) + 1, a), {});
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size}>
        <defs>
          <clipPath id="waferClip">
            <circle cx={size / 2} cy={size / 2} r={inner / 2} />
          </clipPath>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={inner / 2} fill="var(--panel-2)" stroke="var(--border-strong)" strokeWidth="1.5" />
        <g clipPath="url(#waferClip)">
          {cells.map((c, i) => {
            const x = pad + c.c * cell + gap / 2;
            const y = pad + c.r * cell + gap / 2;
            const col = DIE_COLOR[c.status];
            const op = c.status === "good" ? 0.5 : 0.95;
            return <rect key={i} x={x} y={y} width={cell - gap} height={cell - gap} rx={cell * 0.12}
              fill={col} opacity={op}
              style={{ animation: c.status !== "good" ? `fadeIn .3s ${0.2 + i * 0.002}s both` : undefined }} />;
          })}
          {scanning && <rect x={pad} width={inner} height={cell * 1.4} fill="var(--accent)" opacity="0.5"
            style={{ animation: "scan 1.6s linear infinite", filter: "blur(2px)" }} />}
        </g>
        <path d={`M${size / 2 - 7} ${size - pad - 2} L${size / 2} ${size - pad + 5} L${size / 2 + 7} ${size - pad - 2}Z`}
          fill="var(--bg)" stroke="var(--border-strong)" strokeWidth="1.5" />
      </svg>
      <div style={{ position: "absolute", bottom: -2, left: "50%", transform: "translateX(-50%)",
        display: "flex", gap: 11, fontSize: 9.5 }} className="mono">
        {[["good", "정상", counts.good || 0], ["marginal", "경계", counts.marginal || 0], ["fail", "결함", counts.fail || 0]].map(([k, ko, n]) => (
          <span key={k} style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--text-3)" }}>
            <span style={{ width: 7, height: 7, borderRadius: 2, background: DIE_COLOR[k] }} />{ko} {n}
          </span>
        ))}
      </div>
    </div>
  );
}

export function GradCAM({ size = 240, hot = "edge" }) {
  const blobs = hot === "cluster"
    ? [{ x: 0.78, y: 0.30, r: 0.30, i: 1 }, { x: 0.70, y: 0.42, r: 0.18, i: 0.7 }, { x: 0.5, y: 0.5, r: 0.5, i: 0.18 }]
    : [{ x: 0.86, y: 0.46, r: 0.22, i: 0.7 }, { x: 0.5, y: 0.5, r: 0.6, i: 0.12 }, { x: 0.2, y: 0.66, r: 0.12, i: 0.25 }];
  const inner = size - 20, cx = size / 2, cy = size / 2;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size}>
        <defs>
          <clipPath id="camClip"><circle cx={cx} cy={cy} r={inner / 2} /></clipPath>
          <radialGradient id="camCool"><stop offset="0%" stopColor="#1e3a5f" /><stop offset="100%" stopColor="#0b1a2e" /></radialGradient>
          {blobs.map((b, i) => (
            <radialGradient key={i} id={`camHot${i}`}>
              <stop offset="0%" stopColor={b.i > 0.6 ? "#ff4a36" : b.i > 0.3 ? "#c8d83c" : "#3d7bec"} stopOpacity={b.i} />
              <stop offset="45%" stopColor={b.i > 0.5 ? "#c8d83c" : "#3d7bec"} stopOpacity={b.i * 0.5} />
              <stop offset="100%" stopColor="#3d7bec" stopOpacity="0" />
            </radialGradient>
          ))}
        </defs>
        <circle cx={cx} cy={cy} r={inner / 2} fill="url(#camCool)" stroke="var(--border-strong)" strokeWidth="1.5" />
        <g clipPath="url(#camClip)">
          {blobs.map((b, i) => (
            <circle key={i} cx={10 + b.x * inner} cy={10 + b.y * inner} r={b.r * inner} fill={`url(#camHot${i})`}
              style={{ filter: "blur(3px)", animation: `fadeIn .5s ${i * 0.1}s both` }} />
          ))}
          <circle cx={10 + blobs[0].x * inner} cy={10 + blobs[0].y * inner} r={blobs[0].r * inner * 0.5}
            fill="none" stroke="#ffce6a" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.55" />
        </g>
        <path d={`M${cx - 7} ${size - 12} L${cx} ${size - 5} L${cx + 7} ${size - 12}Z`} fill="var(--bg)" stroke="var(--border-strong)" strokeWidth="1.5" />
      </svg>
      <div style={{ position: "absolute", top: 8, right: 8, display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-end" }}>
        <span className="mono" style={{ fontSize: 8.5, color: "#ff6a5a" }}>■ high act.</span>
        <span className="mono" style={{ fontSize: 8.5, color: "#3d7bec" }}>■ low act.</span>
      </div>
    </div>
  );
}

export function ROIPatch({ label, defect, sev = "low", w = 116, h = 116 }) {
  const fid = "g" + label.replace(/[^a-z0-9]/gi, "");
  const c = sev === "high" ? "var(--high)" : sev === "med" ? "var(--med)" : "var(--accent)";
  return (
    <div style={{ position: "relative", width: w, height: h, borderRadius: 6, overflow: "hidden", border: "1px solid var(--border-strong)", flex: "none" }}>
      <svg width={w} height={h} style={{ display: "block" }}>
        <defs>
          <filter id={fid}><feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="3" seed={label.length * 7} /><feColorMatrix type="saturate" values="0" /></filter>
          <linearGradient id={fid + "v"} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3a4a5a" /><stop offset="100%" stopColor="#161e26" /></linearGradient>
        </defs>
        <rect width={w} height={h} fill={`url(#${fid}v)`} />
        <rect width={w} height={h} filter={`url(#${fid})`} opacity="0.32" />
        {Array.from({ length: 7 }).map((_, i) => <line key={i} x1={i * w / 7 + 4} y1="0" x2={i * w / 7 + 4} y2={h} stroke="#5a6b7d" strokeWidth="0.5" opacity="0.4" />)}
        <rect x={w * 0.52} y={h * 0.3} width={w * 0.3} height={h * 0.34} rx="2" fill="none" stroke={c} strokeWidth="1.5" />
        <circle cx={w * 0.67} cy={h * 0.47} r="4.5" fill={c} opacity="0.65" style={{ filter: "blur(1px)" }} />
      </svg>
      <div style={{ position: "absolute", top: 4, left: 5, fontSize: 8.5, fontWeight: 600, color: "#cdd8e4", background: "rgba(0,0,0,.45)", padding: "1px 5px", borderRadius: 3 }} className="mono">{label}</div>
      <div style={{ position: "absolute", bottom: 4, left: 5, fontSize: 8.5, color: c, background: "rgba(0,0,0,.45)", padding: "1px 5px", borderRadius: 3 }} className="mono">{defect}</div>
      <div style={{ position: "absolute", bottom: 4, right: 5, fontSize: 8, color: "#8493a4", background: "rgba(0,0,0,.4)", padding: "1px 4px", borderRadius: 3 }} className="mono">×{sev === "high" ? "40k" : "12k"}</div>
    </div>
  );
}
