# Warehouse Management Backend

Node.js/Express REST API for warehouse master data, user access, inventory, stock movements, transfers, dashboard summaries, and operational reports.

## Architecture

- `src/app.js` configures security, CORS, request parsing, rate limits, logging, routes, and centralized 404/error handling.
- `src/server.js` validates runtime configuration, connects to MongoDB, starts HTTP, and performs graceful termination.
- `src/routes/` and `src/controllers/` define the HTTP layer; business rules live in `src/services/`.
- `src/models/` defines Mongoose models and database indexes.
- `src/config/`, `src/constants/`, `src/middleware/`, and `src/utils/` contain shared runtime and API foundations.
- `scripts/` contains the explicit administrator bootstrap and development-only seed scripts.
- `tests/` contains API, model, security-configuration, and transaction-dependent integration tests.
- `docs/openapi.yaml` is the OpenAPI 3.0.3 contract for Phases 1–7.

## Requirements

- Node.js 22 or newer
- npm
- MongoDB Atlas or another MongoDB replica set/sharded cluster for stock-changing and transfer-completion transactions

Standalone MongoDB may serve read and master-data operations, but stock operations and transfer completion return HTTP 503 rather than performing non-atomic writes.

## Installation

```sh
cd backend
npm ci
```

Copy `.env.example` to `.env` for local development, then replace every placeholder. Do not commit `.env`.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | Use `development` locally and `production` on the deployment platform. |
| `PORT` | HTTP listener port; defaults to `5000` locally. The platform-provided value is used in production. |
| `MONGODB_URI` | MongoDB connection string. Production must use a replica set/sharded deployment. Keep credentials private. |
| `MONGODB_TEST_URI` | Optional, tests only. Use a separate database whose name contains `test`; never point it at `MONGODB_URI`. |
| `JWT_ACCESS_SECRET` | Unique, cryptographically random access-token signing secret of at least 32 characters. |
| `JWT_REFRESH_SECRET` | A different unique, cryptographically random refresh-token signing secret of at least 32 characters. |
| `JWT_ACCESS_EXPIRES_IN` | Access-token lifetime, e.g. `15m`. |
| `JWT_REFRESH_EXPIRES_IN` | Refresh-token lifetime, e.g. `7d`. |
| `FRONTEND_URL` | Comma-separated exact frontend origins. Production values must be HTTPS origins without paths. |
| `ADMIN_FIRST_NAME`, `ADMIN_LAST_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Required only when running the initial-admin script; remove them from the deployment environment after bootstrap. |

Generate separate high-entropy secrets without printing or storing them in source control:

```sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Startup requires `NODE_ENV=development` or `NODE_ENV=production` explicitly and fails when JWT secrets are missing or identical. Production additionally rejects weak/placeholders, requires valid token lifetimes and HTTPS `FRONTEND_URL` origins, and fails if the database cannot be reached. CORS allows only exact configured browser origins; requests without an `Origin` header remain usable for health checks and server-to-server clients.

## Development and production

```sh
npm run dev
npm start
```

Production logs avoid request bodies, tokens, and database credentials. The server trusts one reverse proxy hop in production for correct client IP/rate-limit handling; this is intended for Render's proxy setup. The process handles `SIGINT`/`SIGTERM`, unhandled promise rejections, and uncaught exceptions with a bounded graceful shutdown.

## Testing and security checks

```sh
npm test
npm audit
npm audit --omit=dev
```

Tests use `MONGODB_TEST_URI` (default `mongodb://127.0.0.1:27017/warehouse_management_test`) and refuse a URI whose database name does not identify it as a test database or which targets the same MongoDB host and database as `MONGODB_URI`. Never point the test suite at production data.

The end-to-end acceptance and atomicity/concurrency tests require a transaction-capable replica set. They are explicitly skipped when the configured test MongoDB is standalone. This project has not been deployed or remotely health-checked as part of local verification.

## Initial administrator

Administrator creation is a deliberate, manual operation; application startup never seeds production records.

1. Provide `MONGODB_URI`, `ADMIN_FIRST_NAME`, `ADMIN_LAST_NAME`, `ADMIN_EMAIL`, and a unique strong `ADMIN_PASSWORD` to the operator's secure shell/deployment environment or a temporary secret store.
2. Run `npm run create:admin` once against the intended deployment database.
3. Remove the temporary `ADMIN_*` values from the environment.

The script refuses to create a bootstrap account if any administrator already exists. Use authenticated user-management endpoints to add further administrators. Do not put bootstrap passwords in documentation, tickets, or source control.

Development fixtures may be created explicitly with `npm run seed:dev`; the script requires `NODE_ENV=development`, a database name marked as development, and the supplied temporary administrator configuration.

## Health check and API documentation

```http
GET /api/v1/health
GET /api/v1/openapi.yaml
```

The health endpoint reports application and database status and returns HTTP 503 when MongoDB is unavailable, making it suitable as a readiness check. The OpenAPI YAML is public and describes API endpoints; business endpoints require authentication unless specifically documented otherwise.

## Deployment (Render example)

1. Create a Node web service from the backend directory; use Node 22+.
2. Set the build command to `npm ci` and the start command to `npm start`.
3. Configure `NODE_ENV=production`, `MONGODB_URI`, distinct high-entropy JWT secrets, token lifetimes, and exact HTTPS `FRONTEND_URL` origin(s). Render supplies `PORT`.
4. Use a MongoDB Atlas replica-set connection string, allow the Render service's egress to reach Atlas, and restrict Atlas network access to the deployment's approved network policy.
5. Set the platform health-check path to `/api/v1/health`. A healthy result requires a connected database.
6. Run the administrator bootstrap as a one-off secure operation, then remove its temporary environment values.
7. Confirm deployment health and database connectivity through the deployed health endpoint before directing frontend traffic.

This repository is prepared for deployment but no deployment is claimed as complete until the deployed health endpoint has been checked.

## Frontend integration

See [`../docs/FRONTEND_IMPLEMENTATION.md`](../docs/FRONTEND_IMPLEMENTATION.md) for the full integration contract and checklist. The OpenAPI reference is [`docs/openapi.yaml`](docs/openapi.yaml).

## Known limitations

- Transaction-dependent flows require MongoDB replica-set/sharded support; they intentionally fail closed with HTTP 503 otherwise.
- Access tokens are short-lived JWTs; logout revokes the refresh token, while an already-issued access token can remain usable until expiry unless the user is deactivated.
- The application supports one active refresh session per user because login removes prior refresh sessions.
- Reports are paginated and limited to 50 records per page; CSV export is not implemented.
- Integration tests run against a dedicated test database and transaction scenarios are skipped on standalone MongoDB.
- No deployment URL or shared test credentials are included. Accounts must be provisioned and credentials exchanged securely.
