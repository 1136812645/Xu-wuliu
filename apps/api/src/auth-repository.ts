import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual, type BinaryLike } from 'node:crypto';
import { promisify } from 'node:util';
import { dbQuery } from './db.js';
import type { RowDataPacket } from 'mysql2/promise';

const scrypt = promisify(scryptCallback);

export type UserRole = 'ADMIN' | 'SHIPPER' | 'CARRIER';

export type AuthAccount = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  passwordHash: string | null;
  googleSub: string | null;
  pictureUrl: string | null;
};

type AuthAccountRow = RowDataPacket & {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  password_hash: string | null;
  google_sub: string | null;
  picture_url: string | null;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function mapAccountRow(row: AuthAccountRow): AuthAccount {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    passwordHash: row.password_hash,
    googleSub: row.google_sub,
    pictureUrl: row.picture_url,
  };
}

export async function ensureAuthUserTable(): Promise<void> {
  await dbQuery(
    `CREATE TABLE IF NOT EXISTS auth_user (
      id VARCHAR(64) PRIMARY KEY,
      email VARCHAR(191) NOT NULL,
      name VARCHAR(128) NOT NULL,
      role ENUM('ADMIN', 'SHIPPER', 'CARRIER') NOT NULL DEFAULT 'SHIPPER',
      password_hash VARCHAR(255) NULL,
      google_sub VARCHAR(128) NULL,
      picture_url VARCHAR(255) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      last_login_at DATETIME NULL,
      UNIQUE KEY uk_auth_user_email (email),
      UNIQUE KEY uk_auth_user_google_sub (google_sub),
      KEY idx_auth_user_role (role)
    )`,
  );
}

export async function findAuthUserByEmail(email: string): Promise<AuthAccount | null> {
  const rows = await dbQuery<AuthAccountRow[]>(
    `SELECT id, email, name, role, password_hash, google_sub, picture_url
     FROM auth_user
     WHERE email = ?
     LIMIT 1`,
    [normalizeEmail(email)],
  );
  if (rows.length === 0) {
    return null;
  }
  return mapAccountRow(rows[0]);
}

export async function findAuthUserByGoogleSub(googleSub: string): Promise<AuthAccount | null> {
  const rows = await dbQuery<AuthAccountRow[]>(
    `SELECT id, email, name, role, password_hash, google_sub, picture_url
     FROM auth_user
     WHERE google_sub = ?
     LIMIT 1`,
    [googleSub],
  );
  if (rows.length === 0) {
    return null;
  }
  return mapAccountRow(rows[0]);
}

export async function createPasswordUser(payload: {
  email: string;
  name: string;
  role: UserRole;
  passwordHash: string;
}): Promise<AuthAccount> {
  const id = `user:${randomUUID()}`;
  const email = normalizeEmail(payload.email);
  await dbQuery(
    `INSERT INTO auth_user (id, email, name, role, password_hash)
     VALUES (?, ?, ?, ?, ?)`,
    [id, email, payload.name, payload.role, payload.passwordHash],
  );

  const created = await findAuthUserByEmail(email);
  if (!created) {
    throw new Error('Failed to load created account.');
  }
  return created;
}

export async function upsertGoogleUser(payload: {
  googleSub: string;
  email: string;
  name: string;
  pictureUrl?: string;
  defaultRole: UserRole;
}): Promise<AuthAccount> {
  const normalizedEmail = normalizeEmail(payload.email);
  const existingBySub = await findAuthUserByGoogleSub(payload.googleSub);
  if (existingBySub) {
    await dbQuery(
      `UPDATE auth_user
       SET email = ?, name = ?, picture_url = ?, last_login_at = NOW()
       WHERE id = ?`,
      [normalizedEmail, payload.name, payload.pictureUrl ?? null, existingBySub.id],
    );
    const updatedBySub = await findAuthUserByGoogleSub(payload.googleSub);
    if (!updatedBySub) {
      throw new Error('Failed to load Google account by sub.');
    }
    return updatedBySub;
  }

  const existingByEmail = await findAuthUserByEmail(normalizedEmail);
  if (existingByEmail) {
    await dbQuery(
      `UPDATE auth_user
       SET google_sub = ?, name = ?, picture_url = ?, last_login_at = NOW()
       WHERE id = ?`,
      [payload.googleSub, payload.name, payload.pictureUrl ?? null, existingByEmail.id],
    );
    const updatedByEmail = await findAuthUserByEmail(normalizedEmail);
    if (!updatedByEmail) {
      throw new Error('Failed to load Google account by email.');
    }
    return updatedByEmail;
  }

  const id = `user:${randomUUID()}`;
  await dbQuery(
    `INSERT INTO auth_user (id, email, name, role, google_sub, picture_url, last_login_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [id, normalizedEmail, payload.name, payload.defaultRole, payload.googleSub, payload.pictureUrl ?? null],
  );

  const created = await findAuthUserByEmail(normalizedEmail);
  if (!created) {
    throw new Error('Failed to load created Google account.');
  }
  return created;
}

export async function touchAuthUserLogin(id: string): Promise<void> {
  await dbQuery('UPDATE auth_user SET last_login_at = NOW() WHERE id = ? LIMIT 1', [id]);
}

export async function hashPassword(plainTextPassword: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scrypt(plainTextPassword, salt, 32)) as Buffer;
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

function toBuffer(value: BinaryLike): Buffer {
  return Buffer.isBuffer(value) ? value : Buffer.from(value as string, 'hex');
}

export async function verifyPassword(plainTextPassword: string, encodedHash: string): Promise<boolean> {
  const parts = encodedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }

  const [, salt, expectedHex] = parts;
  const derived = (await scrypt(plainTextPassword, salt, 32)) as Buffer;
  const expected = toBuffer(expectedHex);
  if (derived.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(derived, expected);
}
