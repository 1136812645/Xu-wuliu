import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: '127.0.0.1',
  port: 13306,
  user: 'root',
  password: 'root',
  database: 'waybill_admin',
});

await conn.query(`
  INSERT INTO pricing_rule (
    shipper_id,
    truck_type,
    min_mileage_km,
    max_mileage_km,
    unit_price_per_km,
    loading_fee,
    insurance_rate
  ) VALUES
    ('shipper-2', '9.6M', 0, 300, 8.10, 170.00, 0.0110),
    ('shipper-2', '9.6M', 301, 2000, 7.50, 170.00, 0.0110)
`);

const [rows] = await conn.query(`
  SELECT shipper_id, truck_type, min_mileage_km, max_mileage_km, unit_price_per_km
  FROM pricing_rule
  ORDER BY shipper_id, truck_type, min_mileage_km
`);

console.log(JSON.stringify(rows, null, 2));
await conn.end();
