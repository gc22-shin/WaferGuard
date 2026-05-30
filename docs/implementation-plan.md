# 구현 계획

## 1단계: 로컬 Agent MVP 뼈대

- FastAPI 앱 생성
- SQLite 스키마 생성
- React/Vite 대시보드 생성
- 실행 스크립트 작성

## 2단계: 공정 이상 시나리오 입력

- 9개 결함 유형 샘플 웨이퍼 생성
- lot, process step, recipe, metrology 입력 연결
- Grad-CAM 스타일 heatmap/overlay 생성
- ROI crop 생성
- 위험도 계산
- 검사 결과 저장

## 3단계: Agent 판단 근거 구성

- RAG 유사 사례 검색
- metrology rule hit 생성
- WM-811K 평가 fixture 표시
- critical miss와 품질 리스크 설명
- 데이터 경계 Real / Synthetic / Fixture / Eval 표시

## 4단계: Action Card와 대응 action

- Defect Action Card 생성
- 가능 원인 후보, 추가 확인 항목, process check, next action 표시
- drift/성능 저하 이벤트 생성
- 재학습 요청, 대응 기준 적용, 이전 기준 복구 action 시뮬레이션

## 5단계: 인수인계 표준화

- 검사 이력 기반 설비 특이사항 추출
- Scrap Risk 자동 판정
- 미처리 High Risk/검토 큐 항목 정리
- 다음 근무자 체크리스트 생성
- 생성된 Daily Report를 DB에 저장하고 대시보드에서 조회

## 6단계: 운영 Copilot 차별화

- 설비별 반복 결함 메모리 생성
- 결함 유형별 첫 확인 항목과 담당 영역 추천
- near-miss / Scrap 방지 로그 생성
- AI 판단과 엔지니어 판단 이력 연결

## 7단계: 교대 리포트 워크플로우

- 채팅형 인터페이스에서 초안 생성과 설비 질문 지원
- 교대 시간 기반 자동 초안 생성
- Daily Report 초안 수정 저장
- "이대로 전달하시겠습니까?" 확인 후 전달 완료 상태 기록

## 8단계: 검증

- Python smoke test
- Frontend build
- 백엔드 health check
- 대시보드 로컬 접속 확인

## 9단계: 교수 피드백 반영

- 화면과 문서에서 분류 정확도 개선 프로젝트처럼 보이는 표현 제거
- 복잡한 서버 인프라 설명 제거
- `이상 상황 -> 근거 수집 -> 품질 리스크 판단 -> action 수행` 흐름을 첫 화면에 노출
- API 기반 Agent 시스템 MVP로 README, spec, UI 프레이밍 정리

---

## 2026-05-30 합의: M5 Agent loop 구현 계획 (파트별)

이전 1~9단계는 룰 기반 시뮬레이션 + UI 표면을 만든 단계다. 이 합의는 그 위에 **실제 Agent**(D-009 GPT-4o-mini via Luxia gateway, D-010 M5 Tool, D-011 Escalation, D-015 LangGraph, D-016 진짜 RAG)와 **실 데이터 시뮬레이션**(D-012 WM-811K subset + 시나리오 스크립트)을 얹고, 사용하지 않을 surface(D-014)를 제거하는 단계다.

---

### Part 1. Backend (FastAPI)

**1-1. Agent 엔진**
- `app/services/luxia_client.py` 신규 (~150 LOC)
  - `chat_with_tools(messages, tools, image_urls=None)` — GPT-4o-mini via `/llm/openai/chat/completions/gpt-4o-mini/create`, function calling, multimodal
  - `embed(texts: list[str])` — `/luxia/v1/embedding` (1024-d)
  - `rerank(query, documents, top_k)` — `/luxia/v1/rerank` (선택)
  - `apikey` 헤더 처리, 환경변수 `LUXIA_API_KEY`
- `app/services/agent.py` 신규 (~250 LOC)
  - Evidence builder (룰 결과를 프롬프트 텍스트로 직렬화)
  - Tool registry (5개 Tool 함수 + 스키마)
  - LangGraph `StateGraph` — decide / tool nodes / conditional routing
  - 노드 안에서 raw `requests`로 luxia_client 사용 (LangChain BaseChatModel 미사용)
  - Trace 로깅 → `agent_traces` 테이블 (storage 확장)
- `app/services/pipeline.py` 수정 (~50 LOC)
  - 룰 단계 종료 후 분기: Low → 룰 리포트로 종료, Medium/High/review → `agent.run(evidence)` 호출
  - Agent 결과(`final_action`, `tool_calls`, `trace_id`)를 record에 병합

**1-2. Tool 구현** (`app/services/tools.py` 신규, ~200 LOC)
- `search_similar_cases(query, k=3)` — RAG: query 임베딩 → SQLite `rag_documents` cosine → top-20 → rerank → top-3
- `inspect_image(image_url, focus)` — luxia_client.chat_with_tools에 image_url 포함해 재호출
- `enqueue_for_review(inspection_id, reason)` — `storage.record_review(inspection_id, "pending", ...)`
- `trigger_critical_alert(inspection_id, message)` — `pending_approvals` 테이블 insert (status=pending)
- `recommend_retrain(reason)` — `pending_approvals` 테이블 insert (status=pending)

**1-3. 승인 처리 신규 엔드포인트**
- `GET /api/v1/pending-approvals` — High-risk Tool 대기 큐 조회
- `POST /api/v1/approvals/{id}/approve` — 승인 후 실제 `storage.insert_alert()` 또는 `mlops.simulate_retraining()` 실행
- `POST /api/v1/approvals/{id}/reject` — pending row를 rejected로 마킹
- `POST /api/v1/inspect/{id}/re-agent` — 검토 큐에서 수동 Agent 재질의

**1-4. 정리** (D-014, -600 LOC)
- 삭제: `handoff.edit_handoff_report`, `handoff.send_handoff_report`, `PUT /api/v1/handoff/{id}`, `POST /api/v1/handoff/{id}/send`
- 삭제: `copilot.py`의 near-miss / 엔지니어 판단 이력 트래킹 (UI 요약 함수만 유지)
- 삭제: `reporting.py`의 룰 리포트 (Agent가 리포트 생성하므로 불필요) — Low 케이스에 한해 짧은 fallback만 유지
- 유지: `mlops.promote_latest` / `mlops.rollback` — UI 수동 버튼용 (Agent Tool 아님)

---

### Part 2. Data + RAG

**2-1. WM-811K subset (S3)**
- 큐레이션: 9 class × 10장 = ~90장
- S3 bucket `waferguard-artifacts`의 `wm811k/` prefix에 업로드
- `app/data/wm811k_index.json` — `[{wm811k_id, defect_type, s3_key, synthetic_metrology: {cd_nm, overlay_nm, ...}}, ...]`
- `synthetic_wafer.py` 분기: `image_url` 인자 있으면 그것 사용, 없으면 기존 generate 호출 (fallback)
- Grad-CAM overlay 생성 로직은 유지하되 라벨: *"실 이미지 위 시뮬레이션 hotspot"*

**2-2. RAG corpus + indexing (D-016)**
- `app/data/rag_corpus.json` (~50건)
  - 기존 `rag.py` CASE_LIBRARY 9건 이전
  - `defect_rag_eval_set.json` 12 Q/A의 evidence 변환
  - SOP 문서 9 class × 2 = 18건 (팀 작성)
  - Near-miss 사례 10건 (팀 작성)
- `scripts/build_rag_index.py` — 일회성 인덱싱: 각 문서 → `luxia-embedding` 호출 → SQLite `rag_documents`(id, content, defect_type, embedding BLOB, metadata) insert
- `storage.py` 확장: `rag_documents` 테이블 + `query_rag(query_vec, k)` 함수
- 평가: 기존 `defect_rag_eval_set.json` 12 Q/A로 retrieval hit률 측정

**2-3. Demo scenario script**
- `app/data/demo_scenario_script.json` (5~7 step)
  - 각 step: `{step, wm811k_id, expected_risk, expected_tool_path, note}`
  - 예: `{step:3, wm811k_id:"scratch_lot42", expected:"High / trigger_alert"}`
- `automation.run_automation_tick` 수정: `random.choice(SCENARIOS)` → `script[next_step_index]`
- step 인덱스는 in-memory 또는 SQLite 작은 테이블

---

### Part 3. Frontend (React, `frontend/src/App.jsx`)

**3-1. 신규 UI**
- **Agent Decision 패널**: LangGraph 노드 흐름 시각화 (decide → tool → decide → action), Tool 호출 시퀀스, 최종 판단 텍스트, RAG retrieved 사례 expand
- **Pending Approvals 패널** (High-risk Tool 대기 큐)
  - 각 카드: Tool 이름, 대상 inspection, Agent의 이유, 근거 링크, [승인] [거부] 버튼
- **"Agent 재질의" 버튼** — 검토 큐 / 검사 상세에서 호출
- **데이터/Agent 라벨** (정직성)
  - `"룰 기반 자동 통과 (Agent 미참여)"` — Low 케이스
  - `"본 시뮬레이션에서 결함 분류는 입력값이며, Agent는 분류 결과에 대한 운영 판단을 시뮬레이션합니다"`
  - `"RAG corpus 50건 한정, 사내 문서 검색 아님"`

**3-2. 자르기 (D-014)**
- Shift Copilot Chat 섹션 전체 삭제 (~200 LOC)
- handoff Edit/Send 버튼 및 모달 삭제

**3-3. 유지/축약**
- WM-811K Evaluation 패널 유지 (포트폴리오 가치)
- Fab Ops Copilot 패널 — near-miss 영역 제거, 요약 통계만 유지
- Data Boundary 라벨 — 위 정직성 라벨로 보강

---

### Part 4. AWS Infrastructure

**4-1. EC2 (메인 호스트)**
- t3.small or t3.medium, us-east-1, Amazon Linux 2, public subnet, Elastic IP
- 설치: Python 3.11, Node 20, Nginx, git
- systemd unit: `uvicorn app.main:app --host 127.0.0.1 --port 8000`
- Nginx: `:80` reverse proxy → uvicorn, `/outputs` static, frontend build serve
- LabInstanceProfile (LabRole) 부착 → S3 접근, outbound HTTPS 허용
- Security group: 22 (SSH, vockey), 80 (HTTP), 443 (HTTPS — 선택, ACM 안 쓰면 생략)
- EBS gp3 30GB (SQLite + 이미지 캐시)

**4-2. S3 bucket `waferguard-artifacts`**
- prefix:
  - `wm811k/` — WM-811K subset 90장 (private, EC2/Lambda 읽기)
  - `handoff/` — Daily Report markdown 아카이브 (선택)
  - `frontend/` — Vite build static (선택, EC2에서 serve할 거면 생략)
- LabRole에 GetObject/PutObject 권한
- Presigned URL로 GPT-4o-mini multimodal에 image 전달

**4-3. EventBridge + Lambda**
- EventBridge rule: rate(5 minutes) 또는 cron(*/10 * * * ? *)
- Lambda: Python 3.11, 128MB, LabRole, ~30초 timeout
  - 코드: `urllib3.request("POST", f"http://{EC2_EIP}/api/v1/automation/tick", body={...})`
  - 환경변수: `EC2_EIP`, automation tick 인자
- 1 함수만 (concurrency 1로 reserved)

**4-4. 환경 변수 / 시크릿**
- EC2 `/etc/waferguard.env`:
  - `LUXIA_API_KEY=...`
  - `S3_BUCKET=waferguard-artifacts`
  - `AWS_REGION=us-east-1`
- Lambda 환경변수: `EC2_EIP`
- AWS Academy 제약: Secrets Manager 사용 가능하나 단순 env 파일로 충분

**4-5. 운영 절차**
- 세션 재시작 시: EC2 자동 start, Lambda/EventBridge 그대로, SQLite/EBS 보존, 새 IP 안 받음 (EIP 덕분)
- 세션 종료 전 체크리스트: pending approval 정리, 데모 시나리오 step 인덱스 리셋
- 로그: systemd journal (`journalctl -u waferguard`) + Lambda CloudWatch Logs

---

### 팀 역할 분배

| 사람 | 담당 파트 | 작업 |
|---|---|---|
| **A** | Backend / Agent 엔진 | Part 1-1, 1-3 일부 (re-agent 엔드포인트) |
| **B** | Backend / Tools + 정리 | Part 1-2, 1-3 (승인 처리), 1-4 (자르기) |
| **C** | Data + RAG | Part 2-1 (WM-811K), Part 2-2 (RAG corpus + indexing), Part 2-3 (시나리오) |
| **D** | AWS Infrastructure | Part 4 전부 |
| **E** | Frontend | Part 3 전부 |

**Cross-cutting 약속**:
1. A는 Sprint 1 종료 시 `luxia_client.py` 함수 시그니처 README 공개 → B/E mock 작성 기준
2. C는 Sprint 1 종료 시 `wm811k_index.json` 스키마 + S3 URL 패턴 공개 → A/B 사용
3. D는 Sprint 0~1에 LabRole 권한, vockey, EIP, S3 bucket 이름(`waferguard-artifacts`) 확정
4. 새 API/스키마 변경 시 `docs/decisions.md`에 한 줄 추가, 새 도메인 용어는 `CONTEXT.md`에 추가

### Sprint (학기 잔여에 맞춰 조정)

- **Sprint 0** 반나절: 팀 미팅, D-009~D-016 통독, 분담 확정, D가 AWS 자원 예약, C가 WM-811K 다운로드 시작
- **Sprint 1** 1주: A는 Luxia client, B는 자르기 + Tool 스켈레톤, C는 WM-811K subset S3 업로드 + index 공개, D는 EC2 hello-world, E는 mock으로 UI 시작
- **Sprint 2** 1주: A는 LangGraph 작동, B는 5개 Tool 실구현 + 승인 엔드포인트, C는 RAG corpus + indexing + 시나리오, E는 Agent 패널 1차, D는 Lambda + EventBridge
- **Sprint 3** 1주: A pipeline 연결, E 승인 UI + 라벨 보강, D 통합 배포 (EC2 + Lambda 모두 EIP/실서비스), end-to-end 로컬 + AWS 시연 가능
- **Sprint 4** 잔여: 통합 테스트, RAG 평가 숫자 측정, 발표 리허설, 시나리오 다듬기
