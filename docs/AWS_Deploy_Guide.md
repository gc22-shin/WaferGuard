# AWS 배포 가이드 (EC2 단일 인스턴스)

WaferGuard를 EC2 한 대에 올리는 실전 절차다. 아키텍처 개요는 [README의 "AWS 배포 구조"](../README.md#aws-배포-구조)를 참고한다.

AWS Academy와 일반 AWS 모두 아래 절차로 배포한다.

| 항목 | AWS Academy | 일반 AWS |
|------|-------------|----------|
| 인스턴스 | t2.medium | t3.medium 이상 권장 |
| IAM 프로필 | LabInstanceProfile (사전 생성) | 커스텀 역할 직접 생성 |
| 리전 | us-east-1 / us-west-2 | 제한 없음 |

> **Elastic IP 필수**: EC2 재시작 시 공인 IP가 바뀐다. Elastic IP를 할당해 연결하면 고정 IP를 유지할 수 있다 (실행 중 무료).

## 1. EC2 인스턴스 준비

1. EC2 콘솔 → Launch Instance
   - AMI: **Amazon Linux 2023** (64-bit x86)
   - 스토리지: **20 GB gp3** (기본 8 GB 부족)
   - IAM 인스턴스 프로필: LabInstanceProfile (Academy) / 커스텀 역할 (일반)
   - 퍼블릭 IP 자동 할당: 활성화
2. 보안 그룹 인바운드: SSH 22 (내 IP), TCP **8000** (0.0.0.0/0)
3. EC2 → Elastic IPs → Allocate → 인스턴스에 Associate

## 2. 소프트웨어 설치

```bash
ssh -i ~/.ssh/labsuser.pem ec2-user@<ELASTIC_IP>

sudo dnf update -y
sudo dnf install -y python3.11 python3.11-pip python3.11-devel nodejs npm git
```

## 3. 코드 배포

```bash
git clone https://github.com/<YOUR_REPO>/WaferGuard.git /home/ec2-user/WaferGuard
cd /home/ec2-user/WaferGuard

python3.11 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
```

## 4. 환경 변수 설정

```bash
cat > .env << 'EOF'
LUXIA_API_KEY=<발급받은_키>
EOF
chmod 600 .env
```

> 일반 AWS에서는 키를 `.env` 대신 **Secrets Manager**에 두고 IAM 역할로 fetch하는 방식을 권장한다.

## 5. 프론트엔드 빌드

```bash
cd frontend
npm install && npm run build   # frontend/.env.production 자동 적용 → 상대 URL 빌드
cd ..
```

## 6. 서비스 등록 및 실행

```bash
sudo tee /etc/systemd/system/waferguard.service > /dev/null << 'EOF'
[Unit]
Description=WaferGuard FastAPI
After=network.target
[Service]
User=ec2-user
WorkingDirectory=/home/ec2-user/WaferGuard
EnvironmentFile=/home/ec2-user/WaferGuard/.env
ExecStart=/home/ec2-user/WaferGuard/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1
Restart=on-failure
[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload && sudo systemctl enable --now waferguard
```

`systemctl enable`로 등록해 두면 EC2 재시작 시 서비스가 자동 복구된다.

## 접속 주소

```
Dashboard : http://<ELASTIC_IP>:8000
API docs  : http://<ELASTIC_IP>:8000/docs
Health    : http://<ELASTIC_IP>:8000/health
```

```bash
# 로그 확인
sudo journalctl -u waferguard -f
```

## 관련 문서

- [`AWS_Academy_Guide.md`](AWS_Academy_Guide.md) — AWS Academy 환경 제약 및 배포 상세
- [`AWS_Cloud_Migration_Guide.md`](AWS_Cloud_Migration_Guide.md) — 멀티서비스(S3/RDS/SNS/Secrets) 마이그레이션 상세
- [`AWS_Cost_Management.md`](AWS_Cost_Management.md) — 인스턴스별 비용 및 절감 가이드
- [`AWS_Migration_Report.md`](AWS_Migration_Report.md) — 마이그레이션 결과 리포트
