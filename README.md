# RCinventory

A full-stack chemical inventory management system for RC (Repair &amp; Cleaning) operations. Field technicians and store managers track chemical stock levels across multiple store locations using voice input, an AI-powered reporting assistant, and a companion mobile app.

## Features

- **Multi-store inventory** — track chemical quantities per store location
- **Voice input** — dictate inventory counts using speech-to-text
- **AI reporting assistant** — natural-language queries over your inventory data
- **AI call mode** — hands-free conversational inventory updates with TTS responses
- **Mobile app** — Expo React Native app for field technicians
- **Role-based access** — admin and employee roles with store assignment

## Tech Stack

| Layer | Technology |
|---|---|
| API Server | Node.js 24, Express 5, TypeScript |
| Database | PostgreSQL 16, Drizzle ORM |
| Web Frontend | React 19, Vite 6, Tailwind CSS v4, TanStack Query |
| Mobile App | Expo SDK 54, React Native, Expo Router |
| AI / Voice | OpenAI (Whisper STT, TTS, GPT-4o) |
| Monorepo | pnpm workspaces |

---

## Requirements

- **Node.js** ≥ 24
- **pnpm** ≥ 9 (`corepack enable && corepack prepare pnpm@latest --activate`)
- **PostgreSQL** ≥ 15 (or Docker for local development)
- **OpenAI API key** — for voice transcription, TTS, and the AI report assistant

---

## Local Development

### 1. Clone &amp; install

```bash
git clone https://github.com/YOUR_USERNAME/redinventory.git
cd redinventory
pnpm install
```

> **Note:** If you previously had this repo checked out on Linux, run `pnpm install` fresh — the lockfile was generated on Linux and may need to resolve platform-specific native binaries for your OS.

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your values
```

Required variables:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret for signing JWTs (generate with command below) |
| `OPENAI_API_KEY` | OpenAI API key for voice &amp; AI features |

Generate a `JWT_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 3. Start PostgreSQL

**With Docker:**
```bash
docker run -d --name rcinventory-db \
  -e POSTGRES_DB=rcinventory \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 postgres:16-alpine
```

**Or use your own PostgreSQL instance** and update `DATABASE_URL` accordingly.

### 4. Push database schema

```bash
pnpm --filter @workspace/db run push
```

This applies the Drizzle schema directly to the database. A default admin account (`admin` / `admin123`) is created automatically on first startup.

### 5. Start development servers

In separate terminals:

```bash
# API server (port 5000)
pnpm --filter @workspace/api-server run dev

# Web frontend (auto-assigned port, proxied through Vite)
pnpm --filter @workspace/rcinventory run dev
```

The API is available at `http://localhost:5000/api`.  
The web app is available at `http://localhost:PORT` (Vite prints the port).

### 6. (Optional) Mobile app

```bash
pnpm --filter @workspace/rcinventory-mobile run dev
```

Scan the QR code with Expo Go, or run on a simulator.

---

## Production

### Build

```bash
# Build the API server (outputs to artifacts/api-server/dist/)
pnpm --filter @workspace/api-server run build

# Build the web frontend (outputs to artifacts/rcinventory/dist/)
pnpm --filter @workspace/rcinventory run build
```

### Start

```bash
# API server
PORT=5000 NODE_ENV=production node artifacts/api-server/dist/index.mjs
```

Serve the web frontend (`artifacts/rcinventory/dist/`) from nginx or any static file host. Configure nginx to proxy `/api` to the API server (see `deploy/nginx.conf`).

---

## Docker

### Build &amp; run with Docker Compose (recommended)

```bash
# Copy and fill in your environment variables
cp .env.example .env
# Set at minimum: JWT_SECRET, OPENAI_API_KEY, and optionally POSTGRES_PASSWORD

docker compose up --build
```

This starts three services:

| Service | Description | Port |
|---|---|---|
| `db` | PostgreSQL 16 | 5432 |
| `api` | Node.js API server | 5000 |
| `web` | nginx serving frontend + API proxy | 80 |

Open `http://localhost` in your browser.

### First run: push schema

```bash
docker compose exec api node -e "
  const { db } = require('./artifacts/api-server/dist/index.mjs');
"
# Or push schema before starting the containers:
DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/rcinventory \
  pnpm --filter @workspace/db run push
```

### Individual Docker stages

```bash
# Build just the API image
docker build --target api -t rcinventory-api .

# Build just the web image (requires deploy/nginx.conf)
docker build --target web -t rcinventory-web .
```

---

## Database

The project uses **Drizzle ORM** with PostgreSQL. Schema lives in `lib/db/src/schema/`.

### Push schema changes (development)

```bash
pnpm --filter @workspace/db run push
```

### Generate &amp; run migrations (production-safe)

```bash
# Generate migration files
pnpm --filter @workspace/db run generate

# Apply migrations
pnpm --filter @workspace/db run migrate
```

Migration files land in `lib/db/migrations/`.

---

## Environment Variables Reference

See [`.env.example`](./.env.example) for the full list with descriptions.

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | ✅ | — | API server port |
| `NODE_ENV` | — | `development` | `development` or `production` |
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `JWT_SECRET` | ✅ (prod) | auto-generated | JWT signing secret |
| `OPENAI_API_KEY` | ✅ | — | OpenAI API key |
| `OPENAI_BASE_URL` | — | `https://api.openai.com/v1` | Custom OpenAI endpoint |
| `CORS_ORIGIN` | — | all origins | Comma-separated allowed origins |
| `LOG_LEVEL` | — | `info` | Pino log level |

---

## Testing

```bash
# Type-check all packages
pnpm run typecheck

# Build verification
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/rcinventory run build
```

CI runs automatically on every push and pull request via GitHub Actions (`.github/workflows/ci.yml`). The CI pipeline:
1. Installs dependencies
2. Spins up a test PostgreSQL instance
3. Pushes the DB schema
4. Type-checks all packages
5. Builds the API and web frontend
6. Verifies the API health endpoint

---

## Deployment (Linux VPS / Cloud VM)

```bash
# 1. Install Node.js 24 and pnpm
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt-get install -y nodejs
corepack enable && corepack prepare pnpm@latest --activate

# 2. Clone the repo
git clone https://github.com/YOUR_USERNAME/redinventory.git
cd redinventory

# 3. Install production deps
pnpm install --frozen-lockfile

# 4. Set environment variables (use a .env file or systemd EnvironmentFile)
export DATABASE_URL="postgresql://..."
export JWT_SECRET="your-secret"
export OPENAI_API_KEY="sk-..."
export PORT=5000
export NODE_ENV=production

# 5. Push schema
pnpm --filter @workspace/db run push

# 6. Build
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/rcinventory run build

# 7. Start API (with pm2 for process management)
pm2 start artifacts/api-server/dist/index.mjs --name rcinventory-api

# 8. Serve frontend with nginx (see deploy/nginx.conf)
cp artifacts/rcinventory/dist /var/www/rcinventory
cp deploy/nginx.conf /etc/nginx/sites-available/rcinventory
# Edit nginx.conf with your domain name, then:
ln -s /etc/nginx/sites-available/rcinventory /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

---

## Repository Structure

```
.
├── artifacts/
│   ├── api-server/          # Express 5 API server
│   ├── rcinventory/         # React/Vite web frontend
│   └── rcinventory-mobile/  # Expo React Native mobile app
├── lib/
│   ├── db/                  # Drizzle ORM schema + DB client
│   ├── api-spec/            # OpenAPI spec (source of truth for API contracts)
│   ├── api-client-react/    # Generated React Query hooks (from OpenAPI)
│   ├── api-zod/             # Generated Zod schemas (from OpenAPI)
│   ├── integrations-openai-ai-server/  # Server-side OpenAI client
│   └── integrations-openai-ai-react/   # Client-side voice/audio hooks
├── deploy/
│   └── nginx.conf           # nginx config for production
├── .github/
│   └── workflows/ci.yml     # GitHub Actions CI pipeline
├── Dockerfile               # Multi-stage Docker build
├── docker-compose.yml       # Full-stack Docker Compose setup
├── .env.example             # Environment variable template
└── pnpm-workspace.yaml      # pnpm workspace configuration
```

---

## Troubleshooting

**`DATABASE_URL must be set`**  
Set `DATABASE_URL` in your `.env` file or environment. See [Environment Variables](#environment-variables-reference).

**`JWT_SECRET is not set — a temporary key has been generated`**  
In development this is a warning — the server works but sessions reset on restart. In production, `JWT_SECRET` is required; the server will refuse to start without it.

**`No OpenAI API key configured`**  
Set `OPENAI_API_KEY` in your environment. Voice transcription, TTS, and AI reporting will not work without it. The rest of the app (inventory management) works fine without it.

**pnpm install fails on my platform**  
The lockfile was generated on Linux. Run `pnpm install` without `--frozen-lockfile` once to regenerate it for your platform:
```bash
pnpm install
```

**Port already in use**  
Change `PORT` in your `.env` or use a different port:
```bash
PORT=3001 pnpm --filter @workspace/api-server run dev
```

**Expo mobile app can't reach the API**  
Set `EXPO_PUBLIC_API_URL` to your API server's URL in the mobile app environment:
```bash
EXPO_PUBLIC_API_URL=http://192.168.1.x:5000 pnpm --filter @workspace/rcinventory-mobile run dev
```

---

## Default Credentials

A default admin account is created automatically on first startup:

| Username | Password |
|---|---|
| `admin` | `admin123` |

**Change this password immediately after first login in any environment.**
