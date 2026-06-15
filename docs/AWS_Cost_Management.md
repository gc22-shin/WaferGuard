# WaferGuard AWS 비용 절감 가이드

> 멀티서비스 배포(S3·RDS·Secrets·SNS·Lambda·CloudWatch·EC2) 운영 시 **비용을 최소화**하는 방법.
> 리전: ap-northeast-2 · 핵심 원칙: **"컴퓨트(EC2·RDS)는 안 쓰면 끈다."**

---

## 0. 한눈에 — 비용 우선순위

| 리소스 | 과금 방식 | 영향 | 조치 |
|--------|-----------|------|------|
| **RDS** | 실행 시간 + 스토리지 | 🔴 큼 | 안 쓰면 **중지/삭제** |
| **EC2** | 실행 시간 | 🔴 큼 | 안 쓰면 **중지** |
| **EventBridge tick** | 트리거 자체는 무료지만, 매시간 RDS 쓰기·S3·LLM·SNS 유발 | 🟠 간접 | 데모 후 **규칙 Disable** |
| **Elastic IP** | 실행 중 연결 시 **무료**, EC2 중지/미연결 시 과금 | 🟡 소액 | 아래 주의 참고 |
| S3 / Secrets / SNS / CloudWatch / Lambda | 사용량 기반 | 🟢 소액 | 로그 보존기간만 관리 |

> 핵심: **EC2와 RDS를 끄는 것만으로 비용의 대부분이 사라집니다.**

---

## 1. 매일/사용 후 루틴 (가장 중요)

하루 작업이 끝나면 **이 3가지**만 하면 됩니다.

1. **EventBridge 규칙 Disable** — 자동 tick이 밤새 돌며 RDS·S3·LLM·이메일을 계속 쓰는 것 방지
2. **EC2 중지(Stop)**
3. **RDS 중지(Stop)**

다음 날 다시 쓸 때 시작(Start)하면 됩니다(데이터는 보존됨).

---

## 2. 서비스별 상세

### 2-1. EC2 중지
- 콘솔: EC2 → 인스턴스 선택 → **인스턴스 상태(Instance state) → 인스턴스 중지(Stop instance)**
- 중지하면 **실행 시간 과금이 멈춤**. EBS 스토리지 비용(소액)만 유지.
- 다시 쓸 때 **Start instance**.

> ⚠️ **Elastic IP 주의**: Elastic IP는 **실행 중인 인스턴스에 연결돼 있을 때만 무료**입니다. EC2를 **중지하면** 그 Elastic IP에 **소액 시간당 과금**(약 $0.005/h)이 붙습니다.
> - 며칠만 안 쓸 거면: 그냥 두기(소액).
> - 오래 안 쓸 거면: Elastic IP **해제(Release)** 고려(단, 다시 쓸 때 IP가 바뀌어 Lambda `EC2_BASE`·접속 IP를 갱신해야 함).

### 2-2. RDS 중지 / 삭제
- 콘솔: RDS → 데이터베이스 → `waferguard-db` → **작업(Actions) → 중지(Stop temporarily)**
- ⚠️ **중요 주의 2가지**:
  1. RDS는 **세션 종료로 자동 중지되지 않습니다.** 반드시 직접 중지.
  2. 중지해도 **7일 뒤 AWS가 자동으로 재시작**합니다. 7일 이상 안 쓸 거면 아래처럼 **삭제 + 스냅샷**이 안전.
- **오래 안 쓸 때 (권장)**: 작업 → **스냅샷 생성** 후 **삭제(Delete)**. 나중에 스냅샷에서 복원 가능.

### 2-3. EventBridge 규칙 Disable
- 콘솔: EventBridge(또는 CloudWatch → Events) → **Rules** → `waferguard-tick-hourly` 선택 → **Disable(비활성화)**
- 또는 Lambda 함수 → 트리거에서 EventBridge 비활성화.
- 이걸 안 끄면 EC2가 켜져 있는 한 **매시간 자동 검사**가 돌아 RDS·S3·LLM·SNS 비용이 누적됩니다.

### 2-4. 소액 서비스 (관리 포인트만)
- **S3**: 저장 용량 기반(소액). 테스트로 쌓인 `images/`·`reports/` 객체가 많아지면 정리.
- **CloudWatch Logs**: 로그 그룹 `waferguard/app`·`/aws/lambda/...`의 **보존기간(retention)**을 7일 등으로 짧게(이미 7일 설정). 오래 안 쓰면 로그 그룹 삭제.
- **Secrets Manager**: 시크릿당 월 소액. 안 쓰면 삭제.
- **SNS / Lambda**: 호출량 기반. 거의 무시 가능.

---

## 3. 완전 정리 (Teardown) — 프로젝트 종료 시

학습/데모가 완전히 끝났으면 **만든 역순**으로 삭제합니다.

1. **EventBridge 규칙** 삭제 (`waferguard-tick-hourly`)
2. **Lambda 함수** 삭제 (`waferguard-automation-tick`)
3. **CloudWatch** 경보(`waferguard-ec2-cpu-high`)·로그 그룹(`waferguard/app`) 삭제
4. **RDS** 삭제 (필요 시 최종 스냅샷)
5. **S3 버킷** 비우기(empty) → 삭제 (`waferguard-images-twkim`)
6. **SNS** 구독·토픽 삭제 (`waferguard-alerts`)
7. **Secrets Manager** 시크릿 삭제 (`waferguard/app`)
8. **EC2** 종료(Terminate)
9. **Elastic IP** 해제(Release)
10. (선택) **IAM 역할** `waferguard-ec2-role` 삭제

> S3·RDS는 안에 데이터가 있으면 삭제가 막힐 수 있으니 **비우기/스냅샷 후 삭제**.

---

## 4. 비용 모니터링

- **Cost Explorer**: 콘솔 → Billing/Cost Management → Cost Explorer → 서비스별 일/월 비용 확인.
- **Budgets**: 월 예산(예: $5)을 설정하고 초과 시 이메일 알림 → 예상치 못한 과금 조기 감지.
- (AWS Academy면) 상단 **남은 예산(remaining budget)** 표시를 주기적으로 확인. 단, 8~12시간 지연 반영.

---

## 5. 빠른 체크리스트

**🔻 하루 끝 (사용 후):**
- [ ] EventBridge `waferguard-tick-hourly` **Disable**
- [ ] EC2 **Stop**
- [ ] RDS **Stop**

**🔺 다시 쓸 때:**
- [ ] RDS **Start** (Available 될 때까지 대기)
- [ ] EC2 **Start**
- [ ] (필요 시) Lambda `EC2_BASE`가 현재 EC2 IP와 맞는지 확인 (Elastic IP면 불변)
- [ ] (자동화 다시 쓰면) EventBridge 규칙 **Enable**

**🗑️ 완전 종료:**
- [ ] 위 3절 Teardown 1~10 순서대로 삭제
- [ ] Cost Explorer로 잔여 리소스 과금 없는지 최종 확인

---

> 💡 가장 효과적인 한 가지: **퇴근 전 EC2·RDS Stop + EventBridge Disable.** 이 세 가지만 습관화하면 비용의 90% 이상을 막을 수 있습니다.
