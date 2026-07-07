// In production the web app is behind the same gateway as the API.
// Default to same-origin so requests go to /api/* via nginx reverse proxy.
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';
async function request(path, init) {
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
    return response.json();
}
export function fetchBootstrap() {
    return request('/api/bootstrap');
}
export function fetchDashboard() {
    return request('/api/dashboard');
}
export function fetchWaybills() {
    return request('/api/waybills');
}
export function fetchWarnings() {
    return request('/api/warnings');
}
export function createWaybill(payload) {
    return request('/api/waybills', {
        method: 'POST',
        headers: {
            'x-idempotency-key': crypto.randomUUID(),
        },
        body: JSON.stringify(payload),
    });
}
