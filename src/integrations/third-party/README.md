# Third-Party Integrations (`src/integrations/third-party/`)

Contains adapters for miscellaneous third-party external services (e.g. government educational databases, biometric device APIs, WhatsApp Business API).

## Architecture Rule

- Wrap each third-party external API behind a strongly-typed client adapter.
- Handle circuit breaking, retries, and rate limits within the adapter.
