import http from 'node:http';

const upstreams = [
  { name: 'api-1', host: '127.0.0.1', port: 3101 },
  { name: 'api-2', host: '127.0.0.1', port: 3102 },
];

let cursor = 0;

function pickStartIndex() {
  const start = cursor % upstreams.length;
  cursor += 1;
  return start;
}

function proxyToUpstream(req, res, index, tried = 0) {
  const target = upstreams[index];
  const proxyReq = http.request(
    {
      host: target.host,
      port: target.port,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: `${target.host}:${target.port}`,
      },
      timeout: 1500,
    },
    (proxyRes) => {
      const headers = { ...proxyRes.headers, 'x-gateway-upstream': target.name };
      res.writeHead(proxyRes.statusCode ?? 502, headers);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on('timeout', () => {
    proxyReq.destroy(new Error('upstream timeout'));
  });

  proxyReq.on('error', () => {
    const nextTried = tried + 1;
    if (nextTried >= upstreams.length) {
      if (!res.headersSent) {
        res.writeHead(503, { 'content-type': 'application/json' });
      }
      res.end(JSON.stringify({ message: 'All upstreams unavailable' }));
      return;
    }
    const nextIndex = (index + 1) % upstreams.length;
    proxyToUpstream(req, res, nextIndex, nextTried);
  });

  req.pipe(proxyReq);
}

const server = http.createServer((req, res) => {
  const url = req.url ?? '/';
  if (!url.startsWith('/api/') && url !== '/health') {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ message: 'Only /api/* and /health are proxied in local HA drill.' }));
    return;
  }

  const start = pickStartIndex();
  proxyToUpstream(req, res, start, 0);
});

const port = Number(process.env.HA_GATEWAY_PORT ?? 18080);
server.listen(port, () => {
  console.log(`Local HA gateway running at http://127.0.0.1:${port}`);
  console.log('Upstreams: api-1@3101, api-2@3102');
});
