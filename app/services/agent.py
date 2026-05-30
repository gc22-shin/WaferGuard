"""
WaferGuard Agent — LangGraph StateGraph implementation.

Flow
----
START → decide → (tool_call | final_action) → tool_exec → decide → ... → final_action → END

Nodes
-----
decide:
    Calls GPT-4o-mini (via luxia_client.chat_with_tools) with the Evidence text
    + wafer image URLs.  The model either selects a Tool or produces a final answer.

tool_exec:
    Dispatches to a Tool function from the registry (see _TOOL_REGISTRY below).
    Falls back to no-op stubs if app/services/tools.py does not yet exist.

final_action:
    Collects the assistant's last message as the Agent decision text.  Persists
    the full trace to the agent_traces table.

Public API
----------
run(evidence: dict) -> dict
    evidence keys: inspection_id, defect_type, risk_level, risk_score,
                   confidence, metrology_rule_hits, rag_cases, process_context,
                   metrology, image_urls (list[str])

    Returns:
        {
          "final_action": str,
          "tool_calls": list[dict],   # [{name, args, result}, ...]
          "trace_id": str,
          "agent_mode": "llm" | "stub",
        }

Tool function signatures (defined in app/services/tools.py):
    search_similar_cases(query: str, k: int = 3) -> list[dict]
    inspect_image(image_url: str, focus: str) -> dict
    enqueue_for_review(inspection_id: str, reason: str) -> dict
    trigger_critical_alert(inspection_id: str, message: str) -> dict
    recommend_retrain(reason: str) -> dict
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any, TypedDict

from app.services import luxia_client
from app.services.storage import insert_agent_trace

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Tool schemas (OpenAI function-call format)
# ---------------------------------------------------------------------------

_TOOL_SCHEMAS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "search_similar_cases",
            "description": (
                "RAG: 유사 결함 사례를 검색합니다. "
                "defect 유형과 맥락을 자연어로 쿼리하면 SQLite RAG index에서 유사 사례 k건을 반환합니다."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "결함 유형, 공정 단계, 위험 맥락을 포함한 자연어 쿼리",
                    },
                    "k": {
                        "type": "integer",
                        "description": "반환할 유사 사례 수 (기본 3)",
                        "default": 3,
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "inspect_image",
            "description": (
                "wafer 이미지 또는 Grad-CAM overlay를 GPT-4o-mini multimodal로 해석합니다. "
                "hotspot 위치, 패턴 특징, 주목할 영역을 판단합니다."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "image_url": {
                        "type": "string",
                        "description": "분석할 wafer 이미지 URL (overlay, ROI 등)",
                    },
                    "focus": {
                        "type": "string",
                        "description": "집중 분석 영역 또는 질문 (예: 'edge hotspot 위치 확인')",
                    },
                },
                "required": ["image_url", "focus"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "enqueue_for_review",
            "description": (
                "해당 inspection을 엔지니어 검토 큐에 등록합니다. "
                "신뢰도가 낮거나 판단이 불확실할 때 사용합니다 (Low-risk Tool)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "inspection_id": {
                        "type": "string",
                        "description": "검토 큐에 등록할 inspection ID",
                    },
                    "reason": {
                        "type": "string",
                        "description": "검토 큐 등록 이유",
                    },
                },
                "required": ["inspection_id", "reason"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "trigger_critical_alert",
            "description": (
                "Critical alert를 생성합니다 (High-risk Tool). "
                "실행 전 사람 승인이 필요하며, pending_approvals 테이블에 기록됩니다."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "inspection_id": {
                        "type": "string",
                        "description": "알림 대상 inspection ID",
                    },
                    "message": {
                        "type": "string",
                        "description": "알림 메시지 (결함 유형, 위험도, 조치 요청 포함)",
                    },
                },
                "required": ["inspection_id", "message"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "recommend_retrain",
            "description": (
                "재학습 추천을 생성합니다 (High-risk Tool). "
                "실행 전 사람 승인이 필요하며, pending_approvals 테이블에 기록됩니다."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "reason": {
                        "type": "string",
                        "description": "재학습이 필요한 이유 (drift, 신규 패턴, 성능 저하 등)",
                    },
                },
                "required": ["reason"],
            },
        },
    },
]

# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = """당신은 WaferGuard Fab Ops Agent입니다.
반도체 공정 이상 상황을 판단하고 적절한 대응 action을 수행합니다.

규칙:
1. Evidence(risk score, metrology rule hit, RAG 유사 사례)를 해석하되, 새 risk score를 임의로 생성하지 않습니다.
2. 제공된 RAG 사례 외에 출처 없는 사례를 인용하지 않습니다 (환각 방지).
3. High-risk Tool(trigger_critical_alert, recommend_retrain)은 반드시 명확한 근거와 함께 호출합니다.
4. 판단이 불확실하면 enqueue_for_review로 엔지니어에게 넘깁니다.
5. 최종 판단은 한국어로 간결하게 작성합니다.
6. 본 시뮬레이션에서 결함 분류는 입력값이며, Agent는 분류 결과에 대한 운영 판단을 시뮬레이션합니다.
7. RAG corpus는 50건 한정이며 사내 문서 검색이 아닙니다."""

# ---------------------------------------------------------------------------
# LangGraph State
# ---------------------------------------------------------------------------


class AgentState(TypedDict):
    inspection_id: str
    messages: list[dict]
    tool_calls_log: list[dict]
    final_action: str
    image_urls: list[str]
    max_iterations: int
    iteration: int


# ---------------------------------------------------------------------------
# Tool registry (lazy import so missing tools.py doesn't break import)
# ---------------------------------------------------------------------------


def _get_tool_registry() -> dict[str, Any]:
    """Load tool functions from tools.py, falling back to no-op stubs."""
    try:
        from app.services import tools  # noqa: PLC0415

        return {
            "search_similar_cases": tools.search_similar_cases,
            "inspect_image": tools.inspect_image,
            "enqueue_for_review": tools.enqueue_for_review,
            "trigger_critical_alert": tools.trigger_critical_alert,
            "recommend_retrain": tools.recommend_retrain,
        }
    except (ImportError, AttributeError) as exc:
        logger.warning("tools.py not available (%s); using no-op stubs.", exc)
        return _stub_registry()


def _stub_registry() -> dict[str, Any]:
    def _stub(**kwargs: Any) -> dict:
        return {"status": "stub", "note": "tools.py 미설치 — 스텁 실행", **kwargs}

    return {
        "search_similar_cases": lambda **kwargs: [_stub(**kwargs)],
        "inspect_image": lambda **kwargs: _stub(**kwargs),
        "enqueue_for_review": lambda **kwargs: _stub(**kwargs),
        "trigger_critical_alert": lambda **kwargs: _stub(**kwargs),
        "recommend_retrain": lambda **kwargs: _stub(**kwargs),
    }


# ---------------------------------------------------------------------------
# Evidence serializer
# ---------------------------------------------------------------------------


def _build_evidence_text(evidence: dict) -> str:
    """Convert rule-computed evidence dict into a structured prompt string."""
    lines: list[str] = [
        f"## 검사 ID: {evidence.get('inspection_id', 'N/A')}",
        f"## 결함 유형: {evidence.get('defect_type', 'Unknown')}",
        f"## 위험 수준: {evidence.get('risk_level', 'N/A')} (score: {evidence.get('risk_score', 0):.3f})",
        f"## 신뢰도: {evidence.get('confidence', 0):.1%}",
    ]

    # Metrology rule hits
    rule_hits = evidence.get("metrology_rule_hits", [])
    if rule_hits:
        lines.append("\n## 계측 Rule Hit")
        for hit in rule_hits:
            lines.append(
                f"  - [{hit.get('severity', '?')}] {hit.get('signal', '?')}: "
                f"{hit.get('evidence', '')} → {hit.get('action', '')}"
            )
    else:
        lines.append("\n## 계측 Rule Hit: 없음")

    # Process context
    pc = evidence.get("process_context", {})
    if pc:
        lines.append(
            f"\n## 공정 맥락: {pc.get('lot_id', '-')} / "
            f"{pc.get('process_step', '-')} / "
            f"{pc.get('tool_id', '-')} / "
            f"{pc.get('recipe_id', '-')}"
        )

    # Metrology values
    met = evidence.get("metrology", {})
    if met:
        lines.append(
            f"## 계측값: CD {met.get('cd_nm', '-')}nm, "
            f"overlay {met.get('overlay_nm', '-')}nm, "
            f"film thickness {met.get('film_thickness_nm', '-')}nm, "
            f"roughness {met.get('roughness_nm', '-')}nm, "
            f"defect count {met.get('defect_count', '-')}"
        )

    # RAG cases
    rag_cases = evidence.get("rag_cases", [])
    if rag_cases:
        lines.append("\n## 참고 사례 (RAG)")
        for case in rag_cases[:3]:
            lines.append(
                f"  - [{case.get('defect_type', '?')}] {case.get('summary', case.get('content', ''))[:120]}"
            )
    else:
        lines.append("\n## 참고 사례 (RAG): 없음")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# LangGraph nodes
# ---------------------------------------------------------------------------


def _node_decide(state: AgentState) -> AgentState:
    """Call LLM with current messages and available tools."""
    resp = luxia_client.chat_with_tools(
        messages=state["messages"],
        tools=_TOOL_SCHEMAS,
        image_urls=state["image_urls"] if state["iteration"] == 0 else None,
    )
    msg = resp["choices"][0]["message"]
    state["messages"].append(msg)
    return state


def _node_tool_exec(state: AgentState) -> AgentState:
    """Execute all tool_calls from the last assistant message."""
    last_msg = state["messages"][-1]
    tool_calls = last_msg.get("tool_calls") or []
    registry = _get_tool_registry()

    for tc in tool_calls:
        fn = tc.get("function", {})
        name = fn.get("name", "")
        try:
            args = json.loads(fn.get("arguments", "{}"))
        except json.JSONDecodeError:
            args = {}

        tool_fn = registry.get(name)
        if tool_fn is None:
            result = {"error": f"Unknown tool: {name}"}
        else:
            try:
                result = tool_fn(**args)
            except Exception as exc:  # noqa: BLE001
                logger.error("Tool %s failed: %s", name, exc)
                result = {"error": str(exc)}

        # Log the tool call
        state["tool_calls_log"].append({"name": name, "args": args, "result": result})

        # Add tool result as a message
        state["messages"].append(
            {
                "role": "tool",
                "tool_call_id": tc.get("id", name),
                "name": name,
                "content": json.dumps(result, ensure_ascii=False),
            }
        )

    state["iteration"] += 1
    return state


def _node_final_action(state: AgentState) -> AgentState:
    """Extract the final assistant text as the action decision."""
    # Walk messages in reverse to find the last assistant text content
    for msg in reversed(state["messages"]):
        if msg.get("role") == "assistant":
            content = msg.get("content")
            if content and isinstance(content, str):
                state["final_action"] = content
                return state
    state["final_action"] = "Agent 판단 결과를 추출할 수 없습니다."
    return state


# ---------------------------------------------------------------------------
# Routing condition
# ---------------------------------------------------------------------------


def _should_continue(state: AgentState) -> str:
    """Return 'tool_exec' if the last message has tool_calls, else 'final_action'."""
    if state["iteration"] >= state["max_iterations"]:
        return "final_action"
    last_msg = state["messages"][-1]
    tool_calls = last_msg.get("tool_calls")
    if tool_calls:
        return "tool_exec"
    return "final_action"


# ---------------------------------------------------------------------------
# Build LangGraph graph
# ---------------------------------------------------------------------------


def _build_graph():
    """Build the LangGraph StateGraph. Imported lazily to avoid hard dependency."""
    try:
        from langgraph.graph import END, START, StateGraph  # noqa: PLC0415

        graph = StateGraph(AgentState)
        graph.add_node("decide", _node_decide)
        graph.add_node("tool_exec", _node_tool_exec)
        graph.add_node("final_action", _node_final_action)

        graph.add_edge(START, "decide")
        graph.add_conditional_edges(
            "decide",
            _should_continue,
            {"tool_exec": "tool_exec", "final_action": "final_action"},
        )
        graph.add_edge("tool_exec", "decide")
        graph.add_edge("final_action", END)

        return graph.compile()
    except ImportError:
        logger.warning("langgraph not installed; will use fallback sequential execution.")
        return None


_GRAPH = None  # lazily initialized


def _get_graph():
    global _GRAPH  # noqa: PLW0603
    if _GRAPH is None:
        _GRAPH = _build_graph()
    return _GRAPH


# ---------------------------------------------------------------------------
# Fallback sequential runner (used when langgraph is not installed)
# ---------------------------------------------------------------------------


def _run_sequential(state: AgentState) -> AgentState:
    """Simple sequential fallback: decide → tool_exec loop → final_action."""
    while state["iteration"] < state["max_iterations"]:
        state = _node_decide(state)
        route = _should_continue(state)
        if route == "final_action":
            break
        state = _node_tool_exec(state)
    return _node_final_action(state)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def run(evidence: dict) -> dict:
    """Run the Agent loop for a given inspection evidence dict.

    Parameters
    ----------
    evidence:
        Must include at least ``inspection_id``.  Optional keys:
        defect_type, risk_level, risk_score, confidence,
        metrology_rule_hits, rag_cases, process_context, metrology,
        image_urls (list[str]).

    Returns
    -------
    dict
        {
          "final_action": str,
          "tool_calls": list[dict],
          "trace_id": str,
          "agent_mode": "llm" | "stub",
        }
    """
    inspection_id = evidence.get("inspection_id", "unknown")
    image_urls: list[str] = evidence.get("image_urls", [])

    evidence_text = _build_evidence_text(evidence)

    initial_state: AgentState = {
        "inspection_id": inspection_id,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    f"다음 Evidence를 분석하고 적절한 대응 action을 결정하세요.\n\n{evidence_text}"
                ),
            },
        ],
        "tool_calls_log": [],
        "final_action": "",
        "image_urls": image_urls,
        "max_iterations": 5,
        "iteration": 0,
    }

    # Determine agent mode
    agent_mode = "llm" if os.environ.get("LUXIA_API_KEY", "").strip() else "stub"

    try:
        graph = _get_graph()
        if graph is not None:
            final_state = graph.invoke(initial_state)
        else:
            final_state = _run_sequential(initial_state)
    except Exception as exc:  # noqa: BLE001
        logger.error("Agent graph execution failed: %s", exc)
        final_state = _node_final_action(initial_state)

    # Persist trace
    trace = {
        "inspection_id": inspection_id,
        "messages": final_state["messages"],
        "tool_calls": final_state["tool_calls_log"],
        "final_action": final_state["final_action"],
        "agent_mode": agent_mode,
    }
    try:
        trace_id = insert_agent_trace(inspection_id, trace)
    except Exception as exc:  # noqa: BLE001
        logger.error("Failed to persist agent trace: %s", exc)
        trace_id = "trace-error"

    return {
        "final_action": final_state["final_action"],
        "tool_calls": final_state["tool_calls_log"],
        "trace_id": trace_id,
        "agent_mode": agent_mode,
    }
