# FarmFresh — Hyderabad farm-to-household marketplace

A full-stack development MVP built with React + Vite, Express, MongoDB/Mongoose and JWT authentication.

## Included

- Customer and farmer registration; admin accounts are created through a local seed command, never public registration.
- Login, JWT-protected APIs, password hashing, role-based access, Helmet security headers and API rate limiting.
- Farmer profile submission and admin approval/rejection.
- Product creation, editing, hiding and reactivation; supported categories/units, stock, PIN-code coverage and delivery method are validated server-side.
- Public catalogue with search, category and PIN-code filtering. Only products belonging to approved farmers are shown.
- Basket persisted in the browser and COD checkout.
- One parent customer order split into separate farmer fulfilment orders, grouped by farmer and delivery method so mixed-delivery baskets are represented accurately.
- Farmer order status updates, customer-visible per-farmer fulfilment progress, and aggregate parent-order status.
- Responsive layout for desktop and mobile.

## Important limitations

This is a functional development MVP, not a production commerce platform. Online payment gateway integration, payment webhooks/refunds, live courier integrations, SMS/email notifications, customer reviews, audit trails, automated integration tests, and production deployment are not included. A small backend unit-test suite covers input validation only; it does not test database operations, authorization flows or browser workflows. Delivery method is recorded per farmer fulfilment order; this does not book a courier. PIN-code filtering is seller-configured and does not guarantee service availability. Demo listings must be labelled as demo until real sellers consent and are onboarded.

Checkout now uses a MongoDB transaction so inventory changes and parent/farmer order creation commit together or roll back together. For production, add idempotency keys, inventory reservation policies, order cancellation/refunds, audit logging and a security review. MongoDB transactions require a replica-set deployment; MongoDB Atlas clusters support this, while a standalone local MongoDB server may not.

## Requirements

- Node.js 20+
- MongoDB Atlas cluster (or local MongoDB replica set)

## Setup

### 1. Configure the backend

```bash
cd server
cp .env.example .env
```

Edit `server/.env` locally. Replace the MongoDB URI placeholders with the database username/password and cluster hostname from Atlas. URL-encode special characters in the password. Keep `.env` private; it is ignored by Git. Never paste credentials into chat or screenshots.

Generate a JWT secret locally, for example:

```bash
openssl rand -hex 32
```

Put that output in `JWT_SECRET`. Set a unique admin name, email and password (12+ characters).

Then:

```bash
npm install
npm run seed:admin
npm run dev
```

API health check: http://localhost:5000/api/health

### 2. Start the frontend

In a second terminal:

```bash
cd client
cp .env.example .env
npm install
npm run dev
```

Open http://localhost:5173.

## First use

1. Sign in with the admin credentials configured in `server/.env`.
2. Register a farmer account from the storefront.
3. Sign in as that farmer and submit a farm profile with its PIN codes.
4. Sign in as admin and approve the application.
5. Sign back in as the farmer and publish products. Select farmer delivery or platform-coordinated delivery for each listing.
6. Register a customer, enter a delivery PIN code, add products and place a COD order.
7. Farmer dashboard updates each farmer's fulfilment status; admin dashboard can inspect parent orders.

## Project structure

```text
farmfresh-marketplace/
  client/                 React + Vite storefront and role dashboards
  server/
    src/models.js         Mongoose models
    src/auth.js           JWT authentication and role guards
    src/server.js         REST API
    src/seed-admin.js     Secure local admin bootstrap
```

## Verification performed in this build

- Node.js syntax checks passed for all backend JavaScript files.
- ZIP archive integrity check passed.
- Eight backend unit tests pass (`cd server && npm test`), covering PIN/email/product/address validation, status transitions, parent-order status aggregation and mixed-delivery fulfilment grouping.
- Backend includes API rate limiting, security headers, input validation and invalid-ID handling.
- Frontend production build and live MongoDB end-to-end tests have not been run in this environment. Run `npm install` and `npm run build` in `client`, then follow the manual workflow above against your own Atlas database.

## Before public deployment

- Configure production CORS origins, HTTPS, secure secrets and managed backups.
- Add deeper integration/security tests, audit logging and production monitoring.
- Use transactions and idempotency for checkout; never trust client prices or totals.
- Integrate a payment provider with verified server-side webhooks before accepting online payments.
- Integrate a real delivery provider before promising live delivery/tracking.
- Add privacy policy, terms, refund/cancellation rules and seller agreements.
- Deploy frontend/backend and configure environment variables in the hosting platforms; do not upload `.env`.

## Detailed project report

See [`docs/FarmFresh_Detailed_Project_Report.pdf`](docs/FarmFresh_Detailed_Project_Report.pdf) for the project report covering requirements, architecture, API overview, security, verification results, limitations, and future work.
