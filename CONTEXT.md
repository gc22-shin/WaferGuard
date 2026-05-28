# WaferGuard

공정 이상 상황을 시뮬레이션하고, LLM 에이전트가 근거를 모아 품질 리스크를 판단한 뒤 대응 action을 수행하는 흐름을 보여주는 로컬 MVP. DNN 성능 개선이 아니라 Agent/RAG 기반 운영 자동화가 주제다.

## Language

**Agent**:
수집된 **Evidence**를 입력받아 상황을 판단하고, 스스로 어떤 **Tool**을 호출할지 결정하는 LLM 기반 의사결정 주체. 제공 API에 네이티브 function calling이 없으므로, Agent는 가능한 Tool 목록을 받아 "어떤 Tool을 어떤 인자로 부를지"를 **구조화된 JSON으로 응답**하고 앱이 이를 파싱해 실행한다(structured tool selection). 규칙으로 미리 정해진 선형 파이프라인과 구분된다.
_Avoid_: 분류기(classifier), 모델(model) — 이들은 결함을 판정하는 별개 구성요소다. "네이티브 tool-calling/function calling" — 제공 API가 지원하지 않으므로 그렇게 표현하지 않는다.

**Evidence**:
Agent가 판단의 근거로 삼는, 결정적(규칙 기반)으로 먼저 계산된 입력. metrology rule hit, risk score, RAG 유사 사례가 여기 속한다. Agent는 Evidence를 *해석*하되 새로운 risk score를 지어내지 않는다.
_Avoid_: 입력(input), 컨텍스트(context) — 너무 일반적이다.

**Tool**:
Agent가 호출할 수 있는 단위 action으로, 기존 서비스 기능(drift 조회, RAG 검색, 검토 큐 등록, 재학습, promote/rollback, alert)을 감싼 래퍼다.
_Avoid_: 액션(action) — 일반어로 남겨두고, 호출 가능한 단위에는 Tool을 쓴다.

**Low-risk Tool**:
Agent가 사람 승인 없이 자동 실행해도 되는 Tool. 조회·해석·검토 큐 등록처럼 되돌릴 수 있거나 사람에게 넘기는 행위.

**High-risk Tool**:
실행 전 사람 승인이 반드시 필요한 Tool. 재학습 트리거, 모델 promote/rollback, critical alert 발송처럼 영향이 크고 되돌리기 어려운 행위.

**Human-in-the-Loop**:
신뢰도가 낮거나 신규 패턴이거나 High-risk Tool이 관련될 때, 자동 실행 대신 엔지니어 검토·승인 단계로 넘기는 원칙. 프로젝트 전반의 안전 기준.

## Example dialogue

- 엔지니어: "Center 결함이 들어왔는데 Agent가 알아서 재학습 걸어?"
- 개발자: "아니. 재학습은 High-risk Tool이라 Agent가 추천만 하고 승인 버튼을 띄워. Agent가 자동으로 부를 수 있는 건 RAG 검색이나 검토 큐 등록 같은 Low-risk Tool뿐이야."
- 엔지니어: "그럼 risk score도 Agent가 정해?"
- 개발자: "그건 Evidence야. risk.py가 규칙으로 먼저 계산해서 Agent한테 주고, Agent는 그걸 해석만 해. 점수를 새로 지어내면 원인 단정 금지 원칙에 어긋나니까."
