# 진행 상황

## 2026-05-12

- [x] 제공 문서 기반 초기 요구사항 반영
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
- [x] Shift Copilot Chat 추가
- [x] 교대 시간 자동 초안 생성 UI 추가
- [x] Daily Report 초안 수정 저장과 전달 완료 상태 추가

## 2026-05-13

- [x] 자동 교대 초안 중복 방지 로직 추가
- [x] 같은 날짜/라인/근무/시간 기준 `schedule_key` 저장 추가
- [x] 여러 결함 유형과 엔지니어 리뷰를 만드는 시연 데이터 생성 API 추가
- [x] 대시보드 상단에 `시연 데이터` 버튼 추가
- [x] 실행 시 실제 접속 주소를 `outputs/runtime-url.txt`에 저장하도록 개선

## 2026-05-19

- [x] WM-811K defect pattern 평가 리포트 API 추가
- [x] confusion matrix와 class별 precision/recall/F1 데이터 추가
- [x] critical defect 미검출 분석과 품질 리스크 설명 추가
- [x] class imbalance 대응 전략과 drift 시나리오 추가
- [x] Grad-CAM 판단 근거 체크 항목 추가
- [x] 대시보드에 WM-811K 평가 리스크 분석 패널 추가
- [x] WM-811K 평가 숫자를 `app/data/wm811k_evaluation_fixture.json` 파일 기반으로 분리
- [x] 검사 요청과 저장 결과에 lot/process/recipe/metrology metadata 추가
- [x] Defect Action Card API 응답과 대시보드 패널 추가
- [x] Real / Fixture / Synthetic / Eval 데이터 경계 표시 추가
- [x] defect RAG/Agent 미니 평가셋과 `/api/v1/rag/evaluation` API 추가
- [x] CD/overlay/thickness/defect count/yield proxy 기반 metrology rule hit 추가
- [x] rule hit를 risk score, review_required 상태, Action Card next action에 반영
- [x] 대시보드 Action Card에 rule hit 근거와 우선 조치 표시 추가
- [x] ROI crop 이미지 산출물 추가
- [x] roughness metrology 입력과 rule hit 추가
- [x] 공개 proxy 데이터 manifest와 metrology threshold basis API 추가
- [x] WM-811K 평가 상세 표를 기본 접힘 상태로 단순화

## 2026-05-28

- [x] 교수 피드백 기준으로 프로젝트 프레이밍을 Agent 시뮬레이션 MVP로 변경
- [x] 첫 화면 제목을 `공정 이상 대응 Agent 시뮬레이션`으로 변경
- [x] `이상 상황 입력 -> 근거 수집 -> 품질 리스크 판단 -> action 수행` 흐름 패널 추가
- [x] 분류 지표 중심 문구를 Agent 판단 근거/대응 action 중심 문구로 교체
- [x] README, spec, implementation plan, interview summary에서 복잡한 서버 인프라 중심 설명 제거
- [x] FastAPI 문서 제목을 Agent Simulation API로 변경
- [x] 서버/cron에서 호출 가능한 자동 감시 tick API 추가
- [x] Auto Monitor UI 추가: 데이터 유입, Agent trigger, drift check, handoff 상태 표시
- [x] 화면 배치를 `자동 감시 -> Agent 판단 -> 조치 큐 -> 수동 시나리오` 흐름으로 재정렬

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
- `POST /api/v1/demo/seed` smoke test 통과
- 자동 초안 `reuse_existing` 중복 방지 smoke test 통과
- `GET /api/v1/copilot/ops` smoke test 통과
- `PUT /api/v1/handoff/{id}` smoke test 통과
- `POST /api/v1/handoff/{id}/send` smoke test 통과
- 2026-05-19 보강 후 `python -m compileall app scripts`: 통과
- 2026-05-19 보강 후 `.\.venv\Scripts\python.exe scripts\smoke_test.py`: 통과, RAG eval 12문항과 metrology rule hit 3건 확인
- 2026-05-19 보강 후 `npm run build`: 통과
- 보강 확인 서버: Dashboard `http://127.0.0.1:5181`, API `http://127.0.0.1:8010`
- Codex 내장 브라우저에서 Real/Fixture/Synthetic/Eval 경계, 12 RAG checks, process/metrology 입력, Defect Action Card 렌더링 확인
- `WF-RULE-VERIFY-001` Scratch 검사에서 overlay excursion 포함 rule hit 3건, `Risk +0.22`, `review_required` UI 반영 확인
- 2026-05-19 UI 단순화/ROI 보강 후 `python -m compileall app scripts`: 통과
- 2026-05-19 UI 단순화/ROI 보강 후 `.\.venv\Scripts\python.exe scripts\smoke_test.py`: 통과, ROI crop과 metrology rule hit 4건 확인
- 2026-05-19 UI 단순화/ROI 보강 후 `npm run build`: 통과
- Codex 내장 브라우저에서 Action Card 빈 fallback 미노출, ROI crop, roughness, 평가 상세 접힘/펼침 확인
- 2026-05-28 자동 감시 보강 후 `python -m compileall app scripts`: 통과
- 2026-05-28 자동 감시 보강 후 `npm run build`: 통과
- `GET /api/v1/automation/status`: 통과
- `POST /api/v1/automation/tick`: 통과, 신규 inspection 생성 및 high-risk event 4건 반환 확인
