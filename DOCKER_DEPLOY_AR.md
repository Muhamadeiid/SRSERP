# تشغيل SRS ERP باستخدام Docker

## البرامج المطلوبة على السيرفر

- Docker Desktop على Windows Server أو Docker Engine على Linux.
- Docker Compose plugin، بيكون موجود مع Docker Desktop غالبا.
- Git اختياري لو هتنزل المشروع من GitHub مباشرة.
- Browser على أجهزة المستخدمين لفتح النظام.

مش محتاج تثبت PHP أو Composer أو Node.js أو MySQL على السيرفر. Docker هيشغلهم داخل containers.

مفتاح Laravel `APP_KEY` بيتولد تلقائي أول مرة ويتحفظ داخل volume، فلا يحتاج تعديل يدوي.

## أول تشغيل

افتح Terminal أو PowerShell داخل فولدر المشروع:

```powershell
cd C:\Users\elash\srserp
docker compose up -d --build
```

افتح النظام:

```text
http://localhost:5175/login
```

من جهاز تاني على نفس الشبكة:

```text
http://SERVER-IP:5175/login
```

## الحساب الافتراضي

```text
Email: admin@srs.com
Password: password
```

غير الباسورد بعد أول تشغيل.

## إعدادات اختيارية

لو عايز تغير البورتات أو باسورد MySQL:

```powershell
copy .env.docker.example .env
notepad .env
docker compose up -d --build
```

أهم القيم:

```text
FRONTEND_PORT=5175
API_PORT=8000
MYSQL_PORT=3307
MYSQL_ROOT_PASSWORD=srs_root_password
```

## أوامر مهمة

إيقاف النظام:

```powershell
docker compose down
```

تشغيله مرة تانية:

```powershell
docker compose up -d
```

مشاهدة حالة الخدمات:

```powershell
docker compose ps
```

مشاهدة اللوج:

```powershell
docker compose logs -f
```

## قاعدة البيانات

MySQL محفوظة في Docker volume باسم:

```text
srs_mysql_data
```

إيقاف وتشغيل containers لن يمسح الداتا. الداتا تتمسح فقط لو استخدمت:

```powershell
docker compose down -v
```

استخدم الأمر ده بحذر شديد لأنه يمسح قاعدة البيانات.
