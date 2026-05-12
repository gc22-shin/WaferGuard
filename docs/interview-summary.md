# WaferGuard 문서 기반 요구사항 요약

이 문서는 사용자가 제공한 `WaferGuard_PRD.docx`, `WaferGuard_AWS_Plan.docx`를 바탕으로 정리했다. 별도 인터뷰 없이 문서에 이미 적힌 내용을 우선 요구사항으로 본다.

## 핵심 목표

- 반도체 웨이퍼 결함을 자동 분류한다.
- Grad-CAM 형태의 시각 근거를 보여준다.
- RAG 유사 사례와 자연어 리포트로 엔지니어 판단을 돕는다.
- 드리프트 감지, 재학습, 모델 승급, 롤백 흐름을 시연 가능하게 만든다.
- AWS는 인프라로만 사용하고 SageMaker, Bedrock 같은 관리형 AI/ML 서비스는 쓰지 않는다.

## MVP

- 로컬 FastAPI 백엔드
- React 운영 대시보드
- 샘플 웨이퍼 이미지 생성과 9개 결함 유형 시뮬레이션
- Grad-CAM 스타일 히트맵과 overlay 이미지 생성
- 로컬 RAG 사례 검색과 한국어 리포트 생성
- SQLite 검사 이력 저장
- 드리프트, 재학습, 모델 승급, 롤백 시뮬레이션

## 나중에 할 일

- 실제 WM-811K 데이터셋 학습
- PyTorch ResNet/EfficientNet 앙상블 적용
- 실제 Grad-CAM 구현
- Gemini API 연동
- ChromaDB, MLflow, Evidently, Airflow 실서비스 연결
- AWS CDK/Terraform 인프라 코드 작성
- ECS, EC2 GPU, RDS, S3, CloudWatch 배포
