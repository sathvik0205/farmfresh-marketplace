# FarmFresh — Technical Notes

## Architecture

- `client/`: React 18 single-page application built with Vite.
- `server/`: Express 4 REST API with Mongoose models and JWT authentication.
- Database: MongoDB. Checkout uses a multi-document transaction and therefore requires a replica set (MongoDB Atlas is suitable).

## Main API routes

| Method | Route | Access | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | Public | Register customer/farmer |
| POST | `/api/auth/login` | Public | Authenticate |
| GET | `/api/auth/me` | Authenticated | Current user |
| POST | `/api/farmers/profile` | Farmer | Submit/update farm profile |
| GET | `/api/farmers/me` | Farmer | Own profile |
| GET | `/api/products` | Public | Approved-seller catalogue |
| GET | `/api/products/mine` | Farmer | Own listings |
| POST | `/api/products` | Approved farmer | Create listing |
| PATCH | `/api/products/:id` | Owner farmer | Edit listing or active state |
| DELETE | `/api/products/:id` | Owner farmer | Hide listing (soft hide) |
| POST | `/api/orders` | Customer | Transactional COD checkout |
| GET | `/api/orders/mine` | Customer/farmer/admin | Own orders or role-specific orders |
| PATCH | `/api/orders/farmer/:id/status` | Owner farmer | Update fulfilment status |
| GET | `/api/admin/overview` | Admin | Counts |
| GET | `/api/admin/farmers` | Admin | Farmer applications |
| PATCH | `/api/admin/farmers/:id/approval` | Admin | Review application |
| GET | `/api/admin/orders` | Admin | Marketplace orders |

## Data model

- `User`: identity, unique email, password hash, role.
- `Farmer`: one profile per farmer user, farm details, PIN codes, approval state.
- `Product`: owner, product information, price/unit, stock, delivery method, active state, service PIN codes.
- `Order`: customer, item snapshot, address snapshot, payment state, total, references to farmer orders.
- `FarmerOrder`: one farmer's fulfilment lines for one delivery method, subtotal, delivery method, status. If a farmer has products using both delivery methods in the same basket, checkout creates two fulfilment orders for that farmer.

## Checkout transaction

The API validates the request and starts a MongoDB session. Within `withTransaction`, it loads active products, validates stock and PIN coverage, confirms each farmer remains approved, decrements inventory, creates farmer fulfilment orders grouped by both farmer and delivery method, and creates the parent customer order. If any step fails, the transaction aborts so partial stock deductions/order creation are not committed.

## Security and configuration

- Password hashing uses bcryptjs.
- JWTs expire after seven days.
- Helmet adds standard security headers; CORS is restricted to configured `CLIENT_URL` origins; API requests are rate-limited.
- Configure `MONGODB_URI`, `JWT_SECRET`, `CLIENT_URL`, and admin seed values in `server/.env`.
- Never commit or share `.env`; rotate any credential that has been exposed.

## Operational limitations

No payment gateway, courier integration, notifications, image storage, or production deployment configuration is included. There is no automated end-to-end test suite yet. Before launch, add input/schema hardening, idempotency, audit logs, cancellation/refund rules, monitoring, backups, security review, and tests against a replica-set database.


## Validation and tests

The API centralizes PIN-code, email, category, unit, price, stock, delivery-method and description validation in `server/src/validation.js`. Run `cd server && npm test` for the Node.js built-in unit tests. These are unit tests for validation helpers only; database integration, transaction rollback, authentication/authorization and browser end-to-end tests remain outstanding.

## Farmer fulfilment status transitions

Farmer fulfilment orders follow a restricted state machine: `placed → accepted → packed → out_for_delivery → delivered`. A farmer may cancel an order while it is `placed`, `accepted`, or `packed`. `delivered` and `cancelled` are terminal states. The API rejects invalid or backward transitions with HTTP 409; the dashboard only offers valid next states.


## Customer-facing parent order status

The parent order status returned by order-list endpoints is derived from its farmer fulfilment orders, so customers and admins see progress instead of a permanently stale `placed` value. All delivered fulfilments produce `delivered`; all cancelled produce `cancelled`; a mixture of delivered and cancelled produces `partially_fulfilled`; otherwise the furthest active stage is shown (`out_for_delivery`, `packed`, `accepted`, then `placed`). This is a response-time calculation and does not rewrite the stored parent order document.
