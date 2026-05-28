# 구현 계획

## 1단계: 로컬 Agent MVP 뼈대

- FastAPI 앱 생성
- SQLite 스키마 생성
- React/Vite 대시보드 생성
- 실행 스크립트 작성

## 2단계: 공정 이상 시나리오 입력

- 9개 결함 유형 샘플 웨이퍼 생성
- lot, process step, recipe, metrology 입력 연결
- Grad-CAM 스타일 heatmap/overlay 생성
- ROI crop 생성
- 위험도 계산
- 검사 결과 저장

## 3단계: Agent 판단 근거 구성

- RAG 유사 사례 검색
- metrology rule hit 생성
- WM-811K 평가 fixture 표시
- critical miss와 품질 리스크 설명
- 데이터 경계 Real / Synthetic / Fixture / Eval 표시

## 4단계: Action Card와 대응 action

- Defect Action Card 생성
- 가능 원인 후보, 추가 확인 항목, process check, next action 표시
- drift/성능 저하 이벤트 생성
- 재학습 요청, 대응 기준 적용, 이전 기준 복구 action 시뮬레이션

## 5단계: 인수인계 표준화

- 검사 이력 기반 설비 특이사항 추출
- Scrap Risk 자동 판정
- 미처리 High Risk/검토 큐 항목 정리
- 다음 근무자 체크리스트 생성
- 생성된 Daily Report를 DB에 저장하고 대시보드에서 조회

## 6단계: 운영 Copilot 차별화

- 설비별 반복 결함 메모리 생성
- 결함 유형별 첫 확인 항목과 담당 영역 추천
- near-miss / Scrap 방지 로그 생성
- AI 판단과 엔지니어 판단 이력 연결

## 7단계: 교대 리포트 워크플로우

- 채팅형 인터페이스에서 초안 생성과 설비 질문 지원
- 교대 시간 기반 자동 초안 생성
- Daily Report 초안 수정 저장
- "이대로 전달하시겠습니까?" 확인 후 전달 완료 상태 기록

## 8단계: 검증

- Python smoke test
- Frontend build
- 백엔드 health check
- 대시보드 로컬 접속 확인

## 9단계: 교수 피드백 반영

- 화면과 문서에서 분류 정확도 개선 프로젝트처럼 보이는 표현 제거
- 복잡한 서버 인프라 설명 제거
- `이상 상황 -> 근거 수집 -> 품질 리스크 판단 -> action 수행` 흐름을 첫 화면에 노출
- API 기반 Agent 시스템 MVP로 README, spec, UI 프레이밍 정리
