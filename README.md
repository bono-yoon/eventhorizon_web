# EventHorizon Web

건설 현장 **EventHorizon 센서** 관제 웹입니다.

모바일 앱 데이터 취득 → MariaDB 적재 → 웹 표출 + 임계값 알림

## 역할

| 역할 | 설명 |
|------|------|
| **admin** | 센서 위치 추적, 사용 로그, 현장/유저 전체 관리 |
| **건설사 (company)** | 전체 현장 지도 대시보드, 현장 개설, 조직도·권한 관리 |
| **현장소장 (site_manager)** | 소속 현장 대시보드/관리, 건설사 페이지 열람 가능(소속 외 현장 진입 차단) |
| **직원 (employee)** | 권한에 따라 건설사/현장 페이지 이동, 센서·업무 기능 |
| **본사 현장작업자 (field_worker)** | 서비스 본사(EventHorizon) 소속. 센서 최초 설치·현장 배송·현장 안내·현장 점검. 건설사 소속 아님. 현장 일시중지/종료 불가 |

## 실행

`.env.local` 에 `JWT_SECRET`, `DB_*` 를 채운 뒤:

```powershell
cd D:\projects\eventhorizon_web
npm install
npm run seed:users
npm run dev
```

브라우저: http://localhost:3000

최초 관리자는 코드에 박혀 있지 않습니다. `.env.local` 의 `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` 로 `npm run seed:users` 한 번만 실행하세요.

## 데이터

소스 오브 트루스는 **MariaDB `eventhorizon`** 입니다. `data/store.json` 은 더 이상 사용하지 않습니다.

- 현장 / 센서 / sensor_logs / 로그인 로그 / 웹 사용자 / 알림 / 조직도 / 사용 로그 / 센서 운영상태
- 현장은 `sites.company_id` 로 건설사에 매핑됩니다. ingest 가 한빛으로 고정하지 않습니다.

```powershell
curl http://localhost:3000/api/health
```

MQTT 알림(선택): `MQTT_ENABLED=true`

## AWS 배포 (EC2 + RDS)

이 웹은 **프론트와 API가 한 Next.js 프로세스**입니다. 별도 백엔드 서버를 나누지 않습니다. EC2에 앱 1개, RDS에 MariaDB 1개면 됩니다.

```
브라우저 / 센서 앱
        │
        ▼
  EC2 (Nginx :443 → Next.js :3000)
        │
        ▼
  RDS MariaDB :3306  (보안그룹: EC2만 허용)
```

### 1. RDS

- 엔진: MariaDB, EC2와 **같은 VPC**
- 보안그룹: `3306` 은 **EC2 보안그룹만** 허용 (인터넷 공개 금지)
- 앱 `.env` : `DB_ENABLED=true`, `DB_HOST`(RDS 엔드포인트), `DB_USER`, `DB_PASSWORD`, `DB_NAME`, **`DB_SSL=true`**

스키마는 이미 MariaDB에 있습니다. 최초 관리자만 만들면 됩니다.

```bash
npm run seed:users
```

`.env.local` 없이도 `DB_*` / `BOOTSTRAP_ADMIN_*` 환경변수만 있으면 됩니다.

### 2. EC2

Amazon Linux 2023 기준. Node 20 설치 후 이 저장소를 clone 합니다.

```bash
git clone git@github.com:bono-yoon/eventhorizon_web.git
cd eventhorizon_web
cp .env.example .env.production   # JWT_SECRET, DB_*, 카카오 키 채우기
npm ci
NEXT_PUBLIC_KAKAO_MAP_JS_KEY=카카오_JS_키 npm run build
```

`NEXT_PUBLIC_*` 는 **빌드할 때** 들어갑니다. 나중에 `.env`만 바꿔서는 카카오맵 키가 반영되지 않습니다.

프로세스 기동은 systemd 예시(`deploy/eventhorizon-web.service`), HTTPS는 Nginx 예시(`deploy/nginx.conf.example`)를 쓰면 됩니다. 헬스체크: `GET /api/health` (DB가 내려가면 503).

보안그룹: EC2는 `22`(관리), `80`/`443`(웹). RDS는 `3306`을 EC2에서만.

### 3. Docker를 쓰고 싶을 때

EC2에 Docker를 올려도 됩니다. 앱은 여전히 컨테이너 1개입니다.

```bash
docker compose up --build -d
```

카카오맵 키는 이미지 빌드 ARG 로 넣습니다.

## 지도

카카오맵(좌표 핀 표시만).

```env
NEXT_PUBLIC_KAKAO_MAP_JS_KEY=카카오_JavaScript_키
```

Kakao Developers > 앱 > 플랫폼 > Web에 사용할 도메인을 등록해야 합니다.

## 인코딩 (UTF-8)

UI 문자열은 **UTF-8** 이어야 합니다. Windows PowerShell `Set-Content` / `Out-File` 은 기본 인코딩이 CP949인 경우가 많아 한글이 `??` 로 깨집니다.

- 소스 편집·저장: UTF-8 (`.editorconfig` / `.gitattributes` 참고)
- 스크립트로 파일 쓸 때: `fs.writeFileSync(path, content, "utf8")` (Node)
- 커밋·빌드 전 자동 검사: `npm run check:encoding` (`lint` / `build`에 포함)

선택 — git 커밋 훅 활성화:

```bash
git config core.hooksPath .githooks
```

- `/admin` — 시스템 관제
- `/company/[companyId]` — 건설사 대시보드
- `/company/[companyId]/org` — 조직도
- `/company/[companyId]/permissions` — 직원 권한 일괄 관리
- `/site/[siteId]` — 현장 대시보드
