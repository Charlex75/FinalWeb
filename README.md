# BildyApp API

REST API for delivery note (albarán) management. Built with Node.js 20, TypeScript, Express 4, and MongoDB.

## Tech stack

- **Runtime**: Node.js 20 + TypeScript
- **Framework**: Express 4
- **Database**: MongoDB 7 via Mongoose 8
- **Auth**: JWT access tokens + refresh tokens (hashed in DB)
- **Validation**: Zod
- **Real-time**: Socket.IO (company-scoped rooms)
- **Storage**: Cloudinary (falls back to local when not configured)
- **PDF generation**: PDFKit
- **Image processing**: Sharp

---

## Prerequisites

- Node.js ≥ 20
- npm ≥ 10
- MongoDB 7 (or Docker)

---

## Local development

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

Key variables:

| Variable | Description | Default |
|---|---|---|
| `PORT` | HTTP port | `3000` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/bildyapp` |
| `JWT_SECRET` | Secret for signing access tokens | — |
| `JWT_EXPIRES_IN` | Access token TTL | `15m` |
| `JWT_REFRESH_SECRET` | Secret for refresh tokens | — |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token TTL | `7d` |
| `EMAIL_HOST` | SMTP host | — |
| `EMAIL_PORT` | SMTP port | `587` |
| `EMAIL_USER` | SMTP user | — |
| `EMAIL_PASS` | SMTP password | — |
| `EMAIL_FROM` | From address | — |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name | — |
| `CLOUDINARY_API_KEY` | Cloudinary API key | — |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret | — |

> If Cloudinary credentials are absent, uploads return a mock URL — the app still works.

### 3. Start the dev server

```bash
npm run dev
```

The API will be available at `http://localhost:3000`.

Interactive docs: `http://localhost:3000/api-docs`

---

## Docker

### Start everything (API + MongoDB)

```bash
docker compose up --build
```

This starts:
- **app** — the compiled API on port 3000
- **mongo** — MongoDB 7 on port 27017 (with health check)

Persistent data is stored in named volumes (`mongo_data`, `uploads`).

### Build the image only

```bash
docker build --target production -t bildyapp-api .
```

### Stop and remove containers

```bash
docker compose down
```

To also remove volumes (destroys all data):

```bash
docker compose down -v
```

---

## Running tests

```bash
# Single run
npm test

# Watch mode
npm run test:watch

# With coverage report (enforces ≥ 70 % on all metrics)
npm run test:coverage
```

Tests use `mongodb-memory-server` — no external MongoDB required.

---

## API reference

Interactive Swagger UI is served at `/api-docs` when the server is running.

### Endpoint summary

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/user/register` | Register a new user |
| `PUT` | `/api/user/validation` | Verify email with 6-digit code |
| `POST` | `/api/user/login` | Login — returns access + refresh tokens |
| `POST` | `/api/user/refresh` | Exchange refresh token for a new access token |
| `PUT` | `/api/user/register` | Update personal data |
| `PATCH` | `/api/user/company` | Create or update company |
| `PATCH` | `/api/user/logo` | Upload company logo |
| `GET` | `/api/user` | Get authenticated user |
| `DELETE` | `/api/user` | Delete or archive user |
| `POST` | `/api/user/logout` | Logout (revoke refresh token) |
| `POST` | `/api/user/invite` | Invite a collaborator |
| `PATCH` | `/api/user/password` | Change password |
| `POST` | `/api/client` | Create client |
| `GET` | `/api/client` | List active clients |
| `GET` | `/api/client/archived` | List archived clients |
| `GET` | `/api/client/:id` | Get client |
| `PUT` | `/api/client/:id` | Update client |
| `DELETE` | `/api/client/:id` | Archive or hard-delete client |
| `PATCH` | `/api/client/:id/restore` | Restore archived client |
| `POST` | `/api/project` | Create project |
| `GET` | `/api/project` | List active projects |
| `GET` | `/api/project/archived` | List archived projects |
| `GET` | `/api/project/:id` | Get project |
| `PUT` | `/api/project/:id` | Update project |
| `DELETE` | `/api/project/:id` | Archive or hard-delete project |
| `PATCH` | `/api/project/:id/restore` | Restore archived project |
| `POST` | `/api/deliverynote` | Create delivery note |
| `GET` | `/api/deliverynote` | List delivery notes |
| `GET` | `/api/deliverynote/:id` | Get delivery note |
| `GET` | `/api/deliverynote/pdf/:id` | Download PDF |
| `PATCH` | `/api/deliverynote/:id/sign` | Sign delivery note (upload signature) |
| `DELETE` | `/api/deliverynote/:id` | Delete delivery note (unsigned only) |
| `GET` | `/api/dashboard` | Summary stats and charts data |
| `GET` | `/health` | Health check |

---

## Project structure

```
src/
  config/       # Environment config, Swagger setup
  controllers/  # Route handlers
  middleware/   # Auth, validation, rate-limit, upload, error handler
  models/       # Mongoose models (User, Company, Client, Project, DeliveryNote)
  routes/       # Express routers
  services/     # PDF generation, cloud storage
  utils/        # AppError, asyncHandler, token helpers
  validators/   # Zod schemas
  app.ts        # Express app factory
  index.ts      # Server entry point (MongoDB connect + HTTP listen)
tests/          # Integration test suites (Jest + Supertest)
requests/       # .http example files (VS Code REST Client)
```
