from __future__ import annotations

import hashlib
import json
import logging
import random
from pathlib import Path

logger = logging.getLogger(__name__)

_CORPUS_PATH = Path(__file__).resolve().parent.parent / "data" / "rag_corpus.json"

# Hand-curated, high-signal reference cases. These are seeded first per defect
# type and carry a higher base relevance so they tend to surface in retrieval.
CURATED_LIBRARY: dict[str, list[dict[str, str]]] = {
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

# ── Synthetic case generation ────────────────────────────────────────────────
# Each defect type gets a pool of plausible root-cause scenarios. Scenarios are
# combined with an equipment pool, a measured signal value, and a resolution
# date to synthesize a large, varied body of past cases for RAG to retrieve.

# scenario = (root cause, observed signal, recommended action, resolution outcome)
_SCENARIOS: dict[str, list[tuple[str, str, str, str]]] = {
    "Center": [
        ("CMP 패드 중심부 마모", "중심부 polish rate가 상승하며 over-polish가 관찰됐다", "패드 컨디셔닝 주기 단축과 중심 두께 프로파일 점검", "conditioning 주기를 조정한 뒤 중심 결함이 사라졌다"),
        ("슬러리 중심 공급 편차", "중앙 영역 디싱이 슬러리 유량 변동과 동기화됐다", "슬러리 유량/압력 로그와 디스펜서 노즐 상태 확인", "유량 안정화 후 중심부 분포가 정상화됐다"),
        ("노광 focus offset 드리프트", "중심부에 패턴 집중 결함이 focus 변동과 함께 나타났다", "스캐너 focus/leveling 로그와 최근 레시피 변경 비교", "focus 재보정으로 중심 결함이 회복됐다"),
        ("리테이너 링 압력 편향", "리테이너 압력 zone1 편차로 중심 압력이 과다했다", "헤드 zone 압력 캘리브레이션과 리테이너 마모 점검", "압력 재설정 후 중심 over-polish가 해소됐다"),
        ("척 진공 중심 누설", "중심 척킹 진공 누설로 평탄도가 흔들렸다", "ESC 진공 라인과 백사이드 가스 흐름 점검", "진공 라인 수리로 평탄도가 회복됐다"),
        ("폴리시 타임 과다", "레시피 polish time 과다로 중심 두께가 규격 이탈했다", "레시피 polish time과 endpoint 신호 재검토", "endpoint 보정으로 두께 편차가 줄었다"),
        ("헤드 zone1 유량 막힘", "헤드 zone1 백프레셔 상승이 중심 결함과 겹쳤다", "헤드 가스/유체 라인 막힘과 백프레셔 추세 확인", "라인 세정 후 중심 분포가 안정됐다"),
        ("컨디셔너 디스크 마모", "디스크 마모로 패드 재생이 불균일했다", "컨디셔너 디스크 grit 상태와 dressing 압력 점검", "디스크 교체 후 중심 polish rate가 안정됐다"),
        ("백사이드 가스 중심 편차", "백사이드 가스 중심 압력 편차로 휨이 발생했다", "백사이드 가스 zone 밸런스와 척 평탄도 확인", "가스 밸런스 조정으로 휨이 개선됐다"),
        ("중심 온도 핫스팟", "핫플레이트 중심 온도 핫스팟이 CD 편차를 유발했다", "핫플레이트 zone 온도 맵과 thermocouple 캘리브레이션 확인", "온도 zone 재보정으로 중심 CD가 균일해졌다"),
    ],
    "Donut": [
        ("챔버 온도 zone 편차", "링 형태 불량이 챔버 온도 zone 편차와 동기화됐다", "히터 zone 온도 맵과 thermocouple 캘리브레이션 확인", "zone 온도 재보정으로 링 패턴이 사라졌다"),
        ("showerhead 부분 막힘", "showerhead 일부 막힘으로 가스 분포가 링형으로 치우쳤다", "showerhead 차압과 PM 주기, 세정 이력 확인", "showerhead 세정 후 균일도가 회복됐다"),
        ("가스 유량 비대칭", "MFC 유량 비대칭으로 링 영역 증착률이 낮았다", "MFC 캘리브레이션과 가스 라인 밸런스 점검", "MFC 재보정으로 링 결함이 감소했다"),
        ("서셉터 회전 불안정", "서셉터 회전 편차로 반경 방향 균일도가 흔들렸다", "서셉터 회전 모터와 베어링 상태 점검", "회전 안정화 후 링 패턴이 줄었다"),
        ("RF power 편차", "RF 정합 편차로 plasma 밀도가 링형으로 분포했다", "RF generator/matcher reflected power 추세 확인", "정합 재조정으로 균일도가 회복됐다"),
        ("챔버 압력 드리프트", "스로틀 밸브 드리프트로 압력이 변동했다", "스로틀 밸브 응답과 압력 게이지 캘리브레이션 확인", "밸브 보정 후 압력이 안정됐다"),
        ("에지 퍼지 가스 불균형", "에지 퍼지 가스 과다로 링 영역 증착이 억제됐다", "에지 퍼지 유량과 exclusion 설정 점검", "퍼지 유량 조정으로 링 분포가 개선됐다"),
        ("히터 캘리브레이션 편차", "히터 zone 캘리브레이션 이탈로 링 두께 편차가 났다", "히터 zone 출력과 온도 피드백 루프 점검", "캘리브레이션 후 두께가 균일해졌다"),
    ],
    "Edge-Loc": [
        ("로봇 end-effector 접촉", "end-effector 접촉 위치와 엣지 결함 위치가 일치했다", "이송 로그와 end-effector 패드 마모 점검", "end-effector 교체 후 엣지 결함이 사라졌다"),
        ("edge grip mark", "에지 그립 마크가 핸들링 압력 증가와 함께 늘었다", "그립 압력 설정과 그립 패드 상태 확인", "그립 압력 조정으로 마크가 감소했다"),
        ("핸들링 정렬 오프셋", "정렬 오프셋으로 특정 엣지 영역에 접촉이 집중됐다", "aligner notch/flat 정렬 오프셋 캘리브레이션 확인", "정렬 보정 후 엣지 접촉이 분산됐다"),
        ("load port 접촉", "load port 도킹 편차로 엣지 긁힘이 발생했다", "load port 도킹 정밀도와 카세트 안착 상태 점검", "도킹 보정 후 엣지 결함이 줄었다"),
        ("notch aligner 마모", "notch aligner 롤러 마모로 정렬이 흔들렸다", "aligner 롤러/센서 마모와 캘리브레이션 확인", "롤러 교체 후 정렬 안정됨"),
        ("카세트 슬롯 간섭", "슬롯 변형으로 엣지가 슬롯에 간섭했다", "카세트 슬롯 변형과 적재 높이 점검", "카세트 교체로 엣지 간섭이 사라졌다"),
        ("에지 척킹 손상", "엣지 척킹 영역 손상으로 국소 결함이 반복됐다", "ESC 엣지 영역 표면과 척킹 균일도 점검", "ESC 보수 후 엣지 결함이 회복됐다"),
        ("베벨 식각 편차", "베벨 식각 편차로 엣지 영역 결함이 집중됐다", "베벨 etch 레시피와 엣지 가스 분포 확인", "베벨 레시피 조정으로 결함이 감소했다"),
    ],
    "Edge-Ring": [
        ("EBR nozzle pressure 변동", "엣지 링 불량이 EBR nozzle pressure 변동과 동시 발생했다", "EBR pressure, nozzle 상태, edge exclusion 설정 점검", "노즐 보수 후 엣지 링 결함이 사라졌다"),
        ("edge exclusion 설정 오류", "exclusion 폭 설정 오류로 엣지 링이 형성됐다", "코터 edge exclusion 레시피 파라미터 검토", "exclusion 재설정으로 링 결함이 해소됐다"),
        ("코터 회전수 편차", "스핀 코터 RPM 편차로 엣지 두께가 두꺼워졌다", "코터 RPM 안정성과 디스펜스 타이밍 확인", "RPM 안정화 후 엣지 두께가 균일해졌다"),
        ("에지 린스 불균일", "엣지 린스 불균일로 링 영역 잔류가 발생했다", "린스 노즐 정렬과 유량, 타이밍 점검", "린스 보정 후 잔류가 사라졌다"),
        ("베벨 폴리시 편차", "베벨 폴리시 편차로 엣지 링 거칠기가 증가했다", "베벨 폴리시 압력과 패드 상태 점검", "폴리시 조정으로 엣지 거칠기가 개선됐다"),
        ("edge bead 두께 과다", "edge bead 두께 과다로 디펙이 링형으로 남았다", "코팅 두께 프로파일과 EBR 폭 비교", "EBR 폭 조정으로 bead가 제거됐다"),
        ("척 에지 온도 편차", "척 에지 온도 편차로 엣지 CD가 이탈했다", "척 에지 zone 온도와 thermocouple 확인", "에지 온도 보정으로 CD가 회복됐다"),
        ("디벨로퍼 에지 퍼들 불균일", "디벨로퍼 에지 퍼들 불균일로 링 결함이 났다", "디벨로퍼 디스펜스 패턴과 퍼들 시간 점검", "디스펜스 조정으로 엣지 현상이 균일해졌다"),
    ],
    "Loc": [
        ("챔버 파티클 오염", "특정 챔버에서만 국소 결함이 반복됐다", "동일 설비 lot history와 particle counter 추이 확인", "챔버 clean 후 국소 결함이 감소했다"),
        ("펌프 오일 역류", "드라이펌프 오일 역류로 입자가 유입됐다", "펌프 백스트림과 오일 상태, 배기 라인 점검", "펌프 정비 후 입자가 사라졌다"),
        ("가스 라인 입자", "가스 라인 필터 오염으로 입자가 들어왔다", "가스 라인 필터 차압과 교체 이력 확인", "필터 교체 후 결함이 회복됐다"),
        ("ESC 표면 손상", "ESC 표면 손상에서 입자가 발생했다", "ESC 표면 상태와 백사이드 입자 맵 점검", "ESC 교체 후 국소 결함이 사라졌다"),
        ("리프트핀 마모 입자", "리프트핀 마모 분진이 국소 결함을 유발했다", "리프트핀 마모와 백사이드 컨택 흔적 확인", "리프트핀 교체 후 결함이 줄었다"),
        ("슬릿 밸브 파티클", "슬릿 밸브 시일 마모로 입자가 발생했다", "슬릿 밸브 시일과 트랜스퍼 챔버 입자 점검", "밸브 시일 교체 후 입자가 감소했다"),
        ("트랜스퍼 챔버 누설", "트랜스퍼 챔버 미세 누설로 입자가 유입됐다", "챔버 리크 레이트와 진공 안정성 점검", "리크 수리 후 입자가 사라졌다"),
        ("정전 흡착 입자", "정전기로 입자가 국소 흡착됐다", "이오나이저 밸런스와 그라운딩 상태 확인", "이오나이저 보정 후 흡착이 감소했다"),
    ],
    "Random": [
        ("HVAC 필터 교체 직후 입자", "필터 교체 직후 무작위 결함이 일시 증가했다", "클린룸 particle trend와 필터 교체 이력 확인", "HVAC 안정화 후 결함이 회복됐다"),
        ("클린룸 일시 오염 이벤트", "클린룸 차압 변동과 함께 입자가 일시 증가했다", "클린룸 차압/풍속과 도어 인터록 로그 확인", "차압 회복 후 결함이 사라졌다"),
        ("휴먼 트래픽 입자", "교대 시간대 인원 이동과 입자 증가가 겹쳤다", "해당 시간대 출입 로그와 가운룸 절차 점검", "트래픽 통제 후 입자가 줄었다"),
        ("케미컬 후드 배기 불안정", "후드 배기 불안정으로 미스트 입자가 퍼졌다", "후드 배기 풍량과 댐퍼 동작 점검", "배기 보정 후 입자가 감소했다"),
        ("DI water 입자", "DI water 입자 스파이크로 잔류 결함이 났다", "DI water resistivity와 입자 모니터 추세 확인", "수질 회복 후 결함이 사라졌다"),
        ("가스캐비닛 파티클 버스트", "가스 전환 시 파티클 버스트가 관찰됐다", "가스캐비닛 퍼지 시퀀스와 입자 모니터 점검", "퍼지 보정 후 버스트가 사라졌다"),
        ("환경 모니터 스파이크", "환경 모니터 입자 스파이크와 결함이 동기화됐다", "FFU 풍속과 환경 모니터 알람 이력 확인", "FFU 점검 후 입자가 안정됐다"),
        ("정전기 무작위 흡착", "건조한 환경에서 정전 흡착이 산발적으로 발생했다", "습도 관리와 이오나이저 밸런스 점검", "습도 회복 후 결함이 감소했다"),
    ],
    "Scratch": [
        ("cassette unload 스크래치", "긴 선형 결함이 cassette unload 이후 관찰됐다", "load port, robot arm, cassette slot 접촉 여부 확인", "로봇 경로 교정 후 스크래치가 사라졌다"),
        ("로봇 암 경로 간섭", "로봇 암 경로 간섭으로 표면 긁힘이 발생했다", "로봇 teaching 좌표와 경로 클리어런스 점검", "경로 재교정 후 스크래치가 줄었다"),
        ("척 표면 이물 스크래치", "척 표면 이물로 백사이드 스크래치가 났다", "척 표면 청결도와 백사이드 결함 맵 확인", "척 청소 후 스크래치가 사라졌다"),
        ("핸들러 벨트 손상", "핸들러 벨트 손상으로 마찰 스크래치가 발생했다", "핸들러 벨트/롤러 마모 상태 점검", "벨트 교체 후 결함이 회복됐다"),
        ("wafer slip 마찰", "이송 중 wafer slip으로 긁힘이 생겼다", "그립 압력과 가속 프로파일, 진공 상태 확인", "그립/가속 조정으로 slip이 사라졌다"),
        ("end-effector 패드 마모", "end-effector 패드 마모로 긁힘이 발생했다", "end-effector 패드 마모와 평탄도 점검", "패드 교체 후 스크래치가 줄었다"),
        ("정렬 스테이지 긁힘", "정렬 스테이지 간섭으로 표면 긁힘이 났다", "정렬 스테이지 클리어런스와 z-height 점검", "스테이지 보정 후 결함이 사라졌다"),
        ("boat 적재 간섭", "boat 적재 간섭으로 엣지 스크래치가 발생했다", "boat 슬롯 정렬과 적재 핸들링 점검", "boat 정렬 후 스크래치가 감소했다"),
    ],
    "Near-full": [
        ("recipe mismatch 전면 불량", "전면 불량이 잘못된 recipe 적용과 연관됐다", "lot start recipe, chamber recipe, operator override 로그 즉시 확인", "recipe 정정 후 전면 불량이 사라졌다"),
        ("챔버 컨디션 이탈", "챔버 컨디션 이탈로 전면에 불량이 퍼졌다", "챔버 시즈닝 상태와 PM 직후 컨디셔닝 확인", "재시즈닝 후 전면 불량이 회복됐다"),
        ("가스 공급 중단", "공정 중 가스 공급 중단으로 전면 결함이 발생했다", "가스 공급 압력과 인터록, 알람 로그 확인", "공급 복구 후 전면 결함이 사라졌다"),
        ("노광 dose 전면 오류", "노광 dose 설정 오류로 전면 패턴이 무너졌다", "스캐너 dose/focus 설정과 레시피 검증", "dose 정정 후 전면 패턴이 회복됐다"),
        ("현상액 농도 이탈", "현상액 농도 이탈로 전면 현상 불량이 났다", "디벨로퍼 농도와 온도, 교체 주기 확인", "현상액 교체 후 전면 불량이 사라졌다"),
        ("핫플레이트 전면 온도 이탈", "핫플레이트 전면 온도 이탈로 CD가 무너졌다", "핫플레이트 온도 맵과 PEB 조건 점검", "온도 보정 후 전면 CD가 회복됐다"),
        ("잘못된 마스크 사용", "잘못된 마스크 사용으로 전면 패턴이 어긋났다", "마스크 ID와 레이어 매칭, job deck 확인", "마스크 정정 후 전면 패턴이 회복됐다"),
        ("전면 디포지션 실패", "전구체 고갈로 전면 증착이 실패했다", "전구체 잔량과 버블러 상태, 라인 가열 확인", "전구체 보충 후 전면 증착이 회복됐다"),
    ],
    "None": [
        ("정상 baseline 저장", "정상 웨이퍼 분포를 baseline으로 보관했다", "정상 lot의 공정 조건을 baseline으로 저장", "이후 드리프트 비교 기준으로 활용했다"),
        ("드리프트 비교 기준선", "정상 패턴을 드리프트 비교 기준선으로 사용했다", "라인별 baseline 분포와 SPC 한계선 갱신", "기준선 갱신으로 드리프트 감지가 정확해졌다"),
        ("SPC 정상 범위 확인", "SPC 차트 정상 범위 안에서 안정 운영됐다", "주요 파라미터 SPC 한계와 추세 검토", "정상 범위 확인 후 모니터링을 유지했다"),
        ("정상 CD 분포 기록", "정상 CD 분포를 reference로 기록했다", "정상 lot CD 분포와 측정 위치 표준화", "CD reference로 후속 비교에 활용했다"),
        ("정상 overlay 기준", "정상 overlay 분포를 기준으로 저장했다", "정상 overlay 맵과 정렬 마크 상태 기록", "overlay 기준선으로 드리프트를 추적했다"),
        ("정상 두께 프로파일", "정상 두께 프로파일을 baseline으로 보관했다", "정상 두께 반경 프로파일과 측정 조건 기록", "두께 baseline으로 후속 비교에 활용했다"),
        ("무결함 reference 보관", "무결함 웨이퍼를 reference로 보관했다", "무결함 lot의 설비/레시피 조건 아카이브", "reference로 신규 패턴 판정에 활용했다"),
        ("정상 패턴 골든 샘플", "정상 패턴을 골든 샘플로 등록했다", "골든 샘플 이미지와 메타데이터 등록", "골든 샘플 대비로 이상 판정을 보조했다"),
    ],
}

# Per-type allocation of the 500 synthetic cases.
_ALLOC: dict[str, int] = {
    "Center": 70,
    "Donut": 45,
    "Edge-Loc": 60,
    "Edge-Ring": 60,
    "Loc": 70,
    "Random": 55,
    "Scratch": 50,
    "Near-full": 40,
    "None": 50,
}

# Equipment id prefixes per process area associated with each defect type.
_EQUIP_PREFIXES: dict[str, list[str]] = {
    "Center": ["CMP", "LITHO"],
    "Donut": ["CVD", "PVD", "ALD"],
    "Edge-Loc": ["TRACK", "ETCH", "ROBOT"],
    "Edge-Ring": ["COAT", "DEVT", "EBR"],
    "Loc": ["ETCH", "CVD", "PVD"],
    "Random": ["FAB", "CR", "ENV"],
    "Scratch": ["ROBOT", "SORT", "TRACK"],
    "Near-full": ["LITHO", "CVD", "WET"],
    "None": ["REF", "SPC", "BASE"],
}

# Measured signal per type: (label, unit, low, high, decimals)
_METRIC: dict[str, tuple[str, str, float, float, int]] = {
    "Center": ("중심 두께 편차", "nm", 4.0, 22.0, 1),
    "Donut": ("반경 균일도", "%", 1.5, 9.0, 1),
    "Edge-Loc": ("엣지 결함 밀도", "ea/cm²", 0.8, 6.5, 1),
    "Edge-Ring": ("엣지 두께 편차", "nm", 3.0, 18.0, 1),
    "Loc": ("particle count", "ea", 12, 480, 0),
    "Random": ("particle count", "ea", 8, 360, 0),
    "Scratch": ("스크래치 길이", "mm", 2.0, 38.0, 1),
    "Near-full": ("불량 die 비율", "%", 42.0, 96.0, 1),
    "None": ("SPC 편차", "σ", 0.1, 0.9, 2),
}


def _equipment_pool(prefixes: list[str], n: int = 12) -> list[str]:
    pool: list[str] = []
    idx = 1
    while len(pool) < n:
        for p in prefixes:
            pool.append(f"{p}-{idx:02d}")
            if len(pool) >= n:
                break
        idx += 1
    return pool


def _build_library() -> dict[str, list[dict]]:
    rng = random.Random(20240517)  # fixed seed → stable corpus across restarts
    library: dict[str, list[dict]] = {}
    for defect_type, curated in CURATED_LIBRARY.items():
        cases: list[dict] = []
        # curated seeds carry a higher base relevance
        for case in curated:
            cases.append({**case, "case_id": f"RAG-{defect_type[:2].upper()}-C{len(cases):03d}", "base": 0.88})

        scenarios = _SCENARIOS.get(defect_type, _SCENARIOS["Random"])
        equipment = _equipment_pool(_EQUIP_PREFIXES.get(defect_type, ["FAB"]))
        label, unit, lo, hi, dec = _METRIC.get(defect_type, _METRIC["Random"])
        target = _ALLOC.get(defect_type, 40)

        s_count = len(scenarios)
        for i in range(target):
            cause, signal, action, outcome = scenarios[i % s_count]
            equip = equipment[(i // s_count) % len(equipment)]
            val = rng.uniform(lo, hi)
            val_str = f"{val:.{dec}f}" if dec else f"{int(round(val))}"
            year = rng.choice([2024, 2024, 2025, 2025, 2025, 2026])
            month = rng.randint(1, 12)
            day = rng.randint(1, 28)
            date = f"{year}-{month:02d}-{day:02d}"
            summary = f"{equip}에서 {signal}. 당시 {label} {val_str}{unit} 수준이었고, {outcome}."
            cases.append(
                {
                    "case_id": f"RAG-{defect_type[:2].upper()}-{i:03d}",
                    "title": f"{cause} · {equip}",
                    "summary": summary,
                    "action": action,
                    "equipment": equip,
                    "date": date,
                    "base": round(rng.uniform(0.46, 0.80), 3),
                }
            )
        library[defect_type] = cases
    return library


CASE_LIBRARY: dict[str, list[dict]] = _build_library()

# Canonical defect-type order used by the data-management RAG browser.
DEFECT_TYPES: list[str] = list(CASE_LIBRARY.keys())


def _query_score(line_id: str, case: dict) -> float:
    """Deterministic pseudo-similarity blending a case's base relevance with a
    query-dependent jitter, so retrieval order varies by line_id but is stable."""
    key = f"{line_id}:{case.get('case_id', case.get('title', ''))}"
    h = int(hashlib.md5(key.encode("utf-8")).hexdigest(), 16)
    jitter = (h % 1000) / 1000.0
    combined = 0.6 * case.get("base", 0.6) + 0.4 * jitter
    return 0.70 + 0.27 * combined


def search_cases(defect_type: str, line_id: str, k: int = 3) -> list[dict]:
    pool = CASE_LIBRARY.get(defect_type) or CASE_LIBRARY["Random"]
    ranked = sorted(pool, key=lambda c: _query_score(line_id, c), reverse=True)
    results: list[dict] = []
    for case in ranked[:k]:
        results.append(
            {
                "title": case["title"],
                "summary": case["summary"],
                "action": case["action"],
                "case_id": case.get("case_id"),
                "equipment": case.get("equipment"),
                "date": case.get("date"),
                "similarity": round(_query_score(line_id, case), 2),
                "line_context": f"{line_id} 최근 24시간 추세와 함께 비교",
                "source": "case_library",
            }
        )
    if not results:
        results.append(
            {
                "title": "표준 결함 대응 SOP",
                "summary": "AI 판정은 1차 스크리닝으로 사용하고 엔지니어가 Grad-CAM 근거를 확인한다.",
                "action": "신뢰도 0.70 미만 또는 신규 패턴이면 Human-in-the-Loop 검토 큐로 이동",
                "similarity": 0.70,
                "line_context": f"{line_id} 공정 로그와 lot 이력 확인",
                "source": "sop",
            }
        )
    return results[:k]


# ---------------------------------------------------------------------------
# Vector RAG (A-2): unify the main pipeline onto embedding retrieval, with the
# deterministic library above as a graceful fallback. Same display shape, so
# report/action_card/chat are unaffected. Learned cases written back by the
# review loop (save_case_to_knowledge) become retrievable here too — closing
# the operation→knowledge→retrieval loop end to end.
# ---------------------------------------------------------------------------


def _vector_query_text(defect_type: str, line_id: str, query_text: str | None) -> str:
    if query_text and query_text.strip():
        return query_text.strip()
    return f"{defect_type} 결함, {line_id} 라인 공정 이상 대응 사례와 권장 조치"


def _doc_to_case(doc: dict, score: float, line_id: str) -> dict:
    """Map a rag_documents row into the legacy display shape."""
    meta = doc.get("metadata") or {}
    content = doc.get("content", "") or ""
    title = meta.get("title") or (content.split(":", 1)[0][:48] if content else "유사 사례")
    learned = meta.get("source") == "engineer_confirmed"
    return {
        "title": title,
        "summary": meta.get("summary") or content,
        "action": meta.get("action") or "",
        "case_id": doc.get("id"),
        "equipment": meta.get("equipment_id") or meta.get("equipment"),
        "date": meta.get("date"),
        "similarity": round(float(score), 2),
        "line_context": f"{line_id} 최근 24시간 추세와 함께 비교",
        "source": meta.get("source", "rag_documents"),
        "learned": learned,
    }


def retrieve_cases(
    defect_type: str,
    line_id: str,
    query_text: str | None = None,
    k: int = 3,
) -> list[dict]:
    """Unified Top-k retrieval: embed → cosine (query_rag) → rerank.

    Falls back to the deterministic library (``search_cases``) when no API key
    is configured, the vector index is empty, or anything in the path errors —
    so the pipeline never breaks and degrades cleanly.
    """
    try:
        from app.services import luxia_client, storage  # noqa: PLC0415
    except ImportError:
        return search_cases(defect_type, line_id, k)

    if luxia_client._api_key() is None:
        return search_cases(defect_type, line_id, k)

    try:
        query = _vector_query_text(defect_type, line_id, query_text)
        vecs = luxia_client.embed([query])
        qv = vecs[0] if vecs else []
        if not qv or not any(qv):
            return search_cases(defect_type, line_id, k)

        raw = storage.query_rag(qv, k=max(k * 4, 12))
        if not raw:
            return search_cases(defect_type, line_id, k)

        try:
            rr = luxia_client.rerank(query, [d.get("content", "") for d in raw], top_k=k)
            ordered = [
                (raw[r["index"]], r.get("relevance_score", 0.0))
                for r in rr
                if 0 <= int(r.get("index", -1)) < len(raw)
            ]
        except Exception as exc:  # noqa: BLE001
            logger.debug("rerank skipped in retrieve_cases: %s", exc)
            ordered = [(d, d.get("similarity", 0.0)) for d in raw[:k]]

        results = [_doc_to_case(doc, score, line_id) for doc, score in ordered[:k]]
        return results or search_cases(defect_type, line_id, k)
    except Exception as exc:  # noqa: BLE001
        logger.warning("retrieve_cases vector path failed (%s) — using legacy library", exc)
        return search_cases(defect_type, line_id, k)


def ensure_rag_index(force: bool = False) -> dict:
    """Seed rag_documents from the curated corpus. Idempotent and incremental.

    Embeds and upserts only corpus docs not already indexed, so newly added
    documents (e.g. technical guides) are picked up on the next startup without
    re-embedding the whole corpus. ``force=True`` re-embeds everything.

    No-op without an API key (zero-vector embeddings carry no signal). Intended
    to run in a background thread at startup so the vector path above has a
    corpus to search instead of silently falling back.
    """
    try:
        from app.services import luxia_client, storage  # noqa: PLC0415
    except ImportError:
        return {"seeded": 0, "reason": "imports unavailable"}

    if luxia_client._api_key() is None:
        return {"seeded": 0, "reason": "no_api_key"}

    try:
        corpus = json.loads(_CORPUS_PATH.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        logger.warning("rag corpus load failed: %s", exc)
        return {"seeded": 0, "reason": str(exc)}

    if force:
        pending = corpus
    else:
        try:
            indexed_ids = storage.existing_rag_ids()
        except Exception as exc:  # noqa: BLE001
            logger.warning("existing_rag_ids failed: %s", exc)
            indexed_ids = set()
        pending = [d for d in corpus if d.get("id") not in indexed_ids]
        if not pending:
            return {"seeded": 0, "reason": "already_indexed", "existing": len(indexed_ids)}

    corpus = pending
    written = 0
    batch_size = 16
    for i in range(0, len(corpus), batch_size):
        batch = corpus[i : i + batch_size]
        texts = [d.get("content", "") for d in batch]
        try:
            embeddings = luxia_client.embed(texts)
        except Exception as exc:  # noqa: BLE001
            logger.warning("embed batch failed: %s", exc)
            embeddings = [None] * len(batch)
        for doc, emb in zip(batch, embeddings, strict=False):
            try:
                storage.upsert_rag_document(
                    doc_id=doc["id"],
                    content=doc.get("content", ""),
                    defect_type=doc.get("defect_type"),
                    embedding=emb,
                    metadata=doc.get("metadata", {}),
                )
                written += 1
            except Exception as exc:  # noqa: BLE001
                logger.warning("rag upsert failed for %s: %s", doc.get("id"), exc)

    logger.info("RAG index seeded: %d/%d documents", written, len(corpus))
    return {"seeded": written, "total": len(corpus)}


# ---------------------------------------------------------------------------
# Data-management surface: index stats + free-text case browsing. These power
# the "데이터 관리 · RAG" view. Both degrade to the deterministic case library
# when the vector index is unavailable, so the UI always has live data to show.
# ---------------------------------------------------------------------------


def index_stats() -> dict:
    """Live stats for the RAG index, for the data-management view.

    Reports the vector index (``rag_documents``) when it is populated, otherwise
    the deterministic case library that retrieval falls back to.
    """
    library_counts = {dt: len(cases) for dt, cases in CASE_LIBRARY.items()}
    try:
        from app.services import luxia_client, storage  # noqa: PLC0415

        if luxia_client._api_key() is not None:
            indexed = storage.count_rag_documents()
            if indexed > 0:
                by_type = storage.rag_type_counts()
                return {
                    "indexed": indexed,
                    "source": "vector",
                    "retrieval": "embedding cosine + rerank",
                    "by_type": by_type,
                    "defect_types": DEFECT_TYPES,
                }
    except Exception as exc:  # noqa: BLE001
        logger.debug("index_stats vector path failed (%s) — using library", exc)

    return {
        "indexed": sum(library_counts.values()),
        "source": "library",
        "retrieval": "deterministic case library",
        "by_type": library_counts,
        "defect_types": DEFECT_TYPES,
    }


def browse_cases(
    defect_type: str,
    query: str | None = None,
    line_id: str = "LINE-7",
    k: int = 6,
) -> dict:
    """Top-k case retrieval for the data-management browser.

    Routes through the unified ``retrieve_cases`` path (vector when available,
    case library otherwise) and reports which source answered so the UI can
    label the result honestly.

    ``defect_type`` may be empty/unknown — that means "no filter" (the user
    cleared the chip), so we run a general search across the corpus instead of
    biasing to one defect class.
    """
    q = (query or "").strip()
    dt_known = defect_type in CASE_LIBRARY
    pool_type = defect_type if dt_known else "Random"
    # filter cleared and no keyword → a generic query so retrieval isn't biased
    effective_query = q or (None if dt_known else "반도체 공정 결함 대응 사례와 권장 조치")
    k = max(1, min(int(k or 6), 12))
    cases = retrieve_cases(pool_type, line_id, query_text=effective_query, k=k)
    sources = {c.get("source") for c in cases}
    answered_by = "vector" if sources - {"case_library", "sop"} else "library"
    return {
        "defect_type": defect_type if dt_known else "",
        "query": q,
        "line_id": line_id,
        "count": len(cases),
        "source": answered_by,
        "cases": cases,
    }
