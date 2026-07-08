USE waybill_admin;

SET @schema_name = DATABASE();

SET @add_waybill_operation_unique = IF(
  (
    SELECT COUNT(*)
    FROM information_schema.statistics
    WHERE table_schema = @schema_name
      AND table_name = 'waybill_operation_log'
      AND index_name = 'uk_waybill_operation'
  ) = 0,
  'ALTER TABLE waybill_operation_log ADD UNIQUE KEY uk_waybill_operation (waybill_no, operation_type)',
  'SELECT ''uk_waybill_operation already exists'' AS message'
);

PREPARE stmt_waybill_operation FROM @add_waybill_operation_unique;
EXECUTE stmt_waybill_operation;
DEALLOCATE PREPARE stmt_waybill_operation;

SET @add_idempotency_key_unique = IF(
  (
    SELECT COUNT(*)
    FROM information_schema.statistics
    WHERE table_schema = @schema_name
      AND table_name = 'waybill_operation_log'
      AND index_name = 'uk_waybill_idempotency_key'
  ) = 0,
  'ALTER TABLE waybill_operation_log ADD UNIQUE KEY uk_waybill_idempotency_key (idempotency_key)',
  'SELECT ''uk_waybill_idempotency_key already exists'' AS message'
);

PREPARE stmt_idempotency_key FROM @add_idempotency_key_unique;
EXECUTE stmt_idempotency_key;
DEALLOCATE PREPARE stmt_idempotency_key;
