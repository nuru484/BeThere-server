# <img src="public/assets/logo.png" alt="BeThere Logo" width="35" style="vertical-align: middle;"/> BeThere – Smart Attendance System Backend

**BeThere** is an intelligent attendance tracking backend built for modern organizations and event systems.
It powers the **BeThere client site**,  handling authentication, event scheduling, and real-time face-based attendance verification.

With built-in **geolocation validation**, **background job automation**, and **facial scan matching**, BeThere ensures that attendance records are secure, accurate, and location-verified.

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
* [Author](#-author)

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

* **JWT-based authentication** (stateless, token sent once and encrypted on client).
* **Role-based access control** (`ADMIN` and `USER`).
* **Cloudinary** handles secure face scan and profile picture storage.
* CORS protection for trusted origins only.

---

## 🛠️ Tech Stack

| Layer              | Technology / Library                 |
| ------------------ | ------------------------------------ |
| **Framework**      | Express.js (JavaScript – ES Modules) |
| **Database**       | PostgreSQL + Prisma ORM              |
| **Authentication** | JWT (JSON Web Token)                 |
| **Job Queue**      | Redis + BullMQ (via ioredis)         |
| **Geolocation**    | @turf/turf                           |
| **Date Handling**  | date-fns                             |
| **Validation**     | express-validator                    |
| **File Storage**   | Cloudinary                           |
| **Logging**        | pino + pino-pretty                   |
| **Deployment**     | Render (Backend)                     |

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

> 🧠 **Note:** Worker process is deployed separately using Render background workers to handle job queues efficiently.

---

## 🤝 Contributing

This project is **private and proprietary**.
External contributions, forks, or pull requests are **not permitted**.

Development, modification, or deployment of any part of this project requires **explicit authorization** or **purchase of ownership rights**.

📩 For licensing or collaboration inquiries:
**[abdulmajeednurudeen47@gmail.com](mailto:abdulmajeednurudeen47@gmail.com)**

---

## 🧾 License

**All Rights Reserved**

All code, design, and intellectual property are exclusively owned by:
**Nurudeen Abdul-Majeed**

Usage of this project, in whole or in part — including but not limited to:

* Copying
* Redistribution
* Reverse-engineering
* Commercial deployment
* Creation of derivative works

is strictly prohibited without prior written permission or a valid license.

---

## 🧠 Author

* **Developer:** Nurudeen Abdul-Majeed
* **Email:** [abdulmajeednurudeen47@gmail.com](mailto:abdulmajeednurudeen47@gmail.com)

