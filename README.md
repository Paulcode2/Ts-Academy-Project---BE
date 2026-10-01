# Warehouse Management Backend

A backend foundation for a warehouse management application built with Node.js, Express.js, MongoDB, and Mongoose.

## Project purpose

This service provides a REST API foundation for future warehouse-management features such as warehouses, storage locations, inventory tracking, stock movement workflows, and stock transfer operations.

## Requirements

- Node.js 18 or newer
- MongoDB replica set or sharded cluster (required for transactional stock operations)
- MongoDB URI
- npm

For local stock-operation development, configure MongoDB as a single-node replica set and include its replica-set name in `MONGODB_URI`. A standalone `mongod` can serve reads but cannot perform stock-changing transactions.

## Installation

```bash
cd backend
npm install
```

## Environment configuration

Create a `.env` file from `.env.example` and update the values for your local environment:

```bash
cp .env.example .env
```

Required environment variables:

- `NODE_ENV`
- `PORT`
- `MONGODB_URI`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `JWT_ACCESS_EXPIRES_IN`
- `JWT_REFRESH_EXPIRES_IN`
- `FRONTEND_URL`

## Development command

```bash
npm run dev
```

## Production start command

```bash
npm start
```

## Health-check endpoint

```http
GET /api/v1/health
```

Example response:

```json
{
  "success": true,
  "message": "Health check passed",
  "environment": "development",
  "serverStatus": "running",
  "databaseStatus": "disconnected",
  "timestamp": "2026-09-30T00:00:00.000Z"
}
```

## Folder structure

```text
backend/
├── src/
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── validators/
│   ├── utils/
│   ├── app.js
│   └── server.js
├── tests/
├── scripts/
├── .env
├── .env.example
├── .gitignore
├── package.json
├── README.md
└── docs/
```

## Notes

The API currently includes authentication and user administration, master-data endpoints, inventory queries, stock-in/out/adjustment operations, and stock-movement history. Stock-changing requests use MongoDB transactions and require a replica set or sharded cluster. Standalone MongoDB instances can serve read and master-data requests, but stock-changing operations return HTTP 503 rather than falling back to non-atomic writes. Transfer workflows are not implemented yet.
