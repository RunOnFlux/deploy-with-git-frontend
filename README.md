# Orbit — Git-to-Flux Deployment UI

Deploy any Git repository to the **Flux Decentralized Cloud** in minutes. Orbit is a full-stack React + Node.js app that handles everything from authentication and app registration to live monitoring, redeploys, and billing — all without a centralised server.

🏢 **Owned by:** InFlux Technologies
⚡ **Powered by:** [Flux](https://runonflux.io)

---

## 🌟 Features

### Authentication
- 🔑 **SSP Wallet** — sign-in via the SSP browser extension
- 🦊 **ZelCore** — QR-based wallet signing flow
- 📧 **Firebase Email/Google** — traditional login with SSO-derived Flux keypair
- 🔐 **Deterministic zelid** — each Firebase user always maps to the same Flux address
- 🔒 **Session persistence** — auth state survives page reloads

### Deployment Wizard
- 🚀 **6-step guided wizard** — Repo → Plan → Config → Review → Payment → Status
- 🧠 **Repo intelligence** — auto-detects framework, port, build/run commands from GitHub
- 📦 **Plan selection** — Free, Developer, Pro, Custom with live price calculation
- 🌍 **Geo-targeting** — choose continent or specific country for node placement
- 💳 **Stripe Checkout** — fiat payments via Flux payment bridge
- 🔄 **ZelCore / SSP Wallet** — native crypto FLUX payments
- ✅ **Live test install** — streaming NDJSON build log during registration
- 🔏 **On-chain signing** — spec verified + signed before submission to the blockchain

### App Management
- 📊 **Real-time status** — per-node running/partial/stopped badges, auto-polls every 30s
- 🖼️ **Site preview** — live screenshot of deployed app via BFF proxy
- 📋 **Settings editor** — edit description, domain, env vars, git branch, polling interval, secrets
- 🔁 **Redeploy** — trigger a git pull + rebuild on any node via HMAC-signed webhook
- ⚡ **Hard Redeploy** — force a clean build from scratch
- 🛑 **Node actions** — restart / start / stop / remove per Flux node
- 📜 **Live logs** — streaming app & system logs via xterm.js terminal
- 🌐 **Orbit status** — last commit, build status, deployed-at per node

### Billing & Support
- 💰 **Subscription overview** — per-app plan, expiry countdown in days, renew shortcut
- ⚠️ **Expiry alerts** — banner when any app expires within 14 days
- 🎫 **Support tickets** — submit tickets via relay with issue-type classification

### Developer Experience
- 🎨 **Fully responsive** — mobile sidebar drawer, responsive grids throughout
- 🔔 **Toast notifications** — success/error feedback for every action
- 💀 **Skeleton loaders** — shimmer placeholders on every async card
- 🛡️ **Error boundary** — graceful fallback UI for unhandled errors
- ⚡ **Vite + React** — HMR in development, optimised code-split bundles in production
- 🔀 **BFF proxy** — Express server handles Flux API proxying, screenshot capture, webhook signing

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- A Flux account (SSP Wallet, ZelCore, or Firebase email)
- Firebase project with Email/Password and Google auth enabled *(optional — a shared project is used by default)*

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd orbit-ui

# Install dependencies
npm install

# Create your environment file
cp .env.example .env

# Edit .env with your values (see Environment Setup below)
nano .env

# Start dev server (Vite on :5173 + Express BFF on :3001)
npm run dev
```

Open **http://localhost:5173** in your browser.

### Build for Production

```bash
# Build optimised bundle
npm run build

# Preview production build locally
npm run preview

# Run in production (serves /dist + API on one port)
PORT=4000 node server.js
```

---

## ⚙️ Environment Setup

Copy `.env.example` to `.env` and fill in the values:

```bash
# App
VITE_APP_URL=http://localhost:5173

# Feature Flags
VITE_ENABLE_ANALYTICS=false
VITE_GA_MEASUREMENT_ID=

# Payment Bridge (Stripe + Flux price calculation)
VITE_PAYMENT_BRIDGE_URL=https://fiatpaymentsbridge.runonflux.io

# Stripe
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...

# Firebase (optional — defaults to the shared FluxOS project)
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=

# SSO signing — 'self' (HMAC keypair) or 'fluxcore' (service.fluxcore.ai)
SSO_PROVIDER=self

# Required when SSO_PROVIDER=self. Generate with: openssl rand -hex 32
# Never change this in production — it determines all user zelid addresses.
SSO_SIGNING_SECRET=your_secret_here
```

### Production Environment

```bash
VITE_APP_URL=https://orbit.runonflux.io
VITE_ENABLE_ANALYTICS=true
PORT=4000
NODE_ENV=production
```

---

## 🔥 Firebase Setup

### 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project and add a **Web App**

### 2. Enable Authentication

1. Navigate to **Authentication → Sign-in method**
2. Enable **Email/Password** and **Google**
3. Add authorised domains: `localhost`, `your-domain.com`

### 3. Configure Orbit

Paste your Firebase config values into `.env`:

```bash
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
```

### 4. SSO Signing

Orbit derives a deterministic Flux keypair for every Firebase user so they can sign transactions without owning a wallet app:

| `SSO_PROVIDER` | How it works |
|---|---|
| `self` | BFF signs with HMAC-SHA256 using `SSO_SIGNING_SECRET` |
| `fluxcore` | Delegates to `service.fluxcore.ai` (requires official FluxOS Firebase project) |

```bash
# Generate a strong signing secret (do this once, never change it)
openssl rand -hex 32
```

> ⚠️ Changing `SSO_SIGNING_SECRET` after launch will generate different zelid addresses for all existing users. Treat it like a database encryption key.

---

## 🏗️ Project Structure

```
orbit-ui/
├── server.js                  # Express BFF — API proxy, auth, screenshot, webhooks
├── src/
│   ├── pages/
│   │   ├── Home.jsx            # Landing page
│   │   └── dashboard/
│   │       ├── DashboardLayout.jsx
│   │       ├── Overview.jsx
│   │       ├── Deployments.jsx
│   │       ├── AppDetail.jsx   # Per-app management page
│   │       ├── DeployWizard.jsx
│   │       ├── Billing.jsx
│   │       └── Support.jsx
│   ├── components/
│   │   ├── management/         # App detail cards (info, settings, instances, logs)
│   │   ├── wizard/             # Deployment wizard steps
│   │   ├── dashboard/          # AppCard, StatusBadge
│   │   ├── common/             # ErrorBoundary, Modal, Button, Input
│   │   └── landing/            # Home page sections
│   ├── services/
│   │   ├── appsService.js      # App list + status fetching
│   │   ├── deployService.js    # Plans, spec building, registration
│   │   ├── managementService.js # Node actions, orbit status, redeploy
│   │   ├── authService.js      # Login flows (SSP, ZelCore, Firebase)
│   │   └── axiosInstance.js    # Axios + Flux API proxy helpers
│   ├── hooks/
│   │   └── useApps.js          # React Query hooks for app data
│   └── context/
│       └── AuthContext.jsx     # Global auth state
└── public/
    └── orbit-icon.svg
```

---

## 🔌 API Architecture

Orbit uses a **Backend-for-Frontend (BFF)** pattern. The Express server (`server.js`) proxies all Flux API calls so the browser never touches the network directly.

```
Browser  →  Vite dev proxy (dev)  →  BFF :3001
                                        ↓
                              https://api.runonflux.io
                              https://<node>.node.api.runonflux.io
                              https://service.fluxcore.ai
                              https://fiatpaymentsbridge.runonflux.io
```

### Key BFF Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/flux/*` | Proxy to `api.runonflux.io` |
| `POST` | `/api/flux/apps/registerapplication` | Register app on Flux |
| `GET` | `/api/screenshot?url=` | Capture site screenshot via thum.io |
| `POST` | `/api/orbit-deploy` | HMAC-signed redeploy webhook trigger |
| `POST` | `/api/sso/sign` | Derive deterministic Flux keypair + sign |

---

## 💳 Payment Flow

Orbit supports three payment methods for app deployments:

### Stripe (Fiat)
1. Price calculated via `POST /apps/calculatefiatandfluxprice` on the payment bridge
2. Checkout session created at `POST <bridge>/api/v1/stripe/checkout/create`
3. User redirected to Stripe Hosted Checkout
4. On success, `?session_id=` redirected to `/successcheckout`

### ZelCore (Crypto)
1. FLUX amount fetched from payment bridge
2. Payment address fetched from `GET /apps/deploymentinformation`
3. `zel:?action=pay&...` deep-link opens ZelCore wallet

### SSP Wallet (Crypto)
1. Same price/address lookup as ZelCore
2. `window.ssp.request('pay', {...})` invokes the browser extension

---

## 🔄 Redeploy Mechanism

Orbit nodes run a local webhook server. Redeploy triggers are sent as synthetic GitHub-style push events:

```
POST http://<node-ip>:<mgmt-port>/webhook
X-Hub-Signature-256: sha256=<hmac-sha256>
```

The BFF signs the payload with the app's `WEBHOOK_SECRET` env var so each node validates authenticity before pulling and rebuilding.

- **Redeploy** — `git pull` + rebuild (same image)
- **Hard Redeploy** — `forced: true` — clean wipe + full rebuild from scratch

---

## 📦 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, Framer Motion |
| State / Data | TanStack Query, Zustand |
| Backend | Node.js, Express |
| Auth | Firebase Auth, SSP Wallet, ZelCore |
| Payments | Stripe, ZelCore deep-link, SSP extension |
| Crypto signing | bitcoinjs-lib, tiny-secp256k1 |
| Terminal | xterm.js |
| Icons | Lucide React |
| Notifications | react-hot-toast |

---

## 🛠️ Development

```bash
# Start both servers (Vite :5173 + Express :3001)
npm run dev

# Run only the BFF server
npm run server

# Run only the Vite client
npm run client

# Lint
npm run lint

# Production build
npm run build
```

### Dev Mock Mode

Set a zelid starting with `dev_` to skip live Flux API calls and work with mock data:

```bash
# In AuthContext, dev mock mode activates automatically for zelid = 'dev_*'
# App list queries are disabled, letting you build UI against static fixtures
```

---

## 🌐 Deployment

Orbit is itself deployable on Flux. The app container runs `NODE_ENV=production node server.js` which serves the built `/dist` and the BFF API on a single port.

```bash
# Build
npm run build

# Run (production)
PORT=4000 NODE_ENV=production node server.js
```

Flux spec environment variables to set:

| Variable | Description |
|---|---|
| `PORT` | Server port (default `3001`, set to `4000` or any free port) |
| `NODE_ENV` | `production` |
| `SSO_PROVIDER` | `self` or `fluxcore` |
| `SSO_SIGNING_SECRET` | 32-byte hex secret for deterministic keypair derivation |
| `VITE_PAYMENT_BRIDGE_URL` | Flux fiat payment bridge URL |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |

---

## 📄 Licence

MIT © InFlux Technologies
