import amqplib, { type Channel, type ChannelModel, type ConfirmChannel, type ConsumeMessage } from 'amqplib';
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

function pushOutbox(event: WaybillEvent, reason: string): void {
  outbox.push({
    event,
    reason,
    createdAt: new Date().toISOString(),
  });
  stats.publishFailed += 1;
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
    const event = parseEvent(message);
    if (!event.eventId || !event.waybillNo) {
      throw new Error('Invalid event payload.');
    }

    if (processedEventIds.has(event.eventId)) {
      stats.duplicated += 1;
      consumeChannel.ack(message);
      return;
    }

    processedEventIds.add(event.eventId);
    stats.consumed += 1;
    consumeChannel.ack(message);
  } catch (error) {
    const retryCount = Number(message.properties.headers?.['x-retry-count'] ?? 0);
    if (retryCount >= 3) {
      // Retry budget exhausted, message will be routed to DLQ for manual replay.
      stats.deadLettered += 1;
      consumeChannel.nack(message, false, false);
      return;
    }

    try {
      await routeToRetry(message, retryCount + 1);
      consumeChannel.ack(message);
    } catch {
      stats.deadLettered += 1;
      consumeChannel.nack(message, false, false);
    }

    if (error instanceof Error) {
      logger.error('mq.consume_error', { error: error.message });
    }
  }
}

export async function publishWaybillEvent(event: WaybillEvent): Promise<{ persistedToOutbox: boolean }> {
  const connected = await ensureConnected();
  if (!connected) {
    pushOutbox(event, 'mq_disconnected');
    return { persistedToOutbox: true };
  }

  try {
    await publishToExchange(event);
    return { persistedToOutbox: false };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'publish_failed';
    pushOutbox(event, reason);
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

  return { sent, remaining: outbox.length };
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
