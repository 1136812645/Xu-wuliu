import mysql from 'mysql2/promise';

const c = await mysql.createConnection({
  host: '127.0.0.1',
  port: 13306,
  user: 'root',
  password: 'root',
  database: 'waybill_admin',
});

const [totalRows] = await c.query(
  `SELECT
    (SELECT COUNT(*) FROM waybill_202607_0)
    + (SELECT COUNT(*) FROM waybill_202607_1)
    + (SELECT COUNT(*) FROM waybill_202607_2)
    + (SELECT COUNT(*) FROM waybill_202607_3) AS total`,
);

const [idemRows] = await c.query(
  `SELECT COUNT(*) AS count
   FROM waybill_operation_log
   WHERE idempotency_key LIKE 'bulk-import-idem-%'`,
);

console.log(
  JSON.stringify(
    {
      totalWaybills: totalRows[0].total,
      bulkImportIdemCount: idemRows[0].count,
    },
    null,
    2,
  ),
);

await c.end();
