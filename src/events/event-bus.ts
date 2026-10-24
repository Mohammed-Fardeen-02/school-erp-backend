import { EventEmitter } from 'events';
import { DomainEvent, BaseDomainEventPayload } from './event-types';
import { logger } from '../core/logger/app-logger';

class ApplicationEventBus extends EventEmitter {
  constructor() {
    super();
    // Increase listener limit for modular listeners
    this.setMaxListeners(50);
  }

  public publish<T extends BaseDomainEventPayload>(event: DomainEvent, payload: T): void {
    logger.debug(
      { event, eventId: payload.eventId, schoolId: payload.schoolId },
      'Publishing domain event'
    );
    this.emit(event, payload);
  }

  public subscribe<T extends BaseDomainEventPayload>(
    event: DomainEvent,
    listener: (payload: T) => Promise<void> | void
  ): void {
    this.on(event, async (payload: T) => {
      try {
        await listener(payload);
      } catch (error) {
        logger.error(
          { err: error, event, eventId: payload.eventId },
          'Error executing domain event listener'
        );
      }
    });
  }
}

export const eventBus = new ApplicationEventBus();
export default eventBus;
