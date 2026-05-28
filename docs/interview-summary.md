# WaferGuard 요구사항 요약

## 현재 방향

WaferGuard는 단순히 웨이퍼 결함 분류 모델을 더 잘 만드는 프로젝트가 아니다. 프로젝트의 목적은 공정 이상 상황을 시뮬레이션하고, Agent가 근거를 수집해 품질 리스크를 판단한 뒤 대응 action을 추천/수행하는 운영 자동화 흐름을 보여주는 것이다.

## 핵심 목표

- wafer defect와 공정 이상 상황을 시뮬레이션한다.
- Grad-CAM/ROI 형태의 시각 근거를 보여준다.
- metrology rule hit와 RAG 유사 사례로 Agent 판단 근거를 만든다.
- critical defect 미검출이 품질 리스크에서 왜 문제인지 설명한다.
- drift/성능 저하 상황에서 재학습 요청, 대응 기준 적용, 이전 기준 복구 action을 시뮬레이션한다.
- Daily Report와 교대 인수인계로 현장 운영 흐름을 연결한다.

## MVP

- 로컬 FastAPI 백엔드
- React 운영 대시보드
- 샘플 웨이퍼 이미지 생성과 9개 결함 유형 시뮬레이션
- Grad-CAM 스타일 히트맵, overlay, ROI crop 생성
- 로컬 RAG 사례 검색과 한국어 리포트 생성
- Defect Action Card 생성
- SQLite 검사 이력 저장
- drift, 재학습 요청, 대응 기준 적용, 이전 기준 복구 action 시뮬레이션
- Daily Report 자동 초안/수정/전달 흐름

## 나중에 할 일

- 실제 WM-811K 데이터셋과 validation 결과 연결
- 실제 defect classifier와 Grad-CAM 구현
- 최신 AI API 연동
- 실제 문서 검색 기반 RAG로 교체
- MES/FDC/SPC, 계측 DB, 설비 PM 이력 연동
- 운영 DB와 권한/배포 구조 연결
