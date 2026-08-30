-- EventHorizon: 센서 재고 + 웹 사용자
-- 실행: mysql -u dba -p eventhorizon < sql/2026_inventory_and_users.sql

CREATE TABLE IF NOT EXISTS companies (
  id VARCHAR(64) NOT NULL,
  name VARCHAR(200) NOT NULL,
  code VARCHAR(64) NOT NULL,
  address VARCHAR(500) NULL,
  lat DOUBLE NULL,
  lon DOUBLE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_companies_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO companies (id, name, code, address, lat, lon)
SELECT 'co_hanbit', '한빛건설', 'HANBIT', '서울특별시 강남구 테헤란로 152', 37.5012, 127.0396
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM companies WHERE id = 'co_hanbit');

-- sites 에 건설사 연결
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sites'
    AND COLUMN_NAME = 'company_id'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE sites ADD COLUMN company_id VARCHAR(64) NULL AFTER id, ADD KEY idx_sites_company (company_id)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE sites SET company_id = 'co_hanbit' WHERE company_id IS NULL;

-- 센서 마스터 (재고/배정/회수/수리/폐기)
CREATE TABLE IF NOT EXISTS sensors (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  device_id VARCHAR(64) NOT NULL,
  label VARCHAR(100) NULL,
  site_id INT UNSIGNED NULL COMMENT '배정 현장, 재고면 NULL',
  status VARCHAR(32) NOT NULL DEFAULT 'inventory'
    COMMENT 'inventory|assigned|recovered|repair|disposed',
  memo VARCHAR(500) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  installed_at DATETIME NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_sensors_device (device_id),
  KEY idx_sensors_site (site_id),
  KEY idx_sensors_status (status),
  CONSTRAINT fk_sensors_site
    FOREIGN KEY (site_id) REFERENCES sites (id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO sensors (device_id, label, site_id, status, is_active, installed_at, created_at)
SELECT m.device_id, m.label, m.site_id, 'assigned', m.is_active, m.installed_at, m.created_at
FROM site_sensor_mapping m
WHERE NOT EXISTS (
  SELECT 1 FROM sensors s WHERE s.device_id = m.device_id
);

-- 웹 사용자
CREATE TABLE IF NOT EXISTS web_users (
  id VARCHAR(64) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  role ENUM('admin','company','site_manager','employee') NOT NULL,
  company_id VARCHAR(64) NULL,
  org_node_id VARCHAR(64) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_web_users_email (email),
  KEY idx_web_users_company (company_id),
  KEY idx_web_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS web_user_sites (
  user_id VARCHAR(64) NOT NULL,
  site_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (user_id, site_id),
  KEY idx_wus_site (site_id),
  CONSTRAINT fk_wus_user FOREIGN KEY (user_id) REFERENCES web_users (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_wus_site FOREIGN KEY (site_id) REFERENCES sites (id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS web_user_permissions (
  user_id VARCHAR(64) NOT NULL,
  permission VARCHAR(64) NOT NULL,
  PRIMARY KEY (user_id, permission),
  CONSTRAINT fk_wup_user FOREIGN KEY (user_id) REFERENCES web_users (id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
