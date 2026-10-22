

# 🚍 BusGo South — Intercity Bus Reservation & Live Fleet Tracking Platform

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React 18](https://img.shields.io/badge/React_18-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Leaflet](https://img.shields.io/badge/Leaflet-199900?style=for-the-badge&logo=leaflet&logoColor=white)](https://leafletjs.com/)

---
# Demo Video 
https://github.com/user-attachments/assets/3abcdac8-a678-4959-b3c5-49fb9b038e75






## 📌 Table of Contents

1. [About the Project](#-about-the-project)
2. [Key Highlights & Features](#-key-highlights--features)
3. [Neo-Brutalist Tactile Design System](#-neo-brutalist-tactile-design-system)
4. [Technology Stack](#-technology-stack)
5. [Project Architecture & Directory Structure](#-project-architecture--directory-structure)
6. [Getting Started & Local Setup](#-getting-started--local-setup)
7. [Environment Configuration (`.env`)](#-environment-configuration-env)
8. [Automated Email Delivery (Gmail SMTP Setup)](#-automated-email-delivery-gmail-smtp-setup)
9. [API Architecture & Route Reference](#-api-architecture--route-reference)
10. [Automated Cron Services](#-automated-cron-services)
11. [Demo Accounts](#-demo-accounts)
12. [Testing](#-testing)

---

## 📖 About the Project

**BusGo South** is a modern, production-grade full-stack bus reservation platform engineered specifically for intercity transit across South India (covering **Tamil Nadu, Karnataka / Bengaluru, Kerala, and Andhra Pradesh**). 

The platform offers a unified, mobile-first responsive experience featuring real-time road routing, realistic dual-deck seat layouts, gender-safe seat assignment algorithms, QR-code payment approvals, live satellite GPS tracking, automated PDF ticket generation, and instant transactional email delivery via SMTP.

---

## 🌟 Key Highlights & Features

### 1. 🛣️ Intelligent Road Geocoding & Route Engine
- Built-in database of **70+ South Indian cities and regional stops** with colloquial alias matching (e.g., *Bangalore -> Bengaluru*, *Trichy -> Tiruchirappalli*).
- Multi-tier distance & polyline geometry resolution:
  1. **Google Routes API** (traffic-aware, if key is provided).
  2. **OSRM (Open Source Routing Machine)** on real OpenStreetMap highway networks.
  3. **Groq AI (Llama 3 / GPT-OSS)** fallback estimation for remote pickup points.
- Animated satellite map transition illustrating the vehicle driving along the genuine road route before revealing search results.

### 2. 💺 Realistic Dual-Deck Seat Reservation & Safety Controls
- **True-to-Life Seat Rendering**: Distinguishes between pushback seaters (with headrest, cushion, armrests) and luxury sleeper berths (upper and lower decks with pillow and rails).
- **Gender-Sensitive Safety Logic (`validateSeatEligibility`)**:
  - Enforces operator-level gender segregation: women-only seats, and adjacent-seat restrictions (male next to male, female next to female).
  - Fixed account gender verification prevents gender fraud on passenger selection.
  - Concurrency locking using atomic MongoDB `findOneAndUpdate` and unique index constraints to eliminate double-booking race conditions.

### 3. 📅 Dynamic Date Navigation Strip
- Reactive 7-day strip seamlessly synchronized with search query parameters.
- Dynamically centers around the selected travel date (e.g. `29 Oct`) while clamping to prevent past dates, ensuring instant single-click switching between adjacent departure days.

### 4. 📱 Scan-to-Pay QR Simulation (Zero Gateway Hassle)
- Generates instant scannable UPI-style QR codes for checkout.
- Automatically resolves to your local network LAN address (e.g. `http://192.168.x.x:5173/pay/approve/<token>`), enabling real mobile devices on the same Wi-Fi to scan and approve/reject bookings.
- Idempotent payment processing with hold-to-book atomic state transitions.

### 5. 📧 Automated Email Dispatch & PDF Ticket Invoicing
- Transactional email service powered by **Nodemailer** and **Gmail SMTP**.
- Generates high-definition, professional PDF boarding passes using **PDFKit** containing:
  - Scannable PNR QR code & Barcode.
  - Passenger breakdown, seat assignments, and fare breakdown (base fare, GST, discounts).
  - Boarding point address, landmark, and reporting timestamp.
- Dispatched automatically on payment confirmation, with user feedback delivered via in-app toast alerts.

### 6. 🛰️ Live Bus Radar & Telemetry
- Real-time bus tracking dashboard embedded on Leaflet satellite imagery.
- Operator position updates (`POST /api/operator/trips/:id/location`) with fallback to schedule-based highway road interpolation.

### 7. 🔄 Replacement-Based Ticket Cancellation
- Fair cancellation model: preview refund deductions, mark ticket as **Cancellation Pending**, and release refund automatically as soon as a replacement traveller books the vacated seat.

### 8. 🌐 Multi-Language Localization
- Seamless client-side i18n support across 4 languages:
  - **English**
  - **தமிழ் (Tamil)**
  - **മലയാളം (Malayalam)**
  - **ಕನ್ನಡ (Kannada)**
- Language toggle persists across sessions; translates all UI labels, seat states, routes, and error messages.

---

## 🎨 Neo-Brutalist Tactile Design System

BusGo South adopts a signature **Tactile Neo-Brutalist** aesthetic built with custom Tailwind CSS:
- **Defined Black Borders**: Solid `border-2 border-black` outlines on every container, card, modal, pill, and action element.
- **Hard Isometric Drop Shadows**: High-contrast `shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]` and `shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]` providing tactile depth and physical affordance.
- **Distinctive Color Palette**:
  - **Electric Crimson Brand**: `#FF1840` / Tailwind `bg-brand`
  - **Cream Background**: `#FFFDF7` / Tailwind `bg-cream`
  - **Deep Charcoal Ink**: `#111827`
  - **Accent Badges**: Soft pastels with solid black borders for status and category tags.

---

## 🛠️ Technology Stack

### **Frontend**
| Technology | Role |
|---|---|
| **React 18** | High-performance reactive UI architecture |
| **Vite** | Next-generation frontend build tooling & hot reload |
| **TypeScript** | Strict end-to-end type safety |
| **Tailwind CSS** | Utility-first responsive styling and neo-brutalist primitives |
| **TanStack Query (React Query)** | Server-state caching, prefetching, and synchronization |
| **Zustand** | Lightweight client state management (booking wizard & UI store) |
| **React Router v6** | Client-side routing with deep link parameters |
| **React Hook Form + Zod** | Form validation with schema inference |
| **Leaflet & React-Leaflet** | Interactive OpenStreetMap & satellite map rendering |
| **Lucide React & React Icons** | Crisp, lightweight SVG iconography |
| **i18next** | Comprehensive multilingual localization |

### **Backend**
| Technology | Role |
|---|---|
| **Node.js & Express** | RESTful HTTP API services |
| **TypeScript** | Backend type-checking and unified interfaces |
| **MongoDB & Mongoose** | Document database with replica-set transactions |
| **MongoMemoryServer** | Zero-configuration ephemeral MongoDB fallback for rapid dev |
| **Nodemailer** | SMTP email transport for transactional ticket emails |
| **PDFKit** | Dynamic programmatic PDF invoice & ticket generation |
| **QRCode** | Digital boarding pass barcode & QR matrix encoding |
| **JWT & HTTP-Only Cookies** | Secure access token & rotating refresh session management |
| **Bcrypt.js** | Cryptographic password hashing |
| **Node-Cron** | Scheduled background jobs (hold cleanup, reminders, fallbacks) |

### **Shared**
| Package | Role |
|---|---|
| **`@busgo/shared`** | Shared TypeScript contracts, DTO interfaces, and enums between client and server |

---

## 📁 Project Architecture & Directory Structure

```text
bus-reservation/
├── backend/                             # Express REST API Server
│   ├── src/
│   │   ├── config/                      # Environment variables & constants
│   │   │   ├── env.ts                   # Validated Zod schema for process.env
│   │   │   └── index.ts                 # Database & port configurations
│   │   ├── middleware/                  # Express middleware
│   │   │   ├── auth.ts                  # JWT token verification & role guards
│   │   │   └── error.ts                 # Centralized HTTP error handler
│   │   ├── models/                      # Mongoose Document Models
│   │   │   ├── Booking.ts               # Ticket bookings & passenger records
│   │   │   ├── Bus.ts                   # Bus fleet specifications & layout
│   │   │   ├── Operator.ts              # Transport companies & policies
│   │   │   ├── Payment.ts               # Transactions & approval tokens
│   │   │   ├── Trip.ts                  # Scheduled departures & live seats
│   │   │   └── User.ts                  # Customer & operator credentials
│   │   ├── routes/                      # Route Handlers
│   │   │   ├── auth.ts                  # Signup, login, profile, refresh
│   │   │   ├── bookings.ts              # Ticket list, seat holds, cancellations
│   │   │   ├── catalog.ts               # Cities, operators, and stops
│   │   │   ├── operator.ts              # Fleet management & location broadcast
│   │   │   ├── payments.ts              # QR initiation & approval hooks
│   │   │   └── trips.ts                 # Bus availability search & pricing
│   │   ├── services/                    # Business Logic Layer
│   │   │   ├── cron.ts                  # Background timers & hold expiry
│   │   │   ├── distance.ts              # Google Routes / OSRM / Groq engine
│   │   │   ├── email.ts                 # Nodemailer dispatcher & HTML templates
│   │   │   ├── pdf.ts                   # PDFKit ticket generation
│   │   │   └── seatEligibility.ts       # Gender & safety assignment validation
│   │   ├── index.ts                     # Express app initialization & server startup
│   │   └── seed.ts                      # Demo fleet & route seeding script
│   ├── .env                             # Backend environment secrets
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/                            # React + Vite Web Application
│   ├── src/
│   │   ├── assets/                      # Static logos and illustrations
│   │   ├── components/                  # Reusable UI Components
│   │   │   ├── MapView.tsx              # Satellite map view with route lines
│   │   │   ├── Navigation.tsx           # Responsive desktop & mobile headers
│   │   │   ├── Overlay.tsx              # Confirm dialogs & loading skeletons
│   │   │   ├── RouteTransition.tsx      # Driving animation before search results
│   │   │   ├── SeatMap.tsx              # Interactive deck canvas & seat buttons
│   │   │   ├── ui.tsx                   # PageHeader, StatusPill, buttons, inputs
│   │   │   └── states/                  # Empty, error, and permission screens
│   │   │       ├── EmptyState.tsx       # Tactile bordered empty placeholder
│   │   │       └── ErrorState.tsx       # Retryable error boundary view
│   │   ├── i18n/                        # Multilingual localization dictionaries
│   │   │   └── dict/                    # en.ts, ta.ts, ml.ts, kn.ts
│   │   ├── pages/                       # Application Views
│   │   │   ├── Auth.tsx                 # Login & Registration
│   │   │   ├── Entry.tsx                # Welcome landing screen
│   │   │   ├── Home.tsx                 # Route search & date picker
│   │   │   ├── Results.tsx              # Bus search results with 7-day strip
│   │   │   ├── Seats.tsx                # Deck selector & fare summary
│   │   │   ├── Passengers.tsx           # Traveller details & gender assignment
│   │   │   ├── Payment.tsx              # Scannable QR payment checkout
│   │   │   ├── PaymentApprove.tsx       # Mobile QR approval target page
│   │   │   ├── Ticket.tsx               # Confirmed digital pass & download
│   │   │   ├── Track.tsx                # Real-time satellite vehicle radar
│   │   │   └── Trips.tsx                # My Trips tabs & cancellation request
│   │   ├── store/                       # Client state stores
│   │   │   ├── booking.ts               # Booking wizard state
│   │   │   └── ui.ts                    # Toasts & modal state
│   │   ├── utils/                       # Network client & helpers
│   │   │   ├── api.ts                   # Typed API service wrappers
│   │   │   ├── format.ts                # Currency (INR), date, duration helpers
│   │   │   └── http.ts                  # Axios/fetch client with auto-refresh
│   │   ├── App.tsx                      # Root route configuration
│   │   ├── index.css                    # Tailwind CSS directives & fonts
│   │   └── main.tsx                     # React DOM entry point
│   ├── .env                             # Frontend client environment variables
│   ├── package.json
│   ├── tailwind.config.ts               # Brand theme & shadow tokens
│   ├── tsconfig.json
│   └── vite.config.ts                   # Dev server & proxy settings
│
├── shared/                              # Common Codebase Contracts
│   ├── src/                             # Shared TypeScript types & DTOs
│   ├── package.json
│   └── tsconfig.json
│
├── package.json                         # Root monorepo workspace configuration
└── README.md                            # Complete Project Documentation
```

---

## 🚀 Getting Started & Local Setup

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- *(Optional)* **MongoDB**: Local mongod instance or Atlas URI (If omitted, an in-memory replica set starts automatically with zero manual configuration).

### 2. Clone and Install Dependencies
```bash
# Clone the repository
git clone <repository-url>
cd "bus reseration"

# Install all monorepo dependencies (root, backend, frontend, shared)
npm install
```

### 3. Configure Environment Variables
Copy the example environment configurations for both backend and frontend:

```bash
# For the backend
cp .env.example backend/.env

# For the frontend
cp .env.example frontend/.env
```

*(Refer to the [Environment Configuration](#-environment-configuration-env) section below for key values).*

### 4. Run Development Servers
Start both the Express backend API (`:4000`) and the Vite React frontend (`:5173`) concurrently with one command:

```bash
npm run dev
```

- **Frontend App**: [http://localhost:5173](http://localhost:5173)
- **Backend API**: [http://localhost:4000/api](http://localhost:4000/api)

---

## ⚙️ Environment Configuration (`.env`)

### `backend/.env`
```ini
# Server
PORT=4000
NODE_ENV=development
PUBLIC_APP_URL=http://localhost:5173

# Database (Leave blank to use embedded MongoMemoryServer)
MONGODB_URI=

# Authentication Secrets
JWT_ACCESS_SECRET=your_super_secret_access_key_min_32_chars
JWT_REFRESH_SECRET=your_super_secret_refresh_key_min_32_chars

# SMTP Email Configuration (Nodemailer)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_16_digit_app_password
EMAIL_FROM="BusGo South" <your_email@gmail.com>

# Optional Routing & AI Enhancements
GOOGLE_MAPS_SERVER_KEY=
GROQ_API_KEY_1=
GROQ_API_KEY_2=
```

### `frontend/.env`
```ini
VITE_API_BASE_URL=http://localhost:4000/api
```

---

## 📧 Automated Email Delivery (Gmail SMTP Setup)

BusGo South sends instant booking confirmation emails with PDF ticket attachments directly to the passenger's registered email address.

To enable Gmail SMTP:
1. Log in to your Google Account and navigate to **Security** → **2-Step Verification**.
2. Scroll to the bottom and select **App Passwords**.
3. Create a new app name (e.g. `BusGo`) and copy the generated **16-character password**.
4. Paste it in `backend/.env`:
   ```ini
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your_email@gmail.com
   SMTP_PASS=your_16_character_app_password
   EMAIL_FROM="BusGo South" <your_email@gmail.com>
   ```
5. Whenever a ticket is booked and approved, the passenger receives an automated HTML email containing the journey summary and a PDF ticket attachment.

---

## 📡 API Architecture & Route Reference

### 🔐 Authentication (`/api/auth`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Create a new traveller account with locked gender |
| `POST` | `/api/auth/login` | Authenticate with email/password; receives JWT cookies |
| `POST` | `/api/auth/refresh` | Refresh access token using rotating refresh token |
| `GET` | `/api/auth/me` | Fetch authenticated user profile |
| `POST` | `/api/auth/logout` | Revoke session and clear cookies |

### 🚌 Catalog & Trips (`/api/catalog`, `/api/trips`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/catalog/places` | List 70+ South Indian cities, towns & boarding gates |
| `GET` | `/api/trips/search` | Query scheduled trips by source, destination, and travel date |
| `GET` | `/api/trips/:id` | Fetch specific trip timetable, route path & deck capacity |
| `GET` | `/api/trips/:id/seats` | Retrieve real-time seat deck occupancy and gender permissions |

### 🎟️ Bookings & Seats (`/api/bookings`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/bookings/hold` | Temporarily reserve seats (10-minute hold window) |
| `GET` | `/api/bookings` | List user bookings filtered by tab (`upcoming`, `completed`, etc.) |
| `GET` | `/api/bookings/:id` | Get single ticket details and printable boarding pass |
| `GET` | `/api/bookings/:id/cancel-preview` | Calculate refund breakdown before requesting cancellation |
| `POST` | `/api/bookings/:id/cancel` | Place booking into replacement-pending cancellation queue |

### 💳 Payments (`/api/payments`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/payments/initiate` | Generate QR code with unique approval token |
| `GET` | `/api/payments/status/:id` | Poll payment status (`pending`, `completed`, `failed`) |
| `POST` | `/api/payments/approve/:token` | Approve payment from mobile scanner; triggers booking completion |
| `POST` | `/api/payments/reject/:token` | Cancel payment and immediately release held seats |

---

## ⏰ Automated Cron Services

Managed by `node-cron` in `backend/src/services/cron.ts`:

- **Seat Hold Cleaner** *(every 30 seconds)*: Automatically releases seats whose 10-minute hold window has expired without payment.
- **Cancellation Replacement Fallback** *(every 60 seconds)*: Evaluates pending cancellations against operator cutoff times and applies fallback refund policies if no replacement traveller booked the seat.
- **Trip Status Sync** *(every 5 minutes)*: Transitions departures from scheduled to completed based on arrival milestones.
- **Email Retry Dispatcher** *(every 10 seconds)*: Retries failed email jobs with exponential backoff.

---

## 👤 Demo Accounts

The database comes pre-seeded with ready-to-test accounts:

| Role | Email | Password | Access Scope |
|---|---|---|---|
| **Traveller (Female)** | `demo@busgo.test` | `Demo@1234` | Search, book seats, view tickets, cancel bookings |
| **Operator (TNSTC)** | `operator@busgo.test` | `Operator@123` | Broadcast bus GPS locations, view manifests, manage refunds |
| **Super Admin** | `admin@busgo.test` | `Admin@123` | System audit logs, operator administration |

---

## 🧪 Testing

Execute the comprehensive Vitest test suite:

```bash
# Run all unit and integration tests
npm test
```

Test coverage includes:
- Concurrency and atomic seat hold operations.
- Gender-segregated seat eligibility rules.
- Refund calculation logic and cancellation replacement flows.
- Idempotency of payment webhooks and QR approvals.
- Route distance failover chain (Google -> OSRM -> Groq AI).

---

## 📄 License & Credits

Built with precision for South Indian transit. Licensed under the MIT License.
