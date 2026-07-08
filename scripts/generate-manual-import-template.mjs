import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const totalRows = Number(process.env.IMPORT_TOTAL ?? 12000);

const outputs = [
  resolve(process.cwd(), 'scripts', 'data', `waybill-import-template-${totalRows}.csv`),
  resolve(process.cwd(), 'docs', `交付物-批量导入模板-${totalRows}.xlsx.csv`),
];

const validCombos = [
  { shipperId: 'shipper-1', carrierId: 'carrier-1', vehicleId: 'vehicle-1', minMileageKm: 301, maxMileageKm: 1200 },
  { shipperId: 'shipper-1', carrierId: 'carrier-1', vehicleId: 'vehicle-3', minMileageKm: 301, maxMileageKm: 1200 },
  { shipperId: 'shipper-2', carrierId: 'carrier-2', vehicleId: 'vehicle-1', minMileageKm: 0, maxMileageKm: 1200 },
  { shipperId: 'shipper-2', carrierId: 'carrier-2', vehicleId: 'vehicle-2', minMileageKm: 0, maxMileageKm: 1200 },
  { shipperId: 'shipper-2', carrierId: 'carrier-2', vehicleId: 'vehicle-3', minMileageKm: 0, maxMileageKm: 1200 },
];

function ensureDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function buildMileage(index, combo) {
  const span = combo.maxMileageKm - combo.minMileageKm + 1;
  return combo.minMileageKm + (index % span);
}

function buildRow(index) {
  const combo = validCombos[index % validCombos.length];
  const rowNumber = index + 1;
  const mileageKm = buildMileage(index, combo);
  const weightKg = 2800 + (index % 5000);
  const volumeM3 = 10 + (index % 15);
  const extraLoadingFee = 20 + (index % 40);
  const subsidy = index % 12;
  const deduction = index % 10;

  return [
    combo.shipperId,
    combo.carrierId,
    combo.vehicleId,
    String(mileageKm),
    String(weightKg),
    String(volumeM3),
    `manual-import-${rowNumber}`,
    String(extraLoadingFee),
    String(subsidy),
    String(deduction),
    `manual-import-idem-${rowNumber}`,
  ].join(',');
}

function main() {
  const header = 'shipperId,carrierId,vehicleId,mileageKm,weightKg,volumeM3,goodsName,extraLoadingFee,subsidy,deduction,idempotencyKey';
  const lines = [header];

  for (let i = 0; i < totalRows; i += 1) {
    lines.push(buildRow(i));
  }

  const content = `${lines.join('\n')}\n`;
  for (const output of outputs) {
    ensureDir(output);
    writeFileSync(output, content, 'utf8');
  }

  console.log(
    JSON.stringify(
      {
        totalRows,
        outputs,
        comboCount: validCombos.length,
      },
      null,
      2,
    ),
  );
}

main();