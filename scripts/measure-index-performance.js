const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    database: 'waybill_admin',
  });

  const reportSql = "SELECT report_date, shipper_id, carrier_id, waybill_count, revenue_amount, gross_profit_amount FROM waybill_report_daily WHERE report_date BETWEEN '2026-07-01' AND '2026-07-31' ORDER BY report_date DESC LIMIT 31";
  const pageSql = "SELECT waybill_no, shipper_id, carrier_id, status, total_amount, created_at FROM waybill_202607_0 WHERE created_at <= '2026-12-31 23:59:59' ORDER BY created_at DESC, id DESC LIMIT 50";

  const t1 = process.hrtime.bigint();
  const [reportRows] = await conn.query(reportSql);
  const reportMs = Number(process.hrtime.bigint() - t1) / 1e6;

  const t2 = process.hrtime.bigint();
  const [pageRows] = await conn.query(pageSql);
  const pageMs = Number(process.hrtime.bigint() - t2) / 1e6;

  console.log(JSON.stringify({
    reportRows: reportRows.length,
    reportMs: Number(reportMs.toFixed(3)),
    paginationRows: pageRows.length,
    paginationMs: Number(pageMs.toFixed(3)),
  }, null, 2));

  await conn.end();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
