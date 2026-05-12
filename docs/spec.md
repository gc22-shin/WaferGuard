# WaferGuard MVP Spec

## 제품 설명

WaferGuard는 웨이퍼 결함 검사 결과를 운영자가 빠르게 이해하고 대응할 수 있게 돕는 로컬 시연용 MLOps MVP다. PRD의 전체 시스템을 축소해, 한 컴퓨터에서 검사, 설명, 검토, MLOps 이벤트를 확인할 수 있게 한다.

## 사용자

- 공정/품질 엔지니어
- MLOps 담당자
- 시연 평가자

## 주요 화면

- 운영 대시보드: 총 검사, High Risk, 검토 큐, 운영 모델 F1
- 검사 요청 패널: wafer, line, equipment, defect hint 입력
- 최신 결과: 웨이퍼 이미지, Grad-CAM overlay, 리포트, 승인/검토 버튼
- Action Queue: 고위험 검토 대기 목록
- Analytics: 결함 분포, 위험도 추이, 모델 파이프라인 상태
- Daily Report: 교대 근무자 인수인계, 설비 특이사항, Scrap Risk, 다음 근무자 체크리스트
- Ledger: 최근 검사 이력

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

## 데이터

- SQLite: `outputs/waferguard.db`
- 이미지 산출물: `outputs/images`
- 결함 유형: Center, Donut, Edge-Loc, Edge-Ring, Loc, Random, Scratch, Near-full, None
- 인수인계 리포트: `handoff_reports` 테이블에 생성 시점의 요약 JSON과 Markdown 저장

## 성공 기준

- 한 명령으로 백엔드와 프론트엔드를 실행할 수 있다.
- 샘플 검사 실행 시 이미지, overlay, 리포트, 이력이 생성된다.
- 드리프트 이벤트가 재학습 job과 Staging 모델을 만든다.
- 모델 승급과 롤백이 대시보드에 반영된다.
- Daily Report가 설비 특이사항과 미처리 항목을 표준 형식으로 남긴다.
