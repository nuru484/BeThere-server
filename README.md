# <img src="public/assets/logo.png" alt="BeThere Logo" width="35" style="vertical-align: middle;"/> BeThere – Smart Attendance System Backend

**BeThere** is the backend that powers a full-stack **smart attendance system** that verifies **live presence**: a person scans a **rotating code shown on a screen at the venue** to prove they are physically there, then a short **face-liveness check** confirms it is really them, live. Both are verified **entirely on the server**, from raw camera frames, so the check cannot be faked by tampering with the app. It is built for organizations, schools, and recurring events where attendance records need to be genuinely hard to fake: you have to *be there*, in person.

This repository is the **API and background job engine**. It handles authentication, event and session scheduling, the rotating venue codes, server-side face verification, encrypted biometric storage, evidence/anomaly/audit trails, and organization-wide analytics. The companion frontend lives in [BeThere-client](https://github.com/nuru484/BeThere-client.git).

> **One-line pitch:** Verified live presence. Scan the venue's live code, then a real-time face check confirms it's you, all verified on the server, not your phone.

> **On the security claim:** no browser-based system is literally unfakeable (only a native app with hardware attestation fully closes live-relay collusion). BeThere is built to be *as close as a web app gets*: it defeats the practical attacks (posting a fake descriptor, replaying a photo, a stale screenshotted code) and leaves a reviewable evidence trail for the rest.

---

## 🧠 How It Works

**1. Enrollment (consented, encrypted).**
A user enrolls their face once. The 128-dimension descriptor is produced in the browser with **face-api.js**, but the server stores it **AES-256-GCM encrypted at rest** (`faceScanEnc`) and decrypts it only in memory at match time; the raw descriptor never leaves the server. Enrollment requires explicit **biometric consent** (GDPR Art. 9 / BIPA), and deletion destroys the template.

**2. Presence: the rotating venue code.**
Each event has a server-side secret. A screen at the venue shows a QR that rotates every **30 seconds**; the codes are stateless keyed hashes of the secret and the current time window, so nothing polls or writes the database to rotate them (the display fetches a batch and cycles locally). Scanning the current code is the presence gate. A screenshotted code is stale within seconds.

**3. Identity: server-side liveness.**
Check-in and check-out are a two-step handshake. A fail-fast preflight (valid venue code + enrollment + session window) issues a **randomized action sequence** (turn, blink, smile) and a single-use challenge token. The client uploads raw frames performing those actions, and the server verifies, from the pixels: the actions happened, the face matches the enrolled template, it is not a replayed descriptor, and it is one continuous person. Only then is attendance recorded (**PRESENT / LATE**). Failed attempts are retained as flagged evidence and an anomaly for review.

**4. Automated recurring sessions.**
Events can be one-off or **recurring** (every X days, with a duration and a daily open/close window). A **BullMQ + Redis** pipeline (`session-scheduler.js` -> `session-worker.js`, orchestrated by `worker.js`) automatically generates `Session` records for upcoming occurrences, deduplicates them, and runs as a **separate worker process**. **date-fns** handles all date math.

**5. Roles, dashboards, and audit.**
Two roles (`ADMIN`, `USER`). **Users** check in/out and view their own history. **Admins** create/update/delete events, open the venue-code display, manage users, reset a user's face scan, review anomaly flags and evidence, and pull organization-wide analytics. Every check-in and biometric action is written to an append-only **audit log**.

**6. Auth & security.**
Cookie-only **JWT** access + refresh tokens with **refresh-token rotation and replay-as-theft detection**, a per-request session-epoch check, role-based access control, passwordless OTP login and optional 2FA, password reset via hashed tokens (nodemailer + EJS), **Cloudinary** for image storage, CORS locked to trusted origins, Redis-backed rate limiting, and structured logging with **pino**. A scheduled retention sweep purges expired auth material, challenges, evidence, and dormant biometric templates.

---

## 📚 Table of Contents

* [Features](#-features)
* [Tech Stack](#-tech-stack)
* [Architecture Overview](#-architecture-overview)
* [Database Design](#-database-design)
* [Background Jobs](#-background-jobs)
* [Getting Started](#-getting-started)
* [Environment Variables](#-environment-variables)
* [Project Structure](#-project-structure)
* [Deployment](#-deployment)
* [Contributing](#-contributing)
* [License](#-license)

---

## ✨ Features

### 👥 User Capabilities

* Register and authenticate (passwordless OTP login or password + optional 2FA).
* Enroll a face once (consented; stored encrypted on the server).
* Check in and out by scanning the venue's rotating code, then a live face-liveness check.
* View personal attendance history and event details.

### 🧭 Admin Capabilities

* Create, update, and delete events (each gets a rotating venue code).
* Open the **venue-code display** for an event (the screen shown at the location).
* Define event recurrence, duration, and allowed check-in times.
* Manage user records and reset a user's face template when required.
* Review anomaly flags and check-in evidence; view attendance analytics and reports.

### ⚙️ Automated System Intelligence

* **BullMQ + Redis** power recurring event **session generation**.
* Rotating **venue codes** are stateless keyed hashes (no per-rotation DB load).
* **date-fns** manages all date and time calculations (windows in the venue timezone).
* A scheduled **retention sweep** purges expired auth material, challenges, evidence, and dormant biometric templates.
* Robust **error handling**, **role-based access control**, and **input validation** via *express-validator*.

### 🔐 Authentication & Security

* **Cookie-only JWT** access + refresh tokens with **rotation and replay-as-theft detection**, plus a per-request session-epoch check for instant revocation.
* Passwordless **OTP login**, optional **2FA**, and a hashed-token **password reset** flow (`nodemailer` + EJS).
* **Server-side face verification** with **randomized-action liveness**; biometric templates **AES-256-GCM encrypted at rest**, decrypted only in memory.
* **Consent + retention** for biometric data; flagged-attempt **evidence**, **anomaly flags**, and an append-only **audit log**.
* Redis-backed **rate limiting**, `helmet`, bcrypt password hashing, **Cloudinary** image storage (parsed with `multer`), and CORS locked to trusted origins.

---

## 🛠️ Tech Stack

| Layer                  | Technology / Library                          |
| ---------------------- | --------------------------------------------- |
| **Framework**          | Express.js (JavaScript – ES Modules)          |
| **Database**           | PostgreSQL (`pg` + `@prisma/adapter-pg`)      |
| **ORM**                | Prisma                                         |
| **Authentication**     | JWT (`jsonwebtoken`) access + refresh tokens  |
| **Password Hashing**   | bcrypt                                          |
| **Cookies**            | cookie-parser (refresh-token cookie)          |
| **Job Queue**          | Redis + BullMQ (via ioredis)                  |
| **Face verification**  | @vladmandic/face-api on the tfjs WASM backend |
| **Presence**           | Rotating venue codes (HMAC-SHA256, time-windowed) |
| **Biometric crypto**   | AES-256-GCM (templates encrypted at rest)     |
| **Date Handling**      | date-fns                                        |
| **File Uploads**       | multer (multipart parsing)                    |
| **File Storage**       | Cloudinary                                      |
| **Email**              | nodemailer + EJS templates                    |
| **Validation**         | express-validator                              |
| **Logging**            | pino + pino-pretty, morgan (HTTP requests)    |
| **CORS**               | cors (trusted origins only)                   |
| **Deployment**         | Render (API + separate background worker)     |

---

## 🏗️ Architecture Overview

```
Frontend (face-api.js)
   ↓
API Gateway (Express.js)
   ↓
Controllers → Prisma ORM → PostgreSQL
   ↓
Redis (BullMQ)
   ↓
Session Scheduler → Session Worker (background)
```

**Key Data Flow:**

1. Enrollment: the client computes a face descriptor; the server stores it encrypted.
2. On sign-in/out, the client sends the scanned venue code, then uploads raw face frames.
3. The server validates both, from its own data and the pixels:

   * Presence: the scanned code matches the event's current rotating code.
   * Identity + liveness: the frames perform the randomized actions and match the enrolled template.
4. Validations pass -> Attendance record created (failed attempts -> flagged evidence + anomaly).
5. Background workers auto-generate sessions and run the retention sweep.

---

## 🗄️ Database Design

**Core Entities**

* **User**: stores user details, roles, and face scan embeddings.
* **Event**: base entity defining event metadata, recurrence, and location.
* **Session**: generated automatically for recurring or future events.
* **Attendance**: links users to sessions (with timestamps and status).
* **Location**: stores coordinates and contextual data for each event.

All schema relations and constraints are defined using **Prisma**.

---

## ⚙️ Background Jobs

### 🎯 Purpose

Automates the creation of event sessions using **BullMQ** and **Redis**.

### 🧩 Components

* `sessionQueue.js` → defines the job queue.
* `session-scheduler.js` → finds upcoming events and schedules session creation jobs.
* `session-worker.js` → executes session creation logic, ensuring no duplicates and respecting recurrence intervals.
* `worker.js` → initializes all workers, handles daily recurring job scheduling, and manages graceful shutdown.

---

## 🚀 Getting Started

### Prerequisites

* **Node.js** ≥ 18
* **PostgreSQL** ≥ 14
* **Redis** (for BullMQ queue management)

### Installation

```bash
# Clone repository
git clone git@github.com:your-username/bethere-server.git
cd bethere-server

# Install dependencies
npm install
```

### Face models & the biometric key

Server-side face verification needs two things in place:

```bash
# 1. The face-api model weights must live under FACE_MODELS_PATH (default ./models).
#    They ship in this repo's ./models directory. If missing, copy them from the
#    client's public/models (tiny_face_detector, face_landmark_68, face_recognition,
#    face_expression).

# 2. Generate the biometric encryption key (required) and put it in .env:
openssl rand -hex 32   # -> FACE_TEMPLATE_ENC_KEY
```

> The face engine runs on the pure-JS **tfjs WASM backend** (no native build), so it
> installs anywhere. Budget ~1 GB RAM for the process holding the models. Set
> `LIVENESS_ENABLED=false` to skip the models in local/dev flows that don't need them.

### Database Setup

```bash
# Initialize and apply migrations
npm run migrate
```

> ⚙️ **Seed the Database**
>
> Creates default admin and base configuration.
>
> ```bash
> npm run seed
> ```

### Running the Server

```bash
# Development mode
npm run dev

# Production build
npm start
```

### Running Background Worker

```bash
# Run worker (session creation + scheduler)
npm run worker:dev
```

**API Base URL** → [https://api.bethere.manuru.dev/](https://api.bethere.manuru.dev/)

---

## 🔐 Environment Variables

Create a `.env` file in the root directory with:

```bash
DATABASE_URL= 'your db url, example "postgresql://postgresUser:password@localhost:5432/dbName?schema=public"'
PORT="your port, example 8080"
NODE_ENV="development"
CORS_ACCESS="your cors access, example 'http://localhost:3000'"
ACCESS_TOKEN_SECRET="your access_token_secret"
REFRESH_TOKEN_SECRET="your_refresh_token_secret"

ADMIN_EMAIL="your admin email, example"
ADMIN_PASSWORD="your admin password, example 1234"
ADMIN_FIRSTNAME="your admin first name, example Nurudeen"
ADMIN_LASTNAME="your admin last name, example Abdul-Majeed"
ADMIN_PHONE="your admin phone number, example 233546488115"


CLOUDINARY_CLOUD_NAME="your cloudinary cloud name"   
CLOUDINARY_API_KEY="your cloudinary api key"    
CLOUDINARY_API_SECRET="your cloudinary api secret"    

REDIS_URL="your redis url"
```

---

## 📦 Project Structure

```
bethere-server/
│
├── prisma/                  # Prisma schema, migrations & seeds
│
├── src/
│   ├── config/              # Env, Prisma, Redis, Multer, Cloudinary configs
│   ├── controllers/         # Business logic (attendance, event, user, auth)
│   ├── jobs/                # BullMQ queues, schedulers, workers
│   ├── middleware/          # Auth, error handling, role validation
│   ├── routes/              # API routes
│   ├── utils/               # Logger, token verification, cloud helpers
│   └── validation/          # Input validations
│
├── worker.js                # Initializes job schedulers/workers
├── server.js                # Express app entry point
└── package.json
```

---

## 🌐 Deployment

Deployed on **Render** with the following configuration:

| Component        | Platform / Service      |
| ---------------- | ----------------------- |
| **Backend API**  | Render                  |
| **Database**     | Managed PostgreSQL      |
| **Queue / Jobs** | Redis Cloud + BullMQ    |
| **File Storage** | Cloudinary              |
| **Logs**         | pino + Render Dashboard |

> **Note:** Worker process is deployed separately using Render background workers to handle job queues efficiently.

---

## 🤝 Contributing

Contributions are welcome! If you'd like to improve this project, feel free to:

- **Fork** the repository
- **Create a feature branch** (`git checkout -b feature/amazing-feature`)
- **Commit your changes** (`git commit -m 'Add some amazing feature'`)
- **Push to the branch** (`git push origin feature/amazing-feature`)
- **Open a Pull Request**

Please ensure your code follows the project's style guidelines and includes appropriate tests where applicable.

For major changes, please open an issue first to discuss what you would like to change.

Questions or suggestions?
**[abdulmajeednurudeen47@gmail.com](mailto:abdulmajeednurudeen47@gmail.com)**

---

## 🧾 License

**MIT License**

Copyright (c) 2025 Nurudeen Abdul-Majeed

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.