import mysql from 'mysql2/promise';

const dbConfig = {
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 13306),
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? 'root',
  database: process.env.DB_NAME ?? 'waybill_admin',
};

const amountColumns = new Set([
  'max_weight_kg',
  'max_volume_m3',
  'min_mileage_km',
  'max_mileage_km',
  'unit_price_per_km',
  'loading_fee',
  'insurance_rate',
  'mileage_km',
  'weight_kg',
  'volume_m3',
  'total_amount',
  'amount',
  'revenue_amount',
  'carrier_cost_amount',
  'gross_profit_amount',
]);

const dateColumns = new Set([
  'created_at',
  'updated_at',
  'license_expiry',
  'road_permit_expiry',
  'signed_at',
  'pod_uploaded_at',
  'uploaded_at',
  'report_date',
]);

const enumColumns = new Set([
  'status',
  'operation_type',
  'consume_status',
  'publish_status',
  'event_type',
  'truck_type',
  'fee_type',
]);

const numericTypes = new Set(['decimal', 'int', 'bigint', 'float', 'double']);
const dateTypes = new Set(['date', 'datetime', 'timestamp']);

function isWaybillShard(tableName) {
  return /^waybill_\d{6}_[0-9]+$/.test(tableName);
}

function shouldCheckEnum(tableName, columnName) {
  if (!enumColumns.has(columnName)) {
    return false;
  }

  if (columnName === 'status') {
    return isWaybillShard(tableName) || tableName === 'inbox_event' || tableName === 'outbox_event';
  }

  if (columnName === 'operation_type') {
    return tableName === 'waybill_operation_log';
  }

  if (columnName === 'consume_status') {
    return tableName === 'inbox_event';
  }

  if (columnName === 'publish_status') {
    return tableName === 'outbox_event';
  }

  if (columnName === 'event_type') {
    return tableName === 'inbox_event' || tableName === 'outbox_event';
  }

  if (columnName === 'truck_type') {
    return tableName === 'vehicle' || tableName === 'pricing_rule';
  }

  if (columnName === 'fee_type') {
    return tableName === 'waybill_fee_detail';
  }

  return false;
}

async function main() {
  const connection = await mysql.createConnection(dbConfig);

  try {
    const [rows] = await connection.query(
      `SELECT table_name, column_name, data_type, column_type
       FROM information_schema.columns
       WHERE table_schema = ?`,
      [dbConfig.database],
    );

    const defects = {
      amountAsVarchar: [],
      dateAsString: [],
      statusWithoutEnum: [],
    };

    for (const row of rows) {
      const table = String(row.table_name);
      const column = String(row.column_name);
      const dataType = String(row.data_type).toLowerCase();
      const columnType = String(row.column_type).toLowerCase();

      if (amountColumns.has(column) && !numericTypes.has(dataType)) {
        defects.amountAsVarchar.push({ table, column, dataType, columnType });
      }

      if (dateColumns.has(column) && !dateTypes.has(dataType)) {
        defects.dateAsString.push({ table, column, dataType, columnType });
      }

      if (shouldCheckEnum(table, column) && dataType !== 'enum') {
        defects.statusWithoutEnum.push({ table, column, dataType, columnType });
      }
    }

    const result = {
      database: dbConfig.database,
      checks: {
        amountAsVarchar: defects.amountAsVarchar.length === 0,
        dateAsString: defects.dateAsString.length === 0,
        statusWithoutEnum: defects.statusWithoutEnum.length === 0,
      },
      defectCount:
        defects.amountAsVarchar.length + defects.dateAsString.length + defects.statusWithoutEnum.length,
      defects,
    };

    console.log(JSON.stringify(result, null, 2));

    if (result.defectCount > 0) {
      process.exitCode = 1;
    }
  } finally {
    await connection.end();
  }
}

await main();
