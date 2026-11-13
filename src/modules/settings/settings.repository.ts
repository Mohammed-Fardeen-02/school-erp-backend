import { prisma } from '../../core/database/prisma-client';
import {
  TenantConfigurationDto,
  UpdateTenantConfigDto,
} from './settings.types';

// In-memory persistent configuration store keyed by organizationId
const configStore = new Map<string, TenantConfigurationDto>();

export class SettingsRepository {
  private get orgClient() {
    return (prisma as any).organization;
  }

  private getDefaultConfig(organizationId: string, orgName: string = 'School Institution', orgEmail: string = 'admin@school.edu'): TenantConfigurationDto {
    return {
      organizationId,
      smtp: {
        host: 'smtp.gmail.com',
        port: 587,
        security: 'STARTTLS',
        username: `notifications@${organizationId.substring(0, 8)}.edu`,
        isPasswordSet: false,
        fromAddress: orgEmail,
        fromName: orgName,
        replyTo: orgEmail,
        isActive: false,
        lastVerifiedAt: null,
        lastError: null,
      },
      storage: {
        provider: 'AWS_S3',
        bucket: `${organizationId.substring(0, 12)}-documents`,
        region: 'ap-south-1',
        endpointUrl: '',
        accessKeyId: '',
        isSecretSet: false,
        cdnCustomDomain: '',
        maxUploadSizeMb: 25,
        allowedExtensions: ['.pdf', '.jpg', '.png', '.docx', '.xlsx'],
        isActive: false,
        lastTestedAt: null,
      },
      razorpay: {
        isEnabled: false,
        mode: 'TEST',
        keyId: '',
        isSecretSet: false,
        webhookSecret: '',
        merchantDisplayName: `${orgName} Fees`,
        currency: 'INR',
        autoCapture: true,
        generateInvoicesOnSuccess: true,
        lastVerifiedAt: null,
      },
      theme: {
        institutionName: orgName,
        logoUrl: '',
        faviconUrl: '',
        primaryColor: '#2563eb',
        accentColor: '#f59e0b',
        tagline: 'Excellence in Holistic Education',
        emailSignature: `Best regards,\n${orgName} Administrative Office`,
        defaultTheme: 'SYSTEM',
      },
      updatedAt: new Date().toISOString(),
    };
  }

  async findByOrganizationId(organizationId: string): Promise<TenantConfigurationDto> {
    const existing = configStore.get(organizationId);

    // Fetch organization info from database to sync legal name, branding, etc.
    let org: any = null;
    try {
      if (organizationId !== 'platform-control') {
        org = await this.orgClient.findUnique({
          where: { id: organizationId },
          select: { displayName: true, email: true, logoUrl: true, brandColor: true },
        });
      }
    } catch {
      // Database read fallback
    }

    const orgName = org?.displayName || 'School Institution';
    const orgEmail = org?.email || 'admin@school.edu';

    if (!existing) {
      const initial = this.getDefaultConfig(organizationId, orgName, orgEmail);
      if (org?.logoUrl) initial.theme.logoUrl = org.logoUrl;
      if (org?.brandColor) initial.theme.primaryColor = org.brandColor;
      configStore.set(organizationId, initial);
      return initial;
    }

    if (org?.displayName && existing.theme.institutionName === 'School Institution') {
      existing.theme.institutionName = org.displayName;
    }
    if (org?.logoUrl && !existing.theme.logoUrl) {
      existing.theme.logoUrl = org.logoUrl;
    }
    if (org?.brandColor && existing.theme.primaryColor === '#2563eb') {
      existing.theme.primaryColor = org.brandColor;
    }

    return existing;
  }

  async updateByOrganizationId(
    organizationId: string,
    payload: UpdateTenantConfigDto
  ): Promise<TenantConfigurationDto> {
    const current = await this.findByOrganizationId(organizationId);

    const merged: TenantConfigurationDto = {
      ...current,
      smtp: {
        ...current.smtp,
        ...(payload.smtp || {}),
        password: payload.smtp?.password || current.smtp.password,
        isPasswordSet: Boolean(payload.smtp?.password || current.smtp.isPasswordSet),
      },
      storage: {
        ...current.storage,
        ...(payload.storage || {}),
        secretAccessKey: payload.storage?.secretAccessKey || current.storage.secretAccessKey,
        isSecretSet: Boolean(payload.storage?.secretAccessKey || current.storage.isSecretSet),
      },
      razorpay: {
        ...current.razorpay,
        ...(payload.razorpay || {}),
        keySecret: payload.razorpay?.keySecret || current.razorpay.keySecret,
        isSecretSet: Boolean(payload.razorpay?.keySecret || current.razorpay.isSecretSet),
      },
      theme: {
        ...current.theme,
        ...(payload.theme || {}),
      },
      updatedAt: new Date().toISOString(),
    };

    configStore.set(organizationId, merged);

    // Sync branding with database organization table if updated
    if (organizationId !== 'platform-control' && payload.theme) {
      try {
        const updateData: Record<string, any> = {};
        if (payload.theme.logoUrl !== undefined) updateData.logoUrl = payload.theme.logoUrl;
        if (payload.theme.primaryColor !== undefined) updateData.brandColor = payload.theme.primaryColor;

        if (Object.keys(updateData).length > 0) {
          await this.orgClient.update({
            where: { id: organizationId },
            data: updateData,
          });
        }
      } catch {
        // Safe fallback
      }
    }

    return merged;
  }
}

export const settingsRepository = new SettingsRepository();
