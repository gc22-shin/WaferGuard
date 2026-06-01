import React, { useState } from "react";
import { Icon, Panel, StatusDot } from "./lib";
import { handoffMock } from "./mock";

export default function HandoffView() {
  const [status, setStatus]   = useState(handoffMock.status);
  const [recip, setRecip]     = useState(handoffMock.recipients);
  const [bullets, setBullets] = useState(handoffMock.bullets);
  const [editing, setEditing] = useState(false);
  const sent = status === "sent";
  const s = handoffMock.summary;

  function send() {
    if (sent) return;
    setStatus("sent");
    setTimeout(() => setRecip(r => r.map((x, i) => i === 0 ? { ...x, confirmed: true } : x)), 1200);
    setTimeout(() => setRecip(r => r.map((x, i) => i === 1 ? { ...x, confirmed: true } : x)), 2600);
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.55fr 1fr", gap: 12, alignItems: "start" }}>
      <Panel title="교대 Daily Report · 자동 생성" icon="file" dense
        right={
          <span className="chip" style={{ color: sent ? "var(--low)" : "var(--text-3)", borderColor: sent ? "var(--low)" : "var(--border-strong)" }}>
            <StatusDot kind={sent ? "success" : "archived"} />
            {sent ? "발송 완료" : "초안 (DRAFT)"}
          </span>}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 650, color: "var(--text)" }}>{handoffMock.shift}</div>
            <div className="mono" style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{handoffMock.period}</div>
          </div>
          <div className="mono" style={{ fontSize: 10.5, color: "var(--text-3)", textAlign: "right" }}>자동 생성<br />{handoffMock.generatedAt}</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 1, background: "var(--border)", borderRadius: 8, overflow: "hidden", marginBottom: 14 }}>
          {[
            ["검사 수행", s.inspections.toLocaleString(), "var(--text)"],
            ["High / Med", `${s.highAlerts} / ${s.medAlerts}`, "var(--med)"],
            ["자동 해결", s.autoResolved, "var(--low)"],
            ["사람 리뷰", s.humanReview, "var(--accent)"],
          ].map(([l, v, c], i) => (
            <div key={i} style={{ background: "var(--panel-2)", padding: "10px 12px" }}>
              <div className="label-cap" style={{ fontSize: 9 }}>{l}</div>
              <div className="mono" style={{ fontSize: 18, fontWeight: 600, color: c, marginTop: 3 }}>{v}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
          <span className="label-cap">주요 항목 · 인수 내용</span>
          <button className="btn btn-ghost" style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => setEditing(e => !e)}>
            <Icon name="note" size={12} />{editing ? "완료" : "편집"}
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {bullets.map((b, i) => (
            <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start", background: "var(--panel-2)", border: "1px solid var(--border-soft)", borderRadius: 7, padding: "9px 11px" }}>
              <span style={{ color: "var(--accent)", marginTop: 2, flex: "none" }}><Icon name="chevR" size={12} /></span>
              {editing
                ? <input value={b} onChange={e => setBullets(bs => bs.map((x, j) => j === i ? e.target.value : x))}
                    className="mono focusable" style={{ flex: 1, background: "transparent", border: "none", color: "var(--text)", font: "inherit", fontSize: 12, outline: "none" }} />
                : <span style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.5, flex: 1 }}>{b}</span>}
            </div>
          ))}
        </div>
      </Panel>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Panel title="발송 · Dispatch" icon="send" dense>
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, background: "var(--low-dim)",
              border: "1px solid var(--low)", borderRadius: 7, padding: "9px 11px" }}>
              <Icon name="check" size={15} style={{ color: "var(--low)", flex: "none" }} />
              <span style={{ fontSize: 11.5, color: "var(--text-2)" }}>중복 발송 없음 — 이 교대 리포트는 미발송 상태</span>
            </div>
            <button className={`btn ${sent ? "" : "btn-accent"}`} disabled={sent} onClick={send} style={{ justifyContent: "center", padding: "10px" }}>
              <Icon name="send" size={15} />{sent ? "발송 완료됨" : "주간 B조에 발송"}
            </button>
            <div className="label-cap" style={{ marginTop: 4 }}>수신자 · 확인 상태</div>
            {recip.map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 0", borderBottom: i < recip.length - 1 ? "1px solid var(--border-soft)" : "none" }}>
                <div style={{ width: 30, height: 30, borderRadius: 99, background: "var(--panel-3)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)", flex: "none" }}>
                  <Icon name="shield" size={14} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                  <div className="mono" style={{ fontSize: 10, color: "var(--text-3)" }}>{r.role}</div>
                </div>
                <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 600, color: r.confirmed ? "var(--low)" : "var(--text-3)" }}>
                  <StatusDot kind={r.confirmed ? "success" : "archived"} />{r.confirmed ? "확인됨" : "대기"}
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="미해결 항목 · Open" icon="flag" dense
          right={<span className="mono" style={{ fontSize: 12, color: "var(--med)", fontWeight: 600 }}>{s.openItems}</span>}>
          <div style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 12, color: "var(--text-2)" }}>
            <div style={{ display: "flex", gap: 8 }}><StatusDot kind="watch" /> W13 사전점검 플래그 등록 필요</div>
            <div style={{ display: "flex", gap: 8 }}><StatusDot kind="watch" /> CMP-02 유량 재튜닝 결과 확인</div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
