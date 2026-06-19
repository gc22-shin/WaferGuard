# README 데모 이미지

이 폴더의 이미지는 루트 [`README.md`](../../README.md)의 "핵심 기능" 섹션에서 참조된다.
아래 **파일명 그대로** 스크린샷을 넣으면 README에 자동으로 표시된다.

| 파일명 | 화면 | 권장 캡처 내용 |
|--------|------|----------------|
| `live-inspection.png` | 실시간 검사 콘솔 | wafer map · Grad-CAM · Risk 게이지 · 계측 결과 |
| `inspection-agent.png` | Inspection Agent 판단 | 추정 원인 랭킹 + Next Actions |
| `rag-evidence.png` | Vector RAG 근거 | RAG Top-3 유사 사례 패널 |
| `mlops-agent.png` | 멀티에이전트 위임 & 자율성 | MLOps Agent 콘솔 · 자율성 다이얼 |
| `model-registry.png` | 모델 레지스트리 & 승인 | Model Registry · Pending Approvals · Drift |
| `data-rag.png` | 학습 루프 · 데이터 | 유사 사례 검색 + SQLite 데이터 브라우저 |

## 캡처 방법

**(A) 실제 대시보드 캡처 (권장)**
1. 백엔드/프론트엔드를 실행한다 (루트 README의 "실행" 참고).
2. 각 화면에서 스크린샷을 찍는다.
3. 위 파일명으로 이 폴더(`docs/assets/`)에 저장한다.

**(B) 발표자료(PDF) 슬라이드 추출**
`WaferGuard 최최종.pdf`의 데모 슬라이드(4~9페이지)를 PNG로 내보내 위 파일명으로 저장한다.

```bash
# macOS / poppler (brew install poppler) 예시 — 4페이지를 PNG로 추출
pdftoppm -png -r 150 -f 4 -l 4 "WaferGuard 최최종.pdf" docs/assets/live-inspection
```

> 가로폭 1600px 내외 PNG를 권장한다. 파일을 채운 뒤 `git add docs/assets/*.png` 로 커밋하면 GitHub에 표시된다.
> (`outputs/` 폴더는 `.gitignore` 대상이라 README 이미지로 쓸 수 없다 — 반드시 이 폴더를 사용할 것.)
