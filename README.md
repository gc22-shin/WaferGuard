# WaferGuard MLOps

문서 `WaferGuard_PRD.docx`, `WaferGuard_AWS_Plan.docx`를 기준으로 만든 로컬 시연용 MVP다.

## 지금 구현된 것

- FastAPI 검사 API
- React 운영 대시보드
- 9개 웨이퍼 결함 유형 샘플 생성
- Grad-CAM 스타일 heatmap/overlay 생성
- RAG 유사 사례 Top-3
- 한국어 자연어 리포트
- SQLite 검사 이력 저장
- 드리프트 감지, 재학습, 모델 승급, 롤백 시뮬레이션
- 교대 근무 인수인계용 Daily Report 생성
- 설비 특이사항, Scrap Risk, 미처리 항목, 다음 근무자 체크리스트 저장

## 주요 API

- `POST /api/v1/inspect`: 웨이퍼 검사 실행
- `GET /api/v1/metrics`: 운영 메트릭 조회
- `POST /api/v1/mlops/drift`: 드리프트 이벤트 시뮬레이션
- `POST /api/v1/mlops/retrain`: 재학습 시뮬레이션
- `POST /api/v1/models/promote`: Staging 모델 승급
- `POST /api/v1/models/rollback`: 모델 롤백
- `POST /api/v1/handoff/report`: 교대 인수인계 Daily Report 생성
- `GET /api/v1/handoff/latest`: 최신 Daily Report 조회

## 실행

PowerShell에서 아래 명령을 실행한다.

```powershell
.\start.ps1
```

실행 후 접속 주소:

- Dashboard: `start.ps1`이 출력하는 주소
- API docs: `start.ps1`이 출력하는 주소 + `/docs`
- Health: API 주소 + `/health`

기본값은 Dashboard `http://127.0.0.1:5173`, API `http://127.0.0.1:8000`이다. 이미 사용 중인 포트가 있으면 자동으로 다음 포트를 사용한다.

## 검증

```powershell
.\.venv\Scripts\python.exe scripts\smoke_test.py
cd frontend
npm run build
```

## 실제 AWS 버전으로 확장할 때

- `app/services/pipeline.py`: synthetic 검사 엔진을 PyTorch CNN + Grad-CAM으로 교체
- `app/services/rag.py`: 로컬 사례 목록을 ChromaDB 검색으로 교체
- `app/services/reporting.py`: 로컬 리포트 엔진을 Gemini API 호출로 교체
- `app/services/storage.py`: SQLite를 RDS PostgreSQL로 교체
- `app/services/mlops.py`: 시뮬레이션을 MLflow, Evidently, Airflow, EventBridge 연동으로 교체
