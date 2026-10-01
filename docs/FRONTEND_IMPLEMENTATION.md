# Frontend Implementation Notes

## Phase 1 Backend Setup

- Completion date: 2026-09-30
- Change summary: Established the initial Express backend foundation, configured middleware, database connectivity, health-check endpoints, request/response conventions, environment configuration, and backend documentation for the first MVP phase.

## Backend base URL pattern

Use the local URL for development and the deployed URL for production:

```text
Development: http://localhost:5000/api/v1
Production:  https://warehouse-management-backend-tqc9.onrender.com/api/v1
```

Use the backend server URL plus `/api/v1` for all API calls. Configure the frontend's `REACT_APP_API_URL` with the appropriate base URL for its environment.

## API version prefix

All backend routes are prefixed with `/api/v1`.

## Health-check endpoint

```http
GET /api/v1/health
```

## Standard success response

```json
{
  "success": true,
  "message": "Request completed successfully",
  "data": {}
}
```

## Standard error response

```json
{
  "success": false,
  "message": "Something went wrong",
  "data": null
}
```

## Expected Content-Type

API requests and JSON responses should be sent using `Content-Type: application/json`.

## CORS expectations

The backend will accept requests from the configured frontend origin using the `FRONTEND_URL` environment variable. Requests from any other origin are rejected.

## Environment variable for the frontend API URL

Configure the frontend's `REACT_APP_API_URL` environment variable with the backend base URL for the target environment. For production, use `https://warehouse-management-backend-tqc9.onrender.com/api/v1`.

## Phase 1 historical scope note (superseded)

This section records the original Phase 1 scope only; it is not a statement of current availability. Later phases supersede the original exclusions:

- Phase 3 added JWT authentication, user management, and authorization.
- Phase 4 added warehouse, location, category, and product APIs.
- Phase 5 added inventory queries and stock-movement operations.
- Phase 6 added stock-transfer workflows.
- Phase 7 added dashboard summaries, operational reports, and OpenAPI documentation.

## Historical Phase 1 note

The Phase 1 section above describes the baseline as originally delivered. The current endpoint inventory and behavior are defined by the phase sections below and the canonical [OpenAPI document](../backend/docs/openapi.yaml), served at `GET /api/v1/openapi.yaml`.

## Phase 2 Data Contracts

- Completion date: 2026-09-30
- Change summary: Added the shared backend model contracts and validation patterns for users, warehouses, locations, categories, products, inventory, stock movements, transfers, and token sessions. These contracts define field shapes, enum values, timestamps, and pagination behavior for future frontend forms and TypeScript models.

### Role values

```json
["ADMIN", "MANAGER", "STAFF"]
```

### Product-unit expectations

```json
["EA", "BOX", "CASE", "PALLET", "KG", "L", "SET", "BUNDLE"]
```

### Warehouse fields

```json
{
  "_id": "ObjectId",
  "name": "string",
  "code": "string",
  "address": {
    "street": "string",
    "city": "string",
    "state": "string",
    "postalCode": "string",
    "country": "string"
  },
  "description": "string",
  "manager": "ObjectId | null",
  "isActive": true,
  "createdBy": "ObjectId | null",
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

### Location fields

```json
{
  "_id": "ObjectId",
  "name": "string",
  "code": "string",
  "warehouse": "ObjectId",
  "type": "STORAGE | PICKING | RECEIVING | QUARANTINE | RETURN | COLD_STORAGE",
  "description": "string",
  "isActive": true,
  "createdBy": "ObjectId | null",
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

### Category fields

```json
{
  "_id": "ObjectId",
  "name": "string",
  "description": "string",
  "isActive": true,
  "createdBy": "ObjectId | null",
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

### Product fields

```json
{
  "_id": "ObjectId",
  "name": "string",
  "sku": "string",
  "category": "ObjectId",
  "unit": "EA | BOX | CASE | PALLET | KG | L | SET | BUNDLE",
  "description": "string",
  "minimumStockLevel": 0,
  "isActive": true,
  "createdBy": "ObjectId | null",
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

### Inventory response fields

```json
{
  "_id": "ObjectId",
  "product": "ObjectId",
  "warehouse": "ObjectId",
  "location": "ObjectId",
  "quantity": 0,
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

### Stock-movement type values

```json
[
  "STOCK_IN",
  "STOCK_OUT",
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT",
  "TRANSFER_IN",
  "TRANSFER_OUT"
]
```

### Transfer-status values

```json
["PENDING", "APPROVED", "COMPLETED", "REJECTED", "CANCELLED"]
```

### Timestamp format

All timestamps are returned in ISO-8601 format, for example:

```text
2026-09-30T12:00:00.000Z
```

### ID format

All MongoDB document IDs are represented as valid Mongo ObjectId strings.

### Pagination structure

```json
{
  "success": true,
  "message": "Records retrieved successfully",
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalItems": 0,
    "totalPages": 0
  }
}
```

### Standard validation-error structure

```json
{
  "success": false,
  "message": "Validation failed",
  "data": null,
  "details": {
    "fieldName": "Validation message"
  }
}
```

> These contracts are the backend data definitions that the frontend should use when building forms, tables, filters, and TypeScript interfaces for future warehouse-management features.

## Phase 3 Authentication and Authorization

- Completion date: 2026-09-30
- Change summary: Added JWT-based login, refresh-token rotation, password changes, active-user enforcement, and role-based admin authorization for internal staff workflows. All private routes are protected at the backend layer.

### Authentication flow

The frontend should treat the backend as a secure session API with an access token and a refresh token.

1. Log in with email and password.
2. Store the access token in memory or a short-lived client state.
3. Use the access token in the `Authorization: Bearer <token>` header for all protected requests.
4. Keep the refresh token only in an HTTP-only cookie from the backend and do not expose it to browser JavaScript.

### Login endpoint

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "operator@example.invalid",
  "password": "<provided-through-approved-secret-manager>"
}
```

Successful response example:

```json
{
  "success": true,
  "message": "Login successful.",
  "data": {
    "accessToken": "jwt-token",
    "user": {
      "_id": "ObjectId",
      "firstName": "System",
      "lastName": "Administrator",
      "email": "operator@example.invalid",
      "role": "ADMIN",
      "assignedWarehouses": [],
      "isActive": true
    }
  }
}
```

The server also sets a cookie named `refreshToken` with `httpOnly`, `sameSite: lax`, and a secure-environment-compatible policy.

### Refresh token endpoint

```http
POST /api/v1/auth/refresh
```

- Reads the refresh token from the `refreshToken` cookie.
- Rotates the refresh token on success.
- Returns a fresh access token and replaces the cookie.
- Rejects invalid, expired, or revoked sessions with a 401 response.

### Current-user endpoint

```http
GET /api/v1/auth/me
Authorization: Bearer <access-token>
```

Returns the authenticated user without exposing the password field.

### Change-password endpoint

```http
PATCH /api/v1/auth/change-password
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "currentPassword": "OldPassword123!",
  "newPassword": "NewPassword456!"
}
```

This endpoint invalidates all existing refresh sessions for the user after a successful password change.

### Logout endpoint

```http
POST /api/v1/auth/logout
```

- Uses the refresh cookie to identify the active session.
- Revokes the refresh token and clears the client cookie.
- Requires no frontend secret or token disclosure.

### Authorization model

The backend enforces roles at the route level. Supported values are:

```json
["ADMIN", "MANAGER", "STAFF"]
```

#### Permission table

| Route group                         | Requires auth | Requires active user | Allowed roles                                     |
| ----------------------------------- | ------------- | -------------------- | ------------------------------------------------- |
| `/api/v1/auth/*`                    | Yes           | Yes                  | All authenticated users                           |
| `/api/v1/users`                     | Yes           | Yes                  | ADMIN only                                        |
| Warehouse and operational endpoints | Yes           | Yes                  | ADMIN, MANAGER, STAFF depending on business rules |

### Internal user-management endpoints

The following admin-only routes are available to authenticated administrators:

```http
GET /api/v1/users
POST /api/v1/users
GET /api/v1/users/:id
PATCH /api/v1/users/:id
PATCH /api/v1/users/:id/role
PATCH /api/v1/users/:id/warehouses
PATCH /api/v1/users/:id/activate
PATCH /api/v1/users/:id/deactivate
PATCH /api/v1/users/:id/reset-password
```

These routes are protected server-side and must never be trusted to the browser alone. Frontend code must respect the backend authorization boundaries.

### Frontend expectations

- Do not create a public self-registration endpoint for users.
- Keep access-token handling in memory and refresh-token handling in secure cookies.
- Always include the bearer token on protected requests.
- Handle 401 responses by redirecting to login or refreshing the session.
- Show 403 responses as permission errors for non-admin or non-authorized actions.
- Do not store password values in local storage or browser state.

> Phase 3 completes the secure backend auth foundation for internal warehouse operations. Future phases may build UI flows on top of these rules, but the backend remains the final source of truth for access control.

## Phase 4 Master Data Integration

- Completion date: 2026-09-30
- Change summary: Added authenticated warehouse, location, category, and product master-data APIs with role checks, warehouse scoping, searchable/filterable pagination, audit fields, and non-destructive status changes.

### Access and response conventions

Every endpoint in this section requires `Authorization: Bearer <access-token>` and an active user account. Read endpoints are available to all authenticated roles unless their row says otherwise. Mutation permissions are enforced by the backend.

Successful single-record responses use this envelope:

```json
{
  "success": true,
  "message": "Record retrieved successfully.",
  "data": {}
}
```

Successful list responses include pagination metadata:

```json
{
  "success": true,
  "message": "Records retrieved successfully",
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalItems": 0,
    "totalPages": 0
  }
}
```

Validation errors return HTTP 400 with `success: false`, `data: null`, and field details where available. Duplicate codes, SKUs, or category names return HTTP 409. Missing records return 404; unauthorized roles or warehouse scope return 403.

### Shared list behavior

- `page`: 1-based, defaults to `1` when invalid.
- `limit`: defaults to `20`, maximum `50`.
- `search`: case-insensitive contains search; regular-expression characters are treated literally.
- `status`: `active`, `inactive`, or `all`; omitted means both statuses.
- `isActive`: accepted as a boolean-string alternative to `status`.
- Sorting defaults to `createdAt` descending. `sortOrder` is `asc` or `desc`; unsupported `sortBy` fields and sort directions return 400.
- List endpoints return `data` and `pagination`; detail and mutation endpoints return the resource in `data`.
- Records are deactivated through their status endpoint. No DELETE endpoint is provided; timestamps and audit IDs remain available, and related historical inventory is not deleted.

### Warehouse API

Warehouse fields are `_id`, `name`, `code`, `address` (`street`, `city`, optional `state` and `postalCode`, `country`), optional `description`, optional `manager` user ID, `isActive`, optional `createdBy`/`updatedBy` user IDs, and `createdAt`/`updatedAt` timestamps. Codes are trimmed and stored uppercase. An assigned manager must be an active `MANAGER` user.

| Method and URL                                 | Required role          | Query parameters                                                                                                             | Request body                                                 | Success response                     | Validation and access errors                                                                       |
| ---------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `POST /api/v1/warehouses`                      | ADMIN                  | None                                                                                                                         | `name`, `code`, `address`; optional `description`, `manager` | 201; `data` is the created warehouse | 400 for missing/invalid fields or manager; 409 for duplicate code                                  |
| `GET /api/v1/warehouses`                       | Any authenticated role | `search` (name/code), `status`/`isActive`, `page`, `limit`, `sortBy` (`name`, `code`, `createdAt`, `updatedAt`), `sortOrder` | None                                                         | 200; paginated warehouse records     | 400 for invalid filters/sort; MANAGER/STAFF see only assigned warehouses or warehouses they manage |
| `GET /api/v1/warehouses/:warehouseId`          | Any authenticated role | None                                                                                                                         | None                                                         | 200; `data` is the warehouse         | 400 for invalid ID; 404 if missing; 403 outside permitted warehouse scope                          |
| `PATCH /api/v1/warehouses/:warehouseId`        | ADMIN                  | None                                                                                                                         | Any of `name`, `code`, `address`, `description`, `manager`   | 200; `data` is the updated warehouse | 400 for invalid values; 404 if missing; 409 for duplicate code                                     |
| `PATCH /api/v1/warehouses/:warehouseId/status` | ADMIN                  | None                                                                                                                         | `{"isActive": false}` or `{"isActive": true}`                | 200; `data` is the updated warehouse | 400 unless `isActive` is boolean; 404 if missing                                                   |

Create request example:

```json
{
  "name": "North Distribution Center",
  "code": "NORTH-01",
  "address": {
    "street": "10 Example Road",
    "city": "Nairobi",
    "state": "Nairobi County",
    "postalCode": "00100",
    "country": "Kenya"
  },
  "description": "Regional distribution facility",
  "manager": "507f1f77bcf86cd799439011"
}
```

### Location API

Location fields are `_id`, `name`, `code`, required `warehouse` ID, `type`, optional `description`, `isActive`, optional `createdBy`/`updatedBy` IDs, and timestamps. Codes are trimmed and stored uppercase; they must be unique within one warehouse. The same code may be reused in a different warehouse. Supported types are:

```json
["STORAGE", "PICKING", "RECEIVING", "QUARANTINE", "RETURN", "COLD_STORAGE"]
```

| Method and URL                               | Required role                            | Query parameters                                                                                                                                    | Request body                                                   | Success response                    | Validation and access errors                                                                                                                                                  |
| -------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/locations`                     | ADMIN; MANAGER for a permitted warehouse | None                                                                                                                                                | `name`, `code`, `warehouse`, optional `type` and `description` | 201; `data` is the created location | 400 for invalid fields or inactive warehouse; 404 for missing warehouse; 403 if manager lacks warehouse access; 409 for duplicate code within warehouse                       |
| `GET /api/v1/locations`                      | Any authenticated role                   | `warehouseId`, `type`, `search` (name/code), `status`/`isActive`, `page`, `limit`, `sortBy` (`name`, `code`, `createdAt`, `updatedAt`), `sortOrder` | None                                                           | 200; paginated location records     | 400 for invalid warehouse/type/filter/sort; MANAGER/STAFF see only locations in permitted warehouses                                                                          |
| `GET /api/v1/locations/:locationId`          | Any authenticated role                   | None                                                                                                                                                | None                                                           | 200; `data` is the location         | 400 for invalid ID; 404 if missing; 403 outside permitted warehouse scope                                                                                                     |
| `PATCH /api/v1/locations/:locationId`        | ADMIN; MANAGER for a permitted warehouse | None                                                                                                                                                | Any of `name`, `code`, `warehouse`, `type`, `description`      | 200; `data` is the updated location | 400 for invalid fields or inactive target warehouse; 404 if missing; 403 unless manager can access the current and target warehouses; 409 for duplicate code within warehouse |
| `PATCH /api/v1/locations/:locationId/status` | ADMIN; MANAGER for a permitted warehouse | None                                                                                                                                                | `{"isActive": false}` or `{"isActive": true}`                  | 200; `data` is the updated location | 400 for non-boolean status or reactivation under an inactive warehouse; 404 if missing; 403 outside permitted warehouse scope                                                 |

Create request example:

```json
{
  "name": "Aisle 4 Shelf B",
  "code": "A4-B",
  "warehouse": "507f1f77bcf86cd799439011",
  "type": "STORAGE",
  "description": "Bulk storage shelving"
}
```

### Category API

Category fields are `_id`, `name`, optional `description`, `isActive`, optional `createdBy`/`updatedBy` IDs, and timestamps. Names are unique without regard to letter case.

| Method and URL                                | Required role          | Query parameters                                                                                                            | Request body                                  | Success response                    | Validation and access errors                                                       |
| --------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------- |
| `POST /api/v1/categories`                     | ADMIN, MANAGER         | None                                                                                                                        | `name`; optional `description`                | 201; `data` is the created category | 400 for missing/invalid fields; 409 for duplicate name, case-insensitively         |
| `GET /api/v1/categories`                      | Any authenticated role | `search` (name/description), `status`/`isActive`, `page`, `limit`, `sortBy` (`name`, `createdAt`, `updatedAt`), `sortOrder` | None                                          | 200; paginated category records     | 400 for invalid status/sort                                                        |
| `GET /api/v1/categories/:categoryId`          | Any authenticated role | None                                                                                                                        | None                                          | 200; `data` is the category         | 400 for invalid ID; 404 if missing                                                 |
| `PATCH /api/v1/categories/:categoryId`        | ADMIN, MANAGER         | None                                                                                                                        | Any of `name`, `description`                  | 200; `data` is the updated category | 400 for invalid fields; 404 if missing; 409 for duplicate name, case-insensitively |
| `PATCH /api/v1/categories/:categoryId/status` | ADMIN, MANAGER         | None                                                                                                                        | `{"isActive": false}` or `{"isActive": true}` | 200; `data` is the updated category | 400 unless `isActive` is boolean; 404 if missing                                   |

Create request example:

```json
{
  "name": "Safety Equipment",
  "description": "Protective equipment and supplies"
}
```

Deactivating a category prevents it from being selected for new product creation or category changes. Existing active products are not automatically deactivated.

### Product API

Product fields are `_id`, `name`, `sku`, required `category` ID, `unit`, optional `description`, non-negative `minimumStockLevel` (defaults to `0`), `isActive`, optional `createdBy`/`updatedBy` IDs, and timestamps. SKUs are trimmed and stored uppercase. Supported units are:

```json
["EA", "BOX", "CASE", "PALLET", "KG", "L", "SET", "BUNDLE"]
```

| Method and URL                             | Required role          | Query parameters                                                                                                                                                    | Request body                                                                              | Success response                   | Validation and access errors                                                                                        |
| ------------------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/products`                    | ADMIN, MANAGER         | None                                                                                                                                                                | Required: `name`, `sku`, `category`, `unit`; optional: `description`, `minimumStockLevel` | 201; `data` is the created product | 400 for missing/invalid fields, negative minimum level, or missing/inactive category; 409 for duplicate SKU         |
| `GET /api/v1/products`                     | Any authenticated role | `search` (name/SKU), `category`, `unit`, `status`/`isActive`, `page`, `limit`, `sortBy` (`name`, `sku`, `createdAt`, `updatedAt`, `minimumStockLevel`), `sortOrder` | None                                                                                      | 200; paginated product records     | 400 for invalid category ID, unit, status, or sort                                                                  |
| `GET /api/v1/products/:productId`          | Any authenticated role | None                                                                                                                                                                | None                                                                                      | 200; `data` is the product         | 400 for invalid ID; 404 if missing                                                                                  |
| `PATCH /api/v1/products/:productId`        | ADMIN, MANAGER         | None                                                                                                                                                                | Any of `name`, `sku`, `category`, `unit`, `description`, `minimumStockLevel`              | 200; `data` is the updated product | 400 for invalid fields, negative minimum level, or missing/inactive category; 404 if missing; 409 for duplicate SKU |
| `PATCH /api/v1/products/:productId/status` | ADMIN, MANAGER         | None                                                                                                                                                                | `{"isActive": false}` or `{"isActive": true}`                                             | 200; `data` is the updated product | 400 unless `isActive` is boolean; reactivation requires an active category; 404 if missing                          |

Create request example:

```json
{
  "name": "Protective Gloves",
  "sku": "PPE-GLV-001",
  "category": "507f1f77bcf86cd799439011",
  "unit": "EA",
  "description": "Reusable warehouse gloves",
  "minimumStockLevel": 12
}
```

### Status, dropdowns, and selection rules

- Status changes update `isActive`, `updatedAt`, and `updatedBy`; they do not delete records or related historical inventory.
- Inactive warehouses cannot receive new locations. Inactive locations, warehouses, and products are rejected by model validation for new inventory, stock movement, and transfer records.
- A location selector must include only active locations whose warehouse is active and permitted to the signed-in user.
- A warehouse selector must include only active warehouses permitted to the signed-in user. MANAGER/STAFF access is based on `assignedWarehouses` or the warehouse’s manager assignment.
- A category selector used to create or recategorize a product must include only active categories.
- A product selector for new stock operations must exclude inactive products. An already-active product remains active if its category is later deactivated.
- Admin/master-data screens may request `status=inactive` or `status=all` to review and reactivate records; operational selection controls should use active records only.

### Validation examples

Duplicate warehouse code response:

```json
{
  "success": false,
  "message": "A record with the same code already exists.",
  "data": null
}
```

Invalid field response:

```json
{
  "success": false,
  "message": "Validation failed",
  "data": null,
  "details": {
    "minimumStockLevel": "minimumStockLevel must be non-negative."
  }
}
```

## Phase 5 Inventory Integration

- Completion date: 2026-10-01
- Change summary: Added warehouse-scoped inventory and movement-history queries, transactional stock-in/out/adjustment operations, and 24-hour idempotency-key replay protection.

All endpoints below require an authenticated, active user. The backend checks warehouse access for every inventory and movement result. ADMIN can access every warehouse; MANAGER and STAFF can access warehouses assigned to them or managed by them. No endpoint is provided to directly patch or delete inventory quantities or movement records.

### Inventory endpoints

| Method and URL | Access | Query parameters | Success |
| --- | --- | --- | --- |
| `GET /api/v1/inventory` | Any authenticated role, scoped by warehouse | `search` (product name/SKU), `product`, `warehouse`, `location`, `category`, `stockStatus`, `page`, `limit`, `sort` | 200 paginated inventory records |
| `GET /api/v1/inventory/:inventoryId` | Any authenticated role with access to its warehouse | None | 200 inventory record |
| `GET /api/v1/inventory/low-stock` | Any authenticated role, scoped by warehouse | Same filters and pagination as list (status is fixed to low stock) | 200 paginated low-stock records |
| `GET /api/v1/inventory/out-of-stock` | Any authenticated role, scoped by warehouse | Same filters and pagination as list (status is fixed to out of stock) | 200 paginated out-of-stock records |

`stockStatus` accepts `IN_STOCK`, `LOW_STOCK`, or `OUT_OF_STOCK`. Low stock means quantity is greater than zero and less than or equal to the product's minimum stock level. Out of stock means quantity is zero or less (inventory writes prevent a negative quantity). Sort accepts `updatedAt`, `quantity`, `productName`, `sku`, or `createdAt`; prefix a field with `-` for descending order. The default is `-updatedAt`. Pagination defaults to page `1`, limit `20`, and caps limit at `50`.

Each inventory row includes `id`, `quantity`, `minimumStockLevel`, `stockStatus`, `updatedAt`, and compact populated `product` (`id`, `name`, `sku`, `unit`), `category` (`id`, `name`), `warehouse` (`id`, `name`, `code`), and `location` (`id`, `name`, `code`) objects. The list response uses the shared pagination envelope:

```json
{
  "success": true,
  "message": "Records retrieved successfully",
  "data": [
    {
      "id": "507f1f77bcf86cd799439011",
      "quantity": 3,
      "minimumStockLevel": 5,
      "stockStatus": "LOW_STOCK",
      "updatedAt": "2026-10-01T00:00:00.000Z",
      "product": {
        "id": "507f1f77bcf86cd799439012",
        "name": "Protective Gloves",
        "sku": "PPE-GLV-001",
        "unit": "EA"
      },
      "category": { "id": "507f1f77bcf86cd799439013", "name": "Safety" },
      "warehouse": { "id": "507f1f77bcf86cd799439014", "name": "North DC", "code": "NORTH-01" },
      "location": { "id": "507f1f77bcf86cd799439015", "name": "Shelf A", "code": "A-01" }
    }
  ],
  "pagination": { "page": 1, "limit": 20, "totalItems": 1, "totalPages": 1 }
}
```

### Stock operations

All stock operation requests must include an `Idempotency-Key` header containing 8-128 characters. The backend CORS configuration permits this header. Keys are scoped to the authenticated user and retained for 24 hours. Repeating the same request with the same key returns the original result and sets `data.replayed` to `true`; reusing the key with different request content returns HTTP 409. The frontend should generate a fresh key for each intentional operation and reuse it only when retrying that same submission.

| Method and URL | Access | Request body | Success |
| --- | --- | --- | --- |
| `POST /api/v1/stock-movements/stock-in` | Any authenticated role with warehouse access | `productId`, `warehouseId`, `locationId`, positive `quantity`, required `reason`; optional `reference`, `notes` | 201 with updated inventory and movement summary |
| `POST /api/v1/stock-movements/stock-out` | Any authenticated role with warehouse access | Same as stock-in | 201 with updated inventory and movement summary |
| `POST /api/v1/stock-movements/adjust` | ADMIN or MANAGER with warehouse access | `productId`, `warehouseId`, `locationId`, non-negative `newQuantity`, required `reason`; optional `reference`, `notes` | 201 with updated inventory and movement summary |

Stock-in example:

```http
POST /api/v1/stock-movements/stock-in
Authorization: Bearer <access-token>
Idempotency-Key: stock-in-7f31e282-a4ab
Content-Type: application/json
```

```json
{
  "productId": "507f1f77bcf86cd799439012",
  "warehouseId": "507f1f77bcf86cd799439014",
  "locationId": "507f1f77bcf86cd799439015",
  "quantity": 12,
  "reason": "Supplier delivery",
  "reference": "PO-2026-1042",
  "notes": "Received in good condition"
}
```

The response `data` contains an `inventory` summary (`id`, product/warehouse/location IDs, quantity, updatedAt) and a `movement` summary (`id`, `movementType`, quantity, `previousQuantity`, `newQuantity`, reason, reference, performedBy, createdAt). Stock-in and stock-out movements use the operation quantity. Adjustment movement quantity is the absolute difference between old and new quantities. Adjustment movement type is selected by the backend and is never accepted from the client.

Stock movement types are `STOCK_IN`, `STOCK_OUT`, `ADJUSTMENT_IN`, `ADJUSTMENT_OUT`, `TRANSFER_IN`, and `TRANSFER_OUT`. Phase 5 creates only the first four; transfer types are reserved for the transfer workflow.

### Movement history

| Method and URL | Access | Query parameters | Success |
| --- | --- | --- | --- |
| `GET /api/v1/stock-movements` | Any authenticated role, scoped by warehouse | `product`, `warehouse`, `location`, `type`, `user`, `reference`, `startDate`, `endDate`, `page`, `limit`, `sort` | 200 paginated immutable movement history |
| `GET /api/v1/stock-movements/:movementId` | Any authenticated role with access to its warehouse | None | 200 movement record |

`type` accepts the movement-type values above. `startDate` and `endDate` must be valid dates, and endDate cannot precede startDate. `sort` accepts `createdAt`, `quantity`, or `movementType`, optionally prefixed with `-`; default is `-createdAt`. Movement records preserve previous and new quantities, reason, optional operational reference/notes, and the authenticated `performedBy` user. No edit or delete endpoint exists.

### Errors and operational behavior

- Invalid IDs, missing/invalid fields, zero or negative stock-in/out quantity, negative adjustment quantity, equal adjustment quantity, or invalid date/status/sort parameters return HTTP 400 using the shared `success: false`, `data: null` error shape.
- Excess stock-out returns HTTP 409 with message `Insufficient stock.`; `details` includes available and requested quantities.
- Missing/inactive product, warehouse, or location returns 404. A location outside the selected warehouse returns 400.
- A user outside the warehouse's assigned/managed scope receives HTTP 403.
- Reusing an idempotency key with different content returns HTTP 409.
- MongoDB transactions require a replica set or sharded cluster. On deployments without transaction support, stock operations fail with HTTP 503; the backend never falls back to a non-atomic quantity update.
- The frontend should disable the submitted action while a request is pending, preserve the idempotency key for network retries, then refresh the affected inventory and movement list after success. On a retry response, show the original successful result rather than submitting a second operation.
- The frontend must never directly modify inventory quantity. All quantity changes must use the stock-operation endpoints.

> Historical note: Phase 5 originally preceded transfer support. Transfer endpoints were added in Phase 6 and are documented below.

## Phase 6 Transfer Integration

- Completion date: 2026-10-01
- Change summary: Added a controlled transfer lifecycle with approval/rejection/cancellation, transactionally completed stock movement, warehouse-scoped reads, and audit movements.

### Transfer endpoints

All endpoints require an authenticated, active user. Transfer records use the existing success/error envelopes. List responses include the shared pagination object.

| Method and URL | Permission | Request/query | Success |
| --- | --- | --- | --- |
| `POST /api/v1/transfers` | Any authenticated user with access to the source warehouse | Body: `productId`, positive `quantity`, `sourceWarehouseId`, `sourceLocationId`, `destinationWarehouseId`, `destinationLocationId`; optional `reference`, `notes` | 201 PENDING transfer |
| `GET /api/v1/transfers` | Authenticated; records scoped to initiated transfers or accessible source/destination warehouses (ADMIN sees all) | `status`, `product`, `sourceWarehouse`, `destinationWarehouse`, `initiatedBy`, `reference`, `startDate`, `endDate`, `page`, `limit`, `sort` | 200 paginated transfers |
| `GET /api/v1/transfers/:transferId` | Authenticated with access to a transfer endpoint warehouse, or its initiator | None | 200 transfer details |
| `PATCH /api/v1/transfers/:transferId/approve` | ADMIN or MANAGER with access to the source or destination warehouse | No body | 200 APPROVED transfer |
| `PATCH /api/v1/transfers/:transferId/reject` | ADMIN or MANAGER with access to the source or destination warehouse | Required body: `rejectionReason` | 200 REJECTED transfer |
| `PATCH /api/v1/transfers/:transferId/cancel` | Initiator, or ADMIN/MANAGER with access to either endpoint warehouse | No body | 200 CANCELLED transfer |
| `PATCH /api/v1/transfers/:transferId/complete` | ADMIN or MANAGER with access to the source or destination warehouse | No body | 200 COMPLETED transfer and source/destination stock summary |

Transfer body example:

```json
{
  "productId": "507f1f77bcf86cd799439012",
  "quantity": 6,
  "sourceWarehouseId": "507f1f77bcf86cd799439014",
  "sourceLocationId": "507f1f77bcf86cd799439015",
  "destinationWarehouseId": "507f1f77bcf86cd799439016",
  "destinationLocationId": "507f1f77bcf86cd799439017",
  "reference": "MOVE-2026-0042",
  "notes": "Replenish the east facility"
}
```

If `reference` is omitted, the backend generates a unique transfer reference. A supplied reference is unique across transfers. Both warehouses and locations and the product must be active; each location must belong to its stated warehouse; source and destination locations must differ. Distinct locations within the same warehouse are allowed. The source warehouse must have enough current stock at request time. Requesting a transfer does not reserve or decrement inventory; stock is rechecked during completion.

### Transfer response and details

The transfer object includes `id`, `reference`, populated compact `product`, source/destination warehouse and location, `quantity`, `status`, `initiatedBy`, `approvedBy`, `completedBy`, `rejectedBy`, `cancelledBy`, `notes`, `rejectionReason`, lifecycle timestamps, and `createdAt`/`updatedAt`. IDs are strings; timestamps are ISO-8601 UTC. The completion response adds `stock.source` and `stock.destination`, each containing the inventory ID and final quantity.

Transfer status values are `PENDING`, `APPROVED`, `COMPLETED`, `REJECTED`, and `CANCELLED`.

### Status transitions

| From | To | Action and behavior |
| --- | --- | --- |
| PENDING | APPROVED | ADMIN/MANAGER approval; stores `approvedBy` and `approvedAt`; no stock changes |
| PENDING | REJECTED | ADMIN/MANAGER rejection; requires `rejectionReason`, stores `rejectedBy` and `rejectedAt`; no stock changes |
| PENDING | CANCELLED | Initiator or authorized ADMIN/MANAGER; stores `cancelledBy` and `cancelledAt`; no stock changes |
| APPROVED | COMPLETED | Authorized ADMIN/MANAGER; revalidates active resources and source stock, then transactionally updates both inventories, creates exactly two transfer movements, and marks completion |
| APPROVED | CANCELLED | Initiator or authorized ADMIN/MANAGER; stores cancellation audit; no stock changes |

All other transitions return HTTP 409. Cancellation of approved transfers is permitted until completion. A completed transfer cannot be processed again. Buttons are only a user-experience aid: frontend visibility does not replace backend authorization or state-transition checks.

### Filters, pagination, and errors

- `status` accepts only the status values listed above.
- `product`, `sourceWarehouse`, `destinationWarehouse`, and `initiatedBy` are MongoDB ID filters.
- `reference` is a case-insensitive literal substring search.
- `startDate` and `endDate` filter transfer creation timestamps; invalid dates or an end before the start return HTTP 400.
- `page` defaults to 1; `limit` defaults to 20 and is capped at 50.
- `sort` accepts `createdAt`, `updatedAt`, `reference`, `status`, or `quantity`, optionally prefixed by `-` for descending order. Default: `-createdAt`.
- HTTP 400 indicates invalid IDs/input, same source and destination location, invalid dates, or invalid filters.
- HTTP 403 indicates insufficient role or warehouse access; HTTP 404 indicates a missing/inactive resource or transfer.
- HTTP 409 indicates insufficient stock, an invalid state transition, a duplicate supplied reference, or a transfer state changed concurrently.
- HTTP 503 indicates MongoDB transaction support is unavailable. Transfer completion requires a replica set or sharded MongoDB cluster; the server never applies only part of a completion.

Transfer detail screens should show reference/status, product/SKU/unit, quantity, source and destination warehouse/location, initiator, relevant approver/rejector/completer/canceller, lifecycle timestamps, notes, and rejection reason when present. Suggested action visibility: initiators may cancel PENDING or APPROVED transfers; ADMIN/MANAGER users with endpoint warehouse access may approve/reject PENDING transfers, cancel PENDING/APPROVED transfers, and complete APPROVED transfers. The backend remains authoritative.

> Historical note: Phase 6 originally preceded dashboard/reporting. Phase 7 dashboard and reporting endpoints are documented below.

## Phase 7 Dashboard and Reporting Integration

- Completion date: 2026-10-01
- Change summary: Added role-scoped dashboard summaries and paginated inventory, warehouse inventory, low-stock, stock-movement, and transfer reports. Published the complete Phases 1–7 OpenAPI contract.

### Dashboard endpoint

`GET /api/v1/dashboard/summary` requires a valid Bearer access token and an active account. It returns the shared success envelope with:

- `role`
- `totals`: `warehouses`, `locations`, `activeProducts`, `inventoryUnits`, `lowStockProducts`, `outOfStockProducts`, `pendingTransfers`
- `recentStockMovements`: up to five compact movement records; no actor email or other sensitive user details
- `recentTransfers`: up to five compact transfer records
- `inventoryByWarehouse`: at most 50 per-warehouse unit and record totals
- `movementTotalsByType`: count and sum of movement quantities per type, where permitted

Role scope:

- ADMIN sees system-wide operational totals.
- MANAGER sees information for warehouses assigned to them or assigned to their manager account.
- STAFF sees scoped aggregate totals, only their own recent movements and transfers, only their own pending transfer count, and no movement-type aggregate.
- Product counts for MANAGER/STAFF include active products represented in inventory within their permitted warehouse scope. ADMIN's active product count is system-wide.
- `lowStockProducts` counts distinct products that are low-stock in at least one visible warehouse (positive warehouse total at or below minimum stock); `outOfStockProducts` counts products whose combined visible quantity is zero. These are product-level dashboard counts; inventory report `LOW_STOCK` status is per inventory record.

### Reporting endpoints

All report endpoints require an authenticated, active user. MANAGER and STAFF results are restricted to assigned/managed warehouses. Supplying a warehouse outside the caller's scope returns HTTP 403. Reports return an empty `data` array with `totalItems: 0` and `totalPages: 0` when no records match.

| Method and URL | Purpose | Filters |
| --- | --- | --- |
| `GET /api/v1/reports/inventory` | Paginated inventory detail with product/category/warehouse/location display data and stock status | `warehouse` (also `warehouseId` alias), `location`, `product`, `category`, `stockStatus`, `search` (product name/SKU), `startDate`, `endDate` (inventory `updatedAt`), `page`, `limit`, `sort` |
| `GET /api/v1/reports/warehouse-inventory` | Paginated aggregation by warehouse | `warehouse`, `location`, `product`, `category`, `search` (product name/SKU), `startDate`, `endDate` (inventory `updatedAt`), `page`, `limit`, `sort` |
| `GET /api/v1/reports/low-stock` | Paginated low-stock inventory detail; status is fixed to `LOW_STOCK` | Inventory report filters |
| `GET /api/v1/reports/stock-movements` | Paginated immutable movement history | `warehouse`, `location`, `product`, `movementType`, `performedBy`, `search` or `reference`, `startDate`, `endDate` (movement `createdAt`), `page`, `limit`, `sort` |
| `GET /api/v1/reports/transfers` | Paginated transfer history | `warehouse` (either endpoint), `sourceWarehouse`, `destinationWarehouse`, `product`, `transferStatus`, `initiatedBy`, `search` or `reference`, `startDate`, `endDate` (transfer `createdAt`), `page`, `limit`, `sort` |

`stockStatus` values are `IN_STOCK`, `LOW_STOCK`, and `OUT_OF_STOCK`. `movementType` values are `STOCK_IN`, `STOCK_OUT`, `ADJUSTMENT_IN`, `ADJUSTMENT_OUT`, `TRANSFER_IN`, and `TRANSFER_OUT`. `transferStatus` values are `PENDING`, `APPROVED`, `COMPLETED`, `REJECTED`, and `CANCELLED`.

### Date format, time zone, sorting, and pagination

- Report date filters accept strict ISO-8601 date-only values (`YYYY-MM-DD`) or ISO-8601 timestamps with an explicit UTC marker or offset.
- Date-only values are interpreted in UTC. `startDate=2026-10-01` starts at `2026-10-01T00:00:00.000Z`; a date-only `endDate=2026-10-01` includes the full UTC day through `2026-10-01T23:59:59.999Z`.
- Explicit timestamps are inclusive instants. `endDate` earlier than `startDate`, invalid calendar dates, timestamps without an offset, and other invalid formats return HTTP 400.
- Timestamps in responses are ISO-8601 UTC strings.
- `page` is 1-based and defaults to `1`. `limit` defaults to `20`, and values above `50` are capped at `50`.
- Inventory report `sort` accepts `updatedAt`, `quantity`, `productName`, `sku`, or `createdAt`, optionally prefixed by `-` for descending. Warehouse-inventory report accepts `warehouseName`, `totalInventoryUnits`, `productCount`, or `locationCount`. Movement and transfer reports reuse their corresponding Phase 5/6 sort fields.
- Warehouse-inventory aggregates are sorted by warehouse name by default. Invalid sort fields return HTTP 400.

### Loading behavior and recommended UI

- Load the dashboard summary as a single request after authentication; refresh on navigation or user-triggered refresh rather than polling frequently.
- Dashboard cards can display the `totals`; use `recentStockMovements` and `recentTransfers` for compact activity tables and `inventoryByWarehouse` for a warehouse comparison chart/table.
- Use inventory and low-stock reports for filterable stock tables; warehouse-inventory is suited to a per-warehouse summary table or bar chart; stock-movement reports are suited to an audit table; transfer reports are suited to a lifecycle/status table.
- Reports are read-only, paginated, and do not currently provide CSV export. Load subsequent pages using returned `pagination` values and retain filters in UI state.
- No report endpoint returns unlimited records. A slow response should show a loading state and allow retry; errors should be shown from the API response rather than replaced with empty-success data.

### Performance and report semantics

- List reports retain the shared page-size ceiling of 50. Dashboard recent activity is capped at five rows and per-warehouse totals at 50 rows.
- Inventory reporting reuses the Phase 5 inventory aggregation; movement and transfer reports reuse the corresponding Phase 5/6 filtered list services. Warehouse-inventory aggregates by warehouse before pagination.
- Supporting indexes cover inventory uniqueness/warehouse-date queries, movement product/warehouse/performer/type date queries, and transfer source/destination/status date queries. Literal substring search is intentionally not treated as index-backed.
- Inventory date filters use `Inventory.updatedAt`; movement and transfer date filters use their creation timestamps. Empty reports are a successful empty paginated result, not an error.

### API documentation

The complete OpenAPI 3.0.3 document for all endpoints created in Phases 1–7 is available in [`backend/docs/openapi.yaml`](../backend/docs/openapi.yaml) and served without authentication at `GET /api/v1/openapi.yaml`. It records endpoint methods/paths, role and authentication requirements, request/query inputs, success responses, and common validation/auth/access/not-found/conflict errors.

### Current endpoint scope and historical corrections

The “not yet available” statements in the Phase 1 section and “outside this phase” notes in Phases 5 and 6 are historical and superseded. The current endpoint set includes authentication, user administration, warehouse/location/category/product master data, inventory and stock movements, transfers, dashboard, and reports. Phase 8 adds security hardening and deployment guidance without adding business endpoints. The frontend must treat backend authorization as authoritative; hiding buttons or controls is not a security boundary.

## Phase 8 Production Integration

- Completion date: 2026-10-01
- Change summary: Reviewed production configuration and API behavior; tightened production JWT/CORS/database startup requirements; made refresh-token rotation single-use; added safe test-database checks, security/acceptance tests, deployment guidance, and this final integration reference.

### Production base URL

Configure the frontend `REACT_APP_API_URL` to this deployed API base URL:

```text
https://warehouse-management-backend-tqc9.onrender.com/api/v1
```

The API origin is `https://warehouse-management-backend-tqc9.onrender.com`. Health checks should use `https://warehouse-management-backend-tqc9.onrender.com/api/v1/health`. Do not append `/api/v1` to `REACT_APP_API_URL` a second time when constructing endpoint URLs.

### Complete endpoint index

All paths below are relative to `/api/v1`.

| Area | Methods and paths |
| --- | --- |
| Health/documentation | `GET /health`, `GET /openapi.yaml` |
| Authentication | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`, `PATCH /auth/change-password` |
| User administration (ADMIN) | `GET/POST /users`, `GET/PATCH /users/:id`, `PATCH /users/:id/role`, `PATCH /users/:id/warehouses`, `PATCH /users/:id/activate`, `PATCH /users/:id/deactivate`, `PATCH /users/:id/reset-password` |
| Warehouses | `GET/POST /warehouses`, `GET/PATCH /warehouses/:warehouseId`, `PATCH /warehouses/:warehouseId/status` |
| Locations | `GET/POST /locations`, `GET/PATCH /locations/:locationId`, `PATCH /locations/:locationId/status` |
| Categories | `GET/POST /categories`, `GET/PATCH /categories/:categoryId`, `PATCH /categories/:categoryId/status` |
| Products | `GET/POST /products`, `GET/PATCH /products/:productId`, `PATCH /products/:productId/status` |
| Inventory | `GET /inventory`, `GET /inventory/:inventoryId`, `GET /inventory/low-stock`, `GET /inventory/out-of-stock` |
| Stock operations/history | `POST /stock-movements/stock-in`, `POST /stock-movements/stock-out`, `POST /stock-movements/adjust`, `GET /stock-movements`, `GET /stock-movements/:movementId` |
| Transfers | `GET/POST /transfers`, `GET /transfers/:transferId`, `PATCH /transfers/:transferId/approve`, `/reject`, `/cancel`, `/complete` |
| Dashboard | `GET /dashboard/summary` |
| Reports | `GET /reports/inventory`, `/reports/warehouse-inventory`, `/reports/low-stock`, `/reports/stock-movements`, `/reports/transfers` |

The canonical method, input, role, and response documentation is the [OpenAPI specification](../backend/docs/openapi.yaml), also served from `/api/v1/openapi.yaml`.

### Authentication lifecycle and permissions

- Login with `POST /auth/login`; the JSON response contains an access token and safe user profile. The refresh token is set only in an HTTP-only cookie and is never returned in JSON.
- Send `Authorization: Bearer <accessToken>` on protected API calls.
- When the access token expires, call `POST /auth/refresh` with browser credentials/cookies enabled. A successful refresh returns a new access token and rotates the HTTP-only refresh cookie. The previous refresh token is single-use; if two refresh requests race, only one can succeed.
- Login removes any prior refresh sessions for that user. Logout with `POST /auth/logout` revokes the presented refresh session and clears the cookie. The access token already issued may remain valid until its expiry; deactivating the account blocks it immediately.
- Password change and administrator password reset invalidate refresh sessions. An already-issued access token remains valid until expiry; prompt the user to log in again after password changes when the current access token expires.
- Send cookie credentials for login, refresh, and logout (for example `credentials: "include"` in Fetch). Do not attempt to read the HTTP-only cookie in JavaScript.

| Role | Effective backend permissions |
| --- | --- |
| `ADMIN` | System-wide access; create/update warehouses; manage users; manage master data; stock operations; approve/reject/cancel/complete transfers; see system-wide dashboard and reports. |
| `MANAGER` | See/manage assigned or managed warehouses; manage locations, categories, products; use stock operations and adjustments; approve/reject/cancel/complete transfers when authorized for an endpoint warehouse; see scoped dashboard/reports. |
| `STAFF` | Read permitted warehouse/master/inventory/movement data; stock-in/out; request transfers and cancel own eligible transfers; no administrator/user-management, master-data mutation, adjustment, approval, rejection, or completion privileges; dashboard activity is limited. |

Backend authorization remains authoritative regardless of frontend controls.

### Status and enum values

- User and master-data active state: `isActive: true | false` (active/inactive).
- Location types: `STORAGE`, `PICKING`, `RECEIVING`, `QUARANTINE`, `RETURN`, `COLD_STORAGE`.
- Product units: `EA`, `BOX`, `CASE`, `PALLET`, `KG`, `L`, `SET`, `BUNDLE`.
- Inventory stock status: `IN_STOCK`, `LOW_STOCK`, `OUT_OF_STOCK`.
- Transfer statuses: `PENDING`, `APPROVED`, `COMPLETED`, `REJECTED`, `CANCELLED`.
- Movement types: `STOCK_IN`, `STOCK_OUT`, `ADJUSTMENT_IN`, `ADJUSTMENT_OUT`, `TRANSFER_IN`, `TRANSFER_OUT`.

### Errors, validation, pagination, and time

The standard error envelope is:

```json
{
  "success": false,
  "message": "A valid productId is required.",
  "data": null,
  "details": { "field": "productId" }
}
```

Depending on the validation failure, `details` and/or `errors` may be present. Production 5xx responses use the generic message `Something went wrong`, omit stack traces and internal details, and retain safe 4xx validation messages so the UI can guide correction.

Paginated responses include:

```json
{
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalItems": 0,
    "totalPages": 0
  }
}
```

`page` is 1-based; `limit` defaults to 20 and is capped at 50. Empty results are a successful empty `data` array, not an error. Use ISO-8601 timestamps in UTC. Report filters accept strict date-only values (`YYYY-MM-DD`) or timestamps with an explicit UTC marker/offset; date-only end dates include that entire UTC day, and explicit timestamp boundaries are inclusive.

### CORS, environment, and deployment health

- In Render's backend service **Environment** settings, set `FRONTEND_URL` to the exact deployed frontend HTTPS origin (for example, `https://your-frontend.onrender.com`), not the backend URL. Do not include a path or `/api/v1`; comma-separate multiple exact origins. The production server intentionally exits at startup if `FRONTEND_URL` is missing or invalid.
- Configure frontend `REACT_APP_API_URL` to the API origin plus `/api/v1`; include credentials for refresh-cookie operations.
- `GET https://warehouse-management-backend-tqc9.onrender.com/api/v1/health` reports server/database status. It returns HTTP 200 only when MongoDB is connected; otherwise it returns HTTP 503, which is the deployment readiness signal. Do not treat 503 as an authenticated API response.
- Production requires MongoDB, separate high-entropy `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` values (at least 32 characters each, at least 16 distinct characters, and not placeholders), valid token lifetimes, and a configured frontend origin. If Render logs `Production JWT secrets must be unique, random values and must not use placeholders`, set both secrets in the backend service's **Environment** settings using two separately generated values; never reuse the same value or use `.env.example` samples. Do not expose credentials or bootstrap passwords in client code or documentation.

### Compatibility changes and deployment configuration

- Readiness behavior is intentionally stricter: `GET /api/v1/health` now returns HTTP 503 when MongoDB is disconnected, instead of a success-shaped HTTP 200. Configure the platform probe to treat 503 as not ready.
- Browser requests from an origin not explicitly listed in `FRONTEND_URL` no longer receive CORS permission; credentialed wildcard CORS is not supported.
- The server now requires explicit `NODE_ENV=development` or `NODE_ENV=production`, separate configured JWT secrets, and a reachable MongoDB before it begins listening. Production additionally requires distinct strong secrets and exact HTTPS frontend origins.
- Refresh rotation is atomic and single-use. Reusing a consumed token returns 401; a racing refresh request must handle the losing 401 without retrying the same cookie indefinitely.
- Error-envelope fields and business endpoint paths remain unchanged. Production 5xx details/stacks are suppressed, while safe 4xx validation guidance remains available.

### Test accounts and known limitations

No shared test accounts or passwords are published. Request access through the project owner and exchange credentials using the team's approved secret manager. Administrators should provision named accounts with individual passwords; change any temporary password immediately.

- Inventory changes and transfer completion require MongoDB transactions; standalone MongoDB deployments return 503 and cannot run the full transaction acceptance scenario.
- Refresh sessions are single-session-per-user: logging in again removes the previous session.
- Access JWTs remain valid until expiration after logout or password change; deactivation blocks a user immediately.
- Dashboard recent activity and report results are bounded; reports have no CSV export.
- The Render deployment URL has been provided and documented. Its remote health response and production database connection have not been independently verified here.

## Frontend Integration Checklist

- [ ] Configure `REACT_APP_API_URL` as `https://warehouse-management-backend-tqc9.onrender.com/api/v1` in the production frontend environment.
- [ ] Confirm login returns an access token and safe user profile.
- [ ] Attach the access token as a Bearer token to protected requests.
- [ ] Enable credentials for login, refresh, and logout cookie requests.
- [ ] Confirm access-token refresh rotates the refresh cookie and handles a 401 by returning to login.
- [ ] Confirm logout clears the refresh cookie and resets client-side authentication state.
- [ ] Show role-appropriate navigation while relying on backend authorization.
- [ ] Implement warehouse and location forms with warehouse membership/type validation.
- [ ] Implement category and product forms with unit/SKU/category validation.
- [ ] Implement inventory pages with search, filters, stock-status labels, and pagination.
- [ ] Implement stock-in with a unique `Idempotency-Key` per intended operation.
- [ ] Implement stock-out with insufficient-stock handling.
- [ ] Implement adjustments only for ADMIN/MANAGER; submit a target quantity, not a movement type.
- [ ] Implement transfer request, approval, rejection, cancellation, and completion actions according to role/status.
- [ ] Implement dashboard summary cards and recent activity/warehouse summaries.
- [ ] Implement inventory, warehouse inventory, low-stock, movement, and transfer reports.
- [ ] Show loading and disabled-submit states while requests are pending.
- [ ] Show explicit empty states for successful empty lists/reports.
- [ ] Render field/form validation details without converting failures into empty-success data.
- [ ] Handle 401 by refreshing once when appropriate, then requiring login if refresh fails.
- [ ] Handle 403 as insufficient role or warehouse access; do not retry unchanged.
- [ ] Handle 404 as a missing resource and offer navigation/reload where appropriate.
- [ ] Handle 5xx/503 with a clear retry/support state; do not retry stock operations with a new idempotency key unless the user initiates a new operation.
- [ ] Confirm backend readiness at `https://warehouse-management-backend-tqc9.onrender.com/api/v1/health` before enabling production traffic.
