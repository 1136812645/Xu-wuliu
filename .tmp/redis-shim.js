const net = require('node:net');
const fs = require('node:fs');

const store = new Map();
const port = Number(process.env.REDIS_SHIM_PORT || 6380);
const logPath = process.env.REDIS_SHIM_LOG || 'D:\\Xu-wuliu\\.tmp\\redis-shim.log';

function log(message) {
  fs.appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`, { encoding: 'utf8' });
}

const reply = {
  ok: '+OK\r\n',
  pong: '+PONG\r\n',
  nil: '$-1\r\n',
  one: ':1\r\n',
  zero: ':0\r\n',
  empty: '*0\r\n',
};

function bulk(value) {
  if (value === null || value === undefined) return reply.nil;
  const text = String(value);
  return `$${Buffer.byteLength(text)}\r\n${text}\r\n`;
}

function array(items) {
  let out = `*${items.length}\r\n`;
  for (const item of items) {
    out += Array.isArray(item) ? array(item) : bulk(item);
  }
  return out;
}

function cleanup(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt && entry.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }
  return entry;
}

function parse(buffer) {
  let offset = 0;

  function line() {
    const end = buffer.indexOf('\r\n', offset);
    if (end === -1) return null;
    const value = buffer.slice(offset, end).toString();
    offset = end + 2;
    return value;
  }

  const header = line();
  if (!header || header[0] !== '*') return null;

  const count = Number(header.slice(1));
  const args = [];
  for (let i = 0; i < count; i += 1) {
    const bulkHeader = line();
    if (!bulkHeader || bulkHeader[0] !== '$') return null;
    const len = Number(bulkHeader.slice(1));
    if (buffer.length < offset + len + 2) return null;
    args.push(buffer.slice(offset, offset + len).toString());
    offset += len + 2;
  }

  return { args, bytes: offset };
}

function handle(args) {
  const command = String(args[0] || '').toUpperCase();

  if (command === 'PING') return reply.pong;
  if (command === 'QUIT') return reply.ok;
  if (command === 'INFO') return bulk('# Server\r\nredis_version:7.2.0\r\n');
  if (command === 'CLIENT' || command === 'SELECT' || command === 'AUTH' || command === 'READONLY' || command === 'READWRITE') {
    return reply.ok;
  }
  if (command === 'HELLO') {
    return array(['server', 'redis', 'version', '7.2.0', 'proto', '2', 'mode', 'standalone', 'role', 'master']);
  }
  if (command === 'COMMAND' || command === 'CONFIG') {
    return reply.empty;
  }
  if (command === 'SET') {
    const key = args[1];
    const value = args[2];
    let ttlMs = null;
    let nx = false;
    for (let i = 3; i < args.length; i += 1) {
      const token = String(args[i] || '').toUpperCase();
      if (token === 'PX') ttlMs = Number(args[i + 1]);
      if (token === 'EX') ttlMs = Number(args[i + 1]) * 1000;
      if (token === 'NX') nx = true;
    }
    const existing = cleanup(key);
    if (nx && existing) return reply.nil;
    store.set(key, { value, expiresAt: ttlMs ? Date.now() + ttlMs : null });
    return reply.ok;
  }
  if (command === 'GET') {
    const entry = cleanup(args[1]);
    return bulk(entry ? entry.value : null);
  }
  if (command === 'EXISTS') {
    const entry = cleanup(args[1]);
    return entry ? reply.one : reply.zero;
  }
  if (command === 'DEL') {
    let deleted = 0;
    for (let i = 1; i < args.length; i += 1) {
      if (cleanup(args[i])) {
        store.delete(args[i]);
        deleted += 1;
      }
    }
    return `:${deleted}\r\n`;
  }
  if (command === 'EVAL') {
    const key = args[2];
    const token = args[3];
    const entry = cleanup(key);
    if (entry && entry.value === token) {
      store.delete(key);
      return reply.one;
    }
    return reply.zero;
  }

  return reply.ok;
}

const server = net.createServer((socket) => {
  let buffer = Buffer.alloc(0);

  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length > 0) {
      const parsed = parse(buffer);
      if (!parsed) break;
      buffer = buffer.slice(parsed.bytes);
      socket.write(handle(parsed.args));
    }
  });

  socket.on('error', (error) => {
    log(`socket.error ${error.message}`);
  });
});

server.on('error', (error) => {
  log(`server.error ${error.message}`);
  process.exitCode = 1;
});

server.listen(port, '127.0.0.1', () => {
  log(`redis-shim-listening:${port}`);
  console.log(`redis-shim-listening:${port}`);
});
