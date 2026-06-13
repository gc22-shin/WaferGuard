import React, { useCallback, useEffect, useState } from "react";
import { Panel, Metric, Icon } from "./lib";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const DEFECT_LABELS = {
  "Center": "Center",
  "Donut": "Donut",
  "Edge-Loc": "Edge-Loc",
  "Edge-Ring": "Edge-Ring",
  "Loc": "Loc",
  "Random": "Random",
  "Scratch": "Scratch",
  "Near-full": "Near-full",
  "None": "None · 정상",
};

const SOURCE_META = {
  engineer_chat:      { label: "엔지니어 학습", learned: true },
  engineer_confirmed: { label: "엔지니어 확정", learned: true },
  case_library:       { label: "표준 사례",     learned: false },
  rag_documents:      { label: "지식베이스",     learned: false },
  sop:                { label: "SOP",          learned: false },
};

function sourceMeta(src) {
  return SOURCE_META[src] || { label: src || "지식베이스", learned: false };
}

function SourceBadge({ source }) {
  const m = sourceMeta(source);
  return (
    <span className="chip" style={{
      fontSize: 9, fontWeight: 600,
      color: m.learned ? "var(--low)" : "var(--text-3)",
      borderColor: m.learned ? "var(--low)" : "var(--border)",
    }}>
      {m.learned && <Icon name="check" size={9} style={{ marginRight: 3 }} />}
      {m.label}
    </span>
  );
}

function CaseCard({ c }) {
  const sim = Math.round((c.similarity || 0) * 100);
  return (
    <div className="panel-inset" style={{ padding: 13, display: "flex", flexDirection: "column", gap: 9 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span className="mono" style={{ fontSize: 10.5, color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {c.case_id || "—"}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <span className="mono" style={{ fontSize: 14, fontWeight: 600, color: "var(--accent)" }}>{sim}%</span>
          <span className="label-cap" style={{ fontSize: 8.5 }}>유사</span>
        </span>
      </div>
      <div style={{ height: 3, background: "var(--panel-3)", borderRadius: 99 }}>
        <div style={{ width: `${sim}%`, height: "100%", background: "var(--accent)", borderRadius: 99 }} />
      </div>
      <div style={{ fontSize: 12.5, color: "var(--text)", fontWeight: 600, lineHeight: 1.4 }}>{c.title}</div>
      {c.summary && (
        <div style={{ fontSize: 11, color: "var(--text-2)", lineHeight: 1.5 }}>{c.summary}</div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {c.equipment && <span className="mono" style={{ fontSize: 10.5, color: "var(--text-3)" }}>{c.equipment}</span>}
        {c.date && <span className="mono" style={{ fontSize: 10.5, color: "var(--text-3)" }}>· {c.date}</span>}
        <SourceBadge source={c.source} />
      </div>
      {c.action && (
        <>
          <div className="divider" style={{ margin: "2px 0" }} />
          <div>
            <div className="label-cap" style={{ fontSize: 8.5, marginBottom: 3 }}>권장 조치</div>
            <div style={{ fontSize: 11.5, color: "var(--text-2)", lineHeight: 1.45 }}>{c.action}</div>
          </div>
        </>
      )}
    </div>
  );
}

export default function RagView() {
  const [stats, setStats] = useState(null);
  const [evalSet, setEvalSet] = useState(null);
  const [defectType, setDefectType] = useState("Edge-Ring");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);

  const runSearch = useCallback(async (dt, q) => {
    setSearching(true);
    try {
      const url = `${API_BASE}/api/v1/rag/search?defect_type=${encodeURIComponent(dt)}&q=${encodeURIComponent(q || "")}&k=6`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setResult(await res.json());
      setError(null);
    } catch (e) {
      setError(`케이스 검색 실패: ${e.message}`);
    } finally {
      setSearching(false);
    }
  }, []);

  // initial load: index stats + eval guardrails, then a default search
  useEffect(() => {
    (async () => {
      try {
        const [si, ev] = await Promise.all([
          fetch(`${API_BASE}/api/v1/rag/index`).then(r => r.json()),
          fetch(`${API_BASE}/api/v1/rag/evaluation`).then(r => r.json()),
        ]);
        setStats(si);
        setEvalSet(ev);
        const types = si?.defect_types || [];
        const initial = types.includes("Edge-Ring") ? "Edge-Ring" : (types[0] || "Edge-Ring");
        setDefectType(initial);
        runSearch(initial, "");
      } catch (e) {
        setError(`RAG 인덱스 조회 실패: ${e.message}`);
      }
    })();
  }, [runSearch]);

  function selectType(dt) {
    setDefectType(dt);
    runSearch(dt, query);
  }

  function submitSearch(e) {
    e?.preventDefault();
    runSearch(defectType, query);
  }

  const types = stats?.defect_types || [];
  const byType = stats?.by_type || {};
  const guardrails = evalSet?.guardrails || [];
  const questionCount = evalSet?.summary?.question_count ?? (evalSet?.questions?.length || 0);
  const sourceLabel = stats?.source === "vector" ? "벡터 검색" : "사례 라이브러리";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* index stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
        <Panel dense pad={13}>
          <Metric label="인덱스 문서" value={(stats?.indexed ?? 0).toLocaleString()} accent="var(--accent)" />
        </Panel>
        <Panel dense pad={13}>
          <Metric label="결함 클래스" value={types.length || "—"} accent="var(--text)" />
        </Panel>
        <Panel dense pad={13}>
          <Metric label="검색 방식" value={sourceLabel} sub={stats?.retrieval} accent="var(--low)" mono={false} />
        </Panel>
        <Panel dense pad={13}>
          <Metric label="가드레일" value={guardrails.length || "—"} sub={`평가 질문 ${questionCount}건`} accent="var(--text)" />
        </Panel>
      </div>

      {/* case search */}
      <Panel title="유사 과거 케이스 검색 (RAG)" icon="search" dense
        right={result && (
          <span className="mono" style={{ fontSize: 10.5, color: "var(--text-3)" }}>
            {result.source === "vector" ? "벡터" : "라이브러리"} · {result.count}건
          </span>
        )}>
        {/* defect-type chips */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {types.map(dt => {
            const on = dt === defectType;
            const n = byType[dt];
            return (
              <button key={dt} onClick={() => selectType(dt)} className="focusable"
                style={{
                  cursor: "pointer", font: "inherit", padding: "5px 10px", borderRadius: 7,
                  fontSize: 11, fontWeight: on ? 600 : 500,
                  border: "1px solid " + (on ? "var(--accent)" : "var(--border)"),
                  background: on ? "var(--accent-dim)" : "transparent",
                  color: on ? "var(--accent)" : "var(--text-2)",
                  transition: "background .15s, color .15s, border-color .15s",
                }}>
                {DEFECT_LABELS[dt] || dt}
                {typeof n === "number" && (
                  <span className="mono" style={{ fontSize: 9.5, marginLeft: 6, opacity: 0.7 }}>{n}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* keyword search */}
        <form onSubmit={submitSearch} style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <div style={{ position: "relative", flex: 1 }}>
            <Icon name="search" size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)" }} />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="키워드로 케이스 좁히기 (예: EBR nozzle, 슬러리 유량, 파티클)"
              style={{
                width: "100%", boxSizing: "border-box", font: "inherit", fontSize: 12,
                padding: "8px 10px 8px 30px", borderRadius: 8,
                border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--text)",
              }}
            />
          </div>
          <button type="submit" className="btn" disabled={searching}
            style={{ padding: "0 16px", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
            {searching ? "검색 중…" : "검색"}
          </button>
        </form>

        {error && (
          <div style={{ fontSize: 12, color: "var(--high)", marginBottom: 10 }}>{error}</div>
        )}

        {result && result.cases.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
            {result.cases.map((c, i) => <CaseCard key={c.case_id || i} c={c} />)}
          </div>
        ) : (
          !searching && !error && (
            <div style={{ padding: "22px 0", textAlign: "center", color: "var(--text-3)", fontSize: 12 }}>
              검색 결과가 없습니다.
            </div>
          )
        )}
      </Panel>

      {/* answer guardrails */}
      {guardrails.length > 0 && (
        <Panel title="응답 가드레일 · 근거 기반 답변 규칙" icon="shield" dense
          right={<span className="mono" style={{ fontSize: 10.5, color: "var(--text-3)" }}>평가셋 {questionCount}문항</span>}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {guardrails.map((g, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                <span style={{ color: "var(--low)", flexShrink: 0, marginTop: 1 }}>
                  <Icon name="shield" size={13} />
                </span>
                <span style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.5 }}>{g}</span>
              </div>
            ))}
          </div>
          {evalSet?.summary?.required_answer_style && (
            <div className="panel-inset" style={{ marginTop: 12, padding: "9px 11px" }}>
              <span className="label-cap" style={{ fontSize: 8.5 }}>요구 답변 형식</span>
              <div style={{ fontSize: 11.5, color: "var(--text-2)", lineHeight: 1.5, marginTop: 3 }}>
                {evalSet.summary.required_answer_style}
              </div>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
