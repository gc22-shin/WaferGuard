# 결정 사항

## D-001. 지금은 로컬 시연 가능한 Agent MVP를 먼저 만든다

현재 목표는 실제 fab production 환경 전체를 재현하는 것이 아니라, 공정 이상 상황을 시뮬레이션하고 Agent가 근거를 모아 대응 action을 수행하는 흐름을 보여주는 것이다. 따라서 첫 산출물은 로컬 FastAPI 기반 Agent MVP로 둔다.

## D-002. 복잡한 서버 인프라는 프로젝트 주제로 다루지 않는다

교수 피드백에 따라 복잡한 서버 인프라 구성은 프로젝트의 주된 목표에서 제외한다. 구현은 API 기반 Agent 시스템, RAG 근거, Action Card, Daily Report 흐름에 집중한다.

## D-003. 실제 모델 대신 시뮬레이션 엔진을 사용한다

현재 repo에는 WM-811K 데이터셋과 학습된 PyTorch 모델이 없다. 그래서 MVP에서는 결함 유형별 synthetic wafer map, heatmap, 리포트 엔진을 사용한다. 이후 실제 defect classifier와 Grad-CAM으로 `app/services/pipeline.py` 내부를 교체할 수 있다.

## 2026-05-19 WM-811K 평가 리포트는 fixture로 표시

현재 repo에는 실제 WM-811K 원본 데이터셋, train/validation split, 학습 weight가 없다. 그래서 `app/services/evaluation.py`는 `app/data/wm811k_evaluation_fixture.json` 파일을 읽어 WM-811K defect taxonomy를 기준으로 한 로컬 평가 fixture를 제공한다. 대시보드에는 confusion matrix, critical defect 미검출, class imbalance 대응, drift 시나리오, Grad-CAM 판단 근거, 품질 리스크 설명을 보여주되 실제 학습 결과처럼 과장하지 않는다. 실제 데이터가 들어오면 같은 API 응답 구조를 유지하고 fixture 파일만 validation 결과로 교체한다.

## 2026-05-19 Action Card를 WaferGuard 내부 기능으로 흡수

별도 SemiVision 프로젝트를 복구하지 않고, WaferGuard 안에 Defect Action Card를 넣는다. 카드에는 defect 후보, process/metrology context, 가능 원인 후보, 추가 확인할 metrology 항목, process check, next action, human review rule을 저장한다. 이 기능은 `inspection image / wafer map / metrology data -> defect candidate -> quality risk -> possible cause -> additional check -> Action Card` 흐름을 보여주는 핵심 포트폴리오 근거다.

## 2026-05-19 RAG/Agent는 작은 평가셋부터 둔다

삼성 AI센터 SW개발용으로 실제 사내 RAG를 구현했다고 표현하지 않는다. 대신 `app/data/defect_rag_eval_set.json`에 질문, 기대 답변, required evidence, fail-if 조건을 둬서 근거 기반 답변, 원인 단정 금지, hallucination 방지 설계를 보여준다.

## 2026-05-19 계측 rule hit는 원인 확정이 아니라 review 승격 근거로 사용한다

CD, overlay, film thickness, defect count, yield proxy가 기준 범위를 벗어나면 risk score를 올리고 Action Card의 next action에 우선 조치를 추가한다. 단, 이 rule hit는 실제 root cause 확정이 아니라 엔지니어가 확인해야 할 신호로 표현한다.

## 2026-05-19 복잡한 평가지표는 기본 접힘으로 둔다

Confusion matrix와 class별 metric은 포트폴리오 근거로는 필요하지만 첫 화면에 모두 펼치면 사용자가 이해하기 어렵다. 그래서 기본 화면은 critical miss 요약과 운영 조치 중심으로 보여주고, matrix/drift/detail은 상세 보기 버튼 뒤에 둔다.

## 2026-05-19 공개 이미지 데이터는 proxy 후보로만 표현한다

MVTec AD/LOCO는 반도체 fab 이미지가 아니므로 실제 fab 데이터처럼 표현하지 않는다. WaferGuard에서는 공개 proxy 후보와 로컬 연결 경로만 별도 manifest/API로 제공하고, 현재 검사 화면의 기본 이미지는 synthetic wafer로 유지한다.

## D-004. 프론트엔드는 React + Recharts로 만든다

PRD의 React 대시보드 요구사항과 운영 메트릭 시각화를 반영하기 위해 Vite 기반 React 앱과 Recharts를 사용한다.

## D-005. 인수인계는 생성 시점의 리포트를 저장한다

교대 근무 사이 정보 파편화를 막으려면 최신 데이터만 다시 계산해서 보여주는 것보다, 근무자가 생성한 시점의 Daily Report를 별도 기록으로 남기는 편이 안전하다. 그래서 `handoff_reports` 테이블에 요약 JSON과 Markdown을 함께 저장한다.

## D-006. 차별점은 비전 모델이 아니라 운영 판단 연결이다

현장에는 이미 검사 장비와 결함 분류 기능이 존재한다. WaferGuard는 이를 대체하기보다 검사 결과를 설비 메모리, 교대 인수인계, near-miss, 엔지니어 조치 이력과 연결하는 운영 Copilot으로 포지셔닝한다.

## D-008. 교수 피드백 반영 후 프레이밍은 Agent 시뮬레이션으로 고정한다

발표와 문서에서는 WaferGuard를 분류 정확도 개선 프로젝트로 설명하지 않는다. 공식 설명은 `공정 이상 시뮬레이션 -> 근거 수집 -> 품질 리스크 판단 -> 대응 action 수행` 흐름을 구현한 Agent 시스템 MVP로 통일한다.

## D-007. 교대 리포트는 초안-수정-전달 흐름으로 처리한다

현장에서는 자동 생성된 리포트를 그대로 보내기보다 근무자가 특이사항을 수정하고 최종 전달 여부를 확인하는 흐름이 자연스럽다. 그래서 Daily Report는 기본적으로 `draft` 상태로 생성하고, 수정 저장 후 `sent` 상태로 전환한다.

## 2026-05-30 D-009. Agent 모델은 Luxia gateway의 OpenAI passthrough(GPT-4o-mini)로 한다

대안: (α) `luxia3-llm-32b-0731` native chat + 별도 `/luxia/v1/document-ai`로 vision 2-step, (β) raw JSON 프롬프트로 구조화 응답. 둘 다 인증·과금 통합 가치는 동일하다. GPT-4o-mini를 택한 이유는 (1) Evidence + wafer 이미지를 한 번의 호출로 multimodal 처리해서 호출 수와 데모 지연을 줄이고, (2) function calling이 네이티브 지원돼 structured Tool 선택의 신뢰성을 retry 로직 없이 확보하기 위함이다. 정체성 측면에서는 Luxia gateway를 통과하므로 인증/관측/과금이 Luxia 한 곳에 모인다는 점을 명시한다. RAG 임베딩과 rerank는 여전히 `luxia-embedding`/`luxia-rerank` native를 쓴다.

## 2026-05-30 D-010. Tool 인벤토리는 M5(5개)로 고정한다

대안: 7개(설비 메모리 조회 + rollback 포함), 8개(handoff draft 포함). 5개로 둔 이유는 (1) inspect Agent loop 한 곳을 정확히 보여주는 것이 D-008 프레이밍과 일치, (2) AWS Lambda 10 concurrent와 Luxia 호출 수 통제, (3) 발표에서 5개 Tool 이름을 한 슬라이드에 묶어 외울 수 있게 하기 위함이다. 인벤토리: `search_similar_cases`(Low), `inspect_image`(Low), `enqueue_for_review`(Low), `trigger_critical_alert`(High), `recommend_retrain`(High). 추가 Tool은 학기 말 여유 시 검토.

## 2026-05-30 D-011. Agent Escalation 정책: High/review_required + 수동 재호출

모든 inspect에 LLM을 부르지 않는다. 룰이 먼저 risk_level을 계산해 Low로 분류되면 LLM 호출 없이 종료하고 UI에 "룰 기반 자동 통과, Agent 미참여" 라벨을 노출한다. Medium/High 또는 critical metrology rule hit 발생 시에만 자동 Agent 호출. 사용자는 검토 큐에서 어떤 inspection이든 "Agent 재질의" 버튼으로 수동 호출할 수 있다. 이유는 (1) [[Human-in-the-Loop]] 원칙과 일치, (2) demo seed가 10건 burst를 생성해도 Luxia 호출은 ~3~5건으로 통제, (3) Lambda concurrency 압박 회피. 부작용은 "Low 케이스는 Agent가 안 본다"는 정직한 설명이 필요한 점이며, 이는 화면 라벨로 명시한다.

## 2026-05-30 D-012. 시뮬레이션 데이터는 WM-811K subset 실 이미지 + 스크립트된 시나리오 시퀀스로 한다

자동 감시 tick이 `app/data/demo_scenario_script.json`을 **순차** 재생한다(random.choice 대체). 각 step은 WM-811K subset의 실제 이미지 ID와 기대 결과(`Low/auto_screened`, `High/Agent escalation` 등)를 포함한다. 실 이미지에는 metrology가 없으므로 결함 유형에 맞춰 synthetic metrology를 부여한다. 이유는 (1) 발표 재현성 보장 (random은 발표 망치는 최대 위험), (2) Agent의 5개 Tool 경로를 한 데모에 모두 노출, (3) 이미지는 실 데이터 → 정직성 확보, metrology는 synthetic → 학기 범위 통제. Grad-CAM overlay 생성 로직은 유지하되 "실 이미지 위에 시뮬레이션 hotspot을 얹은 시각화"라고 라벨한다.

## 2026-05-30 D-013. AWS 배포는 단일 EC2 + S3 + EventBridge→Lambda(cron) 한 함수로 한정한다

Learner Lab 제약(EC2 9대 한도, Lambda 10 concurrent, 시간당 과금 자원 비용)과 D-002(복잡 인프라 제외) 일관성을 위해. EC2 t3.small/medium 1대에 Nginx + FastAPI + SQLite를 올리고, S3에 wafer 이미지/Daily Report markdown을 보관한다. Lambda는 EventBridge cron이 `/automation/tick`을 5~10분 주기로 두드리는 한 가지 역할만. RDS, EKS/Fargate, ALB, API Gateway, NAT Gateway, SageMaker 모두 사용하지 않는다. Elastic IP 1개로 세션 재시작 시 IP 변경 회피.

## 2026-05-30 D-016. RAG는 Luxia embedding + SQLite vector store + rerank로 진짜로 구현한다 (필수)

교수 메일에 *"Agent 시스템, RAG 등 최신 AI 모델"*이 명시됐고, 팀 답변에도 *"RAG 기반 유사 사례 검색"*이 4대 초점 중 하나다. 현재 `rag.py`는 `CASE_LIBRARY` 정적 dict의 defect_type 키 lookup일 뿐 RAG가 아니며, 그대로는 발표에서 "RAG"라고 부를 수 없다. 따라서:
- **Corpus** ~50건: 기존 9건 + `defect_rag_eval_set.json` 12 Q/A의 evidence + 결함별 SOP 18건 + near-miss 10건. `app/data/rag_corpus.json`으로 통합.
- **Embedding**: `luxia-embedding` (1024-d). 일회성 인덱싱 스크립트로 SQLite `rag_documents` 테이블에 BLOB 저장. FAISS 불필요.
- **Retrieval**: Tool `search_similar_cases` 내부에서 query 임베딩 후 numpy cosine top-k. 필요 시 `luxia-rerank-2501`로 top-20 → top-3 재정렬.
- **Augmentation**: Agent decide 프롬프트에 *"## 참고 사례 (RAG)"* 섹션으로 명시 inject. 시스템 프롬프트에 *"제공된 사례 외 인용 금지"* 명시(환각 방지).
- **평가**: 기존 `defect_rag_eval_set.json` 12 Q/A를 retrieval 평가셋으로 재활용. `required_evidence` hit / `fail_if` violation 카운트.

비용은 1회성 인덱싱 포함 학기 전체 < $0.10이라 무시. T10(C 담당) 신규 작업으로 추가하고, T4 search_similar_cases Tool은 Sprint 1부터 dict 대신 임베딩 검색으로 시작한다(이전 "Sprint 2 옵션 업그레이드" 취소).

## 2026-05-30 D-015. Agent loop은 LangGraph로 구현한다

D-010 M5 Tools에는 `inspect_image`/`search_similar_cases` 같은 read-only Tool과 `enqueue_for_review`/`trigger_critical_alert`/`recommend_retrain` 같은 action Tool이 섞여 있어, Agent가 read-only Tool 결과를 받고 다시 판단으로 돌아오는 multi-step loop가 자연스럽게 발생한다. 이 상태 전이를 LangGraph `StateGraph`로 표현하면 (1) 노드별 상태가 추적 가능해 SQLite에 사후 분석용 trace 저장, (2) `add_conditional_edges`로 Tool 선택 라우팅이 선언적, (3) 발표 시 그래프 시각화로 Agent 동작을 한 장으로 설명할 수 있다. Luxia gateway 호환성 문제는 LangGraph 노드 함수 내부에서 raw `requests.post()`로 호출해 회피한다(LangChain `BaseChatModel` 어댑터 작성 불필요). Lambda 패키지 크기 ~30MB 증가는 EC2 메인 호스팅이므로 영향 없다.

## 2026-05-30 신규 엔드포인트: GET /api/v1/pending-approvals, POST /api/v1/approvals/{id}/approve|reject, POST /api/v1/inspect/{id}/re-agent

High-risk Tool 승인 큐 조회·처리와 수동 Agent 재질의 엔드포인트. pending_approvals 테이블(status: pending|approved|rejected)과 agent_traces 테이블을 사용한다. 삭제된 엔드포인트: PUT /api/v1/handoff/{id}, POST /api/v1/handoff/{id}/send (D-014에 따라 제거).

## 2026-05-30 D-014. 현재 코드에서 Shift Copilot Chat, handoff edit/send, copilot near-miss 트래킹을 제거한다

이유는 (1) D-010 Tool 인벤토리 M5에서 제외된 기능이라 Agent와 연결되지 않고, (2) Shift Chat은 LLM 미연결 fake response라 정직성에 어긋나며, (3) handoff edit/send 워크플로우는 D-007에서 도입했으나 발표 5~7분 시연 흐름에서 비중이 작고 코드 ~300LOC. Daily Report **draft 생성**만 남기고 edit/send는 제거. ROI crop은 UI 가치 있으면 유지하되 별도 결정. `mlops.promote_latest`/`rollback`은 Agent Tool에서 제외되었지만 UI 수동 버튼은 유지(엔지니어 의사결정 시뮬레이션).
