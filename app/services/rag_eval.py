from __future__ import annotations

import json
from pathlib import Path


DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "defect_rag_eval_set.json"


def rag_evaluation_set() -> dict[str, object]:
    with DATA_PATH.open("r", encoding="utf-8") as file:
        payload = json.load(file)
    questions = payload.get("questions", [])
    payload["summary"] = {
        "question_count": len(questions),
        "required_answer_style": "근거 문서 기반, 원인 단정 금지, 추가 확인 항목 제시",
        "portfolio_use": "삼성 AI센터 SW개발에서 RAG/Agent 평가와 hallucination 방지 설계 근거로 사용",
    }
    return payload
