-- EventHorizon Web 확장 스키마 (선택)
-- 기존 eventhorizon DB에 웹 관제용 테이블이 필요할 때 참고용입니다.
-- 현재 웹 앱은 data/store.json 을 기본으로 사용합니다.

CREATE TABLE IF NOT EXISTS web_users (
  id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  role ENUM('admin','company','site_manager','employee') NOT NULL,
  company_id VARCHAR(64) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS web_user_sites (
  user_id VARCHAR(64) NOT NULL,
  site_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (user_id, site_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS web_user_permissions (
  user_id VARCHAR(64) NOT NULL,
  permission VARCHAR(64) NOT NULL,
  PRIMARY KEY (user_id, permission)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS web_alerts (
  id VARCHAR(64) PRIMARY KEY,
  device_id VARCHAR(64) NOT NULL,
  site_id INT UNSIGNED NOT NULL,
  company_id VARCHAR(64) NOT NULL,
  type VARCHAR(32) NOT NULL,
  severity VARCHAR(16) NOT NULL,
  message VARCHAR(255) NOT NULL,
  value DOUBLE NOT NULL,
  threshold_value DOUBLE NOT NULL,
  acknowledged TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_alerts_site (site_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
