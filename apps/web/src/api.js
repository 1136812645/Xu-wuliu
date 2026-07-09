// In production the web app is behind the same gateway as the API.
// Default to same-origin so requests go to /api/* via nginx reverse proxy.
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';
const AUTH_TOKEN_KEY = 'waybill-admin-auth-token';
export function getAuthToken() {
    return globalThis.localStorage?.getItem(AUTH_TOKEN_KEY) ?? null;
}
export function setAuthToken(token) {
    if (!globalThis.localStorage) {
        return;
    }
    if (token) {
        globalThis.localStorage.setItem(AUTH_TOKEN_KEY, token);
    }
    else {
        globalThis.localStorage.removeItem(AUTH_TOKEN_KEY);
    }
}
function createIdempotencyKey() {
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
async function request(path, init) {
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
                .map((issue) => {
                const path = Array.isArray(issue.path) && issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
                return `${path}${issue.message ?? 'invalid value'}`;
            })
                .join('; ')
            : '';
        const message = issueText ? `${body.message ?? 'Request failed.'} ${issueText}` : body.message ?? 'Request failed.';
        throw new Error(message);
    }
    return response.json();
}
export function fetchAuthConfig() {
    return request('/api/auth/config');
}
export function fetchAuthMe() {
    return request('/api/auth/me');
}
export function loginWithGoogle(credential) {
    return request('/api/auth/google', {
        method: 'POST',
        body: JSON.stringify({ credential }),
    });
}
export function registerWithPassword(payload) {
    return request('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}
export function loginWithPassword(payload) {
    return request('/api/auth/password-login', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}
export function devLogin(payload) {
    return request('/api/auth/dev-login', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}
export function logout() {
    return request('/api/auth/logout', {
        method: 'POST',
    });
}
export function fetchBootstrap() {
    return request('/api/bootstrap');
}
export function fetchDashboard() {
    return request('/api/dashboard');
}
export function fetchCacheScenarios() {
    return request('/api/cache/scenarios');
}
export function fetchWaybills() {
    return request('/api/waybills');
}
export function fetchWarnings() {
    return request('/api/warnings');
}
export function quoteWaybill(payload) {
    return request('/api/waybills/quote', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}
export function createWaybill(payload, options) {
    return request('/api/waybills', {
        method: 'POST',
        headers: {
            'x-idempotency-key': options?.idempotencyKey ?? createIdempotencyKey(),
        },
        body: JSON.stringify(payload),
    });
}
export function signWaybill(id, options) {
    return request(`/api/waybills/${id}/sign`, {
        method: 'POST',
        headers: {
            'x-idempotency-key': options?.idempotencyKey ?? createIdempotencyKey(),
        },
    });
}
export function pickupWaybill(id, options) {
    return request(`/api/waybills/${id}/pickup`, {
        method: 'POST',
        headers: {
            'x-idempotency-key': options?.idempotencyKey ?? createIdempotencyKey(),
        },
    });
}
export function startTransitWaybill(id, options) {
    return request(`/api/waybills/${id}/start-transit`, {
        method: 'POST',
        headers: {
            'x-idempotency-key': options?.idempotencyKey ?? createIdempotencyKey(),
        },
    });
}
export function uploadPod(id, options) {
    return request(`/api/waybills/${id}/upload-pod`, {
        method: 'POST',
        headers: {
            'x-idempotency-key': options?.idempotencyKey ?? createIdempotencyKey(),
        },
    });
}
export function createShipper(payload) {
    return request('/api/archives/shippers', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}
export function updateShipper(id, payload) {
    return request(`/api/archives/shippers/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
    });
}
export function deleteShipper(id) {
    return request(`/api/archives/shippers/${id}`, {
        method: 'DELETE',
    });
}
export function createCarrier(payload) {
    return request('/api/archives/carriers', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}
export function updateCarrier(id, payload) {
    return request(`/api/archives/carriers/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
    });
}
export function deleteCarrier(id) {
    return request(`/api/archives/carriers/${id}`, {
        method: 'DELETE',
    });
}
export function createVehicle(payload) {
    return request('/api/archives/vehicles', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}
export function updateVehicle(id, payload) {
    return request(`/api/archives/vehicles/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
    });
}
export function deleteVehicle(id) {
    return request(`/api/archives/vehicles/${id}`, {
        method: 'DELETE',
    });
}
export function createDriver(payload) {
    return request('/api/archives/drivers', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}
export function updateDriver(id, payload) {
    return request(`/api/archives/drivers/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
    });
}
export function deleteDriver(id) {
    return request(`/api/archives/drivers/${id}`, {
        method: 'DELETE',
    });
}
export function importWaybillChunk(payload) {
    return request('/api/waybills/import/chunk', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}
export function savePricingRule(payload) {
    return request('/api/pricing-rules', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}
export function fetchPricingRules() {
    return request('/api/pricing-rules');
}
export function deletePricingRule(id, index) {
    const path = typeof id === 'number' ? `/api/pricing-rules/${id}` : `/api/pricing-rules/0`;
    const query = typeof id === 'number' ? '' : `?index=${index ?? -1}`;
    return request(`${path}${query}`, {
        method: 'DELETE',
    });
}
export function saveSettlementAdjustmentRule(payload) {
    return request('/api/settlement-adjustments', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}
export function fetchSettlementAdjustmentRules() {
    return request('/api/settlement-adjustments');
}
export function deleteSettlementAdjustmentRule(id, index) {
    const path = typeof id === 'number' ? `/api/settlement-adjustments/${id}` : `/api/settlement-adjustments/0`;
    const query = typeof id === 'number' ? '' : `?index=${index ?? -1}`;
    return request(`${path}${query}`, {
        method: 'DELETE',
    });
}
