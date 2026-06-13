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
