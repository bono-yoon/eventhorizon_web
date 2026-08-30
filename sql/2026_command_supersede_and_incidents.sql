-- EventHorizon: 명령 대체 + 이벤트 확인/분류
-- MariaDB eventhorizon

ALTER TABLE device_commands
  MODIFY COLUMN status ENUM('pending','delivered','acked','failed','superseded')
    NOT NULL DEFAULT 'pending'
    COMMENT 'pending=대기, delivered=센서 수신, acked=적용완료, failed=실패, superseded=새 요청으로 대체됨';

ALTER TABLE threshold_incidents
  ADD COLUMN IF NOT EXISTS lifecycle_status VARCHAR(32) NOT NULL DEFAULT 'open'
    COMMENT 'open|site_notified|site_acked|escalated|hq_acked|resolved'
    AFTER phase2_sent,
  ADD COLUMN IF NOT EXISTS site_acked_at TIMESTAMP NULL DEFAULT NULL
    COMMENT '현장 확인 시각'
    AFTER lifecycle_status,
  ADD COLUMN IF NOT EXISTS site_acked_by VARCHAR(64) NULL
    COMMENT '현장 확인자 web_users.id'
    AFTER site_acked_at,
  ADD COLUMN IF NOT EXISTS site_disposition VARCHAR(32) NULL
    COMMENT 'confirmed_real|false_positive|misoperation|maintenance|other'
    AFTER site_acked_by,
  ADD COLUMN IF NOT EXISTS site_ack_reason VARCHAR(500) NULL
    COMMENT '현장 확인 사유'
    AFTER site_disposition,
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMP NULL DEFAULT NULL
    COMMENT '본사 상향 시각'
    AFTER site_ack_reason,
  ADD COLUMN IF NOT EXISTS last_counted_reading_ts BIGINT NULL
    COMMENT '업로드 카운트에 반영한 마지막 reading.ts'
    AFTER escalated_at;

CREATE TABLE IF NOT EXISTS incident_acknowledgements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  incident_id BIGINT UNSIGNED NOT NULL,
  actor_user_id VARCHAR(64) NOT NULL,
  actor_role VARCHAR(32) NOT NULL,
  action VARCHAR(32) NOT NULL DEFAULT 'ack'
    COMMENT 'ack|note',
  disposition VARCHAR(32) NOT NULL
    COMMENT 'confirmed_real|false_positive|misoperation|maintenance|other',
  reason_text VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ia_incident (incident_id, created_at),
  KEY idx_ia_actor (actor_user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
