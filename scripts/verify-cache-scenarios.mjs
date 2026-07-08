const API_BASE = process.env.API_BASE ?? 'http://localhost:3000';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, options);
  const bodyText = await response.text();
  let body;
  try {
    body = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    body = { raw: bodyText };
  }
  return { response, body };
}

async function main() {
  const login = await request('/api/auth/dev-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@example.com',
      name: 'Cache Verifier',
      role: 'ADMIN',
    }),
  });

  assert(login.response.ok, `Dev login failed: ${JSON.stringify(login.body)}`);
  const token = login.body?.token;
  assert(typeof token === 'string' && token.length > 10, 'Dev login token missing.');

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const unique = Date.now().toString(36);
  const createPayload = {
    code: `SHIP-CACHE-${unique}`,
    name: `CacheShipper-${unique}`,
    contactName: 'Cache Tester',
    phone: '13800008888',
  };

  const created = await request('/api/archives/shippers', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(createPayload),
  });
  assert(created.response.status === 201, `Create shipper failed: ${JSON.stringify(created.body)}`);
  const shipperId = created.body?.id;
  assert(typeof shipperId === 'string', 'Created shipper id missing.');

  const read1 = await request(`/api/archives/shippers/${shipperId}`);
  const hit1 = read1.response.headers.get('x-cache-hit');
  assert(read1.response.status === 200, `First read failed: ${JSON.stringify(read1.body)}`);

  const read2 = await request(`/api/archives/shippers/${shipperId}`);
  const hit2 = read2.response.headers.get('x-cache-hit');
  assert(read2.response.status === 200, `Second read failed: ${JSON.stringify(read2.body)}`);

  const updatePayload = {
    ...createPayload,
    name: `CacheShipper-UPDATED-${unique}`,
  };

  const updated = await request(`/api/archives/shippers/${shipperId}`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify(updatePayload),
  });
  assert(updated.response.status === 200, `Update shipper failed: ${JSON.stringify(updated.body)}`);

  const read3 = await request(`/api/archives/shippers/${shipperId}`);
  const hit3 = read3.response.headers.get('x-cache-hit');
  assert(read3.response.status === 200, `Third read failed: ${JSON.stringify(read3.body)}`);

  const read4 = await request(`/api/archives/shippers/${shipperId}`);
  const hit4 = read4.response.headers.get('x-cache-hit');
  assert(read4.response.status === 200, `Fourth read failed: ${JSON.stringify(read4.body)}`);
  assert(read4.body?.name === updatePayload.name, 'Updated value is not returned after cache refresh.');

  const dashboard1 = await request('/api/dashboard');
  const dashboardHit1 = dashboard1.response.headers.get('x-cache-hit');
  assert(dashboard1.response.ok, `Dashboard read #1 failed: ${JSON.stringify(dashboard1.body)}`);

  const dashboard2 = await request('/api/dashboard');
  const dashboardHit2 = dashboard2.response.headers.get('x-cache-hit');
  assert(dashboard2.response.ok, `Dashboard read #2 failed: ${JSON.stringify(dashboard2.body)}`);

  const scenario = await request('/api/cache/scenarios');
  assert(scenario.response.ok, `Cache scenario read failed: ${JSON.stringify(scenario.body)}`);

  const deleted = await request(`/api/archives/shippers/${shipperId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  assert(deleted.response.ok, `Cleanup delete failed: ${JSON.stringify(deleted.body)}`);

  const result = {
    shipperCacheHitSequence: [hit1, hit2, hit3, hit4],
    dashboardCacheHitSequence: [dashboardHit1, dashboardHit2],
    scenarioSample: {
      archiveDetailCache: scenario.body?.scenarios?.archiveDetailCache,
      idempotencyCache: scenario.body?.scenarios?.idempotencyCache,
      dashboardHotCache: scenario.body?.scenarios?.dashboardHotCache,
      policy: scenario.body?.policy,
    },
    expectations: {
      shipperCacheSequenceExpected: ['0', '1', '0', '1'],
      dashboardSecondHitExpected: '1',
    },
  };

  assert(
    JSON.stringify(result.shipperCacheHitSequence) === JSON.stringify(['0', '1', '0', '1']),
    `Shipper cache hit sequence mismatch: ${JSON.stringify(result.shipperCacheHitSequence)}`,
  );
  assert(result.dashboardCacheHitSequence[1] === '1', `Dashboard second hit should be 1, got ${dashboardHit2}`);

  console.log(JSON.stringify(result, null, 2));
}

await main();
