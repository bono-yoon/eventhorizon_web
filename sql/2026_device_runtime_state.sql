-- EventHorizon: 기기 런타임 상태 확장
-- 앱이 업로드/폴링 때 보고하는 현재 설정을 저장해 웹에서 "마지막 상태"를 보여준다.
-- MariaDB eventhorizon

ALTER TABLE device_runtime
  ADD COLUMN IF NOT EXISTS realtime_interval_sec INT UNSIGNED NULL
    COMMENT '앱이 보고한 상시 모드 기록 주기(초)'
    AFTER tilt_threshold_deg,
  ADD COLUMN IF NOT EXISTS upload_interval_min INT UNSIGNED NULL
    COMMENT '앱이 보고한 초절전 모드 업로드 주기(분)'
    AFTER realtime_interval_sec,
  ADD COLUMN IF NOT EXISTS reported_at TIMESTAMP NULL DEFAULT NULL
    COMMENT '앱이 설정값을 마지막으로 보고한 시각'
    AFTER upload_interval_min;

ALTER TABLE device_runtime
  MODIFY COLUMN blackbox_locked TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '블랙박스 잠금(1=수집·자동삭제 중지)',
  MODIFY COLUMN hold_active TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '센서 중지(Hold) 상태 1=중지',
  MODIFY COLUMN operation_mode VARCHAR(32) NULL
    COMMENT '앱이 보고한 운영 모드(ALWAYS_ON=상시, ULTRA_SAVER=초절전)',
  MODIFY COLUMN tilt_threshold_deg DOUBLE NULL
    COMMENT '앱에 적용된 임계각(도)',
  MODIFY COLUMN last_seen_at TIMESTAMP NULL DEFAULT NULL
    COMMENT '앱이 서버와 마지막으로 통신한 시각';
