# WaferGuard 멀티 AWS 서비스 전환 가이드

이 문서는 현재 **EC2 한 대**에서 모든 것을 처리하는 WaferGuard를, **여러 AWS 관리형 서비스**로 분산시키는 과정을 콘솔 화면 흐름 그대로 단계별로 안내합니다. 학부 클라우드 학습을 목적으로, "어느 버튼을 누르는지"까지 친절하게 설명합니다.

> 🎓 **AWS Academy 사용자**: 콘솔 조작은 일반 AWS와 동일합니다. 다만 ① 리전은 **us-east-1 / us-west-2** 만, ② IAM 역할은 새로 만들지 못하므로 미리 만들어진 **LabRole / LabInstanceProfile** 을 사용, ③ 인스턴스 크기는 nano~large 로 제한됩니다. 각 단계마다 이 박스로 차이를 안내합니다.

---

## 0. 개요

### 현재 구조 (단일 EC2)

```
브라우저 ──▶ EC2 한 대
              ├── FastAPI (API + React 정적 서빙)
              ├── SQLite 파일 (outputs/waferguard.db)
              └── 이미지 파일 (outputs/images/*.png)
```

EC2가 꺼지거나 디스크가 날아가면 **DB·이미지가 전부 사라집니다.** 또한 알림은 실제로 발송되지 않고 DB에 기록만 되며, 주기 작업은 사람이 직접 API를 호출해야 합니다.

### 목표 구조 (멀티 서비스)

```
                         인터넷
                            │
                            ▼
                    ┌────────────────┐
   브라우저 ───────▶│  EC2 (FastAPI)  │  ← 백엔드 API + React 정적 서빙 (유지)
                    │  IAM 역할 부착   │
                    └───────┬────────┘
                            │ boto3 (역할 권한으로 호출)
        ┌───────────┬───────┼───────────┬──────────────┐
        ▼           ▼       ▼           ▼              ▼
   ┌────────┐  ┌────────┐ ┌──────────┐ ┌─────────┐ ┌──────────┐
   │   S3   │  │  RDS   │ │ Secrets  │ │   SNS   │ │CloudWatch│
   │ 이미지 │  │Postgres│ │ Manager  │ │ 알림발송│ │ 로그/지표│
   └────────┘  └────────┘ └──────────┘ └─────────┘ └──────────┘
                                            ▲
                              ┌─────────────┘
                   ┌──────────────────────┐
                   │ Lambda + EventBridge  │ ← 주기 작업 자동화
                   └──────────────────────┘
```

### 서비스별 역할 한눈에 보기

| 서비스 | 맡는 일 | 현재 코드에서 대체하는 것 |
|--------|---------|--------------------------|
| **S3** | 웨이퍼 이미지 4종 + 리포트 PDF/CSV 영구 저장 | 로컬 `outputs/images/*.png` (리포트 파일은 신규) |
| **RDS (PostgreSQL)** | 검사·모델·알림 등 워크플로우 DB | SQLite `outputs/waferguard.db` |
| **Secrets Manager** | API 키·DB 비밀번호 안전 보관 | `.env` 평문 파일 |
| **SNS** | High risk·drift 실제 이메일 알림 | `alerts` 테이블에 문자열만 기록 |
| **Lambda + EventBridge** | automation tick·daily handoff 자동 실행 | 사람이 수동으로 API 호출 |
| **CloudWatch** | 로그 수집·지표·경보 | systemd journald 로컬 로그 |

### 진행 순서 (의존성 때문에 이 순서를 권장)

1. **S3** (이미지 저장소) — 독립적, 먼저 만들기 쉬움
2. **RDS** (DB) — 생성에 시간이 걸리므로 일찍 시작
3. **Secrets Manager** (키 관리) — RDS 비밀번호를 여기 보관
4. **SNS** (알림) — 독립적
5. **EC2에 IAM 권한 연결** — 위 서비스들을 호출할 수 있도록
6. **Lambda + EventBridge** (자동화) — EC2가 동작한 뒤
7. **CloudWatch** (모니터링) — 마지막에 전체 관찰

> 💡 이 문서는 **콘솔 설정 가이드**입니다. 각 서비스를 실제로 쓰려면 표시된 `[코드 변경 지점]` 도 함께 수정해야 합니다. 이 문서에서는 "어디를 어떻게 바꾸는지"만 설명하고, 실제 코드 수정은 별도 작업으로 남겨둡니다.

---

## 1. 사전 준비

### 1-1. 리전 선택

콘솔 오른쪽 위에서 리전을 확인/선택합니다. **모든 서비스를 같은 리전에 만들어야** 서로 통신이 쉽습니다.

> 🎓 **AWS Academy**: 반드시 **us-east-1 (버지니아 북부)** 또는 **us-west-2 (오리건)** 중 하나로 통일하세요. 다른 리전은 접근이 막힙니다.

### 1-2. IAM 역할 개념 잡기

EC2 안의 FastAPI가 S3·RDS·SNS 등을 호출하려면 **권한**이 필요합니다. AWS에서는 액세스 키를 코드에 박지 않고, **EC2에 "IAM 역할"을 붙여** 권한을 줍니다. 코드(boto3)는 자동으로 그 역할의 권한을 사용합니다.

- **일반 AWS**: IAM 콘솔에서 EC2용 역할을 만들고, `AmazonS3FullAccess`, `AmazonRDSFullAccess`, `SecretsManagerReadWrite`, `AmazonSNSFullAccess`, `CloudWatchAgentServerPolicy` 정책을 붙입니다. (학습용이라 넓게 주는 것이며, 실무에서는 최소권한으로 좁힙니다.)
- 만든 역할을 EC2 → 인스턴스 선택 → **작업(Actions) → 보안(Security) → IAM 역할 수정(Modify IAM role)** 에서 부착합니다.

> 🎓 **AWS Academy**: 역할을 새로 만들 수 없습니다. 대신 EC2 생성 시 **LabInstanceProfile** 을 부착하면 그 안의 **LabRole** 이 S3·RDS·SNS·Secrets·CloudWatch 등 대부분의 서비스 접근 권한을 이미 가지고 있습니다. (가이드 228~231행 참고) 이전 README 단계에서 이미 부착했다면 추가 작업이 없습니다.

### 1-3. EC2에 boto3 설치

EC2에 SSH로 접속해 Python AWS SDK를 설치합니다.

```bash
cd /home/ec2-user/WaferGuard
source venv/bin/activate
pip install boto3 psycopg2-binary
```

- `boto3`: S3·SNS·Secrets Manager 호출용
- `psycopg2-binary`: PostgreSQL(RDS) 연결용

> 나중에 `requirements.txt` 에도 이 두 줄을 추가해 두면 재배포가 편합니다. (8장 참고)

---

## 2. S3 — 웨이퍼 이미지 저장소

검사할 때마다 만들어지는 4종 이미지(wafer/heatmap/overlay/roi)와 **리포트 파일(PDF/CSV)** 을 EC2 디스크 대신 S3에 저장합니다. EC2가 죽어도 파일은 안전합니다. (리포트 파일 생성은 2-5에서 신규 추가합니다.)

### 2-1. 버킷 만들기

1. 콘솔 검색창에 `S3` 입력 → **S3** 클릭
2. 오른쪽 **버킷 만들기(Create bucket)** 클릭
3. 설정:
   - **버킷 이름(Bucket name)**: `waferguard-images-본인이니셜` (S3 버킷 이름은 전 세계에서 유일해야 합니다. 예: `waferguard-images-twkim`)
   - **AWS 리전**: 1장에서 정한 리전과 동일하게
   - **퍼블릭 액세스 차단(Block all public access)**: **체크 유지(차단)** — 이미지는 EC2가 presigned URL로 접근하므로 공개할 필요 없음
4. 나머지 기본값 → **버킷 만들기**

### 2-2. 폴더 구조

버킷 안에서 별도 폴더를 미리 만들 필요는 없습니다. 코드가 `images/INS-xxxx_wafer.png` 처럼 **키(경로)에 접두사** 를 붙여 올리면 S3가 알아서 폴더처럼 보여줍니다.

### 2-3. EC2 접근 권한 확인

1장에서 EC2에 부착한 IAM 역할에 S3 권한이 있으면 끝입니다.

> 🎓 **AWS Academy**: LabRole 에 S3 접근 권한이 포함돼 있습니다(가이드 410행). 추가 설정 불필요.

### 2-4. [코드 변경 지점] 로컬 저장 → S3 업로드

세 군데를 바꿔야 합니다.

**① 이미지 업로드** — [app/services/synthetic_wafer.py:64-67](../app/services/synthetic_wafer.py#L64-L67)

지금은 PIL이 로컬 디스크에 저장합니다:
```python
# 현재 (before)
wafer.save(image_path)
heatmap.save(heatmap_path)
overlay.save(overlay_path)
roi.save(roi_path)
```
S3로 올리려면 메모리 버퍼에 저장한 뒤 `boto3` 로 업로드하는 방식으로 바꿉니다:
```python
# 개념 (after)
import io, boto3
s3 = boto3.client("s3")
BUCKET = os.environ["S3_BUCKET"]
def _upload(img, key):
    buf = io.BytesIO(); img.save(buf, format="PNG"); buf.seek(0)
    s3.upload_fileobj(buf, BUCKET, key)
_upload(wafer,   f"images/{inspection_id}_wafer.png")
# heatmap/overlay/roi 동일
```

**② 이미지 경로(S3 키) 저장** — [app/services/pipeline.py:197-200](../app/services/pipeline.py#L197-L200)

> ⚠️ **중요 — presigned URL을 DB에 저장하지 마세요.** presigned URL은 만료 시간(예: 1시간)이 지나면 깨집니다. DB에는 **영구적인 S3 키**(`images/INS-xxx_wafer.png`)만 저장하고, **브라우저에 응답할 때 그때그때 presigned URL을 생성**해야 합니다.

지금은 `/outputs/images/...` 로컬 경로를 URL로 씁니다:
```python
# 현재 (before)
"image_url": f"/outputs/images/{image_result['image_path'].name}",
```
DB에는 **S3 키만** 저장합니다(만료 없음):
```python
# 개념 (after) — pipeline.py: DB에는 키만 저장
"image_url": f"images/{inspection_id}_wafer.png",
"heatmap_url": f"images/{inspection_id}_heatmap.png",
"overlay_url": f"images/{inspection_id}_overlay.png",
"roi_url": f"images/{inspection_id}_roi.png",
```

**③ 읽을 때 presigned URL 생성** — [app/services/storage.py](../app/services/storage.py) 의 조회 함수(`get_inspection`, `list_inspections` 등)

브라우저에 검사 기록을 돌려줄 때, 저장된 키를 1시간짜리 presigned URL로 변환해서 내보냅니다:
```python
# 개념 (after) — storage.py: 행을 dict로 만든 직후
def _presign(key):
    if not key:
        return key
    return _s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": os.environ["S3_BUCKET"], "Key": key},
        ExpiresIn=3600,
    )
for f in ("image_url", "heatmap_url", "overlay_url", "roi_url"):
    data[f] = _presign(data.get(f))
```
이렇게 하면 DB에는 영구 키가 남고, 매 요청마다 신선한(만료 안 된) URL이 발급됩니다.

**④ LLM에 이미지 전달** — [app/services/luxia_client.py:131-153](../app/services/luxia_client.py#L131-L153)

`_to_data_uri()` 가 로컬 파일을 읽어 base64로 만듭니다(`file_path.read_bytes()`). 이제 인자로 들어오는 값이 S3 키이므로, S3에서 객체를 내려받아 base64로 만들도록 바꿉니다:
```python
# 개념 (after) — luxia_client.py
obj = _s3.get_object(Bucket=os.environ["S3_BUCKET"], Key=key)
b64 = base64.b64encode(obj["Body"].read()).decode("ascii")
return f"data:image/png;base64,{b64}"
```

**⑤ 정적 마운트 제거** — [app/main.py:90](../app/main.py#L90)

이미지가 S3에 있으므로 `app.mount("/outputs", ...)` 로컬 서빙은 더 이상 필요 없습니다(남겨둬도 무해).

### 2-5. [코드 변경 지점] 리포트 PDF/CSV 파일도 S3에 저장

> 현재 프로젝트에는 **리포트 PDF/CSV 생성 기능이 없습니다.** 리포트는 [reporting.py](../app/services/reporting.py)의 `build_report()`가 만든 **텍스트(HTML)** 가 [storage.py:43](../app/services/storage.py#L43) `report` 컬럼에 들어갈 뿐입니다. 팀원 요구("리포트 PDF/CSV 같은 파일")를 만족하려면 ⓐ 파일 생성 코드를 새로 추가하고 ⓑ S3에 올린 뒤 ⓒ 그 키를 DB에 저장해야 합니다.

**ⓐ CSV 생성** (검사 메타데이터 한 줄) — `pipeline.py` 의 `record` 완성 직후:
```python
# 개념 (after) — pipeline.py
import csv, io
def _build_csv(record: dict) -> bytes:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["wafer_id", "lot_id", "equipment_id", "defect_type", "risk_level", "risk_score"])
    w.writerow([record["wafer_id"], record["lot_id"], record["equipment_id"],
                record["defect_type"], record["risk_level"], record["risk_score"]])
    return buf.getvalue().encode("utf-8")
```

**ⓑ PDF 생성** — 가장 간단한 방법은 `report`(HTML/텍스트)를 PDF로 변환하는 것입니다. 순수 파이썬 라이브러리 `fpdf2`(`pip install fpdf2`)면 EC2에서 추가 시스템 패키지 없이 동작합니다:
```python
# 개념 (after) — pipeline.py
from fpdf import FPDF
def _build_pdf(record: dict) -> bytes:
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("helvetica", size=11)
    pdf.multi_cell(0, 8, record["report"])   # 한글 포함 시 유니코드 폰트 등록 필요
    return bytes(pdf.output())
```
> 한글이 깨지면 `pdf.add_font()` 로 나눔고딕 같은 TTF를 등록하세요. 학습용으로 간단히 할 거면 CSV만 해도 충분합니다.

**ⓒ S3 업로드 + DB 키 저장** — 2-4 ①의 `_upload` 헬퍼를 재사용:
```python
# 개념 (after) — pipeline.py
_s3.put_object(Bucket=BUCKET, Key=f"reports/{inspection_id}.csv", Body=_build_csv(record))
_s3.put_object(Bucket=BUCKET, Key=f"reports/{inspection_id}.pdf", Body=_build_pdf(record))
record["report_csv_url"] = f"reports/{inspection_id}.csv"
record["report_pdf_url"] = f"reports/{inspection_id}.pdf"
```

**ⓓ DB 컬럼 추가** — [storage.py:137-147](../app/services/storage.py#L137-L147)의 `_ensure_column` 패턴을 따라 두 컬럼을 추가:
```python
# 개념 (after) — storage.py init_db()
_ensure_column(conn, "inspections", "report_csv_url", "TEXT")
_ensure_column(conn, "inspections", "report_pdf_url", "TEXT")
```
읽을 때는 2-4 ③의 `_presign` 으로 이 두 키도 presigned URL로 변환해 내보냅니다.

> S3 키 구조 정리: 이미지는 `images/` 접두사, 리포트 파일은 `reports/` 접두사로 분리하면 관리가 깔끔합니다.

### 2-6. 검증

EC2에서:
```bash
# 권한 확인 (빈 목록이라도 오류만 없으면 OK)
aws s3 ls s3://waferguard-images-본인이니셜/

# 테스트 업로드/삭제
echo "hello" > /tmp/test.txt
aws s3 cp /tmp/test.txt s3://waferguard-images-본인이니셜/test.txt
aws s3 rm s3://waferguard-images-본인이니셜/test.txt
```

---

## 3. RDS — PostgreSQL 데이터베이스

SQLite 파일 하나에 들어 있던 9개 테이블을 관리형 PostgreSQL로 옮깁니다. 여러 EC2·Lambda가 동시에 접근할 수 있고 백업도 자동입니다.

### 3-1. 개념: 서브넷 그룹과 보안 그룹

- **DB 서브넷 그룹**: RDS가 들어갈 네트워크 영역. 보통 기본 VPC의 서브넷들을 묶습니다.
- **보안 그룹(SG)**: DB의 방화벽. **EC2에서 오는 5432 포트만 허용** 하도록 설정해 외부 노출을 막습니다.

### 3-2. RDS 인스턴스 만들기

1. 콘솔 검색창에 `RDS` → **RDS** 클릭
2. **데이터베이스 생성(Create database)** 클릭
3. 설정:
   - 생성 방식: **표준 생성(Standard create)**
   - 엔진 옵션: **PostgreSQL**
   - 템플릿: **개발/테스트(Dev/Test)** (학습용)
   - **DB 인스턴스 식별자**: `waferguard-db`
   - **마스터 사용자 이름**: `wgadmin`
   - **마스터 암호**: 안전한 암호 지정 (→ 4장에서 Secrets Manager에 보관)
   - **인스턴스 구성**: 버스터블 클래스 → **db.t3.micro** 또는 **db.t3.small**
   - **스토리지**: 범용 SSD **gp2**, 20GB
   - **연결**: 퍼블릭 액세스 **아니오(No)** (EC2를 통해서만 접근)
   - **추가 구성 → 데이터베이스 옵션 → 초기 데이터베이스 이름**: `waferguard`
4. **데이터베이스 생성** 클릭 → 상태가 **사용 가능(Available)** 이 될 때까지 5~10분 대기

> 🎓 **AWS Academy** (가이드 287~296행):
> - 지원 엔진: Aurora/Oracle/SQL Server/**PostgreSQL**/MySQL/MariaDB
> - 인스턴스: nano/micro/small/medium 의 **버스터블 클래스만**
> - 스토리지: **gp2** 만 (gp3·PIOPS 불가), ≤100GB
> - **고급 구성에서 "향상된 모니터링(Enhanced monitoring)" 체크 해제 필수** (기본 켜져 있으면 생성 실패)
> - ⚠️ 세션이 끝나도 RDS는 자동으로 멈추지 않습니다. 비용 절약하려면 직접 중지하세요(단, 7일 후 자동 재시작됨).

### 3-3. 보안 그룹 연결

1. 생성된 `waferguard-db` 클릭 → **연결 & 보안(Connectivity & security)** 탭
2. **VPC 보안 그룹** 클릭 → 인바운드 규칙 편집
3. 규칙 추가: 유형 **PostgreSQL**, 포트 **5432**, 소스 = **EC2의 보안 그룹**(`waferguard-sg`) 선택
   - 이렇게 하면 EC2에서 오는 연결만 DB에 닿습니다.

### 3-4. 스키마 이전 (SQLite → PostgreSQL)

`init_db()` 가 만드는 9개 테이블([app/services/storage.py:25-160](../app/services/storage.py#L25-L160))을 PostgreSQL에 다시 만들어야 합니다. 대부분 그대로 동작하지만 **SQLite 전용 문법**은 바꿔야 합니다.

| SQLite (현재) | PostgreSQL (변경) | 위치 |
|---------------|-------------------|------|
| `sqlite3.connect(DB_PATH)` | `psycopg2.connect(host/port/db/user/password)` | storage.py:18-22 `connect()` |
| 파라미터 `?` | 파라미터 `%s` | 모든 쿼리 (전 파일) |
| `INSERT OR REPLACE` | `INSERT ... ON CONFLICT (id) DO UPDATE SET ...` | storage.py:463, 980 |
| `PRAGMA table_info(t)` | `SELECT column_name FROM information_schema.columns WHERE table_name='t'` | storage.py:1047, 1074 |
| 임베딩 `BLOB` | `BYTEA` (그대로 struct 직렬화 유지) 또는 `pgvector` 확장 | rag_documents 테이블 |
| TEXT 타임스탬프 | 그대로 TEXT 유지 가능 (변경 최소화) | created_at 등 |

> 💡 **임베딩 검색**: 현재는 모든 행을 읽어 Python에서 코사인 유사도를 계산합니다([storage.py:993-1043 `query_rag`](../app/services/storage.py#L993-L1043)). 학습 단계에서는 이 방식을 그대로 둬도 됩니다(BYTEA로 저장). 더 나아가려면 RDS에서 `CREATE EXTENSION vector;` 후 `embedding vector(1024)` 타입과 `<->` 연산자로 DB가 직접 검색하게 만들 수 있습니다.

#### [선택] 계측값을 개별 컬럼으로 정규화

현재 CD/overlay/thickness 등 계측값은 [storage.py:146](../app/services/storage.py#L146) `metrology_json` **한 컬럼에 JSON 통째로** 저장됩니다. 저장·조회는 되지만 `WHERE cd_nm > 33` 같은 **SQL 검색·집계가 안 됩니다.** 팀원이 "계측값으로 검색/통계"를 원한다면 개별 컬럼으로 풀어주세요.

**컬럼 추가** — `storage.py init_db()`:
```python
# 개념 (after)
_ensure_column(conn, "inspections", "cd_nm", "REAL")
_ensure_column(conn, "inspections", "overlay_nm", "REAL")
_ensure_column(conn, "inspections", "film_thickness_nm", "REAL")
_ensure_column(conn, "inspections", "roughness_nm", "REAL")
```
**저장 시 채우기** — `pipeline.py` 의 `record` 빌드 부분에서 `metrology` dict 값을 개별 필드로도 복사:
```python
# 개념 (after) — record = { ... } 안에 추가
"cd_nm": metrology.get("cd_nm"),
"overlay_nm": metrology.get("overlay_nm"),
"film_thickness_nm": metrology.get("film_thickness_nm"),
"roughness_nm": metrology.get("roughness_nm"),
```
> `metrology_json` 은 원본 보존용으로 그대로 두고, 개별 컬럼은 검색·집계용으로 **병행**하는 방식을 권장합니다. (PostgreSQL JSON 연산자 `metrology_json::jsonb ->> 'cd_nm'` 로도 조회 가능하지만, 개별 컬럼이 인덱스·통계에 유리합니다.)

### 3-5. [코드 변경 지점] 연결 함수

**연결** — [app/services/storage.py:18-22](../app/services/storage.py#L18-L22)
```python
# 현재 (before)
def connect() -> sqlite3.Connection:
    ensure_runtime_dirs()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn
```
```python
# 개념 (after)
import psycopg2, psycopg2.extras
def connect():
    return psycopg2.connect(
        host=os.environ["RDS_HOST"], port=5432,
        dbname=os.environ["RDS_DB"], user=os.environ["RDS_USER"],
        password=os.environ["RDS_PASSWORD"],
        cursor_factory=psycopg2.extras.RealDictCursor,  # row를 dict처럼
    )
```

**설정** — [app/services/config.py:9](../app/services/config.py#L9): `DB_PATH` 대신 `RDS_HOST/DB/USER/PASSWORD`(또는 `DATABASE_URL`)를 환경변수/시크릿에서 읽도록 추가.

### 3-6. 검증

EC2에서:
```bash
# psql 클라이언트 설치 후 연결 테스트
sudo dnf install -y postgresql15
psql -h <RDS엔드포인트> -U wgadmin -d waferguard
# 암호 입력 후 \dt 로 테이블 목록 확인
```

---

## 4. Secrets Manager — 비밀 관리

`.env` 에 평문으로 있던 `LUXIA_API_KEY` 와 RDS 비밀번호를 암호화 저장소로 옮깁니다.

### 4-1. 시크릿 생성

1. 콘솔 검색창에 `Secrets Manager` → 클릭
2. **새 보안 암호 저장(Store a new secret)** 클릭
3. 시크릿 유형: **다른 유형의 보안 암호(Other type of secret)**
4. 키/값 페어 입력:
   - `LUXIA_API_KEY` → 발급받은 키
   - `RDS_PASSWORD` → 3장에서 정한 DB 암호
   - `RDS_HOST` → RDS 엔드포인트
5. **보안 암호 이름**: `waferguard/app`
6. 나머지 기본값 → 저장

> 🎓 **AWS Academy**: Secrets Manager는 LabRole로 접근 가능합니다(가이드 386~388행).

### 4-2. EC2 권한 확인

1장의 IAM 역할에 Secrets Manager 읽기 권한이 있으면 됩니다(LabRole 포함).

### 4-3. [코드 변경 지점] 시크릿 로드

**설정** — [app/services/config.py:6](../app/services/config.py#L6) 부근에 `.env` 로드를 보조하는 시크릿 조회를 추가:
```python
# 개념 (after) — config.py 상단
import boto3, json, os
def _load_secrets():
    try:
        sm = boto3.client("secretsmanager")
        raw = sm.get_secret_value(SecretId="waferguard/app")["SecretString"]
        for k, v in json.loads(raw).items():
            os.environ.setdefault(k, v)   # 이미 있으면 유지
    except Exception:
        pass  # 로컬 개발에서는 .env 로 폴백
_load_secrets()
```
이후 `LUXIA_API_KEY` 를 읽는 [luxia_client.py:119-121 `_api_key()`](../app/services/luxia_client.py#L119-L121)는 그대로 `os.environ` 에서 읽으므로 **수정 불필요**합니다.

### 4-4. 검증
```bash
aws secretsmanager get-secret-value --secret-id waferguard/app --query SecretString --output text
```

---

## 5. SNS — 실제 알림 발송

지금은 High risk·drift가 발생해도 `alerts` 테이블에 문자열만 기록됩니다. SNS로 **진짜 이메일**을 보냅니다.

### 5-1. 토픽 만들기

1. 콘솔 검색창에 `SNS` → **Simple Notification Service** 클릭
2. **주제(Topics) → 주제 생성(Create topic)**
3. 유형: **표준(Standard)**, 이름: `waferguard-alerts` → 생성
4. 생성된 토픽의 **ARN** 복사 (예: `arn:aws:sns:us-east-1:123456789012:waferguard-alerts`)

### 5-2. 구독(이메일) 추가

1. 토픽 화면에서 **구독 생성(Create subscription)**
2. 프로토콜: **이메일(Email)**, 엔드포인트: 본인 이메일 주소 → 생성
3. **받은 메일함에서 "Confirm subscription" 링크를 클릭** 해야 알림을 받습니다.

> 🎓 **AWS Academy**: SNS는 LabRole로 접근 가능합니다(가이드 400~402행).

### 5-3. [코드 변경 지점] insert_alert에 발송 추가

**알림 기록 함수** — [app/services/storage.py:531-540](../app/services/storage.py#L531-L540)

DB 기록은 그대로 두고, 그 뒤에 SNS publish 한 줄을 더합니다:
```python
# 개념 (after) — insert_alert() 끝에 추가
import boto3
_sns = boto3.client("sns")
def insert_alert(severity, channel, content):
    # ... 기존 DB INSERT 유지 ...
    try:
        _sns.publish(
            TopicArn=os.environ["SNS_TOPIC_ARN"],
            Subject=f"[WaferGuard] {severity.upper()}",
            Message=content,
        )
    except Exception:
        pass  # 발송 실패해도 검사 흐름은 계속
```
이 한 곳만 고치면 `insert_alert` 를 호출하는 모든 지점([pipeline.py:217](../app/services/pipeline.py#L217), [mlops.py:46/83/98](../app/services/mlops.py), [main.py:437](../app/main.py#L437))이 자동으로 실제 알림을 보냅니다.

### 5-4. 검증

SNS 콘솔 → 토픽 → **메시지 게시(Publish message)** 로 테스트 메시지를 보내 이메일이 오는지 확인합니다.

---

## 6. Lambda + EventBridge — 주기 작업 자동화

`automation tick`(모의 검사 1건)과 `daily handoff`(교대 리포트)는 지금 사람이 수동으로 API를 호출해야 합니다. 이를 **정해진 시간에 자동 실행**되게 만듭니다.

설계상 가장 간단한 방법은, Lambda가 EC2의 기존 엔드포인트를 **HTTP로 호출**하는 것입니다. 그러면 백엔드 코드는 거의 손대지 않아도 됩니다.

- [app/main.py:272-274](../app/main.py#L272-L274) `POST /api/v1/automation/tick`
- [app/main.py:295-297](../app/main.py#L295-L297) `POST /api/v1/handoff/report`

### 6-1. Lambda 함수 만들기

1. 콘솔 검색창에 `Lambda` → **Lambda** 클릭
2. **함수 생성(Create function)** → **새로 작성(Author from scratch)**
   - 함수 이름: `waferguard-automation-tick`
   - 런타임: **Python 3.12**
   - 실행 역할: 일반 AWS는 새 역할 생성 / **Academy는 기존 역할 사용 → LabRole 선택**(가이드 252~254행)
3. **함수 생성** 클릭
4. 코드 편집기에 입력:
```python
import json
from urllib import request

EC2_BASE = "http://<EC2-Elastic-IP>:8000"

def lambda_handler(event, context):
    body = json.dumps({"line_id": "LINE-7", "drift_check": True, "auto_handoff": True}).encode()
    req = request.Request(
        f"{EC2_BASE}/api/v1/automation/tick",
        data=body, headers={"Content-Type": "application/json"}, method="POST",
    )
    with request.urlopen(req, timeout=30) as r:
        return {"status": r.status}
```
5. **Deploy** 클릭

> `urllib` 은 파이썬 표준 라이브러리라 별도 패키지가 필요 없습니다. EC2 주소는 Elastic IP를 쓰세요(재시작해도 안 바뀜).

> 🎓 **AWS Academy**: 동시 실행 Lambda는 **최대 10개**로 제한됩니다(가이드 255행). 주기 작업 몇 개로는 문제없습니다.

### 6-2. EventBridge 스케줄 연결

1. Lambda 함수 화면 → **트리거 추가(Add trigger)**
2. 소스: **EventBridge (CloudWatch Events)**
3. **새 규칙 생성** → 규칙 이름: `every-5-min`
4. 규칙 유형: **일정 표현식(Schedule expression)** → `rate(5 minutes)`
5. 추가 → 이제 5분마다 자동 검사가 돕니다.

**daily handoff** 도 같은 방식으로 함수를 하나 더 만들고(엔드포인트만 `/api/v1/handoff/report` 로 변경), 스케줄을 `cron(0 22 * * ? *)` (매일 특정 시각) 같은 식으로 겁니다.

### 6-3. 네트워크 주의

- EC2를 **퍼블릭 IP(Elastic IP)** 로 호출하고 보안그룹 8000 포트가 열려 있으면, Lambda를 VPC에 넣지 않아도 동작합니다(가장 간단).
- 더 안전하게 하려면 Lambda를 EC2와 같은 VPC에 넣고 프라이빗 IP로 호출합니다(이 경우 Lambda의 인터넷 접근을 위해 NAT 등 추가 설정 필요 — 학습 단계에서는 퍼블릭 방식 권장).

### 6-4. 검증

Lambda 화면 → **테스트(Test)** 로 수동 실행 → 응답 `{"status": 200}` 확인 → EC2 대시보드에 새 검사가 쌓이는지 확인.

---

## 7. CloudWatch — 로그와 모니터링

EC2 로그를 중앙에서 보고, CPU·DB 연결 수 같은 지표에 경보를 겁니다. Lambda 로그는 자동으로 CloudWatch에 쌓입니다.

### 7-1. EC2 로그 보내기 (CloudWatch Agent)

1. EC2에 에이전트 설치:
```bash
sudo dnf install -y amazon-cloudwatch-agent
```
2. 설정 마법사 실행 후(또는 설정 파일 작성) systemd 로그/uvicorn 로그를 로그 그룹 `waferguard/app` 으로 전송하도록 지정합니다.
3. 에이전트 시작:
```bash
sudo systemctl enable --now amazon-cloudwatch-agent
```

> 🎓 **AWS Academy**: CloudWatch 자체는 사용 가능합니다(가이드 82행). 단 CloudTrail의 CloudWatch 로깅 연동은 제한됩니다(가이드 80행) — 이 프로젝트와는 무관.

### 7-2. 지표·경보 만들기

1. CloudWatch 콘솔 → **경보(Alarms) → 경보 생성**
2. 지표 선택: EC2 → `CPUUtilization` (또는 RDS → `DatabaseConnections`)
3. 조건: 임계값(예: CPU 80% 이상 5분) → 알림 대상으로 **5장에서 만든 SNS 토픽** 선택
4. 생성 → 부하가 높으면 이메일이 옵니다.

### 7-3. 로그 확인

CloudWatch → **로그 그룹(Log groups)** → `waferguard/app` (EC2), `/aws/lambda/waferguard-automation-tick` (Lambda) 에서 실시간 로그를 봅니다.

---

## 8. EC2 ↔ 서비스 연결 총정리

### 8-1. 환경변수/시크릿 매핑

systemd 서비스 파일(`/etc/systemd/system/waferguard.service`)의 `EnvironmentFile` 또는 Secrets Manager를 통해 다음을 EC2에 주입합니다.

| 환경변수 | 값 | 출처 |
|----------|-----|------|
| `S3_BUCKET` | `waferguard-images-본인이니셜` | 2장 |
| `RDS_HOST` | RDS 엔드포인트 | 3장 / 시크릿 |
| `RDS_DB` | `waferguard` | 3장 |
| `RDS_USER` | `wgadmin` | 3장 |
| `RDS_PASSWORD` | DB 암호 | 4장 시크릿 |
| `LUXIA_API_KEY` | LUXIA 키 | 4장 시크릿 |
| `SNS_TOPIC_ARN` | 토픽 ARN | 5장 |

### 8-2. IAM 역할 권한 체크리스트

EC2에 부착한 역할(또는 LabRole)이 아래를 호출할 수 있어야 합니다:

- [ ] S3: `GetObject`, `PutObject` (버킷 한정 권장)
- [ ] RDS: 네트워크(보안그룹)로 접근하므로 IAM 권한은 불필요, 5432 인바운드만 필요
- [ ] Secrets Manager: `GetSecretValue`
- [ ] SNS: `Publish`
- [ ] CloudWatch: 로그 전송(`CloudWatchAgentServerPolicy`)

### 8-3. requirements.txt 추가

```
boto3>=1.34
psycopg2-binary>=2.9
fpdf2>=2.7          # 리포트 PDF 생성 (2-5). CSV만 쓸 거면 불필요
```

---

## 9. 검증 시나리오 (end-to-end)

전체가 연결됐는지 한 번에 확인하는 흐름:

1. 대시보드 또는 curl로 **검사 1건 실행**
   ```bash
   curl -X POST http://<EC2-IP>:8000/api/v1/inspect -H "Content-Type: application/json" -d '{...High risk가 나오는 페이로드...}'
   ```
2. **S3 콘솔** → 버킷에 `images/INS-xxxx_wafer.png` 4종 + `reports/INS-xxxx.csv`·`.pdf` 가 올라왔는지 확인
3. **RDS** → `psql` 로 `SELECT * FROM inspections ORDER BY created_at DESC LIMIT 1;` 새 행 확인
   - `image_url` 등이 **만료 URL이 아니라 S3 키**(`images/...`)로 저장됐는지 확인
   - `cd_nm` 등 계측 컬럼이 채워졌는지 확인(정규화 적용 시)
   - 브라우저 응답의 이미지 URL은 presigned(`https://...X-Amz-...`)로 나오는지 확인
4. High risk였다면 **이메일(SNS)** 수신 확인
5. **CloudWatch 로그 그룹** `waferguard/app` 에 요청 로그 확인
6. **Lambda** 테스트 실행 → 잠시 후 새 자동 검사가 쌓이고 handoff 리포트가 생성되는지 확인

---

## 10. 비용 관리 & 정리

### 주요 과금 포인트

| 리소스 | 특징 | 절약법 |
|--------|------|--------|
| **RDS** | 켜져 있는 내내 과금(EC2보다 비쌀 수 있음) | 안 쓰면 **중지** |
| **EC2** | 인스턴스 시간 | 안 쓰면 **중지** |
| **S3** | 저장 용량(소액) | 테스트 객체 삭제 |
| **NAT Gateway** | (Lambda를 VPC에 넣을 때) 비쌈 | 퍼블릭 호출 방식이면 불필요 |
| Lambda/SNS/CloudWatch | 호출량 기반 소액 | 보통 무시 가능 |

> 🎓 **AWS Academy 주의** (가이드 296행): 세션이 끝나도 **RDS는 자동으로 멈추지 않습니다.** 직접 중지하세요. 단 중지해도 7일 뒤 자동 재시작되니, 오래 안 쓸 거면 **삭제**가 안전합니다.

### 삭제 순서 (만든 역순)

다 학습했으면 비용이 큰 것부터 정리합니다:

1. EventBridge 규칙 비활성화/삭제
2. Lambda 함수 삭제
3. RDS 인스턴스 삭제 (최종 스냅샷 생략 가능)
4. S3 버킷 비우기 → 삭제
5. SNS 토픽/구독 삭제
6. Secrets Manager 시크릿 삭제 (즉시 삭제 옵션)
7. CloudWatch 로그 그룹/경보 삭제
8. (필요 시) EC2 중지 또는 종료

---

## 참고

- 단일 EC2 배포·접속·systemd 설정 등 기본 절차는 [README.md](../README.md)의 "AWS 배포" 섹션을 참고하세요. 이 문서는 그 위에 서비스를 분산하는 단계만 다룹니다.
- 사용 가능한 AWS 서비스와 제약은 [docs/AWS_Academy_Guide.md](AWS_Academy_Guide.md)를 기준으로 합니다. 이 가이드에서 사용한 S3·RDS·Secrets Manager·SNS·Lambda·CloudWatch·EventBridge는 모두 허용 목록에 포함됩니다.
