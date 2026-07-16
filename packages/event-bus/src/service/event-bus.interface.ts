import type { ZaraxEvent } from '@zarax/shared-types';

export type EventHandler<T extends ZaraxEvent = ZaraxEvent> = (event: T) => Promise<void> | void;

export interface EventBus {
  publish(event: ZaraxEvent): Promise<void>;
  /** Registers `handler` for every event whose `type` matches `eventType`. Multiple
   * handlers for the same type are all invoked (fan-out within one process). */
  subscribe<TType extends ZaraxEvent['type']>(
    eventType: TType,
    handler: EventHandler<Extract<ZaraxEvent, { type: TType }>>,
  ): void;
}
