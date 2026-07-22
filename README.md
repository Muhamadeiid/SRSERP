# SRS ERP - Offline LAN Deployment

Internal HR and operations system for Rotem SRS Egypt.

The project is designed to run inside the company network without internet publishing:

- Backend: Laravel 10 API
- Frontend: React + Vite
- Database: MySQL / MariaDB
- Auth: Laravel Sanctum bearer tokens

## Main Modules

- Workforce and employee records
- Attendance upload and attendance sheet
- Leave Requests (LRF)
- Overtime Requests (OTR)
- Disciplinary cases
- Assets and Clearance
- Org Chart and direct manager approvals
- Calendar
- Settings and master data

## Local/LAN Quick Start

On the server machine:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-company-lan.ps1
```

The script starts:

- MySQL from XAMPP
- Laravel API on port `8000`
- Frontend on port `5175`

Open on the server:

```text
http://localhost:5175/login
```

Open from another PC on the same LAN:

```text
http://SERVER-IP:5175/login
```

Replace `SERVER-IP` with the IP address printed by the script.

## Docker Quick Start

If Docker is installed on the server, run the whole stack with one command:

```powershell
docker compose up -d --build
```

Docker starts:

- MySQL 8 on host port `3307`
- Laravel API on host port `8000`
- React/Nginx frontend on host port `5175`

Open:

```text
http://localhost:5175/login
```

For another PC on the same LAN:

```text
http://SERVER-IP:5175/login
```

Detailed Arabic Docker steps are in:

```text
DOCKER_DEPLOY_AR.md
```

## Environment Files

Backend:

```text
SRS-Backend/.env
```

Use `SRS-Backend/.env.lan.example` as a template.

Frontend:

```text
Frontend - Copy/.env
```

Use `Frontend - Copy/.env.lan.example` as a template.

Important values:

```text
APP_URL=http://SERVER-IP:8000
FRONTEND_ORIGINS=http://SERVER-IP:5175,http://localhost:5175,http://127.0.0.1:5175
VITE_API_URL=http://SERVER-IP:8000/api
VITE_API_BASE=http://SERVER-IP:8000/api
```

## Database

Default local database:

```text
DB_DATABASE=srs
DB_USERNAME=root
DB_PASSWORD=
```

Run migrations:

```powershell
cd SRS-Backend
php artisan migrate --force
```

## Default Admin

Current local database admin:

```text
Email: admin@srs.com
Password: password
```

Change this password before company-wide use.

## Build Frontend for LAN

```bat
deploy\build_frontend.bat
```

It asks for the server IP and creates:

```text
Frontend - Copy/.env.production
Frontend - Copy/dist
```

## Firewall

Allow inbound access on the server for:

```text
8000 - Laravel API
5175 - Frontend
3306 - MySQL only if remote DB administration is needed
```

Do not expose these ports to the internet.

## Removed Online Deployment Artifacts

Vercel, Render, ngrok, and Cloudflare tunnel defaults were removed from runtime code.
All fallback API URLs now point to the local API.
