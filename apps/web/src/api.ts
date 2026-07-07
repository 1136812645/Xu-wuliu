import type { BootstrapPayload, DashboardPayload, DocumentWarning, WaybillRecord } from './types';

// In production the web app is behind the same gateway as the API.
// Default to same-origin so requests go to /api/* via nginx reverse proxy.
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: 'Request failed.' }));
    throw new Error(body.message ?? 'Request failed.');
  }

  return response.json() as Promise<T>;
}

export function fetchBootstrap() {
  return request<BootstrapPayload>('/api/bootstrap');
}

export function fetchDashboard() {
  return request<DashboardPayload>('/api/dashboard');
}

export function fetchWaybills() {
  return request<{ items: WaybillRecord[] }>('/api/waybills');
}

export function fetchWarnings() {
  return request<{ items: DocumentWarning[] }>('/api/warnings');
}

export function createWaybill(payload: Record<string, unknown>) {
  return request<WaybillRecord>('/api/waybills', {
    method: 'POST',
    headers: {
      'x-idempotency-key': crypto.randomUUID(),
    },
    body: JSON.stringify(payload),
  });
}
