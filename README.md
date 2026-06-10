# WaferGuard Agent Simulation.

WaferGuard는 이미지 분류 정확도 개선 프로젝트가 아니라, 반도체 공정 이상 상황을 시뮬레이션하고 Agent가 근거를 모아 대응 action을 제안/수행하는 로컬 MVP다.

핵심 흐름은 아래와 같다.

1. wafer defect, 공정 step, 계측값, drift 상황을 입력한다.
2. 시스템이 wafer map, Grad-CAM overlay, ROI crop, metrology rule hit를 생성한다.
3. RAG 유사 사례와 WM-811K 기반 평가 fixture를 참고해 품질 리스크를 해석한다.
4. Agent가 추가 확인 항목, 담당 영역, 검토 큐, 알림/재학습 요청, Daily Report 초안을 action으로 연결한다.

## 프로젝트 초점

- 모델 자체의 정확도 향상이 아니라 `상황 판단 -> 근거 검색 -> 품질 리스크 해석 -> 대응 action` 흐름 구현
- 실제 fab production 환경 재현이 아니라 공정 이상/성능 저하 상황의 시뮬레이션
- 복잡한 서버 인프라가 아니라 로컬 FastAPI 기반 Agent workflow
- 실제 데이터, synthetic 입력, fixture 평가, RAG eval을 화면에서 구분해 과장 표현 방지

## 지금 구현된 것

- FastAPI 기반 Agent workflow API
- React 운영 대시보드
- 9개 wafer defect 상황 시뮬레이션
- wafer map, Grad-CAM style overlay, defect ROI crop 생성
- RAG 유사 사례 Top-3와 한국어 리포트
- SQLite 검사 이력, 엔지니어 리뷰, handoff 상태 저장
- drift/성능 저하 상황과 재학습 요청, 대응 기준 적용, 이전 기준 복구 action 시뮬레이션
- 교대 근무 인수인계용 Daily Report 생성/수정/전달
- Fab Ops Copilot: 설비 메모리, 조치 추천, near-miss 기록, 엔지니어 판단 이력
- Shift Copilot Chat: 채팅으로 교대 리포트 초안 생성, 설비 특이사항 확인, 전달 확인
- WM-811K 기반 평가 fixture: confusion matrix, critical miss, class imbalance, drift, Grad-CAM 근거, 품질 리스크 설명
- Defect Action Card: 가능 원인 후보, 추가 metrology 확인 항목, process check, next action, human review rule
- Metrology Rule Hit: CD/overlay/thickness/roughness/defect count/yield proxy 이상값을 risk score, review status, Action Card 조치에 반영
- RAG/Agent 미니 평가셋: defect knowledge 질문, 기대 답변, 근거 문서, hallucination 방지 기준

## 데이터 경계

| 구분 | 현재 상태 | 표현 방식 |
| --- | --- | --- |
| Real | SQLite 검사 이력, 엔지니어 리뷰, Daily Report 상태 저장 | 실제로 구현한 workflow |
| Synthetic | wafer image, Grad-CAM overlay, process/metrology 입력 | 시스템 구조 검증용 시뮬레이션 입력 |
| Fixture | `app/data/wm811k_evaluation_fixture.json` 기반 평가 숫자 | 실제 학습 성능이 아닌 리스크 분석 fixture |
| Eval set | `app/data/defect_rag_eval_set.json` 기반 RAG 질문/기대 답변 | RAG/Agent 평가 설계 근거 |
| Planned | 실제 WM-811K 학습 결과, MES/FDC/SPC, 사내 문서 RAG | 추후 실제 데이터 연동 범위 |

## 주요 API

- `POST /api/v1/inspect`: 공정 이상 시나리오 실행
- `POST /api/v1/demo/seed`: 시연용 결함/리뷰/drift 데이터 생성
- `GET /api/v1/evaluation/wm811k`: WM-811K defect pattern 평가 fixture 조회
- `GET /api/v1/rag/evaluation`: defect RAG/Agent 미니 평가셋 조회
- `GET /api/v1/proxy-datasets`: 공개 proxy 이미지 데이터 후보와 표현 경계 조회
- `GET /api/v1/metrology/thresholds`: demo 계측 threshold 기준과 주의 문구 조회
- `GET /api/v1/metrics`: 운영 메트릭 조회
- `POST /api/v1/mlops/drift`: drift/성능 저하 이벤트 시뮬레이션
- `POST /api/v1/mlops/retrain`: 재학습 요청 action 시뮬레이션
- `POST /api/v1/models/promote`: 대응 기준 적용 action 시뮬레이션
- `POST /api/v1/models/rollback`: 이전 기준 복구 action 시뮬레이션
- `POST /api/v1/handoff/report`: 교대 인수인계 Daily Report 생성
- `GET /api/v1/handoff/latest`: 최신 Daily Report 조회
- `PUT /api/v1/handoff/{id}`: Daily Report 초안 수정 저장
- `POST /api/v1/handoff/{id}/send`: Daily Report 전달 완료 기록
- `GET /api/v1/copilot/ops`: 운영 Copilot 요약 조회

## 사전 요구사항

| 도구 | 최소 버전 | 확인 명령 |
|------|-----------|-----------|
| Conda | 임의 | `conda --version` |
| Node.js | 18 이상 | `node --version` |
| npm | 9 이상 | `npm --version` |
| Git | 임의 | `git --version` |

## 환경 구축

### 저장소 클론

```bash
git clone https://github.com/arnold6444/WaferGuard.git
cd WaferGuard
```

### Python 환경 (Conda)

```bash
conda create -n waferguard python=3.11 -y
conda activate waferguard
pip install -r requirements.txt
```

### 프론트엔드 의존성

```bash
cd frontend
npm install
cd ..
```

---

## 실행

터미널 2개를 열어 백엔드와 프론트엔드를 각각 실행한다.

### Windows (PowerShell) — 자동 실행

venv 생성, 패키지 설치, 백엔드·프론트엔드 동시 기동을 자동으로 처리한다. 포트가 이미 사용 중이면 자동으로 다음 포트(5174, 8001…)를 사용하며 실제 주소는 `outputs/runtime-url.txt`에 저장된다.

```powershell
.\start.ps1
```

종료는 PowerShell 창에서 `Ctrl+C`.

### macOS / Linux

**터미널 1 — 백엔드**

```bash
conda activate waferguard
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

**터미널 2 — 프론트엔드**

```bash
cd frontend
VITE_API_BASE_URL=http://127.0.0.1:8000 npm run dev
```

### 접속 주소

```
Dashboard : http://127.0.0.1:5173
API docs  : http://127.0.0.1:8000/docs
```

백엔드 정상 기동 여부는 `http://127.0.0.1:8000/health` 에서 `{"status":"ok"}` 로 확인한다.

---

### 처음 실행 시 생성되는 디렉터리

```
outputs/
  images/          # 생성된 wafer map, Grad-CAM, ROI 이미지
  waferguard.db    # SQLite 검사 이력
  runtime-url.txt  # 실행 중인 주소 목록
```

`outputs/` 는 `.gitignore`에 포함되어 있으며 앱 기동 시 자동 생성된다.

## 검증

백엔드가 실행 중인 상태에서 아래 명령으로 주요 엔드포인트를 한 번에 테스트할 수 있다.

```bash
# macOS/Linux
conda activate waferguard
python scripts/smoke_test.py

# Windows
conda activate waferguard
python scripts\smoke_test.py
```

프론트엔드 빌드 검증:

```bash
cd frontend
npm run build
```

## 실제 데이터로 확장할 때

- `app/services/pipeline.py`: synthetic 검사 엔진을 실제 defect classifier + Grad-CAM으로 교체
- `app/services/evaluation.py`와 `app/data/wm811k_evaluation_fixture.json`: fixture 숫자를 실제 validation 결과와 학습 로그로 교체
- `app/services/action_card.py`: synthetic Action Card와 metrology rule hit를 실제 MES/FDC/SPC, metrology 결과와 연결
- `app/services/rag.py`: 로컬 사례 목록을 실제 문서 검색으로 교체
- `app/data/defect_rag_eval_set.json`: 미니 평가셋을 실제 업무 문서 기반 eval set으로 확장
- `app/services/reporting.py`: 로컬 리포트 엔진을 최신 AI API 호출로 교체
- `app/services/storage.py`: SQLite를 운영 DB로 교체
- `app/services/copilot.py`: shift log, 설비 PM 이력, 품질 이슈 기록과 연결해 실제 운영 Copilot으로 확장
