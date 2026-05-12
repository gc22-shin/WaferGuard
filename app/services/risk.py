SEVERITY_WEIGHT = {
    "None": 0.05,
    "Center": 0.55,
    "Donut": 0.50,
    "Edge-Loc": 0.62,
    "Edge-Ring": 0.68,
    "Loc": 0.58,
    "Random": 0.60,
    "Scratch": 0.84,
    "Near-full": 0.96,
}


def compute_risk_score(defect_type: str, confidence: float, hotspot_ratio: float, repeat_weight: float) -> float:
    severity = SEVERITY_WEIGHT.get(defect_type, 0.5)
    score = 0.40 * confidence + 0.30 * severity + 0.20 * min(hotspot_ratio * 3.5, 1.0) + 0.10 * repeat_weight
    if defect_type == "None":
        score *= 0.35
    return round(max(0.0, min(score, 1.0)), 3)


def risk_level(score: float) -> str:
    if score >= 0.72:
        return "High"
    if score >= 0.42:
        return "Medium"
    return "Low"
