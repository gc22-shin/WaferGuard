# WaferGuard Agent Simulation Spec

## 제품 설명

WaferGuard는 웨이퍼 결함 분류 정확도 개선을 목표로 하지 않는다. 이 MVP의 목표는 공정 이상 상황을 시뮬레이션하고, Agent가 근거를 모아 품질 리스크를 판단한 뒤 대응 action을 추천/수행하는 흐름을 보여주는 것이다.

## 사용자

- 공정/품질 엔지니어
- 교대 근무 리더
- Agent/RAG 시스템 시연 평가자

## 핵심 시나리오

1. 사용자가 wafer defect, process step, recipe, 계측값을 입력한다.
2. 시스템이 synthetic wafer map, Grad-CAM overlay, ROI crop을 생성한다.
3. metrology rule hit와 RAG 유사 사례를 결합해 Defect Action Card를 만든다.
4. Agent가 품질 리스크, 추가 확인 항목, 담당 영역, next action을 제안한다.
5. drift/성능 저하 상황에서는 재학습 요청, 대응 기준 적용, 이전 기준 복구 action을 시뮬레이션한다.
6. 교대 시간이 가까우면 Daily Report 초안을 만들고, 근무자가 수정 후 전달 완료로 기록한다.

## 주요 화면

- Agent Simulation Flow: 이상 입력 -> 근거 수집 -> 품질 리스크 판단 -> action 수행 흐름
- Scenario Input: wafer, line, equipment, process step, recipe, metrology, defect hint 입력
- Agent Decision: wafer map, Grad-CAM overlay, ROI crop, Defect Action Card, 리포트, 승인/검토 버튼
- Data Boundary: Real / Synthetic / Fixture / Eval 구분
- WM-811K Evaluation: confusion matrix, critical miss, class imbalance, drift, 품질 리스크
- Action Queue: 고위험 검토 대기 목록
- Agent Actions: drift signal, 재학습 요청, 대응 기준 적용, 이전 기준 복구 상태
- Daily Report: 교대 근무자 인수인계, 설비 특이사항, Scrap Risk, 다음 근무자 체크리스트
- Shift Copilot Chat: 채팅으로 초안 생성, 설비 특이사항 질문, 전달 확인
- Fab Ops Copilot: 설비별 반복 패턴 메모리, 권장 조치, near-miss, 엔지니어 판단 추적
- Ledger: 최근 시뮬레이션/검사 이력

## API

- `GET /health`
- `POST /api/v1/inspect`
- `GET /api/v1/inspections`
- `GET /api/v1/inspect/{id}`
- `POST /api/v1/review/{id}`
- `GET /api/v1/metrics`
- `POST /api/v1/mlops/drift`
- `POST /api/v1/mlops/retrain`
- `POST /api/v1/models/promote`
- `POST /api/v1/models/rollback`
- `POST /api/v1/handoff/report`
- `GET /api/v1/handoff/latest`
- `PUT /api/v1/handoff/{id}`
- `POST /api/v1/handoff/{id}/send`
- `GET /api/v1/copilot/ops`
- `GET /api/v1/evaluation/wm811k`
- `GET /api/v1/rag/evaluation`
- `GET /api/v1/proxy-datasets`
- `GET /api/v1/metrology/thresholds`

## 데이터

- SQLite: `outputs/waferguard.db`
- 이미지 산출물: `outputs/images`
- 결함 유형: Center, Donut, Edge-Loc, Edge-Ring, Loc, Random, Scratch, Near-full, None
- 검사별 process context: lot, wafer, line, process step, tool, recipe
- 검사별 metrology context: CD, overlay, film thickness, roughness, defect count, yield proxy
- 검사별 image evidence: wafer map, Grad-CAM overlay, ROI crop, hotspot ratio
- 검사별 Defect Action Card: possible cause, metrology check, process check, next action, human review rule, metrology rule hit
- 평가 fixture: `app/data/wm811k_evaluation_fixture.json`
- RAG 미니 평가셋: `app/data/defect_rag_eval_set.json`
- 인수인계 리포트: `handoff_reports` 테이블에 생성 시점의 요약 JSON과 Markdown 저장
- 운영 Copilot 요약: 검사 이력, 리뷰 결과, handoff report를 계산해 화면에 표시

## 성공 기준

- 첫 화면에서 “분류 정확도 개선”이 아니라 “공정 이상 대응 Agent 시뮬레이션”임이 보인다.
- 한 명령으로 백엔드와 프론트엔드를 실행할 수 있다.
- 시나리오 실행 시 이미지, overlay, ROI, 리포트, Action Card, 이력이 생성된다.
- RAG 유사 사례와 metrology rule hit가 품질 리스크 판단 근거로 표시된다.
- drift/성능 저하 이벤트가 재학습 요청, 대응 기준 적용, 이전 기준 복구 action으로 연결된다.
- Daily Report가 설비 특이사항과 미처리 항목을 표준 형식으로 남긴다.
- Copilot 패널이 설비 반복 패턴과 다음 조치를 보여준다.
- Action Card가 defect 후보를 실제 원인 확정이 아니라 추가 확인 항목과 엔지니어 판단 흐름으로 연결한다.
- 대시보드가 실제 데이터, synthetic 데이터, fixture 평가, planned integration을 구분해 과장 표현을 막는다.
