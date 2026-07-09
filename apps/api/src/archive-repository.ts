import type { RowDataPacket } from 'mysql2/promise';
import { dbExecute, dbQuery } from './db.js';
import { carriers, drivers, shippers, vehicles } from './data.js';
import type { DriverProfile, PartyProfile, VehicleProfile } from './domain.js';

interface ShipperRow extends RowDataPacket {
  id: string;
  code: string;
  name: string;
  contact_name: string;
  phone: string;
}

interface CarrierRow extends RowDataPacket {
  id: string;
  code: string;
  name: string;
  contact_name: string;
  phone: string;
}

interface DriverRow extends RowDataPacket {
  id: string;
  name: string;
  phone: string;
  license_no: string;
  license_expiry: Date | string | null;
}

interface VehicleRow extends RowDataPacket {
  id: string;
  plate_no: string;
  truck_type: VehicleProfile['truckType'];
  max_weight_kg: number;
  max_volume_m3: number;
  road_permit_expiry: Date | string | null;
  assigned_driver_id: string;
}

function toDateOnly(value: Date | string | null): string {
  if (!value) {
    return '';
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  const normalized = String(value);
  return normalized.length >= 10 ? normalized.slice(0, 10) : normalized;
}

function replaceItems<T>(target: T[], next: T[]): T[] {
  target.splice(0, target.length, ...next);
  return target;
}

function mapShipper(row: ShipperRow): PartyProfile {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    contactName: row.contact_name,
    phone: row.phone,
  };
}

function mapCarrier(row: CarrierRow): PartyProfile {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    contactName: row.contact_name,
    phone: row.phone,
  };
}

function mapDriver(row: DriverRow): DriverProfile {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    licenseNumber: row.license_no,
    licenseExpiry: toDateOnly(row.license_expiry),
  };
}

function mapVehicle(row: VehicleRow): VehicleProfile {
  return {
    id: row.id,
    plateNumber: row.plate_no,
    truckType: row.truck_type,
    maxWeightKg: Number(row.max_weight_kg),
    maxVolumeM3: Number(row.max_volume_m3),
    roadPermitExpiry: toDateOnly(row.road_permit_expiry),
    assignedDriverId: row.assigned_driver_id,
  };
}

export async function listShippersFromDb(): Promise<PartyProfile[]> {
  const rows = await dbQuery<ShipperRow[]>(
    `SELECT id, code, name, contact_name, phone
     FROM shipper
     ORDER BY id ASC`,
  );
  return rows.map(mapShipper);
}

export async function listCarriersFromDb(): Promise<PartyProfile[]> {
  const rows = await dbQuery<CarrierRow[]>(
    `SELECT id, code, name, contact_name, phone
     FROM carrier
     ORDER BY id ASC`,
  );
  return rows.map(mapCarrier);
}

export async function listDriversFromDb(): Promise<DriverProfile[]> {
  const rows = await dbQuery<DriverRow[]>(
    `SELECT id, name, phone, license_no, license_expiry
     FROM driver
     ORDER BY id ASC`,
  );
  return rows.map(mapDriver);
}

export async function listVehiclesFromDb(): Promise<VehicleProfile[]> {
  const rows = await dbQuery<VehicleRow[]>(
    `SELECT id, plate_no, truck_type, max_weight_kg, max_volume_m3, road_permit_expiry, assigned_driver_id
     FROM vehicle
     ORDER BY id ASC`,
  );
  return rows.map(mapVehicle);
}

export async function replaceArchivesFromDb(): Promise<{
  shippers: PartyProfile[];
  carriers: PartyProfile[];
  drivers: DriverProfile[];
  vehicles: VehicleProfile[];
}> {
  const [nextShippers, nextCarriers, nextDrivers, nextVehicles] = await Promise.all([
    listShippersFromDb(),
    listCarriersFromDb(),
    listDriversFromDb(),
    listVehiclesFromDb(),
  ]);

  return {
    shippers: replaceItems(shippers, nextShippers),
    carriers: replaceItems(carriers, nextCarriers),
    drivers: replaceItems(drivers, nextDrivers),
    vehicles: replaceItems(vehicles, nextVehicles),
  };
}

export async function createShipperInDb(payload: PartyProfile): Promise<PartyProfile[]> {
  await dbExecute(
    `INSERT INTO shipper (id, code, name, contact_name, phone)
     VALUES (?, ?, ?, ?, ?)`,
    [payload.id, payload.code, payload.name, payload.contactName, payload.phone],
  );
  return listShippersFromDb();
}

export async function updateShipperInDb(id: string, payload: Omit<PartyProfile, 'id'>): Promise<PartyProfile[]> {
  const result = await dbExecute(
    `UPDATE shipper
     SET code = ?, name = ?, contact_name = ?, phone = ?
     WHERE id = ?`,
    [payload.code, payload.name, payload.contactName, payload.phone, id],
  );
  if (result.affectedRows < 1) {
    throw new Error('Shipper not found.');
  }
  return listShippersFromDb();
}

export async function deleteShipperInDb(id: string): Promise<PartyProfile[]> {
  const result = await dbExecute(`DELETE FROM shipper WHERE id = ?`, [id]);
  if (result.affectedRows < 1) {
    throw new Error('Shipper not found.');
  }
  return listShippersFromDb();
}

export async function createCarrierInDb(payload: PartyProfile): Promise<PartyProfile[]> {
  await dbExecute(
    `INSERT INTO carrier (id, code, name, contact_name, phone)
     VALUES (?, ?, ?, ?, ?)`,
    [payload.id, payload.code, payload.name, payload.contactName, payload.phone],
  );
  return listCarriersFromDb();
}

export async function updateCarrierInDb(id: string, payload: Omit<PartyProfile, 'id'>): Promise<PartyProfile[]> {
  const result = await dbExecute(
    `UPDATE carrier
     SET code = ?, name = ?, contact_name = ?, phone = ?
     WHERE id = ?`,
    [payload.code, payload.name, payload.contactName, payload.phone, id],
  );
  if (result.affectedRows < 1) {
    throw new Error('Carrier not found.');
  }
  return listCarriersFromDb();
}

export async function deleteCarrierInDb(id: string): Promise<PartyProfile[]> {
  const result = await dbExecute(`DELETE FROM carrier WHERE id = ?`, [id]);
  if (result.affectedRows < 1) {
    throw new Error('Carrier not found.');
  }
  return listCarriersFromDb();
}

export async function createDriverInDb(payload: DriverProfile): Promise<DriverProfile[]> {
  await dbExecute(
    `INSERT INTO driver (id, name, phone, license_no, license_expiry)
     VALUES (?, ?, ?, ?, ?)`,
    [payload.id, payload.name, payload.phone, payload.licenseNumber, payload.licenseExpiry || null],
  );
  return listDriversFromDb();
}

export async function updateDriverInDb(id: string, payload: Omit<DriverProfile, 'id'>): Promise<DriverProfile[]> {
  const result = await dbExecute(
    `UPDATE driver
     SET name = ?, phone = ?, license_no = ?, license_expiry = ?
     WHERE id = ?`,
    [payload.name, payload.phone, payload.licenseNumber, payload.licenseExpiry || null, id],
  );
  if (result.affectedRows < 1) {
    throw new Error('Driver not found.');
  }
  return listDriversFromDb();
}

export async function deleteDriverInDb(id: string): Promise<DriverProfile[]> {
  const result = await dbExecute(`DELETE FROM driver WHERE id = ?`, [id]);
  if (result.affectedRows < 1) {
    throw new Error('Driver not found.');
  }
  return listDriversFromDb();
}

export async function createVehicleInDb(payload: VehicleProfile): Promise<VehicleProfile[]> {
  await dbExecute(
    `INSERT INTO vehicle (id, plate_no, truck_type, max_weight_kg, max_volume_m3, road_permit_expiry, assigned_driver_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [payload.id, payload.plateNumber, payload.truckType, payload.maxWeightKg, payload.maxVolumeM3, payload.roadPermitExpiry || null, payload.assignedDriverId],
  );
  return listVehiclesFromDb();
}

export async function updateVehicleInDb(id: string, payload: Omit<VehicleProfile, 'id'>): Promise<VehicleProfile[]> {
  const result = await dbExecute(
    `UPDATE vehicle
     SET plate_no = ?, truck_type = ?, max_weight_kg = ?, max_volume_m3 = ?, road_permit_expiry = ?, assigned_driver_id = ?
     WHERE id = ?`,
    [payload.plateNumber, payload.truckType, payload.maxWeightKg, payload.maxVolumeM3, payload.roadPermitExpiry || null, payload.assignedDriverId, id],
  );
  if (result.affectedRows < 1) {
    throw new Error('Vehicle not found.');
  }
  return listVehiclesFromDb();
}

export async function deleteVehicleInDb(id: string): Promise<VehicleProfile[]> {
  const result = await dbExecute(`DELETE FROM vehicle WHERE id = ?`, [id]);
  if (result.affectedRows < 1) {
    throw new Error('Vehicle not found.');
  }
  return listVehiclesFromDb();
}
