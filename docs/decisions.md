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
