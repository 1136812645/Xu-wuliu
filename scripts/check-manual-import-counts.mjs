import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: '127.0.0.1',
  port: 13306,
  user: 'root',
  password: 'root',
  database: 'waybill_admin',
});

const sql = `
SELECT
  (SELECT COUNT(*) FROM waybill_operation_log WHERE idempotency_key LIKE 'manual-import-idem-%') AS imported_idem_count,
  (SELECT COUNT(*) FROM waybill_fee_detail WHERE waybill_no IN (
      SELECT waybill_no FROM waybill_202607_0 WHERE goods_name LIKE 'manual-import-%'
      UNION ALL SELECT waybill_no FROM waybill_202607_1 WHERE goods_name LIKE 'manual-import-%'
      UNION ALL SELECT waybill_no FROM waybill_202607_2 WHERE goods_name LIKE 'manual-import-%'
      UNION ALL SELECT waybill_no FROM waybill_202607_3 WHERE goods_name LIKE 'manual-import-%'
  )) AS imported_fee_count,
  (SELECT COUNT(*) FROM (
      SELECT waybill_no FROM waybill_202607_0 WHERE goods_name LIKE 'manual-import-%'
      UNION ALL SELECT waybill_no FROM waybill_202607_1 WHERE goods_name LIKE 'manual-import-%'
      UNION ALL SELECT waybill_no FROM waybill_202607_2 WHERE goods_name LIKE 'manual-import-%'
      UNION ALL SELECT waybill_no FROM waybill_202607_3 WHERE goods_name LIKE 'manual-import-%'
  ) t) AS imported_waybill_count
`;

const [rows] = await conn.query(sql);
console.log(JSON.stringify(rows[0], null, 2));
await conn.end();
