# Payment Subscription API

Backend service for pricing calculation, user registration, and order creation.

Built with TypeScript, Express, and TypeORM (PostgreSQL).

## Table of Contents

- Overview
- Tech Stack
- Prerequisites
- Environment Configuration
- Installation
- Running the Project
- Available Scripts
- API Endpoints
- Error Handling
- Project Architecture
- Database and Migrations
- Testing
- Troubleshooting

## Overview

This API provides:

- Pricing configuration lookup
- Price calculation by number of users
- User registration with password hashing
- Order creation based on registered user count
- Order lookup by order id

## Tech Stack

- TypeScript
- Node.js
- Express 5
- TypeORM
- PostgreSQL
- bcrypt
- validator

## Prerequisites

- Node.js 18+
- npm 9+
- PostgreSQL 13+ (or compatible)

## Environment Configuration

Create a `.env` file in the project root (or copy `.env.example`) and set the following values:

```env
# Server
PORT=5000
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=your_database_name

# Pricing
BASE_PRICE=200
PRICE_PER_USER=10
CURRENCY=USD

# PayHere
PAYHERE_MERCHANT_ID=your_sandbox_merchant_id
PAYHERE_MERCHANT_SECRET=your_sandbox_merchant_secret
PAYHERE_CHECKOUT_URL=https://sandbox.payhere.lk/pay/checkout
FRONTEND_BASE_URL=http://localhost:3000
PAYHERE_NOTIFY_URL=http://localhost:5000/api/payment/notify
PAYHERE_DEFAULT_PHONE=0771234567
PAYHERE_DEFAULT_ADDRESS=N/A
PAYHERE_DEFAULT_CITY=Colombo
PAYHERE_DEFAULT_COUNTRY=Sri Lanka

# Subscription
SUBSCRIPTION_DURATION_DAYS=30

# Invoice Storage
INVOICE_STORAGE_DIR=./invoices

# Email
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=no-reply@example.com
EMAIL_PASS=your_email_password
EMAIL_TEST_RECIPIENT=qa@example.com

# API base URL used in email invoice links
BACKEND_BASE_URL=http://localhost:5000
```

## Installation

Install dependencies:

```bash
npm install
```

## Running the Project

Development mode (auto-restart):

```bash
npm run dev
```

Build and run production:

```bash
npm run build
npm run start
```

Default local URL:

`http://localhost:5000`

## Available Scripts

- `npm run dev` - Start development server with ts-node-dev
- `npm run build` - Compile TypeScript into `dist/`
- `npm run start` - Run compiled server from `dist/server.js`
- `npm run typeorm` - Run TypeORM CLI using ts-node

## API Endpoints

### 1) Get Pricing Configuration

- Method: `GET`
- Path: `/pricing`

Success response example:

```json
{
	"basePrice": 200,
	"pricePerUser": 10,
	"currency": "USD"
}
```

### 2) Calculate Price

- Method: `GET`
- Path: `/api/pricing/calculate`
- Query: `users` (number, required)

Example:

`/api/pricing/calculate?users=5`

Success response example:

### 3) Initiate PayHere Checkout

- Method: `POST`
- Path: `/api/payment/initiate`
- Body: `{ "orderId": "<uuid>" }`

Success response includes PayHere checkout URL and signed form fields to POST from frontend.

### 4) Confirm Payment Success

- Method: `POST`
- Path: `/api/payment/confirm-success`
- Body: `{ "orderId": "<uuid>" }`

This sets order status to `ACTIVE` and creates a linked subscription if one does not exist.

### 5) PayHere Notify Callback

- Method: `POST`
- Path: `/api/payment/notify`

Server-to-server callback from PayHere. Signature and amount are verified before activating order/subscription.

On first successful activation of an order (`ACTIVE`), the system also sends a confirmation email with:

- Payment details
- Subscription details
- Invoice link
- Invoice PDF attachment (if available)

```json
{
	"users": 5,
	"total": 250,
	"currency": "USD"
}
```

### 6) Register User

- Method: `POST`
- Path: `/api/auth/register`
- Body:

```json
{
	"name": "John",
	"email": "john@example.com",
	"password": "secret123",
	"userCount": 5
}
```

Success response example:

```json
{
	"message": "User registered successfully",
	"userId": 1
}
```

### 7) Create Order

- Method: `POST`
- Path: `/api/order/create`
- Body:

```json
{
	"user_id": 1
}
```

Success response example:

```json
{
	"message": "Order created",
	"order": {
		"id": "uuid",
		"user_id": 1,
		"user_count": 5,
		"base_price": 200,
		"price_per_user": 10,
		"total_amount": 250,
		"status": "PENDING"
	}
}
```

### 8) Get Order by ID

- Method: `GET`
- Path: `/api/order/:id`

Success response returns the order object.

## Subscription Activation Rules

- On successful payment confirmation, order status becomes `ACTIVE`.
- A `subscriptions` record is created and linked by `user_id` and `order_id`.
- `start_date` is set to current server time.
- `end_date` is set to `start_date + SUBSCRIPTION_DURATION_DAYS` (default 30).
- On failed/cancelled payment callbacks, order status is not activated.

## Invoice Persistence

- Invoice PDF is saved to local storage directory defined by `INVOICE_STORAGE_DIR`.
- Generated invoice path is stored in `orders.invoice_path`.
- Invoice remains linked to the order through `order_id` and stored path metadata.

## Error Handling

The API uses centralized middleware for error handling.

- Validation errors return `400`
- Missing routes return `404`
- Service/controller errors are handled by the global error handler
- In production (`NODE_ENV=production`), internal stack traces are hidden

Error response shape:

```json
{
	"message": "Error message",
	"error": {
		"status": 400,
		"message": "Error message"
	}
}
```

## Project Architecture

```text
src/
	app.ts                  # Express app setup and middleware chain
	server.ts               # Startup only (env + db init + listen)
	config/
		data-source.ts        # TypeORM datasource
		database.ts           # DB initialization helper
		environments.ts       # Environment configuration mapping
		pricing.ts            # Pricing configuration mapping
	controllers/            # HTTP handlers (thin layer)
	services/               # Business logic + repository interaction
	validators/             # Request payload and query validation
	middleware/             # Logger, validation, async wrapper, error handler
	routes/                 # Route definitions and middleware composition
	entity/                 # TypeORM entity schemas
	migrations/             # TypeORM migrations
	types/                  # Shared TypeScript interfaces
	utils/                  # Utility functions
```

## Database and Migrations

This project is configured for TypeORM migrations in TypeScript.

Example commands:

```bash
npm run typeorm -- migration:run -d src/config/data-source.ts
npm run typeorm -- migration:revert -d src/config/data-source.ts
```

## Testing

### How to test a payment on Sandbox Mode?

You can use the following test card numbers to test simulated successful payments:

| Card Type | Card Number |
| :--- | :--- |
| Visa | `4916217501611292` |
| MasterCard | `5307732125531191` |
| AMEX | `346781005510225` |

- For **Name on Card**, **CVV**, and **Expiry date**, you can enter any valid data.
- Any card except the above test cards will result in a failed payment.

#### Specific Decline Scenarios

Please use the following test card numbers to test specific decline scenarios:

**Insufficient Funds:**
- Visa: `4024007194349121`
- MasterCard: `5459051433777487`
- AMEX: `370787711978928`

**Limit Exceeded:**
- Visa: `4929119799365646`
- MasterCard: `5491182243178283`
- AMEX: `340701811823469`

**Do Not Honor:**
- Visa: `4929768900837248`
- MasterCard: `5388172137367973`
- AMEX: `374664175202812`

**Network Error:**
- Visa: `4024007120869333`
- MasterCard: `5237980565185003`
- AMEX: `373433500205887`

## Troubleshooting

- If the API does not start, verify `.env` values and PostgreSQL connectivity.
- If build fails, run `npm run build` and fix TypeScript errors.
- If DB errors appear, ensure migrations were applied and database credentials are correct.
- If you changed environment values, restart the server.