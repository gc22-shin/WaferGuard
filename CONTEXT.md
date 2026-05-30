# WaferGuard

공정 이상 상황을 시뮬레이션하고, LLM 에이전트가 근거를 모아 품질 리스크를 판단한 뒤 대응 action을 수행하는 흐름을 보여주는 로컬 MVP. DNN 성능 개선이 아니라 Agent/RAG 기반 운영 자동화가 주제다.

## Language

**Agent**:
수집된 **Evidence**를 입력받아 상황을 판단하고, 스스로 어떤 **Tool**을 호출할지 결정하는 LLM 기반 의사결정 주체. 모델은 Luxia gateway의 **OpenAI passthrough(GPT-4o-mini)**를 사용한다 — 텍스트 Evidence와 wafer 이미지를 한 번의 호출로 multimodal 처리하기 위함이다. Native function calling이 지원되므로 구조화 응답은 tool calling API로 받는다(이전 결정에서 raw JSON 프롬프트 방식도 fallback으로 검토했음).
_Why GPT-4o-mini via Luxia gateway, not luxia3-* native_: Luxia native chat은 텍스트 only고 비전은 `/luxia/v1/document-ai` 별도 호출이 필요해 2-step이 된다. 운영 시연 흐름이 늘어지고 LLM 호출 수가 늘어 [[Agent Escalation]] 비용 통제와 충돌한다. 단, Luxia gateway를 거치므로 "Luxia API 활용"이라는 정체성은 유지된다 (인증·과금·관측을 Luxia 한 곳에서). RAG 임베딩/리랭킹은 여전히 Luxia native를 쓴다.
_Avoid_: 분류기(classifier), 모델(model) — 이들은 결함을 판정하는 별개 구성요소다.

**Evidence**:
Agent가 판단의 근거로 삼는, 결정적(규칙 기반)으로 먼저 계산된 입력. metrology rule hit, risk score, RAG 유사 사례가 여기 속한다. Agent는 Evidence를 *해석*하되 새로운 risk score를 지어내지 않는다.
_Avoid_: 입력(input), 컨텍스트(context) — 너무 일반적이다.

**Tool**:
Agent가 호출할 수 있는 단위 action으로, 기존 서비스 기능을 감싼 래퍼다. 본 MVP는 5개로 한정한다:
- `search_similar_cases(defect_type, k)` ([[Low-risk Tool]]) — RAG 사례 조회
- `inspect_image(image_url, focus_zone)` ([[Low-risk Tool]]) — GPT-4o-mini multimodal 호출로 wafer/Grad-CAM 이미지 해석
- `enqueue_for_review(inspection_id, reason)` ([[Low-risk Tool]]) — 검토 큐 등록
- `trigger_critical_alert(inspection_id, message)` ([[High-risk Tool]]) — 사람 승인 후 SNS/Slack 알림
- `recommend_retrain(reason)` ([[High-risk Tool]]) — 사람 승인 후 재학습 시뮬레이션 트리거
_Avoid_: 액션(action) — 일반어로 남겨두고, 호출 가능한 단위에는 Tool을 쓴다.

**Low-risk Tool**:
Agent가 사람 승인 없이 자동 실행해도 되는 Tool. 조회·해석·검토 큐 등록처럼 되돌릴 수 있거나 사람에게 넘기는 행위.

**High-risk Tool**:
실행 전 사람 승인이 반드시 필요한 Tool. 재학습 트리거, 모델 promote/rollback, critical alert 발송처럼 영향이 크고 되돌리기 어려운 행위.

**Human-in-the-Loop**:
신뢰도가 낮거나 신규 패턴이거나 High-risk Tool이 관련될 때, 자동 실행 대신 엔지니어 검토·승인 단계로 넘기는 원칙. 프로젝트 전반의 안전 기준.

**Agent Escalation**:
inspect 결과를 무조건 Agent에게 보내지 않고, 룰로 먼저 risk를 계산한 뒤 `review_required` 또는 `High` risk 또는 critical metrology rule hit가 발생한 케이스만 자동으로 Agent에게 넘기는 정책. Low로 자동 통과된 케이스는 룰만으로 종료된다(화면에 "룰 기반 자동 통과, Agent 미참여" 라벨 노출). 사용자는 검토 큐에서 어떤 inspection이든 "Agent에게 재질의" 버튼으로 수동 호출할 수 있다.
_Why_: Luxia 호출 수와 AWS Lambda concurrency를 통제하고, [[Human-in-the-Loop]] 원칙(의심스러운 케이스만 Agent/사람이 본다)과 일치시키기 위해.

**Agent Trace**:
Agent loop의 전체 실행 기록 (messages, tool_calls, final_action). SQLite `agent_traces` 테이블에 inspection_id별로 저장한다. 사후 분석과 발표 시 LangGraph 흐름 설명에 사용한다.

**Pending Approval**:
High-risk Tool(`trigger_critical_alert`, `recommend_retrain`) 호출 전에 Human-in-the-Loop를 실현하는 대기 항목. SQLite `pending_approvals` 테이블에 status(pending|approved|rejected)로 관리한다. 엔지니어가 승인하면 실제 action이 실행된다.

**RAG Document**:
SQLite `rag_documents` 테이블의 한 row. content(텍스트), defect_type, embedding(BLOB, 1024-d), metadata_json으로 구성된다. Luxia embedding API로 인덱싱하고, cosine similarity + rerank로 검색한다.

**Agent Mode**:
inspect 응답의 `agent_mode` 필드. `rule_only`(Low risk, Agent 미참여), `stub`(LUXIA_API_KEY 미설정), `llm`(실제 GPT-4o-mini 호출), `error` 중 하나.

## Example dialogue

- 엔지니어: "Center 결함이 들어왔는데 Agent가 알아서 재학습 걸어?"
- 개발자: "아니. 재학습은 High-risk Tool이라 Agent가 추천만 하고 승인 버튼을 띄워. Agent가 자동으로 부를 수 있는 건 RAG 검색이나 검토 큐 등록 같은 Low-risk Tool뿐이야."
- 엔지니어: "그럼 risk score도 Agent가 정해?"
- 개발자: "그건 Evidence야. risk.py가 규칙으로 먼저 계산해서 Agent한테 주고, Agent는 그걸 해석만 해. 점수를 새로 지어내면 원인 단정 금지 원칙에 어긋나니까."
