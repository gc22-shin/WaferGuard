# WaferGuard

> **반도체 팹을 위한 스마트 팩토리 운영 보조 멀티 에이전트 시스템**
>
> 검사 결과를 받아 _상황 판단 → 근거 검색(RAG) → 품질 리스크 해석 → 대응 action_ 까지,
> 운영자가 내려야 할 결정을 에이전트가 함께 끌고 간다.

WaferGuard는 반도체 공정의 이상 상황에 **대응**하는 멀티 에이전트 시스템이다. 결함을 분류하는 데서 멈추는 모델이 아니라, "그래서 다음에 무엇을 할 것인가"를 판단하고 실제 운영 조치로 연결하는 운영 보조 에이전트다.

검사 라인 단위의 **Inspection Agent**와 라인 전체를 보는 **MLOps Agent**가 위임 구조로 협업하고, 모든 판단은 RAG 근거 위에서 이뤄지며 중요한 결정에는 사람이 개입한다.

## 프로젝트 개요

팹(fab)은 하루에도 수만 장의 wafer를 검사하고, 결함 분류 모델은 이미 충분히 존재한다. 현장에서 진짜 비용이 발생하는 지점은 결함을 **탐지**하는 단계가 아니라 **다음 조치를 결정**하는 단계다. 하나의 critical 결함을 놓치면 그대로 하류 공정으로 번져 lot 전체 scrap으로 이어지기 때문이다.

이 판단은 지금까지 엔지니어 개인의 암묵지에 의존해 왔고, 그래서 품질이 교대 근무자에 따라 출렁였다. WaferGuard는 이 운영 판단을 멀티 에이전트로 시스템화한다.

- **룰 기반으로 먼저 리스크를 계산**하고, 의심스러운 케이스만 에이전트로 escalate한다 — 모든 검사가 LLM을 거치지 않는다.
- escalate된 케이스는 에이전트가 **근거를 모으고 직접 조치**하되, 중요한 결정에는 **사람이 개입(human-in-the-loop)**한다.
- 같은 결함이 반복되는지, 단발성 spike인지, 진짜 drift인지 — 과거 사례(RAG)를 근거로 해석한다.
- 개별 wafer를 넘어서는 문제는 상위 **MLOps 에이전트로 위임**되어 라인 전체 차원에서 재학습 여부를 판단한다.

탐지는 입구일 뿐이고, 데이터는 운영 대시보드를 통해 사람과 에이전트 사이를 흐른다.

## 핵심 기능

### 1. 실시간 검사 콘솔 (Live Inspection)
- Wafer map, Grad-CAM activation, ROI crop이 실시간으로 스트리밍된다.
- **Risk 게이지(0–100)**가 신뢰도와 함께 표시되고, 계측값(CD · Overlay · Thickness · Roughness · Defect Count)마다 룰 hit에 따른 ΔRISK가 붙는다.
- 7일치 결함 카테고리 빈도와 24시간 리스크 분포를 함께 보여준다.

### 2. Inspection Agent의 판단
- Medium/High 리스크 큐에서 케이스를 고르면 Agent가 실시간으로 추론한다.
- **추정 원인(Probable Causes)**을 확률과 함께 랭킹한다 (예: robot arm contact 42% · cassette slot scratch 27%).
- **다음 조치(Next Actions)**를 제시하고, 처리 결과(Resolve / False positive / Needs review)는 다시 RAG로 학습된다.
- 모든 추정은 환각이 아니라 **"Evidence: RAG + metrology rules"**에 근거한다.

### 3. Vector RAG 근거 (anti-hallucination)
- 각 추정 원인의 "Evidence"를 열면 **유사 과거 사례 Top-3**가 나온다.
- 단순 매칭이 아니라, **그 당시 실제로 취한 조치**까지 함께 제공한다.
- 검색 파이프라인: query embedding → cosine similarity → rerank. 실제 vector RAG가 판단의 근거로 동작한다.

### 4. 멀티에이전트 위임 & 자율성
- 문제가 개별 wafer 차원을 넘어서면, Agent가 **다른 Agent를 호출**한다.
- 반복성 결함이나 지속 drift가 확인되면 `escalate_to_mlops`로 **MLOps Agent**에 위임한다. 위임은 **단방향(one-way)**이라 무한 재귀가 없다.
- MLOps Agent는 자체 루프(F1 · drift · metrology trend)를 돌려 **fleet-level 재학습 권고**를 반환한다.
- **자율성 다이얼**: Auto-run · Request approval · Monitor-only — 운영자가 사람과 자동화의 경계를 직접 조정한다.

### 5. Human-in-the-loop 승인 & 모델 운영
- **Model Registry**: production 모델(`wafer-defectnet-v2.3.1`, F1 0.991)과 archived 버전을 함께 관리하며 promote / rollback을 지원한다.
- **Pending Approvals**: 재학습과 긴급 알림은 사람의 승인/반려를 거친다. High-risk 도구는 자동 실행되지 않고 사람을 기다린다.
- **Drift monitor**가 drift 점수를 추적하고, 라인별 High-risk 알림을 SNS / Slack으로 fan-out한다.

### 6. 학습 루프 · 추적 · 데이터
시스템은 두 개의 닫힌 루프로 운영될수록 똑똑해진다.
- **Human feedback** — 승인/반려 이력이 다음 판단의 근거로 들어가, 반려된 조치는 반복되지 않는다.
- **RAG learning** — `Resolved`로 표시된 케이스는 `rag_documents`에 임베딩되어 다음 검색에 반영된다.
- **`agent_traces`** — 모든 도구 호출 · 메시지 · 최종 판단이 빠짐없이 감사(audit) 가능하다.

## 에이전틱 플로우

핵심은 `app/services/agent.py`의 **LangGraph 기반 Agent**다. 검사 evidence(risk score, metrology rule hit, RAG 사례, wafer 이미지)를 받아 LLM이 스스로 도구를 호출하며 운영 판단을 내린다.

### 실행 루프 (StateGraph)

```
Inspection Result → RISK Score → (Risk > Low) → 멀티에이전트 시스템
START → decide → (tool_call?) → tool_exec → decide → … → final_action → END
```

- **decide**: LLM에 evidence 텍스트와 wafer 이미지를 넘겨, 다음에 호출할 도구를 고르거나 최종 판단을 생성한다.
- **tool_exec**: 모델이 고른 도구를 `TOOL_REGISTRY`에서 디스패치해 실행하고, 결과를 다시 decide로 돌려준다.
- **final_action**: 마지막 판단을 확정하고 전체 trace를 `agent_traces` 테이블에 저장한다.
- 최대 5회 반복(`max_iterations=5`)으로 무한 루프를 막는다. langgraph 미설치 시 동일 로직의 순차 실행으로 폴백한다.
- `LUXIA_API_KEY`가 있으면 `llm` 모드, 없으면 규칙 기반 `stub` 모드로 동작한다.

### 사용 가능한 도구

`app/services/tools.py`에 정의된 도구를 LLM이 function-calling으로 호출한다.

| 도구 | 역할 |
|------|------|
| `search_similar_cases` | query를 임베딩해 RAG 지식베이스에서 유사 결함 사례를 검색·rerank (Top-k) |
| `inspect_image` | wafer map / Grad-CAM overlay / ROI crop을 멀티모달 LLM으로 관찰 분석 |
| `compare_with_past_wafer` | 현재 wafer와 과거 사례 이미지를 멀티모달로 직접 비교 |
| `get_equipment_history` | 같은 설비의 최근 검사 이력·동일 결함 반복 여부 조회 (반복성 판단) |
| `get_metrology_trend` | 설비 계측값(CD/Overlay/두께/거칠기 등) 시계열 추세 조회 (단발 vs drift 구분) |
| `get_mlops_state` | 현재 운영 모델 성능, 최신 drift 이벤트, 최근 재학습 이력 조회 |
| `enqueue_for_review` | 신뢰도가 낮거나 불확실한 건을 엔지니어 검토 큐에 등록 |
| `recommend_retrain` | drift·반복 오판 근거를 바탕으로 모델 재학습 권고 (자율 모드에 따라 처리) |
| `escalate_to_mlops` | fleet-level 문제를 MLOps Agent에 위임 |
| `save_case_to_knowledge` | 검증된 대응 사례를 임베딩해 RAG 지식베이스에 저장 (이후 검색에 반영) |

> `search_similar_cases` · `inspect_image` · `compare_with_past_wafer` · `save_case_to_knowledge`는 Luxia Gateway의 embedding/rerank/멀티모달 chat을 사용하므로 `LUXIA_API_KEY`가 필요하다. 키가 없으면 각각 로컬 검색·스텁 응답으로 graceful하게 대체된다.

## 기술 스택

| 영역 | 구성 |
|------|------|
| Backend | FastAPI · **LangGraph StateGraph** (ReAct 루프, 최대 5회 반복) |
| LLM | **GPT-4o-mini via Luxia Gateway** — text + image 멀티모달 |
| RAG | Luxia embedding (1024-d) · cosine · rerank · SQLite BLOB 인덱스 |
| Frontend | React + Vite 운영 대시보드 |
| Storage | SQLite · **9개 테이블** (inspections · agent_traces · pending_approvals · rag_documents · model_registry · retraining_jobs · drift_events · alerts · handoff_reports) |

### 안전 가드레일
- **Agent escalation gate** — 모든 검사가 LLM에 도달하지 않는다 (룰이 먼저 거른다).
- **Low/high-risk 도구 분리** — high-risk 도구는 사람 승인(HITL)을 거친다.
- **단방향 위임** — 무한 재귀를 차단한다.
- **룰 폴백** — API 키가 없을 때 graceful degradation으로 동작한다.

## AWS 배포 구조

하나의 **EC2 인스턴스**가 IAM 역할을 통해 **7개의 AWS 서비스를 오케스트레이션**한다. boto3 호출은 access key 없이 역할 권한으로 수행된다.

```
Internet → Browser → EC2 · FastAPI  (Backend API + React 대시보드 정적 서빙)
                       │  IAM 역할(LabRole) attached
                       ↓ boto3 — 역할 권한으로 호출 (access key 없음)
   ┌──────────────┬──────────────┬───────────────┬──────────────┬──────────────┐
   Amazon S3      Amazon RDS     Secrets Mgr      Amazon SNS     CloudWatch
   wafer·Grad-CAM PostgreSQL     LLM 키 저장       High-risk 알림  로그·메트릭
   이미지         상태 저장       .env→역할로 fetch  insert_alert    uvicorn·/metrics
   정적 마운트     SQLite→psycopg                   →publish
   →object storage
   └──────────────────────────────────────────────────────────────────────────┘
   Lambda + EventBridge — 서버리스 주기 자동화 (EC2와 분리, 실행당 과금)
   ↻ 90초 auto-monitor tick → /api/v1/automation/tick
```

> **설계 원칙**: Stateless compute + Managed state (S3·RDS) + Role-based security (IAM·Secrets) + Event-driven automation

| AWS 서비스 | 역할 | 연동 방식 |
|------------|------|-----------|
| **EC2** | FastAPI 백엔드 + React 대시보드 정적 서빙 (compute) | IAM 역할 attach |
| **S3** | wafer / Grad-CAM 이미지 저장 | 로컬 정적 마운트 → object storage |
| **RDS (PostgreSQL)** | 검사 이력·에이전트 상태 저장 | SQLite → psycopg |
| **Secrets Manager** | LLM API 키 보관 | `.env` 대신 역할로 fetch |
| **SNS** | High-risk 알림 fan-out (Slack 등) | `insert_alert` → publish |
| **CloudWatch** | 로그·메트릭 | uvicorn 로그 · `/metrics` |
| **Lambda + EventBridge** | 90초 주기 auto-monitor (EC2와 분리, 실행당 과금) | → `/api/v1/automation/tick` |

핵심은 **access key 없이 IAM 역할 권한만으로 boto3를 호출**해, EC2가 7개 서비스를 오케스트레이션하는 구조다. 로컬 MVP의 파일·SQLite 기반 저장소를 클라우드 매니지드 서비스(S3·RDS·Secrets)로 그대로 치환할 수 있도록 추상화 계층(`app/services/aws.py`, `object_store.py`, `db.py`)을 둔 것이 설계 포인트다.

> 실제 EC2 배포 단계(인스턴스 준비 → systemd 등록)는 [`docs/AWS_Deploy_Guide.md`](docs/AWS_Deploy_Guide.md)를, 마이그레이션·비용 상세는 [`docs/`](docs/)의 AWS 문서를 참고한다.

## 사전 요구사항

| 도구 | 최소 버전 |
|------|-----------|
| Python | 3.11 |
| Node.js | 18 이상 |
| npm | 9 이상 |

Python 의존성은 [`requirements.txt`](requirements.txt)에 정의되어 있다.

| 패키지 | 용도 |
|--------|------|
| fastapi · uvicorn · pydantic | 백엔드 API |
| langgraph | 에이전트 StateGraph 실행 루프 |
| pillow · numpy | wafer map / Grad-CAM 이미지 생성 |
| httpx · requests | Luxia Gateway LLM 호출 |
| boto3 · psycopg2-binary | AWS(S3/SNS/Secrets) · RDS(PostgreSQL) 연동 |
| python-dotenv | `.env` 로드 |
| fpdf2 | 리포트 생성 |

## 환경 설치

### 1. 저장소 클론 및 Python 환경
```bash
git clone <저장소 URL>
cd WaferGuard

conda create -n waferguard python=3.11 -y
conda activate waferguard
pip install -r requirements.txt
```

### 2. 프론트엔드 의존성
```bash
cd frontend
npm install
cd ..
```

### 3. API 키 설정 (.env)
프로젝트 루트에 `.env` 파일을 만들고 Luxia Gateway API 키를 넣는다.
```bash
# .env
LUXIA_API_KEY=발급받은_키
```
> 이 키는 LLM 기반 리포트·RAG·Agent 응답에 필요하다. 키가 없어도 앱은 동작하지만, 해당 기능은 스텁 응답으로 대체된다.

### 4. outputs 폴더에 데이터 파일 배치
아래 구글 드라이브 파일을 받아 `outputs/` 폴더에 넣는다. (앱 기동 시 `outputs/`가 없으면 자동 생성되므로, 폴더가 없다면 직접 만든 뒤 넣으면 된다.)
```
구글 드라이브: https://drive.google.com/drive/folders/1UShUOb8-q1qySYM-bG0HPBTDlrAQWwxm?usp=sharing

WaferGuard/
  outputs/
    <다운받은 파일을 여기에 배치>
```

## 실행

터미널 2개로 백엔드와 프론트엔드를 각각 실행한다.

**터미널 1 — 백엔드 (FastAPI :8000)**
```bash
conda activate waferguard
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

**터미널 2 — 프론트엔드 (Vite :5173)**
```bash
cd frontend
VITE_API_BASE_URL=http://127.0.0.1:8000 npm run dev
```

**접속 주소**
```
Dashboard : http://127.0.0.1:5173
API docs  : http://127.0.0.1:8000/docs
Health    : http://127.0.0.1:8000/health   →  {"status":"ok"}
```

## 검증
```bash
# 백엔드가 실행 중인 상태에서 주요 엔드포인트 통합 테스트
conda activate waferguard
python scripts/smoke_test.py

# 프론트엔드 빌드 검증
cd frontend && npm run build
```

## 코드베이스 구조

```
app/
  main.py              # FastAPI 앱. 모든 route를 정의하고 service 모듈로 위임
  schemas.py           # Pydantic 요청 모델
  services/
    pipeline.py        # POST /api/v1/inspect 핵심 흐름 오케스트레이션
    agent.py           # LangGraph 기반 Agent 실행 루프
    tools.py           # Agent가 호출하는 도구 정의 (TOOL_REGISTRY)
    rag.py             # 로컬/벡터 case 유사도 검색 (Top-3)
    risk.py            # risk score / level 계산
    action_card.py     # metrology rule 평가 + Action Card 생성
    mlops.py           # drift/retrain/promote/rollback 시뮬레이션
    synthetic_wafer.py # wafer map / Grad-CAM / ROI 이미지 생성
    luxia_client.py    # Luxia Gateway LLM 클라이언트 (chat/embedding/rerank)
    aws.py             # S3 / SNS / Secrets Manager 연동 (boto3, IAM 역할)
    storage.py · db.py # SQLite 접근 (init_db + 9개 테이블)
  data/                # 평가 fixture, RAG eval set, WM-811K subset
frontend/
  src/App.jsx          # 운영 대시보드
infra/
  lambda/automation_tick.py  # EventBridge 주기 자동화 Lambda
scripts/
  smoke_test.py        # 통합 스모크 테스트
  build_wm811k_subset.py  # LSWMD.pkl에서 WM-811K subset 추출
docs/                  # AWS 배포·마이그레이션·비용 가이드
outputs/               # 런타임 산출물 (이미지/DB). gitignore, 기동 시 자동 생성
```
