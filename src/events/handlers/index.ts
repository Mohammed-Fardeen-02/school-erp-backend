import { registerOrganizationEventHandlers } from './organization-event.handler';

export function initializeEventHandlers(): void {
  registerOrganizationEventHandlers();
}

export * from './organization-event.handler';

