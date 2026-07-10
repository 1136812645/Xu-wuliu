import amqplib, { type Channel, type ChannelModel, type ConfirmChannel, type ConsumeMessage } from 'amqplib';
import { type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import { dbQuery, isDbEnabled, withDbConnection } from './db.js';
import * as logger from './logger.js';

type EventOperation = 'CREATE' | 'PICKUP' | 'START_TRANSIT' | 'SIGN' | 'UPLOAD_POD';

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

/**
 * 持久化（或更新）Outbox 事件状态，支撑可靠发布与补偿重放。
 * 功能：在发布前后记录 NEW/FAILED/PUBLISHED，保证 MQ 不可用时仍可追溯与补发。
 * @param event 业务事件载荷。
 * @param publishStatus outbox_event 表中的发布状态。
 * @param retryCount 当前发布重试次数。
 */
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

/**
 * 更新 InBox 事件消费状态。
 * 功能：记录消息已消费/重试中/死信，形成重复消费与故障排查证据链。
 * @param eventId MQ 事件唯一ID。
 * @param consumeStatus 目标消费状态。
 * @param retryCount 当前重试次数（用于重放与死信观察）。
 */
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

/**
 * 尝试写入一条 InBox 记录，作为消费端去重门闩。
 * 功能：数据库模式依赖唯一键去重；内存模式使用 processedEventIds 去重。
 * @param event 已解析事件。
 * @param payload 原始 JSON 文本。
 * @returns true 表示首次消费；false 表示重复消费。
 */
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
  if (!publishChannel) {
    throw new Error('MQ publisher unavailable for retry routing.');
  }

  await publishChannel.publish(RETRY_EXCHANGE, RETRY_ROUTING_KEY, message.content, {
    contentType: message.properties.contentType,
    deliveryMode: 2,
    messageId: message.properties.messageId,
    headers: {
      ...message.properties.headers,
      'x-retry-count': retryCount,
    },
  });
  await publishChannel.waitForConfirms();
}

/**
 * 解析 RabbitMQ 消息为运单业务事件。
 * @param message 事件队列原始消息。
 * @returns 结构化业务事件对象。
 */
function parseEvent(message: ConsumeMessage): WaybillEvent {
  const content = message.content.toString('utf-8');
  return JSON.parse(content) as WaybillEvent;
}

/**
 * 消费单条消息（含去重、重试、死信策略）。
 * 功能：先做重复消费拦截，再做业务消费；异常时按预算重试，超限后转死信。
 * @param message RabbitMQ 消费消息；null 代表消费者被取消。
 */
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
      // 重复消息直接 ACK 丢弃，避免二次触发业务副作用（重复签收/重复回单等）。
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
      // 达到最大重试次数后转入死信，等待人工排查与补偿。
      stats.deadLettered += 1;
      if (parsed?.eventId) {
        await updateInboxStatus(parsed.eventId, 'DEAD_LETTER', retryCount);
      }
      consumeChannel.nack(message, false, false);
      return;
    }

    try {
      // 关键顺序：先投递重试队列并确认，再 ACK 原消息，避免“原消息已确认但重试消息未落盘”。
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

/**
 * 发布运单事件（带 Outbox 兜底）。
 * 功能：MQ 可用时直发；不可用或发送失败时落 Outbox，后续统一补发。
 * @param event 运单业务事件。
 * @returns persistedToOutbox=true 表示已进入待补发缓冲。
 */
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

/**
 * 主动冲刷内存/数据库 Outbox 事件到 MQ。
 * 功能：用于故障恢复后补发，减少事件长期滞留。
 * @returns sent 已发送条数，remaining 剩余缓冲条数。
 */
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
        // 本轮补发失败仅增加失败计数，不删除记录，确保后续仍可继续重放。
        await upsertOutboxEvent(event, 'FAILED', Number(row.retry_count ?? 0) + 1);
      } catch {
        // 保持尽力而为语义：即使更新失败，也不阻断本次冲刷流程。
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
  // 限制单消费者并发在途消息，避免高峰期重试风暴放大。
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
