# WaferGuard

WaferGuard는 반도체 공정 이상 상황 대응을 시뮬레이션하는 로컬 MVP다. 단순 이미지 분류 정확도 프로젝트가 아니라, `상황 판단 → 근거 검색(RAG) → 품질 리스크 해석 → 대응 action`으로 이어지는 하나의 운영 흐름을 구현한다.

핵심 흐름:

1. wafer defect / 공정 step / 계측값 / drift 상황을 입력한다.
2. 시스템이 wafer map, Grad-CAM overlay, ROI crop, metrology rule hit를 생성한다.
3. RAG 유사 사례와 WM-811K 평가 fixture를 참고해 품질 리스크를 해석한다.
4. Agent가 추가 확인 항목, 검토 큐, 알림/재학습 요청, Daily Report 초안을 action으로 연결한다.

백엔드는 FastAPI, 프론트엔드는 React(Vite) 운영 대시보드이며, 검사 이력·리뷰·handoff 상태는 SQLite에 저장된다.

## 코드베이스 구조

```
app/
  main.py              # FastAPI 앱. 모든 route를 정의하고 service 모듈로 위임
  schemas.py           # Pydantic 요청 모델
  services/
    config.py          # 경로/튜너블, .env 로드
    pipeline.py        # POST /api/v1/inspect 핵심 흐름 오케스트레이션
    synthetic_wafer.py # wafer map / Grad-CAM / ROI 이미지 생성
    rag.py             # 로컬 case 유사도 검색 (Top-3)
    rag_eval.py        # 정적 RAG 평가셋 제공
    risk.py            # risk score / level 계산
    action_card.py     # metrology rule 평가 + Action Card 생성
    reporting.py       # 한국어 리포트 빌더
    mlops.py           # drift/retrain/promote/rollback 시뮬레이션
    handoff.py         # 교대 Daily Report 생성/수정/전달
    copilot.py         # Fab Ops Copilot 요약
    automation.py      # Agent 자동화 모니터
    luxia_client.py    # LUXIA Cloud LLM API 클라이언트 (chat/embedding/rerank)
    agent.py           # Agent 실행 루프
    storage.py         # 모든 SQLite 접근 (init_db + 6개 테이블)
  data/                # 평가 fixture, RAG eval set, WM-811K subset
frontend/
  src/App.jsx          # 운영 대시보드 (단일 대형 컴포넌트)
scripts/
  smoke_test.py        # 통합 스모크 테스트
  build_wm811k_subset.py  # LSWMD.pkl에서 WM-811K subset 추출
outputs/               # 런타임 산출물 (이미지/DB). gitignore, 기동 시 자동 생성
```

## 에이전틱 플로우

WaferGuard의 핵심은 `app/services/agent.py`에 구현된 **LangGraph 기반 Agent**다. 검사 evidence(risk score, metrology rule hit, RAG 사례, 웨이퍼 이미지)를 받아 LLM이 스스로 도구를 호출하며 운영 판단을 내린다.

### 실행 루프 (StateGraph)

```
START → decide → (tool_call?) → tool_exec → decide → ... → final_action → END
```

- **decide**: LUXIA Cloud LLM에 evidence 텍스트 + 웨이퍼 이미지 URL을 넘겨, 다음에 호출할 도구를 고르거나 최종 판단을 생성한다.
- **tool_exec**: 모델이 고른 도구를 `TOOL_REGISTRY`에서 디스패치해 실행하고, 결과를 다시 decide로 돌려준다.
- **final_action**: 마지막 판단 텍스트를 확정하고, 전체 trace(호출한 도구·인자·결과)를 `agent_traces` 테이블에 저장한다.
- 최대 5회 반복(`max_iterations=5`)으로 무한 루프를 막는다. langgraph 미설치 시 동일 로직의 순차 실행으로 폴백한다.
- `LUXIA_API_KEY`가 있으면 `llm` 모드, 없으면 규칙 기반 `stub` 모드로 동작한다.

### 멀티에이전트 위임

Agent는 두 종류로 구성되며, 개별 웨이퍼 차원을 넘어서는 문제는 상위 에이전트로 위임된다.

- **Inspection Agent** — 개별 검사 건의 상황 판단·근거 조회·대응 action을 담당.
- **MLOps Agent** — 라인 전체의 모델 성능(F1)·drift·계측 추세를 모니터링하고 재학습 필요 여부를 판단.

Inspection Agent가 같은 설비 반복성 결함이나 지속 drift 근거를 모으면 `escalate_to_mlops`로 MLOps Agent에 위임하고, MLOps Agent의 결론(`mlops_decision`)을 최종 판단에 인용한다. MLOps Agent의 재학습 권고는 자율 모드에 따라 처리 방식이 달라진다 — `auto`(즉시 실행) / `approval`(사람 승인 대기) / `notify`(알림만).

### 사용 가능한 도구

`app/services/tools.py`에 정의된 10개 도구를 LLM이 function-calling으로 호출한다.

| 도구 | 역할 |
|------|------|
| `search_similar_cases` | query를 임베딩해 RAG 지식베이스에서 유사 결함 사례를 검색·rerank (Top-k) |
| `inspect_image` | wafer map / Grad-CAM overlay / ROI crop 이미지를 멀티모달 LLM으로 관찰 분석 |
| `compare_with_past_wafer` | 현재 웨이퍼와 과거 사례 이미지를 멀티모달로 직접 비교 |
| `get_equipment_history` | 같은 설비의 최근 검사 이력·동일 결함 반복 여부 조회 (반복성 판단) |
| `get_metrology_trend` | 설비 계측값(CD/Overlay/두께/거칠기 등) 시계열 추세 조회 (단발 vs drift 구분) |
| `get_mlops_state` | 현재 운영 모델 성능, 최신 drift 이벤트, 최근 재학습 이력 조회 |
| `enqueue_for_review` | 판단이 불확실하거나 신뢰도가 낮은 건을 엔지니어 검토 큐에 등록 |
| `recommend_retrain` | drift·반복 오판 근거를 바탕으로 모델 재학습 권고 (자율 모드에 따라 처리) |
| `escalate_to_mlops` | fleet-level 문제를 MLOps Agent에 위임 |
| `save_case_to_knowledge` | 검증된 대응 사례를 임베딩해 RAG 지식베이스에 저장 (이후 검색에 반영) |

> 도구 중 `search_similar_cases` · `inspect_image` · `compare_with_past_wafer` · `save_case_to_knowledge`는 LUXIA Cloud의 embedding/rerank/멀티모달 chat을 사용하므로 `LUXIA_API_KEY`가 필요하다. 키가 없으면 각각 로컬 검색·스텁 응답으로 graceful하게 대체된다.

## 사전 요구사항

| 도구 | 최소 버전 |
|------|-----------|
| Python | 3.11 |
| Node.js | 18 이상 |
| npm | 9 이상 |

## 환경 구축

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

프로젝트 루트에 `.env` 파일을 만들고 LUXIA Cloud API 키를 넣는다.

```bash
# .env
LUXIA_API_KEY=발급받은_키
```

> LUXIA API 키는 LLM 기반 리포트·RAG·Agent 응답을 위해 필요하다. 키가 없어도 앱은 동작하지만, 해당 기능은 스텁 응답으로 대체된다.

### 4. outputs 폴더에 데이터 파일 배치

아래 구글 드라이브 파일을 받아 `outputs/` 폴더에 넣어둔다. (앱 기동 시 `outputs/`가 없으면 자동 생성되므로, 폴더가 없다면 직접 만든 뒤 넣으면 된다.)

```
구글 드라이브 링크: https://drive.google.com/drive/folders/1UShUOb8-q1qySYM-bG0HPBTDlrAQWwxm?usp=sharing

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

### 접속 주소

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
