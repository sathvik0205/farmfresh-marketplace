# FarmFresh — Product Requirements Document

**Status:** Development MVP specification  
**Market focus:** Hyderabad, Telangana  
**Primary users:** Customers, farmers/producers, marketplace administrators

## 1. Problem and product goal

FarmFresh is a local farm-to-household marketplace intended to help customers discover produce from participating farmers and place orders while giving farmers a simple way to manage listings and fulfilment. The MVP should demonstrate the complete marketplace workflow with role-based access and persistent data.

## 2. User roles

- **Customer:** browse approved-seller listings, filter by category and PIN code, maintain a basket, place a cash-on-delivery order, and inspect fulfilment updates.
- **Farmer:** submit a farm profile for approval, create and maintain product listings after approval, define prices/stock/coverage/delivery method, and update fulfilment status for their orders.
- **Admin:** review farmer applications and inspect marketplace users and orders.

## 3. Core requirements

### Discovery and catalogue
- Show active products belonging only to approved farmers.
- Support product-name search, category filtering, and seller-configured PIN-code filtering.
- Show product name, category, unit price, seller name, and available stock context.

### Farmer onboarding and listings
- Public registration supports customer and farmer roles; admin is provisioned locally.
- Farmer profile requires farm name and village and is submitted for admin review.
- Only approved farmers can publish products.
- Farmers control product name, category, description, unit, price, stock, PIN-code coverage, and delivery method.
- Farmers can edit listings and hide/reactivate them. Hiding a listing does not delete its historical order records.

### Basket and checkout
- A customer basket can contain items from multiple farmers.
- Checkout revalidates products, stock, seller approval, PIN coverage, and quantities on the server.
- Checkout supports COD only in this MVP.
- A single customer order is created with separate farmer fulfilment orders, split by farmer and delivery method so a mixed-delivery basket is represented accurately.
- Inventory deduction and order creation use one MongoDB transaction.

### Fulfilment and administration
- Farmers can move their fulfilment orders through accepted, packed, out-for-delivery, delivered, or cancelled.
- Customers can see the parent order and each farmer fulfilment's status and recorded delivery method.
- Admin can approve/reject farmer applications and inspect orders.

## 4. Non-functional requirements

- Passwords are hashed; protected APIs use signed JWTs and role guards.
- API responses must not expose password hashes.
- Checkout must calculate prices server-side and reject stale/unavailable inventory.
- Layout should remain usable on desktop and mobile.
- Secrets belong in local environment files, never source control.

## 5. Out of scope for this MVP

Real online payments, payment webhooks/refunds, courier booking/live tracking, delivery-slot scheduling, SMS/email notifications, customer reviews, product image upload, seller identity verification, dispute handling, audit trails, and production-grade automated test coverage.

## 6. Acceptance checklist

1. Customer and farmer can register and log in; public admin registration is rejected.
2. Unapproved farmers cannot publish products and their listings do not appear publicly.
3. Admin can approve a farmer; approved farmer can create, edit, hide, and reactivate listings.
4. Customer can search/filter listings and add products from multiple farmers to one basket.
5. Checkout rejects invalid PIN coverage, invalid quantities, unavailable products, and insufficient stock.
6. Successful multi-farmer checkout creates one parent order and one fulfilment order per farmer-and-delivery-method combination, with stock updated atomically.
7. Each farmer can update only their own fulfilment orders.
8. Customer can inspect each fulfilment status; admin can inspect marketplace orders.

## 7. Known product caveats

PIN-code availability is based on seller-entered coverage and is not a verified logistics promise. The delivery method is recorded as an instruction only; no courier is booked. COD is the only implemented payment method. Sample or demo data must be clearly labelled and must not imply real farmer verification, reviews, or delivery performance.
