# SMS Integration (`src/integrations/sms/`)

Contains adapters and client wrappers for external SMS service providers (e.g., Twilio, Termii, Infobip).

## Architecture Rule

- Expose an `SmsService` interface to the application.
- Encapsulate SMS vendor credentials and client instances in this directory.
- Domain modules (e.g. notifications, attendance alerts) must never import vendor-specific SDKs directly.
