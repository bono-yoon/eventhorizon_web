# EventHorizon Web

건설 현장 **EventHorizon 센서** 관제 웹입니다.

모바일 앱 데이터 취득 → DB 적재 → 웹 표출 + 임계값 알림(MQTT)

## 역할

| 역할 | 설명 |
|------|------|
| **admin** | 센서 위치 추적, 사용 로그, 현장/유저 전체 관리 |
| **건설사 (company)** | 전체 현장 지도 대시보드, 현장 개설, 조직도·권한 관리 |
| **현장소장 (site_manager)** | 소속 현장 대시보드/관리, 건설사 페이지 열람 가능(소속 외 현장 진입 차단) |
| **직원 (employee)** | 권한에 따라 건설사/현장 페이지 이동, 센서·업무 기능 |

대시보드는 건설사/현장 **동일 컴포넌트**를 재사용합니다.

## 실행

```powershell
cd D:\projects\eventhorizon_web
npm install
npm run dev
```

브라우저: http://localhost:3000

## 데모 계정

| 계정 | 이메일 | 비밀번호 |
|------|--------|----------|
| 관리자 | admin@eventhorizon.local | admin123 |
| 건설사 | company@hanbit.local | company123 |
| 현장소장 | manager@hanbit.local | manager123 |
| 직원 | employee@hanbit.local | employee123 |

## 데이터

- **현장 / 센서 / sensor_logs / 로그인 로그**: MariaDB `eventhorizon` ingest DB (모바일 앱 적재본)
- **사용자·조직·권한·웹 알림**: `data/store.json`
- `.env.local`에서 ingest 서버와 동일한 DB 계정 사용 (`dba` / `dbapwd`)

```powershell
# 연결 확인
curl http://localhost:3000/api/health
```

MQTT 알림(선택): `MQTT_ENABLED=true`

## 지도

카카오맵(좌표 핀 표시만). calbridge와 동일한 SDK 로딩 패턴을 사용합니다.

```env
NEXT_PUBLIC_KAKAO_MAP_JS_KEY=카카오_JavaScript_키
```

Kakao Developers > 앱 > 플랫폼 > Web에 `http://localhost:3000` 을 등록해야 합니다.

- `/admin` — 시스템 관제
- `/company/[companyId]` — 건설사 대시보드
- `/company/[companyId]/org` — 조직도
- `/company/[companyId]/permissions` — 직원 권한 일괄 관리
- `/site/[siteId]` — 현장 대시보드
- `/site/[siteId]/sensors` — 센서 데이터/상태(설정·배터리·위치)
