USE waybill_admin;

INSERT INTO auth_user (id, email, name, role, password_hash, google_sub, picture_url)
VALUES (
  'user-admin-1806909748',
  '1806909748@qq.com',
  '1806909748@qq.com',
  'ADMIN',
  'scrypt$efceb6020aaf7fa06d97b5c3748deffa$43a5bc0f57906685c4ca53ebb9420b7c0b5f359c8bacaba7e7f11f4c1b5e3db7',
  NULL,
  NULL
)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  role = VALUES(role),
  password_hash = VALUES(password_hash);