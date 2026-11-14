# Installation & Deployment Guide: ShivQuill Platform

## 1. Prerequisites

- **Node.js**: v18.0.0 or higher (v20+ recommended). Verified on v26.13.0.
- **npm**: v9.0.0 or higher.
- **Git**: Installed and available in PATH.

---

## 2. Quick Start (Local Development)

### Step 1: Clone or Enter Repository
```bash
cd "c:\Users\Project\ShivQuill bot"
```

### Step 2: Install Dependencies
```bash
# Installs both backend and frontend dependencies
npm run install:all
```

### Step 3: Configure Environment Variables
Copy the template and configure your preferred AI provider:
```bash
cp .env.example .env
```
To run offline or in local test mode without API keys, leave `REQUEST_TYPE=MOCK`.
To use real AI inference, set `REQUEST_TYPE=GROQ` (or `OPENAI` / `OPENROUTER`) and supply your key:
```ini
REQUEST_TYPE=GROQ
GROQ_API_KEY=gsk_your_groq_api_key_here
GROQ_MODEL=llama-3.3-70b-versatile
```

### Step 4: Run Automated Tests & Benchmarks
```bash
# Run unit and integration tests (18 tests across 4 suites)
npm test

# Run the 200 synthetic writing samples benchmark
npm run benchmark
```

### Step 5: Build and Run Production Server
```bash
# Build both frontend and backend
npm run build

# Start the unified production server
npm start
```
The application will launch on `http://localhost:5000`.
Opening `http://localhost:5000` in your browser provides full access to the interactive writing platform!

---

## 3. Production Deployment (Docker / Cloud Run / VPS)

### Production Dockerfile Pattern
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY . .
RUN npm run install:all
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/package.json ./backend/package.json
COPY --from=builder /app/backend/node_modules ./backend/node_modules
COPY --from=builder /app/frontend/dist ./frontend/dist
ENV NODE_ENV=production
ENV PORT=5000
EXPOSE 5000
CMD ["node", "backend/dist/index.js"]
```
