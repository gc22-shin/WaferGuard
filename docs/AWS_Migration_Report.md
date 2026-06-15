# WaferGuard 클라우드 전환 — 발표/보고용 정리

> 단일 EC2로 동작하던 WaferGuard를 **여러 AWS 관리형 서비스로 분산**한 작업의 요약본입니다.
> 발표 슬라이드·보고서에 바로 쓸 수 있도록 배경 → 아키텍처 → 서비스별 적용 → 기술적 도전 → 검증 → 비용 순으로 정리했습니다.
> 작업 브랜치: `feat/aws-multiservice` · 리전: **ap-northeast-2 (서울)**

---

## 1. 한 줄 요약

> "EC2 한 대가 웹·API·DB·파일·알림을 전부 처리하던 구조를, **S3·RDS·Secrets Manager·SNS·Lambda·EventBridge·CloudWatch** 7개 서비스로 분산하고, **로컬 개발 호환성은 유지(dual-mode)** 한 채 단계적으로 전환·검증했다."

---

## 2. 배경 & 목표

- **대상**: WaferGuard — 반도체 웨이퍼 결함 검사 자동화 시스템 (FastAPI 백엔드 + React 대시보드).
- **기존 구조의 한계**: EC2 한 대가 모든 역할을 담당 → 인스턴스/디스크 장애 시 **DB·이미지 전부 소실**, 알림은 DB 기록만(실발송 X), 주기 작업은 수동 호출.
- **목표 (학부 클라우드 학습)**: 단일 인스턴스 구조를 **다중 AWS 서비스 아키텍처**로 재설계하여 클라우드 운영 패턴(관리형 스토리지/DB/비밀관리/메시징/서버리스/모니터링)을 실제로 경험.

---

## 3. 아키텍처: Before → After

### Before (단일 EC2)
```
브라우저 ──▶ EC2 한 대
              ├── FastAPI (API + React 정적 서빙)
              ├── SQLite 파일 (outputs/waferguard.db)
              └── 이미지 파일 (outputs/images/*.png)
```

### After (멀티 서비스)
```
                         인터넷
                            │
                            ▼
                    ┌────────────────┐
   브라우저 ───────▶│  EC2 (FastAPI)  │  ← 백엔드 API + React 서빙 (유지)
                    │  IAM 역할 부착   │
                    └───────┬────────┘
                            │ boto3 (역할 권한으로 호출)
        ┌───────────┬───────┼───────────┬──────────────┐
        ▼           ▼       ▼           ▼              ▼
   ┌────────┐  ┌────────┐ ┌──────────┐ ┌─────────┐ ┌──────────┐
   │   S3   │  │  RDS   │ │ Secrets  │ │   SNS   │ │CloudWatch│
   │ 파일   │  │Postgres│ │ Manager  │ │ 알림발송│ │ 로그/경보│
   └────────┘  └────────┘ └──────────┘ └─────────┘ └──────────┘
                                            ▲
                              ┌─────────────┘
                   ┌──────────────────────┐
                   │ Lambda + EventBridge  │ ← 1시간마다 자동 검사
                   └──────────────────────┘
```

---

## 4. 서비스별 역할 & 적용 결과

| 서비스 | 맡는 일 | 대체 대상 | 검증 결과 |
|--------|---------|-----------|-----------|
| **S3** | 웨이퍼 이미지 4종 + 리포트 CSV/PDF 저장 | 로컬 `outputs/images` | 업로드·presigned URL HTTP 200·대시보드 표시 ✅ |
| **RDS (PostgreSQL)** | 검사·모델·알림 등 9개 테이블 | SQLite 파일 | 9테이블 생성·검사 저장·계측 컬럼 채움 ✅ |
| **Secrets Manager** | API 키·DB 비밀번호 보관 | `.env` 평문 | `.env`에서 키 제거 후에도 LLM 동작 ✅ |
| **SNS** | High risk·drift 이메일 알림 | DB 문자열 기록만 | High risk 검사 → 이메일 수신 ✅ |
| **Lambda + EventBridge** | 주기 작업(automation tick) 자동화 | 수동 API 호출 | 1시간 스케줄·자동 검사 RDS 적재 ✅ |
| **CloudWatch** | 로그 수집 + CPU 경보 | systemd 로컬 로그 | 앱 로그 그룹 수집·CPU 경보 이메일 ✅ |
| **EC2** | FastAPI + React 서빙 | (유지) | — |

---

## 5. 핵심 설계: Dual-mode 토글

> **발표 포인트**: "AWS로 한 번에 갈아엎지 않고, 환경변수 토글로 로컬↔클라우드를 전환 가능하게 설계했다. 덕분에 로컬 개발이 깨지지 않고, 서비스를 하나씩 안전하게 켤 수 있었다."

| 토글 (환경변수) | 기본값(로컬) | AWS 전환값 |
|------|-----------|-----|
| `IMAGE_BACKEND` | `local` | `s3` (+ `S3_BUCKET`) |
| `STORAGE_BACKEND` | `sqlite` | `postgres` (+ `RDS_*`) |
| `USE_SECRETS_MANAGER` | `0` | `1` (+ `SECRET_ID`) |
| `SNS_TOPIC_ARN` | 미설정(발송 안 함) | ARN 설정 시 발송 |

**신규 추상화 모듈 (관심사 분리):**
- `app/services/aws.py` — boto3 클라이언트 lazy 생성(리전 자동 감지)
- `app/services/object_store.py` — 파일 저장 추상화(로컬 디스크 ↔ S3) + presign
- `app/services/db.py` — DB 추상화(SQLite ↔ PostgreSQL): `?`→`%s` 변환, UPSERT, 스키마 변환
- `infra/lambda/automation_tick.py` — 스케줄 Lambda 핸들러(표준 라이브러리만 사용)

---

## 6. 진행 단계 (단계적 마이그레이션)

각 단계는 **① 코드 작성 → ② AWS 콘솔 작업 → ③ 검증**으로 인터리빙 진행.

| 단계 | 내용 | 결과 |
|------|------|------|
| **Stage 0** | dual-mode 스캐폴딩(신규 모듈 + 토글) | 로컬 동작 불변 ✅ |
| **Stage 1** | S3 파일 저장 + 리포트 CSV/PDF + 계측 컬럼 | EC2 검증 ✅ |
| **Stage 2** | Secrets Manager 키 이전 | EC2 검증 ✅ |
| **Stage 3** | RDS PostgreSQL 전환 | EC2 검증 ✅ |
| **Stage 4** | SNS 실제 알림 | EC2 검증 ✅ |
| **Lambda/CloudWatch** | 자동화 + 모니터링(콘솔) | EC2 검증 ✅ |

---

## 7. 기술적 도전 & 해결 (발표 하이라이트)

> 이 섹션이 발표/보고서에서 가장 임팩트 있는 부분입니다.

1. **presigned URL 만료 문제**
   - 문제: S3 presigned URL을 DB에 저장하면 1시간 뒤 만료되어 링크가 깨짐.
   - 해결: **DB엔 영구적인 S3 키만 저장**하고, **조회 시점에 presigned URL을 즉석 생성**. 로컬 모드에선 `/outputs/...` 경로 반환 → 프론트 코드 무수정.

2. **비(非) us-east-1 버킷의 서명 불일치 (SignatureDoesNotMatch)**
   - 문제: 서울 리전 버킷인데 presigned URL 호스트가 글로벌 엔드포인트(`s3.amazonaws.com`)로 생성 → 307 + 서명 불일치.
   - 해결: **리전 엔드포인트 + SigV4 + virtual addressing** 고정 + **`get_bucket_location`으로 버킷 실제 리전 자동 감지**.

3. **SQLite → PostgreSQL 호환을 로컬 개발 깨지 않고**
   - 문제: `?` placeholder, `INSERT OR REPLACE`, `PRAGMA`, BLOB 등 SQLite 전용 문법.
   - 해결: `db.py` 추상화 계층 — `?`→`%s` 변환(파라미터 있을 때만, `LIKE 'x%'` 보존), `ON CONFLICT` UPSERT, `information_schema` 컬럼 조회, BYTEA(memoryview→bytes). 약 30개 쿼리를 일괄 호환.

4. **비밀 로딩 순서**
   - `config._load_secrets()`가 다른 모듈이 환경변수를 읽기 **전에** 실행되도록 배치. `setdefault`로 명시적 `.env` 값이 우선.

5. **알림 발송이 검사 흐름을 막지 않도록**
   - `insert_alert`의 SNS publish는 **best-effort**(실패 무시) + `SNS_TOPIC_ARN` 미설정 시 no-op.

6. **Lambda → EC2 네트워크**
   - 프라이빗 IP(`172.31.x`)가 아닌 **퍼블릭 Elastic IP**로 호출해야 함. 보안그룹 8000 인바운드를 0.0.0.0/0으로.

7. **스케줄 자동화로 드러난 잠재 버그**
   - Lambda가 `automation tick`을 자동 호출하자, 데모 시나리오의 키 불일치(`defect_hint` vs `defect_type`)로 인한 **기존 버그(HTTP 500)**가 드러나 함께 수정.

8. **팀원과 분기된 main 병합**
   - 팀원이 main을 3커밋(mlops) 앞서 수정 → `git merge-tree`로 **충돌 없음 사전 검증**, 병합 후 양측 코드가 sqlite/postgres에서 정상 동작함을 확인.

---

## 8. 검증 증거 (재현 가능한 결과)

- **S3**: `aws s3 ls s3://waferguard-images-twkim/` → `images/INS-*.png` 4종 + `reports/INS-*.csv/.pdf`. presigned URL `curl` → **HTTP 200**.
- **Secrets Manager**: `.env`에서 `LUXIA_API_KEY` 삭제 후에도 검사 응답 `agent_mode: pending`(LLM 동작) → 시크릿에서 로드 확인.
- **RDS**: `information_schema`에 **9개 테이블**, 검사 1건 → `inspections`에 행 + `cd_nm=33.9` 저장.
- **SNS**: High risk 검사 → 구독 이메일로 `[WaferGuard] CRITICAL` 수신.
- **Lambda/EventBridge**: 수동 테스트 `statusCode 200`, `rate(1 hour)` 규칙 → `WF-AUTO-*` 검사 자동 적재.
- **CloudWatch**: 로그 그룹 `waferguard/app`에 uvicorn 로그 수집, `stress`로 CPU 부하 → CPU 경보 ALARM → 이메일 수신.

---

## 9. IAM / 보안 구성

- EC2 인스턴스 역할 `waferguard-ec2-role`: `AmazonS3FullAccess`, `AmazonSNSFullAccess`, `SecretsManagerReadWrite`, `CloudWatchAgentServerPolicy` (학습용 광범위 권한; 실무는 최소권한으로 좁힘).
- RDS: 퍼블릭 액세스 차단, 보안그룹으로 **EC2에서 오는 5432만 허용**.
- S3: 퍼블릭 액세스 차단(비공개), presigned URL로만 접근.
- 비밀: `.env` 평문 → Secrets Manager로 이전.

---

## 10. 비용 관리

| 리소스 | 특징 | 절약 |
|--------|------|------|
| **RDS / EC2** | 켜진 내내 과금(가장 큼) | 안 쓰면 **중지** |
| **EventBridge tick** | 매시간 RDS·S3·간헐 이메일·LLM | 데모 후 **규칙 Disable** |
| S3 / Secrets / SNS / CloudWatch / Lambda | 소액 | — |

> 주의: RDS는 세션 종료로 자동 중지되지 않으며, 중지해도 7일 뒤 자동 재시작.

---

## 11. 산출물 (저장소)

- **코드**: `app/services/aws.py`, `object_store.py`, `db.py` (신규) + `config.py`/`storage.py`/`pipeline.py`/`synthetic_wafer.py`/`luxia_client.py`/`main.py` (수정) + `infra/lambda/automation_tick.py`
- **문서**: `docs/AWS_Cloud_Migration_Guide.md` (콘솔 단계별 가이드), `README.md`의 "AWS 배포" 섹션, 본 문서
- **브랜치**: `feat/aws-multiservice` (main 대비 충돌 없이 병합 가능)

### 주요 커밋 흐름
```
feat: AWS EC2 배포 지원 / SPA 마운트 픽스
feat(aws): stage 0 — dual-mode 스캐폴딩
feat(aws): stage 1 — S3 파일 저장 + 리포트 + 계측 컬럼
fix(aws): presigned URL 응답 처리 / 리전 엔드포인트 / 버킷 리전 자동 감지
feat(aws): stage 3 — PostgreSQL/RDS 호환
feat(aws): stage 4 — SNS 알림 발송
chore(infra): 스케줄 Lambda 핸들러
fix: automation tick KeyError(데모 시나리오) 픽스
merge: origin/main (팀원 mlops 변경 통합)
```

---

## 12. 발표용 핵심 메시지 (3줄)

1. **"단일 서버 → 관리형 서비스 7종"**: 스토리지·DB·비밀·알림·서버리스·모니터링을 각 역할에 맞는 AWS 서비스로 분리.
2. **"안전한 단계적 전환"**: dual-mode 토글로 로컬 개발을 깨지 않고 서비스를 하나씩 켜며 매 단계 검증.
3. **"실전형 문제 해결"**: presigned URL 만료·리전 서명·DB 방언 차이·네트워크 도달성·분기 병합 등 클라우드 운영의 현실적 이슈를 직접 진단·해결.
