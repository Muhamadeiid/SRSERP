# SRS — HR & Operations Management System

Internal HR and operations management system for Rotem SRS Egypt — Laravel API + React/Vite frontend.

## Stack

| Layer | Tech |
|---|---|
| Backend | Laravel 10, PHP 8.2, MySQL 8 |
| Frontend | React 19, Vite, TailwindCSS, Redux Toolkit |
| Auth | Laravel Sanctum (Bearer tokens) |

## Project Structure

```
SRS/
├── SRS-Backend/        # Laravel API
├── Frontend - Copy/    # React + Vite frontend
├── deploy/             # Deployment templates (nginx, server setup)
└── start_local.bat     # Local dev launcher (Windows)
```

## Features

### Human Resources Module
- **Workforce** management — full employee registry with documents, certifications, contracts
- **Attendance** — biometric file upload, late/shortage tracking, overtime calculation, "On Leave" integration
- **Leave Requests (LRF)** — annual / casual / sick / early leave with manager → depot → HR approval flow
- **Overtime Requests (OTR)** — request, approval, DOCX/HTML print
- **Disciplinary** — warning letters
- **Assets & Clearance** — IT/HR asset register with clearance reports
- **Org Chart**
- **Calendar** — leave calendar overview
- **Settings** — managers, employee assignment

### Approval Flow
```
Pending → Manager Approved → Approved
        ↳ Rejected
        ↳ Cancelled (refunds balance if was deducted)
        ↳ Rescheduled
```

Leave balance auto-deducts when `end_date` passes (lazy on each list query).
Annual leave overflows into casual when exhausted.

### Notifications
- Bell in HR header — real-time notifications, polled every 30s
- Click a notification → navigate directly to the related request

## Local Development

### Prerequisites
- PHP 8.2 with extensions: `mysql`, `mbstring`, `xml`, `curl`, `zip`, `bcmath`
- Node.js 18+
- MySQL 8 (or MariaDB 10.6+)
- Composer 2

### Setup
```bash
# Backend
cd SRS-Backend
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate
php artisan serve --host=127.0.0.1 --port=8000

# Frontend
cd "../Frontend - Copy"
npm install
npm run dev
```

Or just double-click `start_local.bat` on Windows.

Open: http://localhost:5173

### Default Accounts (seeded)
| Email | Password | Role |
|---|---|---|
| admin@srs.com | Admin@1234 | Admin |
| awad@srs.com | Admin@1234 | Depot Manager |
| hr@srs.com | Rotem001! | HR Staff |
| eid@rotem.com | Rotem001! | Manager |

## Deployment

See `deploy/README.txt` for full server setup instructions.

Production stack: **Nginx + PHP-FPM + MySQL**.

## License

Proprietary — internal use only.
