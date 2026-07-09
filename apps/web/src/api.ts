import type {
  AuthConfig,
  CacheScenarioPayload,
  AuthUser,
  BootstrapPayload,
  CreateWaybillResponse,
  DashboardPayload,
  DocumentWarning,
  DriverProfile,
  WaybillImportChunkResult,
  WaybillImportRow,
  PricingRule,
  SettlementAdjustmentRule,
  WaybillTransitionResponse,
  PartyProfile,
  VehicleProfile,
  WaybillRecord,
  WaybillQuoteResponse,
} from './types';

// In production the web app is behind the same gateway as the API.
// Default to same-origin so requests go to /api/* via nginx reverse proxy.
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';
const AUTH_TOKEN_KEY = 'waybill-admin-auth-token';

export function getAuthToken(): string | null {
  return globalThis.localStorage?.getItem(AUTH_TOKEN_KEY) ?? null;
}

export function setAuthToken(token: string | null): void {
  if (!globalThis.localStorage) {
    return;
  }

  if (token) {
    globalThis.localStorage.setItem(AUTH_TOKEN_KEY, token);
  } else {
    globalThis.localStorage.removeItem(AUTH_TOKEN_KEY);
  }
}

function createIdempotencyKey(): string {
  const maybeCrypto = globalThis.crypto;
  if (maybeCrypto?.randomUUID) {
    return maybeCrypto.randomUUID();
  }

  if (maybeCrypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    maybeCrypto.getRandomValues(bytes);
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `idem-${hex}`;
  }

  return `idem-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: 'Request failed.' }));
    const issueText = Array.isArray(body.issues)
      ? body.issues
          .map((issue: { path?: string[]; message?: string }) => {
            const path = Array.isArray(issue.path) && issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
            return `${path}${issue.message ?? 'invalid value'}`;
          })
          .join('; ')
      : '';
    const message = issueText ? `${body.message ?? 'Request failed.'} ${issueText}` : body.message ?? 'Request failed.';
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export function fetchAuthConfig() {
  return request<AuthConfig>('/api/auth/config');
}

export function fetchAuthMe() {
  return request<{ user: AuthUser }>('/api/auth/me');
}

export function loginWithGoogle(credential: string) {
  return request<{ token: string; user: AuthUser }>('/api/auth/google', {
    method: 'POST',
    body: JSON.stringify({ credential }),
  });
}

export function registerWithPassword(payload: { email: string; name: string; role: Extract<AuthUser['role'], 'SHIPPER' | 'CARRIER'>; password: string }) {
  return request<{ token: string; user: AuthUser }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function loginWithPassword(payload: { email: string; password: string }) {
  return request<{ token: string; user: AuthUser }>('/api/auth/password-login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function devLogin(payload: { email: string; name: string; role: AuthUser['role'] }) {
  return request<{ token: string; user: AuthUser }>('/api/auth/dev-login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function logout() {
  return request<{ ok: true }>('/api/auth/logout', {
    method: 'POST',
  });
}

export function fetchBootstrap() {
  return request<BootstrapPayload>('/api/bootstrap');
}

export function fetchDashboard() {
  return request<DashboardPayload>('/api/dashboard');
}

export function fetchCacheScenarios() {
  return request<CacheScenarioPayload>('/api/cache/scenarios');
}

export function fetchWaybills() {
  return request<{ items: WaybillRecord[] }>('/api/waybills');
}

export function fetchWarnings() {
  return request<{ items: DocumentWarning[] }>('/api/warnings');
}

export function quoteWaybill(payload: Record<string, unknown>) {
  return request<WaybillQuoteResponse>('/api/waybills/quote', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function createWaybill(payload: Record<string, unknown>, options?: { idempotencyKey?: string }) {
  return request<CreateWaybillResponse>('/api/waybills', {
    method: 'POST',
    headers: {
      'x-idempotency-key': options?.idempotencyKey ?? createIdempotencyKey(),
    },
    body: JSON.stringify(payload),
  });
}

export function signWaybill(id: string, options?: { idempotencyKey?: string }) {
  return request<WaybillTransitionResponse>(`/api/waybills/${id}/sign`, {
    method: 'POST',
    headers: {
      'x-idempotency-key': options?.idempotencyKey ?? createIdempotencyKey(),
    },
  });
}

export function uploadPod(id: string, options?: { idempotencyKey?: string }) {
  return request<WaybillTransitionResponse>(`/api/waybills/${id}/upload-pod`, {
    method: 'POST',
    headers: {
      'x-idempotency-key': options?.idempotencyKey ?? createIdempotencyKey(),
    },
  });
}

export function createShipper(payload: Omit<PartyProfile, 'id'>) {
  return request<PartyProfile>('/api/archives/shippers', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateShipper(id: string, payload: Omit<PartyProfile, 'id'>) {
  return request<PartyProfile>(`/api/archives/shippers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function deleteShipper(id: string) {
  return request<PartyProfile>(`/api/archives/shippers/${id}`, {
    method: 'DELETE',
  });
}

export function createCarrier(payload: Omit<PartyProfile, 'id'>) {
  return request<PartyProfile>('/api/archives/carriers', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateCarrier(id: string, payload: Omit<PartyProfile, 'id'>) {
  return request<PartyProfile>(`/api/archives/carriers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function deleteCarrier(id: string) {
  return request<PartyProfile>(`/api/archives/carriers/${id}`, {
    method: 'DELETE',
  });
}

export function createVehicle(payload: Omit<VehicleProfile, 'id'>) {
  return request<VehicleProfile>('/api/archives/vehicles', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateVehicle(id: string, payload: Omit<VehicleProfile, 'id'>) {
  return request<VehicleProfile>(`/api/archives/vehicles/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function deleteVehicle(id: string) {
  return request<VehicleProfile>(`/api/archives/vehicles/${id}`, {
    method: 'DELETE',
  });
}

export function createDriver(payload: Omit<DriverProfile, 'id'>) {
  return request<DriverProfile>('/api/archives/drivers', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateDriver(id: string, payload: Omit<DriverProfile, 'id'>) {
  return request<DriverProfile>(`/api/archives/drivers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function deleteDriver(id: string) {
  return request<DriverProfile>(`/api/archives/drivers/${id}`, {
    method: 'DELETE',
  });
}

export function importWaybillChunk(payload: { importBatchId?: string; rows: WaybillImportRow[] }) {
  return request<WaybillImportChunkResult>('/api/waybills/import/chunk', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function savePricingRule(payload: PricingRule) {
  return request<{ items: PricingRule[] }>('/api/pricing-rules', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchPricingRules() {
  return request<{ items: PricingRule[] }>('/api/pricing-rules');
}

export function deletePricingRule(id?: number, index?: number) {
  const path = typeof id === 'number' ? `/api/pricing-rules/${id}` : `/api/pricing-rules/0`;
  const query = typeof id === 'number' ? '' : `?index=${index ?? -1}`;
  return request<{ items: PricingRule[] }>(`${path}${query}`, {
    method: 'DELETE',
  });
}

export function saveSettlementAdjustmentRule(payload: SettlementAdjustmentRule) {
  return request<{ items: SettlementAdjustmentRule[] }>('/api/settlement-adjustments', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchSettlementAdjustmentRules() {
  return request<{ items: SettlementAdjustmentRule[] }>('/api/settlement-adjustments');
}

export function deleteSettlementAdjustmentRule(id?: number, index?: number) {
  const path = typeof id === 'number' ? `/api/settlement-adjustments/${id}` : `/api/settlement-adjustments/0`;
  const query = typeof id === 'number' ? '' : `?index=${index ?? -1}`;
  return request<{ items: SettlementAdjustmentRule[] }>(`${path}${query}`, {
    method: 'DELETE',
  });
}
