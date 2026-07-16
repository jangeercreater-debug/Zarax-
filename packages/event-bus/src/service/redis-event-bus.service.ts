import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { ZaraxEvent } from '@zarax/shared-types';
import Redis from 'ioredis';

import type { EventBus, EventHandler } from './event-bus.interface';

const CHANNEL = 'zarax:events';

export interface EventBusLogger {
  error(message: string, meta?: Record<string, unknown>): void;
}

@Injectable()
export class RedisEventBusService implements EventBus, OnModuleDestroy {
  private readonly publisher: Redis;
  private readonly subscriber: Redis;
  private readonly handlers = new Map<ZaraxEvent['type'], EventHandler[]>();

  constructor(
    redisUrl: string,
    private readonly logger?: EventBusLogger,
  ) {
    this.publisher = new Redis(redisUrl);
    // A dedicated connection: once .subscribe() is called, ioredis puts this
    // connection into subscriber mode, where it can no longer issue other commands.
    this.subscriber = new Redis(redisUrl);
    this.subscriber.subscribe(CHANNEL).catch((error: unknown) => {
      this.logger?.error('Failed to subscribe to event-bus channel', {
        channel: CHANNEL,
        error: String(error),
      });
    });
    this.subscriber.on('message', (_channel, message) => {
      void this.dispatch(message);
    });
  }

  async publish(event: ZaraxEvent): Promise<void> {
    await this.publisher.publish(CHANNEL, JSON.stringify(event));
  }

  subscribe<TType extends ZaraxEvent['type']>(
    eventType: TType,
    handler: EventHandler<Extract<ZaraxEvent, { type: TType }>>,
  ): void {
    const existing = this.handlers.get(eventType) ?? [];
    existing.push(handler as EventHandler);
    this.handlers.set(eventType, existing);
  }

  private async dispatch(rawMessage: string): Promise<void> {
    let event: ZaraxEvent;
    try {
      event = JSON.parse(rawMessage) as ZaraxEvent;
    } catch {
      this.logger?.error('Dropped malformed event-bus message', { rawMessage });
      return;
    }

    const handlers = this.handlers.get(event.type);
    if (!handlers || handlers.length === 0) return;

    await Promise.all(
      handlers.map(async (handler) => {
        try {
          await handler(event);
        } catch (error) {
          this.logger?.error('Event handler threw', {
            eventType: event.type,
            eventId: event.eventId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.subscriber.unsubscribe(CHANNEL);
    this.subscriber.disconnect();
    this.publisher.disconnect();
  }
}
