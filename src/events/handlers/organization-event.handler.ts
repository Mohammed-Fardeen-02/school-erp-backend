import { eventBus } from '../event-bus';
import { DomainEvent, OrganizationProvisionedEventPayload } from '../event-types';
import { getTenantProvisioningQueue } from '../../jobs/queues';
import { logger } from '../../core/logger/app-logger';

export function registerOrganizationEventHandlers(): void {
  eventBus.subscribe<OrganizationProvisionedEventPayload>(
    DomainEvent.ORGANIZATION_PROVISIONED,
    async (payload) => {
      logger.info(
        { organizationId: payload.organizationId, code: payload.code },
        '[EventHandler] Handling ORGANIZATION_PROVISIONED event'
      );

      try {
        const queue = getTenantProvisioningQueue();
        await queue.add('provision-tenant-setup', {
          organizationId: payload.organizationId,
          organizationCode: payload.code,
          adminEmail: payload.adminEmail,
        });
      } catch (err) {
        logger.warn(
          { err, organizationId: payload.organizationId },
          '[EventHandler] Could not enqueue provisioning background job (Redis offline)'
        );
      }
    }
  );
}

