@echo off
echo ==========================================
echo  SRS Frontend Production Build
echo ==========================================
echo.
set /p SERVER_IP="ادخل IP السيرفر (مثال: 192.168.1.100): "

echo VITE_API_URL=http://%SERVER_IP%/api > "C:\Users\hp\SRS\Frontend - Copy\.env.production"
echo.
echo ✅ .env.production تم إنشاؤه بـ: http://%SERVER_IP%/api
echo.

cd "C:\Users\hp\SRS\Frontend - Copy"
echo 🔨 جاري البناء...
npm run build

echo.
echo ✅ تم! ملفات الـ frontend جاهزة في:
echo    C:\Users\hp\SRS\Frontend - Copy\dist\
echo.
pause
