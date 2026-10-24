# Payment Gateway Integration (`src/integrations/payment-gateway/`)

Contains adapters for external financial payment gateways (e.g., Stripe, Paystack, Flutterwave, Razorpay).

## Architecture Rule

- Expose a unified `PaymentGateway` interface (e.g. `initializePayment`, `verifyWebhookSignature`, `verifyTransaction`).
- Encapsulate vendor webhooks, signature verification, and HTTP clients within this module.
- Business modules (`payments`, `fees`) consume this adapter interface and store transactional ledger records independently.
