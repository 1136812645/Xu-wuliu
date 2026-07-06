param(
  [string]$HostName = "127.0.0.1",
  [int]$Port = 3306,
  [string]$User = "root",
  [string]$Password = "root",
  [string]$Database = "waybill_admin"
)

$ErrorActionPreference = "Stop"

function Invoke-MySql {
  param([string]$Sql)
  node -e @"
const mysql = require('mysql2/promise');
(async () => {
  const conn = await mysql.createConnection({
    host: '${HostName}',
    port: ${Port},
    user: '${User}',
    password: '${Password}',
    database: '${Database}',
    multipleStatements: true,
  });
  const [rows] = await conn.query(${([System.Management.Automation.Language.CodeGeneration]::EscapeSingleQuotedStringContent("'" + $Sql + "'"))});
  console.log(JSON.stringify(rows, null, 2));
  await conn.end();
})();
"@
}

Write-Host "[1/5] Check MySQL connectivity..."
Test-NetConnection -ComputerName $HostName -Port $Port | Select-Object ComputerName,RemotePort,TcpTestSucceeded | Format-List

Write-Host "[2/5] Enable slow query log (threshold 1s)..."
Invoke-MySql @"
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 1;
SHOW VARIABLES LIKE 'slow_query_log';
SHOW VARIABLES LIKE 'long_query_time';
"@

Write-Host "[3/5] Run EXPLAIN validation SQL..."
$sql = Get-Content -Path "db/init/05_slow_query_validation.sql" -Raw
Invoke-MySql $sql

Write-Host "[4/5] Count shard table rows..."
Invoke-MySql @"
SELECT
  (SELECT COUNT(1) FROM waybill_202607_0) AS c0,
  (SELECT COUNT(1) FROM waybill_202607_1) AS c1,
  (SELECT COUNT(1) FROM waybill_202607_2) AS c2,
  (SELECT COUNT(1) FROM waybill_202607_3) AS c3;
"@

Write-Host "[5/5] Run pagination timing check (LIMIT 50)..."
Invoke-MySql @"
EXPLAIN ANALYZE
SELECT waybill_no, shipper_id, carrier_id, status, total_amount, created_at
FROM waybill_202607_0
WHERE created_at <= '2026-12-31 23:59:59'
ORDER BY created_at DESC, id DESC
LIMIT 50;
"@

Write-Host "Done. Review slow log entries and EXPLAIN ANALYZE output to verify the 5-second target."
