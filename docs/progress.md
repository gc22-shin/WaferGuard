# 진행 상황

## 2026-05-12

- [x] `WaferGuard_PRD.docx`, `WaferGuard_AWS_Plan.docx` 요구사항 반영
- [x] 로컬 MVP 범위 확정
- [x] FastAPI 백엔드 뼈대 작성
- [x] synthetic wafer map, Grad-CAM style overlay 생성 로직 작성
- [x] RAG 사례 검색과 한국어 리포트 생성 로직 작성
- [x] SQLite 저장소와 메트릭 API 작성
- [x] 드리프트, 재학습, 승급, 롤백 시뮬레이션 API 작성
- [x] React 운영 대시보드 작성
- [x] 교대 인수인계용 Daily Report API 작성
- [x] 설비 특이사항, Scrap Risk, 다음 근무자 체크리스트 생성 로직 작성
- [x] 대시보드에 Daily Report 패널 추가
- [x] Fab Ops Copilot API 작성
- [x] 설비 메모리, 조치 추천, near-miss, 엔지니어 판단 이력 패널 추가

## 남은 확인

- [x] Python dependency 설치
- [x] smoke test 실행
- [x] frontend build 실행
- [x] 로컬 dev server 실행 확인

## 검증 결과

- `python -m compileall app scripts`: 통과
- `.\.venv\Scripts\python.exe scripts\smoke_test.py`: 통과
- `npm run build`: 통과
- `http://127.0.0.1:8000/health`: `ok`
- Codex 내장 브라우저에서 `http://127.0.0.1:5174` 렌더링 확인
- `샘플 검사 실행` 버튼 클릭 후 최신 검사 결과, Grad-CAM, 리포트, High Risk/검토 큐 갱신 확인
- `POST /api/v1/handoff/report` smoke test 통과
- `GET /api/v1/copilot/ops` smoke test 통과
