# Email Integration (`src/integrations/email/`)

Contains adapters and client wrappers for external email transmission services (e.g., SendGrid, AWS SES, SMTP, Resend).

## Architecture Rule

- Expose an `EmailService` interface to the application.
- Encapsulate vendor SDKs (e.g. AWS SDK or SendGrid client) inside this directory.
- Business modules must interact with email delivery only via the abstract service interface or domain events.
