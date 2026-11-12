import type { EmailTemplateId } from '../email.types';

export interface EmailTemplatePayloads {
  USER_INVITATION: {
    recipientName: string;
    inviterName: string;
    organizationName: string;
    roleName: string;
    campusName: string;
    acceptUrl: string;
    expiresInDays?: string | number;
    supportEmail?: string;
    primaryColor?: string;
  };
  ORG_WELCOME: {
    recipientName: string;
    organizationName: string;
    organizationCode: string;
    adminEmail: string;
    consoleUrl: string;
    supportEmail?: string;
    primaryColor?: string;
  };
  PASSWORD_RESET: {
    recipientName: string;
    organizationName: string;
    resetUrl: string;
    otpCode: string;
    expiresInMinutes?: string | number;
    ipAddress?: string;
    requestTime?: string;
    supportEmail?: string;
  };
  EMAIL_VERIFICATION: {
    recipientName: string;
    organizationName: string;
    verifyUrl: string;
    otpCode: string;
    expiresInMinutes?: string | number;
    supportEmail?: string;
    primaryColor?: string;
  };
}

export function renderUserInvitationEmail(data: EmailTemplatePayloads['USER_INVITATION']) {
  const color = data.primaryColor || '#2563eb';
  const expiresDays = data.expiresInDays || '7';
  const support = data.supportEmail || 'support@schoolerp.io';

  const subject = `You're invited to join ${data.organizationName} on School ERP`;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${subject}</title></head>
<body style="margin: 0; padding: 24px; background: #f8fafc; font-family: sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 14px; border: 1px solid #e2e8f0; overflow: hidden;">
    <div style="background: ${color}; padding: 28px 32px; color: #fff;">
      <h1 style="margin: 0; font-size: 20px;">Welcome to ${data.organizationName}</h1>
    </div>
    <div style="padding: 32px; color: #1e293b; font-size: 14px; line-height: 1.6;">
      <p>Hello <strong>${data.recipientName}</strong>,</p>
      <p><strong>${data.inviterName}</strong> has invited you to join <strong>${data.organizationName}</strong> on School ERP.</p>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin: 20px 0;">
        <div><strong>Assigned Role:</strong> ${data.roleName}</div>
        <div><strong>Campus Scope:</strong> ${data.campusName}</div>
        <div><strong>Valid For:</strong> ${expiresDays} days</div>
      </div>
      <div style="text-align: center; margin: 28px 0;">
        <a href="${data.acceptUrl}" style="background: ${color}; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: bold; display: inline-block;">
          Accept Invitation & Set Up Account
        </a>
      </div>
      <p style="font-size: 12px; color: #64748b;">Or copy this URL into your browser:<br><span style="font-family: monospace; color: #2563eb;">${data.acceptUrl}</span></p>
    </div>
    <div style="background: #f1f5f9; padding: 16px 32px; font-size: 11px; color: #94a3b8; text-align: center;">
      Questions? Contact <a href="mailto:${support}">${support}</a>
    </div>
  </div>
</body>
</html>`;

  const text = `Hello ${data.recipientName},

${data.inviterName} has invited you to join ${data.organizationName} on School ERP.

Assigned Role: ${data.roleName}
Campus: ${data.campusName}
Valid for: ${expiresDays} days

Accept invitation here:
${data.acceptUrl}

Questions? Contact ${support}`;

  return { subject, html, text };
}

export function renderOrgWelcomeEmail(data: EmailTemplatePayloads['ORG_WELCOME']) {
  const color = data.primaryColor || '#2563eb';
  const support = data.supportEmail || 'support@schoolerp.io';
  const subject = `Welcome to School ERP - ${data.organizationName} Workspace Ready`;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${subject}</title></head>
<body style="margin: 0; padding: 24px; background: #f8fafc; font-family: sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 14px; border: 1px solid #e2e8f0; overflow: hidden;">
    <div style="background: ${color}; padding: 28px 32px; color: #fff;">
      <h1 style="margin: 0; font-size: 20px;">Workspace Ready: ${data.organizationName}</h1>
    </div>
    <div style="padding: 32px; color: #1e293b; font-size: 14px; line-height: 1.6;">
      <p>Dear <strong>${data.recipientName}</strong>,</p>
      <p>Your institutional tenant workspace for <strong>${data.organizationName}</strong> is ready.</p>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin: 20px 0;">
        <div><strong>Organization Code:</strong> <code>${data.organizationCode}</code></div>
        <div><strong>Root Administrator:</strong> ${data.adminEmail}</div>
      </div>
      <div style="text-align: center; margin: 28px 0;">
        <a href="${data.consoleUrl}" style="background: ${color}; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: bold; display: inline-block;">
          Launch Administration Console
        </a>
      </div>
    </div>
    <div style="background: #f1f5f9; padding: 16px 32px; font-size: 11px; color: #94a3b8; text-align: center;">
      Support: <a href="mailto:${support}">${support}</a>
    </div>
  </div>
</body>
</html>`;

  const text = `Dear ${data.recipientName},

Your institutional workspace for ${data.organizationName} is ready.
Organization Code: ${data.organizationCode}
Admin Email: ${data.adminEmail}

Launch Administration Console:
${data.consoleUrl}`;

  return { subject, html, text };
}

export function renderPasswordResetEmail(data: EmailTemplatePayloads['PASSWORD_RESET']) {
  const subject = `Reset Your School ERP Password - Security Notice`;
  const minutes = data.expiresInMinutes || '15';

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${subject}</title></head>
<body style="margin: 0; padding: 24px; background: #f8fafc; font-family: sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 14px; border: 1px solid #e2e8f0; overflow: hidden;">
    <div style="background: #dc2626; padding: 28px 32px; color: #fff;">
      <h1 style="margin: 0; font-size: 20px;">Security Notice: Password Reset</h1>
    </div>
    <div style="padding: 32px; color: #1e293b; font-size: 14px; line-height: 1.6;">
      <p>Hello <strong>${data.recipientName}</strong>,</p>
      <p>We received a password reset request for your <strong>${data.organizationName}</strong> account.</p>
      <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
        <div style="font-size: 12px; color: #991b1b; font-weight: bold;">VERIFICATION CODE</div>
        <div style="font-size: 28px; font-weight: bold; color: #dc2626; letter-spacing: 4px; margin-top: 4px;">${data.otpCode}</div>
        <div style="font-size: 11px; color: #b91c1c; margin-top: 4px;">Expires in ${minutes} minutes</div>
      </div>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${data.resetUrl}" style="background: #dc2626; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: bold; display: inline-block;">
          Reset Password Directly
        </a>
      </div>
    </div>
  </div>
</body>
</html>`;

  const text = `Hello ${data.recipientName},

Verification Code to reset password for ${data.organizationName}:
${data.otpCode} (Expires in ${minutes} minutes)

Or reset via:
${data.resetUrl}`;

  return { subject, html, text };
}

export function renderEmailTemplateById<K extends EmailTemplateId>(
  templateId: K,
  payload: EmailTemplatePayloads[K]
) {
  switch (templateId) {
    case 'USER_INVITATION':
      return renderUserInvitationEmail(payload as EmailTemplatePayloads['USER_INVITATION']);
    case 'ORG_WELCOME':
      return renderOrgWelcomeEmail(payload as EmailTemplatePayloads['ORG_WELCOME']);
    case 'PASSWORD_RESET':
      return renderPasswordResetEmail(payload as EmailTemplatePayloads['PASSWORD_RESET']);
    case 'EMAIL_VERIFICATION':
      return {
        subject: `Verify Your Email Address`,
        html: `<p>Verification code: ${(payload as any).otpCode}</p>`,
        text: `Verification code: ${(payload as any).otpCode}`,
      };
    default:
      throw new Error(`Unknown email template: ${templateId}`);
  }
}
