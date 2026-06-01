import { buildWaferMap } from "./wafer";

// ── RAG mock ──────────────────────────────────────────────────────────────────
export const ragCases = [
  {
    id: "CASE-9F21", date: "2026-05-22", sim: 0.94, device: "N5P-SRAM-A0",
    title: "엣지 밴드 결함 — EBR 폭 변동", tool: "ETCH-04 / C2",
    action: "EBR recipe 0.2mm 축소 후 재검사", result: "resolved", resultLabel: "해결 (수율 +0.4%p)",
    riskThen: "Low",
  },
  {
    id: "CASE-8C07", date: "2026-04-30", sim: 0.88, device: "N5P-LOGIC-B2",
    title: "3시 방향 파티클 클러스터", tool: "ETCH-04 / C2",
    action: "챔버 PM(예방정비) 후 정상화", result: "resolved", resultLabel: "해결 (PM 적용)",
    riskThen: "Medium",
  },
  {
    id: "CASE-7A55", date: "2026-03-18", sim: 0.81, device: "N5P-SRAM-A1",
    title: "CMP 슬러리 유량 드리프트", tool: "CMP-02 / H1",
    action: "유량 PID 재튜닝, 24h 모니터", result: "monitored", resultLabel: "모니터 후 종결",
    riskThen: "Medium",
  },
];

export const ragMetrics = {
  recallAt3: 0.91, recallAt5: 0.96, precision: 0.88, indexed: 48213, latencyMs: 142,
};

// ── MLOps mock ────────────────────────────────────────────────────────────────
export const registry = [
  { ver: "v4.2.1", arch: "ViT-Defect-L", status: "production", auroc: 0.987, acc: 0.961, promoted: "2026-05-26", traffic: 100 },
  { ver: "v4.3.0-rc", arch: "ViT-Defect-L", status: "staging",  auroc: 0.991, acc: 0.968, promoted: "2026-05-30", traffic: 0 },
  { ver: "v4.1.4",   arch: "ViT-Defect-M", status: "rollback",  auroc: 0.981, acc: 0.953, promoted: "2026-05-10", traffic: 0 },
  { ver: "v4.1.2",   arch: "ViT-Defect-M", status: "archived",  auroc: 0.978, acc: 0.949, promoted: "2026-04-22", traffic: 0 },
];

export const driftThreshold = 0.18;
export const driftSeries = [0.06,0.07,0.05,0.08,0.09,0.07,0.10,0.11,0.09,0.13,0.12,0.15,0.14,0.12]
  .map((v, i) => ({ d: `D-${13 - i}`, psi: v }));

export const driftEvents = [
  { t: "D-3 09:12", sev: "warn", text: "PSI 0.15 — 임계치 근접 (0.18)", metric: "feature: edge_intensity" },
  { t: "D-5 14:40", sev: "info", text: "신규 디바이스 분포 편입 N5P-A0", metric: "covariate shift" },
  { t: "D-9 23:05", sev: "info", text: "야간 조도 보정 적용", metric: "input normalize" },
];

export const retrainJob = {
  active: true, name: "retrain-v4.3.0", progress: 0.68, etaMin: 23,
  samples: 18420, epoch: "14 / 20", gpu: "4×H100", started: "01:48",
};

export const retrainEffect = [
  { metric: "AUROC",        before: 0.981, after: 0.991 },
  { metric: "Recall",       before: 0.93,  after: 0.97 },
  { metric: "False Alarm",  before: 0.084, after: 0.041, invert: true },
  { metric: "Edge Defect F1", before: 0.88, after: 0.95 },
];

// ── Charts mock ───────────────────────────────────────────────────────────────
export const riskHist = [
  { bin: "0-10",  n: 142, band: "low" },
  { bin: "10-20", n: 198, band: "low" },
  { bin: "20-30", n: 121, band: "low" },
  { bin: "30-40", n: 64,  band: "med" },
  { bin: "40-55", n: 38,  band: "med" },
  { bin: "55-70", n: 19,  band: "med" },
  { bin: "70-85", n: 9,   band: "high" },
  { bin: "85-100",n: 4,   band: "high" },
];

export const alarmVolume = Array.from({ length: 24 }, (_, h) => {
  const base = 3 + Math.round(4 * Math.abs(Math.sin(h / 3.8)));
  const high = h === 2 ? 1 : (h === 14 ? 2 : 0);
  return { h: String(h).padStart(2, "0"), n: base + (h % 5 === 0 ? 3 : 0), high };
});

export const defectCats = [
  { cat: "Edge Bead",      n: 412, color: "accent" },
  { cat: "Particle",       n: 318, color: "accent" },
  { cat: "Scratch",        n: 196, color: "med" },
  { cat: "Pattern Bridge", n: 134, color: "med" },
  { cat: "Micro-void",     n: 88,  color: "high" },
  { cat: "Overlay Shift",  n: 61,  color: "high" },
];

// ── Handoff mock ──────────────────────────────────────────────────────────────
export const handoffMock = {
  shift: "야간 A조 → 주간 B조",
  period: "2026-05-31 22:00 → 2026-06-01 06:00",
  generatedAt: "2026-06-01 05:42",
  status: "draft",
  recipients: [
    { name: "주간 B조 리드 (이서연)", role: "Fab Ops Lead", confirmed: false },
    { name: "MLOps 당직 (한도윤)",     role: "AI/MLOps",     confirmed: false },
  ],
  sentBefore: false,
  summary: { inspections: 1284, highAlerts: 1, medAlerts: 7, autoResolved: 23, humanReview: 3, openItems: 2 },
  bullets: [
    "ETCH-04 C2 — 엣지 결함 추세 모니터 중, PM 일정 검토 권고",
    "모델 v4.3.0-rc 재학습 진행(68%), 주간 중 staging 검증 예정",
    "02:14 High 알람 1건 — 파티클 클러스터, 자동 격리 후 종결",
    "미해결 항목 2건: W13 사전점검 플래그, CMP-02 유량 재튜닝 확인",
  ],
};

// ── Copilot mock ──────────────────────────────────────────────────────────────
export const copilotMock = {
  tools: [
    { id: "ETCH-04", health: 0.86, lastPM: "D-12", openIssues: 1, status: "watch" },
    { id: "CMP-02",  health: 0.93, lastPM: "D-4",  openIssues: 0, status: "ok" },
    { id: "LITHO-07",health: 0.79, lastPM: "D-21", openIssues: 2, status: "watch" },
  ],
  memory: [
    { tool: "ETCH-04", note: "C2 챔버는 PM 후 약 10롯간 파티클 안정, 이후 점진 증가 패턴 반복", tag: "패턴" },
    { tool: "CMP-02",  note: "슬러리 교체일(화/금) 직후 유량 PID 재튜닝 필요 — 과거 3회 동일", tag: "운영지식" },
  ],
  nearMiss: [
    { date: "D-6", text: "LITHO-07 오버레이 5.8nm — 스펙(6.0) 직전 회피, 보정 적용", impact: "잠재 수율 -1.2%p 회피" },
    { date: "D-11", text: "ETCH-04 파티클 11ea — 임계(12) 직전, 조기 PM 트리거", impact: "라인 정지 회피" },
  ],
  decisions: [
    { date: "D-6", who: "주간 B조", text: "LITHO-07 오버레이 보정값 +0.4nm 적용 → 정상화", outcome: "good" },
    { date: "D-12", who: "야간 A조", text: "ETCH-04 조기 PM 결정 (추세 기반)", outcome: "good" },
  ],
};

// ── Automation mock ───────────────────────────────────────────────────────────
export const automationMock = {
  agentStatus: "active", autonomy: "supervised", successRate: 0.962,
  last24: { triggered: 41, success: 39, failed: 2, escalated: 3 },
  log: [
    { t: "02:14:09", action: "High 알람 → 영향 다이 자동 격리", target: "LOT-2D49-117/W?", result: "success", auto: true },
    { t: "02:14:31", action: "유사 케이스 RAG 검색 + Action Card 생성", target: "CASE-9F21 외 2", result: "success", auto: true },
    { t: "01:48:00", action: "드리프트 임계 근접 → 재학습 잡 트리거", target: "retrain-v4.3.0", result: "running", auto: true },
    { t: "00:31:22", action: "야간 리포트 초안 자동 생성", target: "Handoff/A조", result: "success", auto: true },
    { t: "23:50:14", action: "CMP-02 유량 보정 제안 → 사람 승인 대기", target: "CMP-02/H1", result: "escalated", auto: false },
    { t: "22:07:48", action: "엣지 결함 오탐 1건 자동 필터", target: "W04", result: "success", auto: true },
    { t: "21:12:03", action: "모델 v4.1.4 자동 롤백 (지표 하락)", target: "registry", result: "failed", auto: true },
  ],
};

// ── Default inspection (shown before first real inspection) ───────────────────
export const defaultInspection = {
  lot: "LOT-2D49-117", wafer: "W12", waferIdx: 12, waferTotal: 25,
  device: "N5P-SRAM-A0", recipe: "ETCH-M4 / CMP-po+",
  tool: "ETCH-04 (Lam 2300)", chamber: "C2",
  operator: "구민재 / 야간 A조", startedAt: "2026-06-01 02:14:07",
  riskLevel: "Low", riskScore: 18, confidence: 0.962,
  yieldEst: 99.1, dieTotal: 612, dieFail: 5,
  waferMap: buildWaferMap(0.045, false),
  causes: [
    { label: "엣지 비드 제거(EBR) 폭 정상 범위 내 미세 변동", conf: 0.34 },
    { label: "CMP 슬러리 유량 단기 변동 — 영향 경미",          conf: 0.21 },
    { label: "포토 트랙 핫플레이트 ±0.3℃ 편차",               conf: 0.12 },
  ],
  checks: [
    { label: "ETCH-04 C2 챔버 파티클 카운트 추세 확인", priority: "low",  done: false },
    { label: "동일 recipe 직전 5롯 CD 산포 비교",      priority: "low",  done: true },
    { label: "EBR 프로파일 SEM 재확인 (선택)",          priority: "info", done: false },
  ],
  nextActions: [
    { label: "정상 처리 — 다음 웨이퍼 진행", kind: "primary" },
    { label: "W13 사전 점검 플래그 등록",     kind: "ghost" },
    { label: "야간 리포트에 메모 추가",        kind: "ghost" },
  ],
  metrology: [
    { id: "CD-UNIF", name: "CD Uniformity (3σ)", value: "2.1 nm", spec: "≤ 3.5 nm", ok: true,  delta: 0 },
    { id: "OVL-X",   name: "Overlay X",          value: "3.4 nm", spec: "≤ 6.0 nm", ok: true,  delta: 0 },
    { id: "OVL-Y",   name: "Overlay Y",          value: "4.1 nm", spec: "≤ 6.0 nm", ok: true,  delta: 0 },
    { id: "ER-RATE", name: "Etch Rate Drift",    value: "+1.2%",  spec: "± 3.0%",   ok: true,  delta: 0 },
    { id: "FILM-TH", name: "Film Thickness",     value: "412 Å",  spec: "405–420 Å",ok: true,  delta: 0 },
    { id: "PART-AD", name: "Particle Adders",    value: "6 ea",   spec: "≤ 12 ea",  ok: true,  delta: 0 },
  ],
  report: `검사 결과 LOT-2D49-117 / W12 는 **Low 리스크(점수 18)** 로 판정되었습니다. 612개 다이 중 5개에서 경미한 결함 신호가 검출되었으나, 모두 웨이퍼 엣지 영역에 분포하여 디바이스 수율 영향은 제한적입니다.

Grad-CAM 활성화 맵은 3시 방향 엣지 밴드에 약한 집중을 보이며, 이는 EBR(Edge Bead Removal) 폭의 정상 범위 내 변동과 일치합니다. 계측 항목 6종은 전부 스펙 이내이며 리스크 가산(delta)이 발생한 룰은 없습니다.

권장: 정상 처리 후 다음 웨이퍼를 진행하되, 동일 recipe 의 엣지 결함 추세를 모니터링하십시오.`,
  defectType: "Edge Bead",
  imageUrl: null,
  overlayUrl: null,
  roiUrl: null,
};

export const criticalAlertData = {
  riskScore: 87, lot: "LOT-2D49-118", wafer: "W04",
  title: "High 리스크 — 패턴 브릿지 클러스터 검출",
  tool: "ETCH-04 / C2",
  cause: "3시 방향 다이 집중 결함 · CD Uniformity 4.0nm (스펙 초과)",
  affectedDie: 47,
};
