# Public API And Webhooks

Sonae includes tenant-scoped API keys, public run-trigger endpoints, public run-status lookup, and webhook delivery monitoring. These features are intended for governed integrations rather than everyday chat use.

## API Keys

Admins manage API keys from `/admin/settings/api-keys`. A key belongs to a company, has one or more scopes, can expire, and has a per-minute rate limit. Raw key secrets are shown once at creation time. After creation, Sonae stores only a digest and key prefix.

Available scopes are:

- `agent:run` for triggering governed agent runs
- `workflow:run` for triggering governed workflow executions
- `run:read` for reading public run status
- `webhook:deliver` reserved for callback delivery surfaces

API keys can be revoked with an optional reason. Revoked and expired keys stop authenticating immediately.

## Public Endpoints

Public API requests use bearer authentication:

```text
Authorization: Bearer sonae_...
```

Current public endpoints are:

- `GET /api/public/v1/ping`: validates a key with `run:read` and returns company, key prefix, scopes, and rate-limit information.
- `GET /api/public/v1/run-status?runId=...`: validates `run:read` and returns the status for a run that belongs to the key's company.
- `POST /api/public/v1/agent-runs`: validates `agent:run` and creates a public agent run from `agentId` and `objective`.
- `POST /api/public/v1/workflow-runs`: validates `workflow:run` and creates a public workflow execution from `workflowId` and optional `initialInput`.

Successful run-trigger requests return `202 Accepted`. Invalid JSON, missing required fields, inaccessible runs, revoked keys, missing scopes, expired keys, and rate-limited requests return structured JSON errors.

## Rate Limits And Audit Trail

Each key has a rate limit, defaulting to 60 requests per minute and capped at 600 requests per minute. Sonae counts recent authorized requests for that key before allowing another request. Public API authentication attempts are logged so operators can inspect allowed, denied, forbidden, and rate-limited usage.

API key creation and revocation are also recorded in audit logs.

## Webhook Deliveries

Webhook delivery monitoring lives at `/admin/settings/webhook-deliveries`. The page shows delivery volume, success rate, retrying count, failed/abandoned count, status filters, company filters, destination URLs, attempt counts, next retry windows, last HTTP status, last error, and delivery timestamps.

Delivery statuses are:

- `PENDING`
- `DELIVERING`
- `SUCCESS`
- `FAILED`
- `RETRY_SCHEDULED`
- `ABANDONED`

Payloads and responses are stored as previews rather than full raw bodies. This keeps the operational log useful without turning it into a long-term payload archive.

## Operating Guidance

Use narrow scopes and rotate keys deliberately. For production integrations:

- create a separate key per external system
- set only the scopes the system needs
- use an expiration when the integration is temporary
- keep the one-time secret in the external system's secret manager
- revoke keys instead of sharing or reusing them across environments
- monitor public request logs and webhook delivery status after launch

For webhook incidents, start with failed, abandoned, and retry-scheduled deliveries. Check the destination URL, last HTTP status, last error, attempt count, and next retry time before increasing integration volume.
