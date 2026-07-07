SRS ERP - Company LAN Deployment
================================

This folder contains helper files for an offline/local company server setup.
No Vercel, Render, ngrok, or public tunnel is required.

1. Backend env
--------------
Copy:

  deploy\backend.env.production

to:

  SRS-Backend\.env

Then replace:

  YOUR_SERVER_IP

with the real LAN IP address of the server.

Generate an app key if APP_KEY is empty:

  cd SRS-Backend
  php artisan key:generate

2. Frontend env/build
---------------------
Run:

  deploy\build_frontend.bat

Enter the server LAN IP when prompted.

3. Database
-----------
Create a MySQL database named:

  srs

Then run:

  cd SRS-Backend
  php artisan migrate --force

4. Start for LAN
----------------
From the project root:

  powershell -ExecutionPolicy Bypass -File .\start-company-lan.ps1

Open from other PCs:

  http://SERVER-IP:5175/login

5. Firewall
-----------
Allow inbound TCP:

  8000
  5175

Keep the system inside the company network only.
