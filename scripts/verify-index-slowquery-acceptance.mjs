import mysql from 'mysql2/promise';

const dbConfig = {
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 13306),
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? 'root',
  database: process.env.DB_NAME ?? 'waybill_admin',
};

const paginationThresholdMs = Number(process.env.PAGINATION_THRESHOLD_MS ?? 5000);

function findAny(predicate, list) {
  return list.some(predicate);
}

function findWaybillShardTables(tableNames) {
  return tableNames.filter((name) => /^waybill_\d{6}_[0-9]+$/.test(name));
}

function normalizeIndexRows(rows) {
  return rows.map((row) => ({
    tableName: String(row.table_name ?? row.TABLE_NAME),
    indexName: String(row.index_name ?? row.INDEX_NAME),
    columnName: String(row.column_name ?? row.COLUMN_NAME),
    seqInIndex: Number(row.seq_in_index ?? row.SEQ_IN_INDEX),
    nonUnique: Number(row.non_unique ?? row.NON_UNIQUE ?? 1),
  }));
}

function getIndexColumnMap(indexRows, tableName) {
  const map = new Map();
  const tableRows = indexRows.filter((row) => row.tableName === tableName);

  for (const row of tableRows) {
    if (!map.has(row.indexName)) {
      map.set(row.indexName, []);
    }
    map.get(row.indexName).push({ seq: row.seqInIndex, column: row.columnName, nonUnique: row.nonUnique });
  }

  for (const [name, cols] of map.entries()) {
    cols.sort((a, b) => a.seq - b.seq);
    map.set(
      name,
      cols.map((item) => item.column),
    );
  }

  return map;
}

function hasIndexStartingWith(indexMap, columns) {
  for (const idxColumns of indexMap.values()) {
    if (idxColumns.length < columns.length) {
      continue;
    }

    let matched = true;
    for (let i = 0; i < columns.length; i += 1) {
      if (idxColumns[i] !== columns[i]) {
        matched = false;
        break;
      }
    }

    if (matched) {
      return true;
    }
  }

  return false;
}

async function main() {
  const conn = await mysql.createConnection(dbConfig);

  try {
    const [indexRowsRaw] = await conn.query(
      `SELECT table_name, index_name, column_name, seq_in_index, non_unique
       FROM information_schema.statistics
       WHERE table_schema = ?
       ORDER BY table_name, index_name, seq_in_index`,
      [dbConfig.database],
    );

    const indexRows = normalizeIndexRows(indexRowsRaw);
    const allTables = [...new Set(indexRows.map((row) => row.tableName))];
    const shardTables = findWaybillShardTables(allTables);

    const defects = [];
    const indexChecks = [];

    if (shardTables.length === 0) {
      defects.push({
        type: 'MISSING_WAYBILL_SHARD_TABLE',
        message: 'No waybill shard table was found by pattern waybill_YYYYMM_N.',
      });
    }

    for (const table of shardTables) {
      const idxMap = getIndexColumnMap(indexRows, table);

      const checks = [
        { code: 'WAYBILL_NO', ok: hasIndexStartingWith(idxMap, ['waybill_no']) },
        { code: 'SHIPPER_CREATED_AT', ok: hasIndexStartingWith(idxMap, ['shipper_id', 'created_at']) },
        { code: 'CARRIER_CREATED_AT', ok: hasIndexStartingWith(idxMap, ['carrier_id', 'created_at']) },
        { code: 'STATUS_CREATED_AT', ok: hasIndexStartingWith(idxMap, ['status', 'created_at']) },
        { code: 'CREATED_AT', ok: hasIndexStartingWith(idxMap, ['created_at']) },
      ];

      for (const check of checks) {
        indexChecks.push({ table, code: check.code, ok: check.ok });
        if (!check.ok) {
          defects.push({
            type: 'MISSING_INDEX',
            table,
            code: check.code,
            message: `Missing expected index prefix for ${check.code} on ${table}`,
          });
        }
      }
    }

    const archiveChecks = [
      { table: 'driver', code: 'LICENSE_NO', requiredPrefix: ['license_no'] },
      { table: 'driver', code: 'PHONE', requiredPrefix: ['phone'] },
      { table: 'shipper', code: 'PHONE', requiredPrefix: ['phone'] },
      { table: 'carrier', code: 'PHONE', requiredPrefix: ['phone'] },
    ];

    for (const check of archiveChecks) {
      const idxMap = getIndexColumnMap(indexRows, check.table);
      const ok = hasIndexStartingWith(idxMap, check.requiredPrefix);
      indexChecks.push({ table: check.table, code: check.code, ok });
      if (!ok) {
        defects.push({
          type: 'MISSING_INDEX',
          table: check.table,
          code: check.code,
          message: `Missing expected index prefix for ${check.code} on ${check.table}`,
        });
      }
    }

    await conn.query("SET GLOBAL slow_query_log = 'ON'");
    const [slowLogRows] = await conn.query("SHOW VARIABLES LIKE 'slow_query_log'");

    const reportSql = `
      SELECT report_date, shipper_id, carrier_id, waybill_count, revenue_amount, gross_profit_amount
      FROM waybill_report_daily
      WHERE report_date BETWEEN '2026-07-01' AND '2026-07-31'
      ORDER BY report_date DESC
      LIMIT 31
    `;

    const paginationSql = `
      SELECT waybill_no, shipper_id, carrier_id, status, total_amount, created_at
      FROM waybill_202607_0
      WHERE created_at <= '2026-12-31 23:59:59'
      ORDER BY created_at DESC, id DESC
      LIMIT 50
    `;

    const [reportExplainRows] = await conn.query(`EXPLAIN FORMAT=JSON ${reportSql}`);
    const [paginationExplainRows] = await conn.query(`EXPLAIN FORMAT=JSON ${paginationSql}`);

    const t1 = process.hrtime.bigint();
    const [reportRows] = await conn.query(reportSql);
    const reportMs = Number(process.hrtime.bigint() - t1) / 1e6;

    const t2 = process.hrtime.bigint();
    const [paginationRows] = await conn.query(paginationSql);
    const paginationMs = Number(process.hrtime.bigint() - t2) / 1e6;

    const [countRows] = await conn.query('SELECT COUNT(1) AS total FROM waybill_202607_0');
    const totalRows = Number(countRows[0]?.total ?? 0);

    const slowLogEnabled = String(slowLogRows[0]?.Value ?? slowLogRows[0]?.value ?? '').toUpperCase() === 'ON';
    const paginationWithinTarget = paginationMs <= paginationThresholdMs;
    const reachedOneMillion = totalRows >= 1_000_000;
    const acceptancePassed = slowLogEnabled && reachedOneMillion && paginationWithinTarget && defects.length === 0;

    const result = {
      database: dbConfig.database,
      slowLogEnabled,
      paginationThresholdMs,
      paginationWithinTarget,
      acceptancePassed,
      rowVolume: {
        table: 'waybill_202607_0',
        totalRows,
        reachedOneMillion,
      },
      performance: {
        reportRows: reportRows.length,
        reportMs: Number(reportMs.toFixed(3)),
        paginationRows: paginationRows.length,
        paginationMs: Number(paginationMs.toFixed(3)),
      },
      explain: {
        report: reportExplainRows[0]?.EXPLAIN ?? null,
        pagination: paginationExplainRows[0]?.EXPLAIN ?? null,
      },
      indexChecks,
      defects,
      defectCount: defects.length,
    };

    console.log(JSON.stringify(result, null, 2));

    if (!acceptancePassed) {
      process.exitCode = 1;
    }
  } finally {
    await conn.end();
  }
}

await main();
