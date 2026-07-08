import fs from 'node:fs';

const source = 'scripts/data/waybill-import-template-12000.csv';
const target = 'scripts/data/waybill-import-template-remaining-6000.csv';

const lines = fs.readFileSync(source, 'utf8').trim().split(/\r?\n/);
const [header, ...rows] = lines;
const vehicleType = {
  'vehicle-1': '9.6M',
  'vehicle-2': '6.8M',
  'vehicle-3': '9.6M',
};

const rules = [
  { shipperId: 'shipper-1', truckType: '9.6M', min: 301, max: 2000 },
  { shipperId: 'shipper-2', truckType: '6.8M', min: 0, max: 1500 },
  { shipperId: 'shipper-2', truckType: '9.6M', min: 0, max: 300 },
  { shipperId: 'shipper-2', truckType: '9.6M', min: 301, max: 2000 },
];

const failedRows = rows.filter((line) => {
  const [shipperId, , vehicleId, mileageKm] = line.split(',');
  const truckType = vehicleType[vehicleId];
  const mileage = Number(mileageKm);
  return !rules.some((rule) => rule.shipperId === shipperId && rule.truckType === truckType && mileage >= rule.min && mileage <= rule.max);
});

fs.writeFileSync(target, `${header}\n${failedRows.join('\n')}\n`, 'utf8');
console.log(JSON.stringify({ target, rows: failedRows.length }, null, 2));
