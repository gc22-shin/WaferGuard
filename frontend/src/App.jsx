import React, { useEffect, useRef, useState } from "react";
import { Icon, RiskBadge, StatusDot } from "./lib";
import { criticalAlertData } from "./mock";

import InspectionView  from "./InspectionView";
import MlopsView       from "./MlopsView";
import DatabaseView    from "./DatabaseView";
import AlertCenterView from "./AlertCenterView";
import SettingsView    from "./SettingsView";
import { SettingsProvider, useStream } from "./SettingsContext";

const NAV = [
  { id: "inspect", icon: "layers",  label: "실시간 검사",    en: "Live Inspection", View: InspectionView },
  { id: "mlops",   icon: "box",     label: "MLOps 콘솔",    en: "MLOps",           View: MlopsView },
  { id: "data",    icon: "history", label: "데이터 관리",    en: "Data & RAG",      View: DatabaseView },
  { id: "alert",   icon: "radio",   label: "Alert Center", en: "Alerts",          View: AlertCenterView, badge: 1 },
  { id: "settings",icon: "cpu",     label: "설정",          en: "Settings",        View: SettingsView },
];

function Clock() {
  const [t, setT] = useState("");
  useEffect(() => {
    const f = () => setT(new Date().toTimeString().slice(0, 8));
    f(); const id = setInterval(f, 1000); return () => clearInterval(id);
  }, []);
  return <span className="mono" style={{ fontSize: 12, color: "var(--text-2)" }}>{t}</span>;
}

function Logo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="var(--accent)" strokeWidth="1.6" />
        <circle cx="12" cy="12" r="4" stroke="var(--accent)" strokeWidth="1.6" />
        <path d="M12 3v4 M12 17v4 M3 12h4 M17 12h4" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="12" cy="12" r="1.4" fill="var(--accent)" />
      </svg>
      <div style={{ lineHeight: 1 }}>
        <div style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: "-.02em", color: "var(--text)" }}>WaferGuard</div>
        <div className="mono" style={{ fontSize: 8.5, color: "var(--text-3)", letterSpacing: ".08em", marginTop: 1 }}>FAB QUALITY OPS</div>
      </div>
    </div>
  );
}

function CriticalAlert({ data, onView, onClose }) {
  return (
    <div className="toast-in" style={{
      position: "fixed", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 200,
      width: "min(880px, calc(100vw - 32px))",
    }}>
      <div className="pulse-high" style={{
        display: "flex", alignItems: "center", gap: 14, padding: "13px 16px",
        background: "linear-gradient(90deg, color-mix(in oklab, var(--high) 22%, var(--panel)), var(--panel))",
        border: "1.5px solid var(--high)", borderRadius: 11,
        boxShadow: "0 12px 40px -10px var(--high-glow)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 38, height: 38, borderRadius: 9,
          background: "var(--high)", color: "#fff", flex: "none" }}>
          <Icon name="alert" size={20} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--high)", letterSpacing: ".02em" }}>CRITICAL · HIGH 리스크</span>
            <RiskBadge level="High" score={data.riskScore} />
            <span className="mono" style={{ fontSize: 10.5, color: "var(--text-3)" }}>{data.lot} · {data.wafer}</span>
          </div>
          <div style={{ fontSize: 12.5, color: "var(--text)", marginTop: 3, fontWeight: 500 }}>{data.title}</div>
          <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 2 }}>
            {data.cause} · <span className="mono">{data.tool}</span> · 영향 다이 <span className="mono" style={{ color: "var(--high)" }}>{data.affectedDie}</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "none" }}>
          <button className="btn btn-danger" onClick={onView}>조치 보기</button>
          <button className="btn btn-ghost" onClick={onClose} aria-label="닫기" style={{ padding: "7px 9px" }}><Icon name="x" size={15} /></button>
        </div>
      </div>
    </div>
  );
}

function Sidebar({ active, setActive }) {
  return (
    <nav style={{
      width: 212, flex: "none", background: "var(--bg-elev)",
      borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column",
      padding: "12px 10px", gap: 3,
      position: "sticky", top: 54, height: "calc(100vh - 54px)", overflowY: "auto",
    }}>
      <div className="label-cap" style={{ padding: "6px 8px 8px" }}>운영 섹션</div>
      {NAV.map(n => {
        const on = active === n.id;
        return (
          <button key={n.id} onClick={() => setActive(n.id)} className="focusable"
            style={{
              display: "flex", alignItems: "center", gap: 11, cursor: "pointer", position: "relative",
              padding: "8px 10px", borderRadius: 8, border: "1px solid transparent",
              font: "inherit", textAlign: "left", width: "100%",
              background: on ? "var(--accent-dim)" : "transparent",
              color: on ? "var(--accent)" : "var(--text-2)",
              transition: "background .15s, color .15s",
            }}>
            {on && <span style={{ position: "absolute", left: 0, top: 8, width: 3, height: "calc(100% - 16px)", background: "var(--accent)", borderRadius: 99 }} />}
            <span style={{ display: "flex", flex: "none" }}><Icon name={n.icon} size={17} /></span>
            <span style={{ fontSize: 12.5, fontWeight: on ? 600 : 500, flex: 1 }}>{n.label}</span>
            {n.badge && <span className="mono" style={{ fontSize: 10, color: "var(--high)", background: "var(--high-dim)", borderRadius: 99, padding: "1px 6px", fontWeight: 700 }}>{n.badge}</span>}
          </button>
        );
      })}
      <div style={{ marginTop: "auto", padding: "10px 8px 4px" }}>
        <div className="panel-inset" style={{ padding: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
            <span className="pulse-high" style={{ width: 7, height: 7, borderRadius: 99, background: "var(--low)" }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text)" }}>라인 정상 운영</span>
          </div>
          <div className="mono" style={{ fontSize: 9.5, color: "var(--text-3)", lineHeight: 1.5 }}>FAB-2 · ETCH/CMP<br />MTBF 312h · OEE 91%</div>
        </div>
      </div>
    </nav>
  );
}

function AppInner() {
  const [theme, setTheme]   = useState("dark");
  const [active, setActive] = useState("inspect");
  const [alert, setAlert]   = useState(false);
  const [alertData, setAlertData] = useState(criticalAlertData);
  const { latest, tick } = useStream();
  const lastAlertTick = useRef(0);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // auto-trigger critical alert when the stream emits a new High-risk inspection
  useEffect(() => {
    if (!latest || tick === lastAlertTick.current) return;
    if (latest.risk_level === "High") {
      lastAlertTick.current = tick;
      setAlertData({
        riskScore: Math.round((latest.risk_score ?? 0) * 100),
        lot: latest.lot_id || "LOT-?",
        wafer: latest.wafer_id || "W?",
        title: `High 리스크 — ${latest.defect_type || "결함"} 감지`,
        tool: `${latest.equipment_id || "?"} / ${latest.process_step || "?"}`,
        cause: latest.defect_type || "분류 불명",
        affectedDie: Math.round((latest.hotspot_ratio || 0) * 612),
      });
      setAlert(true);
    }
  }, [tick, latest]);

  const cur = NAV.find(n => n.id === active);
  const View = cur.View;

  function simulate() { setActive("alert"); setAlert(true); setAlertData(criticalAlertData); }

  return (
    <div style={{ minHeight: "100vh" }}>
      {alert && (
        <CriticalAlert
          data={alertData}
          onView={() => { setActive("inspect"); setAlert(false); }}
          onClose={() => setAlert(false)}
        />
      )}

      {/* top app bar */}
      <header style={{
        display: "flex", alignItems: "center", gap: 16, padding: "0 18px", height: 54,
        background: "var(--bg-elev)", borderBottom: "1px solid var(--border)",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <Logo />
        <div className="vdivider" style={{ height: 26 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="chip" style={{ color: "var(--low)", borderColor: "var(--low)" }}><StatusDot kind="ok" />시스템 정상</span>
          <span className="chip"><span style={{ color: "var(--text-3)" }}>모델</span> v4.2.1</span>
          <span className="chip"><span style={{ color: "var(--text-3)" }}>큐</span> <span className="mono">3 대기</span></span>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
          <button className="btn btn-ghost" onClick={simulate} style={{ color: "var(--high)" }}>
            <Icon name="alert" size={15} />알람 시뮬
          </button>
          <div className="vdivider" style={{ height: 22 }} />
          <div style={{ textAlign: "right", lineHeight: 1.2 }}>
            <div className="label-cap" style={{ fontSize: 8.5 }}>KST · 야간 A조</div>
            <Clock />
          </div>
          <button className="btn btn-ghost" onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}
            title="테마 전환" style={{ padding: "7px 9px" }}>
            <Icon name={theme === "dark" ? "sun" : "moon"} size={16} />
          </button>
        </div>
      </header>

      <div style={{ display: "flex", alignItems: "stretch" }}>
        <Sidebar active={active} setActive={setActive} />
        <main style={{ flex: 1, minWidth: 0, padding: 15, maxWidth: 1480, margin: "0 auto", width: "100%" }}>
          {/* context bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 15, paddingTop: 2 }}>
            <span style={{ color: "var(--accent)", display: "flex" }}><Icon name={cur.icon} size={18} /></span>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 650, letterSpacing: "-.02em", color: "var(--text)" }}>{cur.label}</h1>
            <span className="mono" style={{ fontSize: 11, color: "var(--text-3)", marginTop: 3 }}>/ {cur.en}</span>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
              <span className="kbd">⌘K</span>
              <span style={{ fontSize: 11, color: "var(--text-3)" }}>명령 팔레트</span>
            </div>
          </div>

          <div key={active} className="fade-in">
            {active === "alert"
              ? <AlertCenterView onSimulate={() => setAlert(true)} />
              : <View />}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <AppInner />
    </SettingsProvider>
  );
}
