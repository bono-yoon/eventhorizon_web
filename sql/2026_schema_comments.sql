-- EventHorizon 핵심 스키마 설명 보강
-- 데이터/제약조건은 변경하지 않고 테이블 및 중요 컬럼 COMMENT만 추가한다.

ALTER TABLE companies
  COMMENT = '건설사 마스터',
  MODIFY COLUMN id VARCHAR(64) NOT NULL COMMENT '웹 전역 건설사 ID (예: co_hanbit)',
  MODIFY COLUMN code VARCHAR(64) NOT NULL COMMENT '건설사 식별용 고유 코드';

ALTER TABLE sites
  COMMENT = '건설 현장 마스터',
  MODIFY COLUMN company_id VARCHAR(64) NULL COMMENT '소속 건설사 ID (companies.id)',
  MODIFY COLUMN name VARCHAR(200) NOT NULL COMMENT '현장명',
  MODIFY COLUMN status VARCHAR(32) NOT NULL DEFAULT 'active'
    COMMENT '현장 운영 상태: active|paused|closed';

ALTER TABLE sensors
  COMMENT = '센서 재고 및 현장 배정 마스터',
  MODIFY COLUMN device_id VARCHAR(64) NOT NULL COMMENT 'APK가 생성·전송하는 장비 고유 ID',
  MODIFY COLUMN label VARCHAR(100) NULL COMMENT '관리 화면에 표시할 센서명 또는 설치 위치',
  MODIFY COLUMN site_id INT UNSIGNED NULL COMMENT '배정 현장 ID; 미배정 재고는 NULL',
  MODIFY COLUMN status VARCHAR(32) NOT NULL DEFAULT 'inventory'
    COMMENT '재고 상태: inventory|assigned|recovered|repair|disposed',
  MODIFY COLUMN memo VARCHAR(500) NULL COMMENT '회수·수리·폐기 사유 등 관리자 비고',
  MODIFY COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1
    COMMENT '센서 레코드 활성 여부: 1=활성, 0=비활성',
  MODIFY COLUMN installed_at DATETIME NULL COMMENT '현재 또는 최초 현장 배정 시각';

ALTER TABLE site_sensor_mapping
  COMMENT = '현장과 센서의 레거시 배정 매핑',
  MODIFY COLUMN site_id INT UNSIGNED NOT NULL COMMENT '배정 현장 ID (sites.id)',
  MODIFY COLUMN device_id VARCHAR(64) NOT NULL COMMENT '배정 센서 장비 ID',
  MODIFY COLUMN label VARCHAR(100) NULL COMMENT '현장 내 설치 위치 라벨',
  MODIFY COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1
    COMMENT '현재 매핑 사용 여부: 1=사용, 0=해제';

ALTER TABLE sensor_logs
  COMMENT = '센서가 업로드한 측정 로그',
  MODIFY COLUMN device_id VARCHAR(64) NOT NULL COMMENT '측정값을 전송한 장비 ID',
  MODIFY COLUMN x DOUBLE NOT NULL COMMENT '가속도계 X축 측정값',
  MODIFY COLUMN y DOUBLE NOT NULL COMMENT '가속도계 Y축 측정값',
  MODIFY COLUMN z DOUBLE NOT NULL COMMENT '가속도계 Z축 측정값',
  MODIFY COLUMN lat DOUBLE NOT NULL COMMENT '측정 당시 위도',
  MODIFY COLUMN lon DOUBLE NOT NULL COMMENT '측정 당시 경도',
  MODIFY COLUMN ts BIGINT NOT NULL COMMENT '디바이스 측정 시각 (Unix epoch ms)',
  MODIFY COLUMN mode VARCHAR(32) NOT NULL
    COMMENT '측정 운영 모드: ULTRA_SAVER|ALWAYS_ON|admin|hold',
  MODIFY COLUMN mode_interval_sec INT NOT NULL COMMENT '측정 또는 업로드 기준 주기(초)',
  MODIFY COLUMN battery_percent INT NOT NULL COMMENT '측정 당시 배터리 잔량(%)',
  MODIFY COLUMN temperature_c DOUBLE NULL COMMENT '측정 당시 배터리 온도(섭씨)',
  MODIFY COLUMN hold TINYINT(1) NULL COMMENT 'Hold 상태: 1=중지, NULL/0=가동';

ALTER TABLE sensor_login_logs
  COMMENT = '센서 잠금해제 및 작업자 인증 기록',
  MODIFY COLUMN device_id VARCHAR(64) NOT NULL COMMENT '잠금해제를 시도한 장비 ID',
  MODIFY COLUMN worker_id INT UNSIGNED NULL COMMENT '인증된 작업자 ID (workers.id)',
  MODIFY COLUMN worker_code VARCHAR(32) NOT NULL COMMENT '사용자가 입력한 잠금해제 코드',
  MODIFY COLUMN worker_name VARCHAR(100) NULL COMMENT '인증 당시 작업자명 스냅샷',
  MODIFY COLUMN success TINYINT(1) NOT NULL DEFAULT 1
    COMMENT '인증 성공 여부: 1=성공, 0=실패',
  MODIFY COLUMN client_ts BIGINT NULL COMMENT '디바이스 인증 시각 (Unix epoch ms)';

ALTER TABLE workers
  COMMENT = '센서 잠금해제 권한이 있는 현장 작업자',
  MODIFY COLUMN id INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '작업자 내부 ID',
  MODIFY COLUMN code VARCHAR(32) NOT NULL COMMENT '센서 잠금해제 코드(PIN)',
  MODIFY COLUMN name VARCHAR(100) NOT NULL COMMENT '작업자명',
  MODIFY COLUMN role TINYINT NOT NULL DEFAULT 0 COMMENT '작업자 역할 코드; 현재 0으로 통일';

ALTER TABLE device_hold
  COMMENT = '기존 Hold 폴링과 호환되는 장비 중지 상태',
  MODIFY COLUMN device_id VARCHAR(64) NOT NULL COMMENT '장비 고유 ID',
  MODIFY COLUMN hold_active TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '현재 Hold 상태: 1=센서 중지, 0=가동',
  MODIFY COLUMN release_requested TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '다음 hold_poll에서 해제할지 여부: 1=해제 대기';

ALTER TABLE device_commands
  COMMENT = '웹에서 앱으로 전달하는 원격 제어 명령 큐',
  MODIFY COLUMN device_id VARCHAR(64) NOT NULL COMMENT '명령 대상 장비 ID',
  MODIFY COLUMN command VARCHAR(64) NOT NULL
    COMMENT '명령 종류: hold_on|hold_off|set_mode|set_interval|set_tilt_threshold|reset_origin',
  MODIFY COLUMN payload JSON NULL COMMENT '명령별 설정값 JSON',
  MODIFY COLUMN status ENUM('pending','delivered','acked','failed') NOT NULL DEFAULT 'pending'
    COMMENT '명령 처리 상태: 대기|전달|적용확인|실패',
  MODIFY COLUMN requested_by VARCHAR(64) NULL COMMENT '명령을 요청한 웹 사용자 ID',
  MODIFY COLUMN delivered_at TIMESTAMP NULL DEFAULT NULL COMMENT '앱에 명령을 전달한 시각',
  MODIFY COLUMN acked_at TIMESTAMP NULL DEFAULT NULL COMMENT '앱이 적용 결과를 확인한 시각';

ALTER TABLE device_runtime
  COMMENT = '앱이 보고한 장비의 최신 런타임 상태',
  MODIFY COLUMN device_id VARCHAR(64) NOT NULL COMMENT '장비 고유 ID',
  MODIFY COLUMN blackbox_locked TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '블랙박스 잠금 여부: 1=잠금',
  MODIFY COLUMN hold_active TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '센서 중지(Hold) 여부: 1=중지',
  MODIFY COLUMN operation_mode VARCHAR(32) NULL
    COMMENT '현재 운영 모드: ALWAYS_ON|ULTRA_SAVER',
  MODIFY COLUMN tilt_threshold_deg DOUBLE NULL COMMENT '현재 앱 임계각 설정(도)',
  MODIFY COLUMN last_seen_at TIMESTAMP NULL DEFAULT NULL COMMENT '앱의 마지막 통신 시각';

ALTER TABLE threshold_incidents
  COMMENT = '임계값 초과의 지속 여부와 2단계 알림 상태',
  MODIFY COLUMN device_id VARCHAR(64) NOT NULL COMMENT '이벤트 발생 장비 ID',
  MODIFY COLUMN site_id INT UNSIGNED NULL COMMENT '이벤트 당시 배정 현장 ID',
  MODIFY COLUMN company_id VARCHAR(64) NULL COMMENT '이벤트 당시 소속 건설사 ID',
  MODIFY COLUMN alert_type VARCHAR(32) NOT NULL DEFAULT 'accel'
    COMMENT '임계 이벤트 종류: accel|temp|battery 등',
  MODIFY COLUMN first_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    COMMENT '현재 이벤트의 최초 초과 시각',
  MODIFY COLUMN last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    COMMENT '현재 이벤트의 최근 초과 확인 시각',
  MODIFY COLUMN exceed_upload_count INT UNSIGNED NOT NULL DEFAULT 1
    COMMENT '이벤트 시작 후 임계 초과 업로드 사이클 수',
  MODIFY COLUMN last_value DOUBLE NULL COMMENT '최근 초과 측정값',
  MODIFY COLUMN threshold_value DOUBLE NULL COMMENT '판정에 사용한 임계값',
  MODIFY COLUMN phase1_sent TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '현장소장·직원 즉시 알림 발송 여부',
  MODIFY COLUMN phase2_sent TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '건설사·관리자 에스컬레이션 발송 여부',
  MODIFY COLUMN closed TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '이벤트 종료 여부: 1=정상 복귀로 종료',
  MODIFY COLUMN closed_at TIMESTAMP NULL DEFAULT NULL COMMENT '이벤트 종료 시각';

ALTER TABLE web_alerts
  COMMENT = '역할별 웹 알림과 에스컬레이션 기록',
  MODIFY COLUMN device_id VARCHAR(64) NOT NULL COMMENT '알림 발생 장비 ID',
  MODIFY COLUMN site_id INT UNSIGNED NULL COMMENT '알림 발생 현장 ID',
  MODIFY COLUMN company_id VARCHAR(64) NULL COMMENT '알림 발생 건설사 ID',
  MODIFY COLUMN type VARCHAR(32) NOT NULL COMMENT '알림 종류: accel|temp|battery|blackbox 등',
  MODIFY COLUMN severity VARCHAR(16) NOT NULL DEFAULT 'warning'
    COMMENT '심각도: warning|critical',
  MODIFY COLUMN value DOUBLE NULL COMMENT '알림 발생 측정값',
  MODIFY COLUMN threshold_value DOUBLE NULL COMMENT '알림 발생 기준 임계값',
  MODIFY COLUMN phase TINYINT UNSIGNED NOT NULL DEFAULT 1
    COMMENT '알림 단계: 1=즉시, 2=3사이클 또는 30분 후 에스컬레이션',
  MODIFY COLUMN audience ENUM('site_manager','employee','company','admin','all')
    NOT NULL DEFAULT 'all' COMMENT '알림 수신 역할',
  MODIFY COLUMN incident_id BIGINT UNSIGNED NULL
    COMMENT '연결된 임계 이벤트 ID (threshold_incidents.id)',
  MODIFY COLUMN acknowledged TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '알림 확인 처리 여부: 1=확인';

ALTER TABLE web_alert_reads
  COMMENT = '웹 사용자별 알림 읽음 기록',
  MODIFY COLUMN alert_id VARCHAR(64) NOT NULL COMMENT '읽은 알림 ID (web_alerts.id)',
  MODIFY COLUMN user_id VARCHAR(64) NOT NULL COMMENT '알림을 읽은 사용자 ID',
  MODIFY COLUMN read_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '읽음 처리 시각';

ALTER TABLE web_users
  COMMENT = '웹 로그인 계정과 전역 역할',
  MODIFY COLUMN id VARCHAR(64) NOT NULL COMMENT '웹 사용자 고유 ID',
  MODIFY COLUMN email VARCHAR(190) NOT NULL COMMENT '로그인 이메일',
  MODIFY COLUMN password_hash VARCHAR(255) NOT NULL COMMENT 'bcrypt 비밀번호 해시; 평문 저장 금지',
  MODIFY COLUMN role ENUM('admin','company','site_manager','employee') NOT NULL
    COMMENT '전역 역할: 관리자|건설사|현장소장|직원',
  MODIFY COLUMN company_id VARCHAR(64) NULL COMMENT '소속 건설사 ID; 관리자는 NULL 가능',
  MODIFY COLUMN org_node_id VARCHAR(64) NULL COMMENT '소속 조직도 노드 ID',
  MODIFY COLUMN active TINYINT(1) NOT NULL DEFAULT 1
    COMMENT '계정 활성 여부: 1=로그인 가능, 0=비활성';

ALTER TABLE web_user_sites
  COMMENT = '웹 사용자에게 허용된 현장 목록',
  MODIFY COLUMN user_id VARCHAR(64) NOT NULL COMMENT '웹 사용자 ID',
  MODIFY COLUMN site_id INT UNSIGNED NOT NULL COMMENT '접근 허용 현장 ID';

ALTER TABLE web_user_permissions
  COMMENT = '웹 사용자에게 개별 부여된 세부 권한',
  MODIFY COLUMN user_id VARCHAR(64) NOT NULL COMMENT '웹 사용자 ID',
  MODIFY COLUMN permission VARCHAR(64) NOT NULL
    COMMENT '권한 키 (예: view_sensors, control_sensor_run)';
