# 구현 계획

## 1단계: 로컬 MVP 뼈대

- FastAPI 앱 생성
- SQLite 스키마 생성
- React/Vite 대시보드 생성
- 실행 스크립트 작성

## 2단계: 검사 파이프라인

- 9개 결함 유형 샘플 웨이퍼 생성
- Grad-CAM 스타일 heatmap/overlay 생성
- 위험도 계산
- RAG 유사 사례 검색
- 한국어 리포트 생성
- 검사 결과 저장

## 3단계: MLOps 시뮬레이션

- 드리프트 이벤트 생성
- 재학습 job 생성
- Staging 모델 등록
- Production 승급
- 롤백 이벤트 생성

## 4단계: 검증

- Python smoke test
- Frontend build
- 백엔드 health check
- 대시보드 로컬 접속 확인

## 5단계: 인수인계 표준화

- 검사 이력 기반 설비 특이사항 추출
- Scrap Risk 자동 판정
- 미처리 High Risk/검토 큐 항목 정리
- 다음 근무자 체크리스트 생성
- 생성된 Daily Report를 DB에 저장하고 대시보드에서 조회
