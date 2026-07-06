import amqplib, { type Channel, type ChannelModel, type ConfirmChannel, type ConsumeMessage } from 'amqplib';
import { type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import { dbQuery, isDbEnabled, withDbConnection } from './db.js';
import * as logger from './logger.js';

type EventOperation = 'CREATE' | 'SIGN' | 'UPLOAD_POD';

export interface WaybillEvent {
  eventId: string;
  eventType: 'WAYBILL_STATUS_CHANGED';
  occurredAt: string;
  waybillId: string;
  waybillNo: string;
  status: string;
  operation: EventOperation;
  shardTable: string;
}

interface OutboxEvent {
  event: WaybillEvent;
  reason: string;
  createdAt: string;
}

interface OutboxRow extends RowDataPacket {
  event_id: string;
  payload: unknown;
  retry_count: number;
}

interface MqStats {
  published: number;
  publishFailed: number;
  consumed: number;
  duplicated: number;
  deadLettered: number;
}

const MQ_URL = process.env.RABBITMQ_URL ?? 'amqp://rabbitmq:5672';
const EVENT_EXCHANGE = process.env.RABBITMQ_EVENT_EXCHANGE ?? 'waybill.events.x';
const RETRY_EXCHANGE = process.env.RABBITMQ_RETRY_EXCHANGE ?? 'waybill.events.retry.x';
const DLX_EXCHANGE = process.env.RABBITMQ_DLX_EXCHANGE ?? 'waybill.events.dlx';
const EVENT_QUEUE = process.env.RABBITMQ_EVENT_QUEUE ?? 'waybill.events.q';
const RETRY_QUEUE = process.env.RABBITMQ_RETRY_QUEUE ?? 'waybill.events.retry.q';
const DLQ_QUEUE = process.env.RABBITMQ_DLQ_QUEUE ?? 'waybill.events.dlq';
const EVENT_ROUTING_KEY = process.env.RABBITMQ_EVENT_ROUTING_KEY ?? 'waybill.status.changed';
const RETRY_ROUTING_KEY = process.env.RABBITMQ_RETRY_ROUTING_KEY ?? 'waybill.status.changed.retry';
const RETRY_DELAY_MS = Number(process.env.RABBITMQ_RETRY_DELAY_MS ?? 10000);

let connection: ChannelModel | null = null;
let publishChannel: ConfirmChannel | null = null;
let consumeChannel: Channel | null = null;
let consumerStarted = false;
const outbox: OutboxEvent[] = [];
const processedEventIds = new Set<string>();

const stats: MqStats = {
  published: 0,
  publishFailed: 0,
  consumed: 0,
  duplicated: 0,
  deadLettered: 0,
};

async function ensureTopology(): Promise<void> {
  if (!publishChannel || !consumeChannel) {
    throw new Error('MQ channel is unavailable.');
  }

  await publishChannel.assertExchange(EVENT_EXCHANGE, 'direct', { durable: true });
  await publishChannel.assertExchange(RETRY_EXCHANGE, 'direct', { durable: true });
  await publishChannel.assertExchange(DLX_EXCHANGE, 'direct', { durable: true });

  await publishChannel.assertQueue(EVENT_QUEUE, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': DLX_EXCHANGE,
      'x-dead-letter-routing-key': EVENT_ROUTING_KEY,
    },
  });

  await publishChannel.assertQueue(RETRY_QUEUE, {
    durable: true,
    arguments: {
      'x-message-ttl': RETRY_DELAY_MS,
      'x-dead-letter-exchange': EVENT_EXCHANGE,
      'x-dead-letter-routing-key': EVENT_ROUTING_KEY,
    },
  });

  await publishChannel.assertQueue(DLQ_QUEUE, { durable: true });

  await publishChannel.bindQueue(EVENT_QUEUE, EVENT_EXCHANGE, EVENT_ROUTING_KEY);
  await publishChannel.bindQueue(RETRY_QUEUE, RETRY_EXCHANGE, RETRY_ROUTING_KEY);
  await publishChannel.bindQueue(DLQ_QUEUE, DLX_EXCHANGE, EVENT_ROUTING_KEY);
}

async function connectMq(): Promise<void> {
  if (connection && publishChannel && consumeChannel) {
    return;
  }

  connection = await amqplib.connect(MQ_URL);
  publishChannel = await connection.createConfirmChannel();
  consumeChannel = await connection.createChannel();
  await ensureTopology();

  connection.on('error', () => {
    connection = null;
    publishChannel = null;
    consumeChannel = null;
    consumerStarted = false;
  });

  connection.on('close', () => {
    connection = null;
    publishChannel = null;
    consumeChannel = null;
    consumerStarted = false;
  });
}

async function ensureConnected(): Promise<boolean> {
  try {
    await connectMq();
    return true;
  } catch {
    return false;
  }
}

async function upsertOutboxEvent(event: WaybillEvent, publishStatus: 'NEW' | 'FAILED' | 'PUBLISHED', retryCount: number): Promise<void> {
  if (!isDbEnabled()) {
    return;
  }

  await withDbConnection(async (conn) => {
    await conn.query(
      `INSERT INTO outbox_event (event_id, event_type, business_key, payload, publish_status, retry_count)
       VALUES (?, 'WAYBILL_STATUS_CHANGED', ?, CAST(? AS JSON), ?, ?)
       ON DUPLICATE KEY UPDATE
         payload = VALUES(payload),
         publish_status = VALUES(publish_status),
         retry_count = GREATEST(retry_count, VALUES(retry_count)),
         updated_at = NOW()`,
      [event.eventId, event.waybillNo, JSON.stringify(event), publishStatus, retryCount],
    );
  });
}

async function updateInboxStatus(eventId: string, consumeStatus: 'RETRYING' | 'CONSUMED' | 'DEAD_LETTER', retryCount: number): Promise<void> {
  if (!isDbEnabled()) {
    return;
  }

  await dbQuery(
    `UPDATE inbox_event
     SET consume_status = ?, retry_count = ?, updated_at = NOW()
     WHERE event_id = ?`,
    [consumeStatus, retryCount, eventId],
  );
}

async function tryRecordInboxEvent(event: WaybillEvent, payload: string): Promise<boolean> {
  if (!isDbEnabled()) {
    if (processedEventIds.has(event.eventId)) {
      return false;
    }
    processedEventIds.add(event.eventId);
    return true;
  }

  return withDbConnection(async (conn) => {
    const [result] = await conn.query<ResultSetHeader>(
      `INSERT IGNORE INTO inbox_event (event_id, event_type, business_key, payload, consume_status, retry_count)
       VALUES (?, 'WAYBILL_STATUS_CHANGED', ?, CAST(? AS JSON), 'NEW', 0)`,
      [event.eventId, event.waybillNo, payload],
    );
    return result.affectedRows > 0;
  });
}

async function loadPendingOutbox(limit = 100): Promise<OutboxRow[]> {
  if (!isDbEnabled()) {
    return [];
  }

  return dbQuery<OutboxRow[]>(
    `SELECT event_id, payload, retry_count
     FROM outbox_event
     WHERE publish_status IN ('NEW', 'FAILED')
     ORDER BY created_at ASC
     LIMIT ?`,
    [limit],
  );
}

function normalizeOutboxPayload(payload: unknown): WaybillEvent {
  if (typeof payload === 'string') {
    return JSON.parse(payload) as WaybillEvent;
  }
  return payload as WaybillEvent;
}

async function pushOutbox(event: WaybillEvent, reason: string): Promise<{ persistedToDb: boolean }> {
  let persistedToDb = false;
  if (isDbEnabled()) {
    try {
      await upsertOutboxEvent(event, 'FAILED', 1);
      persistedToDb = true;
    } catch (error) {
      logger.warn('mq.outbox_db_persist_failed', {
        eventId: event.eventId,
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  if (!persistedToDb) {
    outbox.push({
      event,
      reason,
      createdAt: new Date().toISOString(),
    });
  }

  stats.publishFailed += 1;
  return { persistedToDb };
}

async function publishToExchange(event: WaybillEvent): Promise<void> {
  if (!publishChannel) {
    throw new Error('MQ publisher unavailable.');
  }

  const payload = Buffer.from(JSON.stringify(event));
  await publishChannel.publish(EVENT_EXCHANGE, EVENT_ROUTING_KEY, payload, {
    contentType: 'application/json',
    deliveryMode: 2,
    messageId: event.eventId,
    timestamp: Date.now(),
  });
  await publishChannel.waitForConfirms();
  if (isDbEnabled()) {
    try {
      await upsertOutboxEvent(event, 'PUBLISHED', 0);
    } catch (error) {
      logger.warn('mq.outbox_mark_published_failed', {
        eventId: event.eventId,
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  }
  stats.published += 1;
}

async function routeToRetry(message: ConsumeMessage, retryCount: number): Promise<void> {
  if (!consumeChannel) {
    throw new Error('MQ consumer unavailable.');
  }

  consumeChannel.publish(RETRY_EXCHANGE, RETRY_ROUTING_KEY, message.content, {
    contentType: message.properties.contentType,
    deliveryMode: 2,
    messageId: message.properties.messageId,
    headers: {
      ...message.properties.headers,
      'x-retry-count': retryCount,
    },
  });
}

function parseEvent(message: ConsumeMessage): WaybillEvent {
  const content = message.content.toString('utf-8');
  return JSON.parse(content) as WaybillEvent;
}

async function handleMessage(message: ConsumeMessage | null): Promise<void> {
  if (!message || !consumeChannel) {
    return;
  }

  try {
    const payload = message.content.toString('utf-8');
    const event = JSON.parse(payload) as WaybillEvent;
    if (!event.eventId || !event.waybillNo) {
      throw new Error('Invalid event payload.');
    }

    const firstSeen = await tryRecordInboxEvent(event, payload);
    if (!firstSeen) {
      stats.duplicated += 1;
      consumeChannel.ack(message);
      return;
    }

    await updateInboxStatus(event.eventId, 'CONSUMED', 0);
    stats.consumed += 1;
    consumeChannel.ack(message);
  } catch (error) {
    const retryCount = Number(message.properties.headers?.['x-retry-count'] ?? 0);
    const parsed = (() => {
      try {
        return parseEvent(message);
      } catch {
        return null;
      }
    })();

    if (retryCount >= 3) {
      // Retry budget exhausted, message will be routed to DLQ for manual replay.
      stats.deadLettered += 1;
      if (parsed?.eventId) {
        await updateInboxStatus(parsed.eventId, 'DEAD_LETTER', retryCount);
      }
      consumeChannel.nack(message, false, false);
      return;
    }

    try {
      await routeToRetry(message, retryCount + 1);
      if (parsed?.eventId) {
        await updateInboxStatus(parsed.eventId, 'RETRYING', retryCount + 1);
      }
      consumeChannel.ack(message);
    } catch {
      stats.deadLettered += 1;
      if (parsed?.eventId) {
        await updateInboxStatus(parsed.eventId, 'DEAD_LETTER', retryCount + 1);
      }
      consumeChannel.nack(message, false, false);
    }

    if (error instanceof Error) {
      logger.error('mq.consume_error', { error: error.message });
    }
  }
}

export async function publishWaybillEvent(event: WaybillEvent): Promise<{ persistedToOutbox: boolean }> {
  if (isDbEnabled()) {
    try {
      await upsertOutboxEvent(event, 'NEW', 0);
    } catch (error) {
      logger.warn('mq.outbox_prepare_failed', {
        eventId: event.eventId,
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  const connected = await ensureConnected();
  if (!connected) {
    await pushOutbox(event, 'mq_disconnected');
    return { persistedToOutbox: true };
  }

  try {
    await publishToExchange(event);
    return { persistedToOutbox: false };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'publish_failed';
    await pushOutbox(event, reason);
    return { persistedToOutbox: true };
  }
}

export async function flushOutbox(): Promise<{ sent: number; remaining: number }> {
  const connected = await ensureConnected();
  if (!connected) {
    return { sent: 0, remaining: outbox.length };
  }

  let sent = 0;
  const pending = [...outbox];
  outbox.length = 0;

  for (const item of pending) {
    try {
      await publishToExchange(item.event);
      sent += 1;
    } catch {
      outbox.push(item);
    }
  }

  const dbPending = await loadPendingOutbox(200);
  for (const row of dbPending) {
    const event = normalizeOutboxPayload(row.payload);
    try {
      await publishToExchange(event);
      sent += 1;
    } catch {
      try {
        await upsertOutboxEvent(event, 'FAILED', Number(row.retry_count ?? 0) + 1);
      } catch {
        // Keep best-effort semantics. Failures remain queryable in outbox_event.
      }
    }
  }

  const remainingDb = isDbEnabled()
    ? await dbQuery<RowDataPacket[]>(
      `SELECT COUNT(1) AS cnt
       FROM outbox_event
       WHERE publish_status IN ('NEW', 'FAILED')`,
      )
    : [];

  const dbCount = remainingDb.length > 0 ? Number((remainingDb[0] as { cnt: number }).cnt ?? 0) : 0;
  return { sent, remaining: outbox.length + dbCount };
}

export async function startWaybillConsumer(): Promise<void> {
  const connected = await ensureConnected();
  if (!connected || !consumeChannel || consumerStarted) {
    return;
  }

  consumerStarted = true;
  await consumeChannel.prefetch(20);
  await consumeChannel.consume(EVENT_QUEUE, (message: ConsumeMessage | null) => {
    void handleMessage(message);
  });
}

export function getMqRuntimeStatus() {
  return {
    connected: Boolean(connection && publishChannel && consumeChannel),
    consumerStarted,
    exchanges: {
      eventExchange: EVENT_EXCHANGE,
      retryExchange: RETRY_EXCHANGE,
      deadLetterExchange: DLX_EXCHANGE,
    },
    queues: {
      eventQueue: EVENT_QUEUE,
      retryQueue: RETRY_QUEUE,
      deadLetterQueue: DLQ_QUEUE,
    },
    stats,
    outbox: {
      size: outbox.length,
      items: outbox.slice(0, 10),
    },
    processedEventCount: processedEventIds.size,
  };
}

export function buildWaybillEvent(input: {
  waybillId: string;
  waybillNo: string;
  status: string;
  operation: EventOperation;
  shardTable: string;
}): WaybillEvent {
  return {
    eventId: `${input.waybillId}:${input.operation}:${Date.now()}`,
    eventType: 'WAYBILL_STATUS_CHANGED',
    occurredAt: new Date().toISOString(),
    waybillId: input.waybillId,
    waybillNo: input.waybillNo,
    status: input.status,
    operation: input.operation,
    shardTable: input.shardTable,
  };
}
