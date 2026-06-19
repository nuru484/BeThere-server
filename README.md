# <img src="public/assets/logo.png" alt="BeThere Logo" width="35" style="vertical-align: middle;"/> BeThere – Smart Attendance System Backend

**BeThere** is the backend that powers a full-stack **smart attendance system** which verifies attendance using **facial recognition** combined with **GPS geolocation**. Instead of signing a sheet or tapping a card, a person looks into their device camera, the system matches their face against an enrolled scan, confirms they are physically within **50 meters** of the event location, and only then records them as present. It is built for organizations, schools, and recurring events where attendance records need to be genuinely hard to fake — you have to *be there*, in person.

This repository is the **API and background job engine**. It handles authentication, event and session scheduling, geolocation validation, face-scan storage/matching, and organization-wide attendance analytics. The companion frontend lives in [BeThere-client](https://github.com/nuru484/BeThere-client.git).

> **One-line pitch:** Attendance you can't fake — face recognition + GPS verification confirm the right person showed up at the right place, in real time.

---

## 🧠 How It Works

**1. Face enrollment & matching.**
Facial descriptors are produced in the browser with **face-api.js** (the frontend captures 3 samples and averages them into a single **128-dimension descriptor**). This server stores that descriptor on the `User` record (`faceScan` JSON) and uses it as the reference signature for future verification. Matching is performed by Euclidean distance against the enrolled descriptor.

**2. Location + time gate.**
On check-in / check-out the client sends the user's live GPS coordinates. The attendance controller uses **@turf/turf** to compute the geodesic distance between the user and the event's stored location and **rejects anyone beyond 50 meters**. It also enforces the session's daily time window and stamps the record as **PRESENT** when within an hour of the start time, otherwise **LATE** (status enum: `PRESENT / LATE / ABSENT`).

**3. Automated recurring sessions.**
Events can be one-off or **recurring** (every X days, with a duration and a daily open/close window). A **BullMQ + Redis** pipeline (`session-scheduler.js` → `session-worker.js`, orchestrated by `worker.js`) automatically generates `Session` records for upcoming occurrences, deduplicates them, and runs as a **separate worker process** on Render. **date-fns** handles all date math.

**4. Roles & dashboards.**
Two roles (`ADMIN`, `USER`). **Users** check in/out of active sessions and view their own attendance history. **Admins** create/update/delete events, manage user records, **reset a user's face scan** when needed, and pull organization-wide analytics — attendance by user, by event, and totals of users / events / active sessions.

**5. Auth & security.**
Stateless **JWT** access + refresh tokens, role-based access control, password reset via hashed tokens delivered over email (nodemailer + EJS), **Cloudinary** for secure face-scan and profile-picture storage, CORS locked to trusted origins, and structured logging with **pino**.

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

* Register and authenticate via JWT tokens.
* Upload facial data captured via **face-api.js** (handled by the frontend).
* Sign in and out of events using real-time facial recognition.
* Attendance is only recorded if the user’s **current GPS coordinates match** the event’s registered location.
* View personal attendance history and event details.

### 🧭 Admin Capabilities

* Create, update, and delete events.
* Define event recurrence, duration, and allowed check-in times.
* Manage user records and reset user facial scans when required.
* View detailed attendance analytics and dashboard reports.

### ⚙️ Automated System Intelligence

* **BullMQ + Redis** power recurring event **session generation**.
* Automatically schedules and creates daily/recurring event sessions.
* Verifies user locations in real-time using **@turf/turf** for geospatial accuracy.
* **date-fns** manages all date and time calculations.
* Robust **error handling**, **role-based access control**, and **input validation** via *express-validator*.

### 🔐 Authentication & Security

* **JWT-based authentication** — short-lived access token plus a **refresh token** for session renewal via the `/refresh-token` route (`cookie-parser`).
* **Password hashing** with bcrypt.
* **Password reset** flow — hashed, expiring reset tokens (`PasswordReset` table) delivered by email via **nodemailer + EJS** templates.
* **Role-based access control** (`ADMIN` and `USER`).
* **Cloudinary** handles secure face scan and profile picture storage (uploads parsed with `multer`).
* CORS protection for trusted origins only.

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
| **Geolocation**        | @turf/turf                                     |
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

1. User scans face on the client → face data sent to API.
2. Server stores or compares with existing facial data in PostgreSQL.
3. On event sign-in/out, the server validates both:

   * User’s face (via pre-stored embeddings).
   * User’s geolocation using `@turf/turf`.
4. Validations pass → Attendance record created.
5. Background workers auto-generate sessions for upcoming recurring events.

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