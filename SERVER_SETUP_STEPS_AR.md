# تشغيل نظام SRS ERP على سيرفر الشركة خطوة بخطوة

هذا الملف معمول عشان تمشي عليه وانت قدام السيرفر بدون تخمين.

اي مكان تلاقي فيه:

```text
### SERVER_IP_HERE ###
```

بدله بـ IP السيرفر الحقيقي على شبكة الشركة.

مثال فقط:

```text
192.168.1.20
```

لا تستخدم المثال لو مش هو IP السيرفر الحقيقي.

---

## 1. البرامج المطلوبة على السيرفر

نزل وثبت البرامج دي على جهاز السيرفر:

1. XAMPP
   - مهم عشان MySQL.
   - شغل منه MySQL.

2. PHP
   - لو XAMPP فيه PHP 8.2 أو أحدث يبقى تمام.

3. Composer
   - خاص بتشغيل Laravel Backend.

4. Node.js LTS
   - خاص بتشغيل Frontend.

5. Git
   - عشان تسحب المشروع من GitHub.

6. Chrome أو Edge
   - عشان تفتح النظام وتجربه.

---

## 2. اعرف IP السيرفر

افتح PowerShell أو CMD على السيرفر واكتب:

```powershell
ipconfig
```

دور على:

```text
IPv4 Address
```

وخد الرقم اللي شبه:

```text
192.168.x.x
```

هذا هو IP السيرفر.

اكتبه عندك، لأنك هتبدله مكان:

```text
### SERVER_IP_HERE ###
```

---

## 3. اسحب المشروع من GitHub

افتح PowerShell في المكان اللي عايز تحط فيه المشروع، مثلا:

```powershell
cd C:\
```

وبعدين:

```powershell
git clone https://github.com/Muhamadeiid/SRSERP.git
cd SRSERP
```

---

## 4. جهز قاعدة البيانات

افتح XAMPP وشغل:

```text
MySQL
```

بعدها افتح المتصفح واكتب:

```text
http://localhost/phpmyadmin
```

اعمل Database جديدة باسم:

```text
srs
```

خلي الاسم صغير زي ما هو.

---

## 5. جهز Backend

من داخل فولدر المشروع:

```powershell
cd SRS-Backend
composer install
copy .env.lan.example .env
php artisan key:generate
```

افتح ملف:

```text
SRS-Backend\.env
```

وخلي القيم المهمة كده، مع تغيير IP:

```env
APP_ENV=production
APP_DEBUG=false
APP_URL=http://### SERVER_IP_HERE ###:8000

FRONTEND_ORIGINS=http://### SERVER_IP_HERE ###:5175,http://localhost:5175,http://127.0.0.1:5175

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=srs
DB_USERNAME=root
DB_PASSWORD=
```

لو MySQL عندك له password، حطه في:

```env
DB_PASSWORD=
```

بعد كده شغل:

```powershell
php artisan migrate --seed
php artisan config:clear
```

---

## 6. جهز Frontend

ارجع لفولدر المشروع الرئيسي:

```powershell
cd ..
cd "Frontend - Copy"
npm install
copy .env.lan.example .env
```

افتح ملف:

```text
Frontend - Copy\.env
```

وخليه كده، مع تغيير IP:

```env
VITE_API_URL=http://### SERVER_IP_HERE ###:8000/api
VITE_API_BASE=http://### SERVER_IP_HERE ###:8000/api
```

لو موجود ملف:

```text
Frontend - Copy\.env.local
```

خليه بنفس القيم:

```env
VITE_API_URL=http://### SERVER_IP_HERE ###:8000/api
VITE_API_BASE=http://### SERVER_IP_HERE ###:8000/api
```

---

## 7. افتح Firewall

على السيرفر افتح Windows Defender Firewall واعمل Allow للـ Ports دي:

```text
5175
8000
```

Port 5175:

```text
Frontend
```

Port 8000:

```text
Backend API
```

MySQL port 3306 مش لازم تفتحه لأجهزة الشركة لو قاعدة البيانات على نفس السيرفر.

---

## 8. شغل النظام

ارجع لفولدر المشروع الرئيسي:

```powershell
cd C:\SRSERP
```

وشغل:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-company-lan.ps1
```

سيب نافذتي التشغيل مفتوحين.

واحدة للـ Backend وواحدة للـ Frontend.

---

## 9. افتح النظام

من نفس السيرفر:

```text
http://127.0.0.1:5175/login
```

من اي جهاز تاني على نفس شبكة الشركة:

```text
http://### SERVER_IP_HERE ###:5175/login
```

مثال:

```text
http://192.168.1.20:5175/login
```

---

## 10. لو الصفحة فتحت لكن login مش شغال

راجع الآتي:

1. هل MySQL شغال من XAMPP؟
2. هل Backend شغال على port 8000؟
3. هل Frontend شغال على port 5175؟
4. هل IP في Frontend `.env` نفس IP السيرفر؟
5. هل IP في Backend `.env` نفس IP السيرفر؟
6. هل Firewall فاتح 5175 و 8000؟

بعد أي تعديل في `.env` الخاص بالـ Backend شغل:

```powershell
cd C:\SRSERP\SRS-Backend
php artisan config:clear
```

وبعدين اقفل التشغيل وافتحه تاني:

```powershell
cd C:\SRSERP
powershell -ExecutionPolicy Bypass -File .\start-company-lan.ps1
```

---

## 11. تحديث النظام بعدين من GitHub

لو حبيت تجيب آخر نسخة من GitHub:

```powershell
cd C:\SRSERP
git pull origin main
```

وبعدين:

```powershell
cd SRS-Backend
composer install
php artisan migrate
php artisan config:clear
```

ثم:

```powershell
cd "..\Frontend - Copy"
npm install
npm run build
```

وبعدين شغل النظام من جديد:

```powershell
cd C:\SRSERP
powershell -ExecutionPolicy Bypass -File .\start-company-lan.ps1
```

---

## ملاحظات مهمة

- لا ترفع ملفات `.env` على GitHub.
- لا تغير اسم قاعدة البيانات إلا لو غيرته في `.env`.
- لو IP السيرفر اتغير، لازم تعدله في:
  - `SRS-Backend\.env`
  - `Frontend - Copy\.env`
  - `Frontend - Copy\.env.local` لو موجود
- الأفضل تثبت IP السيرفر من إعدادات الراوتر أو Windows عشان ما يتغيرش.
