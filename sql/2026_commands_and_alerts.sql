-- EventHorizon: 원격 명령 큐 + 2단계 알림 + 기기 런타임 상태
-- MariaDB eventhorizon

CREATE TABLE IF NOT EXISTS device_commands (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  device_id VARCHAR(64) NOT NULL,
  command VARCHAR(64) NOT NULL,
  payload JSON NULL,
  status ENUM('pending','delivered','acked','failed') NOT NULL DEFAULT 'pending',
  requested_by VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  delivered_at TIMESTAMP NULL DEFAULT NULL,
  acked_at TIMESTAMP NULL DEFAULT NULL,
  KEY idx_dc_device_status (device_id, status, id),
  KEY idx_dc_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS device_runtime (
  device_id VARCHAR(64) NOT NULL PRIMARY KEY,
  blackbox_locked TINYINT(1) NOT NULL DEFAULT 0,
  hold_active TINYINT(1) NOT NULL DEFAULT 0,
  operation_mode VARCHAR(32) NULL,
  tilt_threshold_deg DOUBLE NULL,
  last_seen_at TIMESTAMP NULL DEFAULT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS threshold_incidents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  device_id VARCHAR(64) NOT NULL,
  site_id INT UNSIGNED NULL,
  company_id VARCHAR(64) NULL,
  alert_type VARCHAR(32) NOT NULL DEFAULT 'accel',
  first_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  exceed_upload_count INT UNSIGNED NOT NULL DEFAULT 1,
  last_value DOUBLE NULL,
  threshold_value DOUBLE NULL,
  phase1_sent TINYINT(1) NOT NULL DEFAULT 0,
  phase2_sent TINYINT(1) NOT NULL DEFAULT 0,
  closed TINYINT(1) NOT NULL DEFAULT 0,
  closed_at TIMESTAMP NULL DEFAULT NULL,
  KEY idx_ti_open (device_id, closed, alert_type),
  KEY idx_ti_site (site_id, closed)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS web_alerts (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  device_id VARCHAR(64) NOT NULL,
  site_id INT UNSIGNED NULL,
  company_id VARCHAR(64) NULL,
  type VARCHAR(32) NOT NULL,
  severity VARCHAR(16) NOT NULL DEFAULT 'warning',
  message VARCHAR(255) NOT NULL,
  value DOUBLE NULL,
  threshold_value DOUBLE NULL,
  phase TINYINT UNSIGNED NOT NULL DEFAULT 1,
  audience ENUM('site_manager','employee','company','admin','all') NOT NULL DEFAULT 'all',
  incident_id BIGINT UNSIGNED NULL,
  acknowledged TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_wa_created (created_at),
  KEY idx_wa_audience (audience, acknowledged, created_at),
  KEY idx_wa_site (site_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS web_alert_reads (
  alert_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  read_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (alert_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
