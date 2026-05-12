from __future__ import annotations

CASE_LIBRARY: dict[str, list[dict[str, str]]] = {
    "Center": [
        {
            "title": "CMP 중심부 압력 편차",
            "summary": "중심부 결함이 반복될 때 패드 마모와 슬러리 공급 안정성을 먼저 확인했다.",
            "action": "CMP pad conditioning 기록과 중심부 두께 편차를 함께 확인",
        },
        {
            "title": "포토 공정 focus drift",
            "summary": "중앙 영역에 국소 결함이 집중되며 focus offset 보정 후 정상화됐다.",
            "action": "노광 focus/exposure 로그와 최근 레시피 변경 이력 비교",
        },
    ],
    "Donut": [
        {
            "title": "증착 균일도 링 패턴",
            "summary": "챔버 온도 편차로 링 형태 불량이 발생했고 showerhead 세정 후 감소했다.",
            "action": "온도 zone 로그와 showerhead PM 주기 확인",
        }
    ],
    "Edge-Loc": [
        {
            "title": "엣지 핸들링 접촉 문제",
            "summary": "로봇 암 접촉 위치와 결함 위치가 겹쳤고 end-effector 점검 후 개선됐다.",
            "action": "웨이퍼 이송 로그와 edge grip mark 검사",
        }
    ],
    "Edge-Ring": [
        {
            "title": "Edge bead removal 불안정",
            "summary": "엣지 링 불량이 EBR nozzle pressure 변화와 동시 발생했다.",
            "action": "EBR pressure, nozzle 상태, edge exclusion 설정 점검",
        }
    ],
    "Loc": [
        {
            "title": "파티클 국소 오염",
            "summary": "특정 tool chamber에서만 국소 결함이 반복되어 chamber clean 후 감소했다.",
            "action": "동일 설비 lot history와 particle counter 추이 확인",
        }
    ],
    "Random": [
        {
            "title": "클린룸 일시 오염 이벤트",
            "summary": "무작위 결함 증가가 필터 교체 직후 발생했고 HVAC 안정화 후 회복됐다.",
            "action": "클린룸 particle trend와 해당 시간대 작업 이력 확인",
        }
    ],
    "Scratch": [
        {
            "title": "이송 구간 스크래치",
            "summary": "긴 선형 결함이 cassette unload 이후부터 관찰되어 로봇 경로를 교정했다.",
            "action": "load port, robot arm, cassette slot 물리 접촉 여부 확인",
        }
    ],
    "Near-full": [
        {
            "title": "공정 recipe mismatch",
            "summary": "전체 웨이퍼에 가까운 불량은 잘못된 recipe 적용과 연관됐다.",
            "action": "lot start recipe, chamber recipe, operator override 로그 즉시 확인",
        }
    ],
    "None": [
        {
            "title": "정상 패턴 기준선",
            "summary": "정상 웨이퍼는 라인별 baseline 분포와 함께 보관해 드리프트 비교 기준으로 사용한다.",
            "action": "정상 lot의 공정 조건을 baseline으로 저장",
        }
    ],
}


def search_cases(defect_type: str, line_id: str) -> list[dict[str, str]]:
    cases = CASE_LIBRARY.get(defect_type, CASE_LIBRARY["Random"])
    enriched = []
    for case in cases[:3]:
        enriched.append(
            {
                **case,
                "line_context": f"{line_id} 최근 24시간 추세와 함께 비교",
            }
        )
    if len(enriched) < 3:
        enriched.append(
            {
                "title": "표준 결함 대응 SOP",
                "summary": "AI 판정은 1차 스크리닝으로 사용하고 엔지니어가 Grad-CAM 근거를 확인한다.",
                "action": "신뢰도 0.70 미만 또는 신규 패턴이면 Human-in-the-Loop 검토 큐로 이동",
                "line_context": f"{line_id} 공정 로그와 lot 이력 확인",
            }
        )
    return enriched[:3]
