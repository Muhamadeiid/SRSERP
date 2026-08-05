# SRS ERP — دليل التسليم والاعتماد النهائي

> ملف مرجعي لكل ما تم عمله وما يجب عمله قبل تسليم الموقع للشركة.
> آخر تحديث: 2026-07-24

---

## الوضع الحالي (ما تم إنجازه)

### السوفتوير المثبت على السيرفر
كله portable في `C:\Users\RotemSRS_ERP\srs_stack\`:

| البرنامج | النسخة | ملاحظة |
|---|---|---|
| PHP | 8.2.28 | portable + DLLs من Edge (مؤقت) |
| MySQL | 8.4.6 Community | portable، بيانات في `mysql-data\` |
| Node.js | 24.18.0 | portable (استخرج من MSI بـ `msiexec /a`) |
| Composer | latest | ملف .phar واحد |

### تعديلات الكود (على GitHub `Muhamadeiid/SRSERP`)
1. **جديد**: `SRS-Backend/app/Http/Middleware/VerifyMachineLicense.php` — machine lock
2. **معدل**: `SRS-Backend/app/Http/Kernel.php` — تسجيل الـ middleware
3. **معدل**: `SRS-Backend/routes/web.php` — يخدم React SPA
4. **جديد**: مجلد `scripts/` كامل — deployment scripts

**كود SRS الأساسي (Attendance, Leaves, Assets, Employees) لم يتغير.**

### الموقع شغال حالياً على
- محلي: `http://localhost:8000`
- LAN: `http://192.168.0.30:8000`
- Admin email: `admin@srs.com` (set a unique password on the server; never store it in Git)

---

## قائمة الإجراءات المتبقية قبل التسليم النهائي

## 🔴 حرجة (لازم قبل الاعتماد)

### 1. مستخدم MySQL منفصل بدل root
شغّل مرة واحدة على الجهاز البعيد (PowerShell):
```powershell
$mysql = 'C:\Users\RotemSRS_ERP\srs_stack\mysql-8.4.6-winx64\bin\mysql.exe'
$appPass = 'CHANGE_ME_STRONG_APP_PASSWORD'
$rootPass = 'CHANGE_ME_STRONG_ROOT_PASSWORD'
& $mysql -u root -e "CREATE USER 'srs_app'@'localhost' IDENTIFIED BY '$appPass'; GRANT ALL PRIVILEGES ON srs.* TO 'srs_app'@'localhost'; ALTER USER 'root'@'localhost' IDENTIFIED BY '$rootPass'; FLUSH PRIVILEGES;"
```
ثم عدّل `SRS-Backend/.env`:
```env
DB_USERNAME=srs_app
DB_PASSWORD=CHANGE_ME_STRONG_APP_PASSWORD
```

### 2. Web Server حقيقي بدل `php -S`
`php -S` = development فقط. هيعلق مع 5+ users متزامنين، مافيهوش logs جيدة، مافيهوش SSL.

**الخيار الأنظف: Caddy Portable**
- ~40MB executable واحد
- HTTPS تلقائي (لو أضفت domain)
- config بسطر واحد
```
:8000 {
    root * C:\Users\RotemSRS_ERP\srs_stack\srserp\SRS-Backend\public
    php_fastcgi 127.0.0.1:9000
    file_server
}
```
مع تشغيل `php-cgi.exe -b 127.0.0.1:9000` في الخلفية.

**البديل: nginx portable** — أخف بس أعقد في الإعداد.

### 3. Static IP + hostname
- من Router: احجز `192.168.0.30` للـ MAC address بتاع الجهاز
- من Windows (PowerShell as Admin):
  ```powershell
  netsh interface ip set address "Ethernet" static 192.168.0.30 255.255.255.0 192.168.0.1
  netsh interface ip set dns "Ethernet" static 8.8.8.8
  ```
- بعدها في `.env`: `APP_URL=http://192.168.0.30:8000`

### 4. VC++ Redistributable رسمي (UAC واحد)
- الملف موجود على الأرجح في `Downloads\Installers\`
- شغّله مرة واحدة → استغني عن DLLs من Edge folder
- بعد التثبيت، احذف الـ DLLs المنسوخة من `php\` و `mysql\bin\` (اختياري بس أنظف)

### 5. Backup يومي
احفظ الملف ده في `C:\Users\RotemSRS_ERP\srs_stack\backup-mysql.ps1`:
```powershell
$backupDir = 'D:\srs_backups'  # ← لازم قرص مختلف!
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$date = Get-Date -Format 'yyyy-MM-dd_HHmm'
$out = Join-Path $backupDir "srs_$date.sql"
$mysqldump = 'C:\Users\RotemSRS_ERP\srs_stack\mysql-8.4.6-winx64\bin\mysqldump.exe'
& $mysqldump -u root --single-transaction --routines --triggers srs | Out-File $out -Encoding utf8
# احذف backups أقدم من 30 يوم
Get-ChildItem $backupDir -Filter 'srs_*.sql' | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | Remove-Item
```

ثم Scheduled Task يومي 2 AM:
```powershell
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -File C:\Users\RotemSRS_ERP\srs_stack\backup-mysql.ps1'
$trigger = New-ScheduledTaskTrigger -Daily -At 2am
Register-ScheduledTask -TaskName 'SRS-Backup' -Action $action -Trigger $trigger
```

**⚠️ اختبر الاسترجاع مرة واحدة على الأقل — Backup مش مختبر = مش موجود.**

---

## 🟡 مهمة (تحسين تشغيل)

### 6. Windows Services (auto-start بعد Restart)
استخدم **NSSM** (Non-Sucking Service Manager) — portable exe واحد، بدون UAC:

تحميل: https://nssm.cc/download → استخرج `nssm.exe`

```powershell
# Service للـ MySQL
.\nssm.exe install SRS-MySQL "C:\Users\RotemSRS_ERP\srs_stack\mysql-8.4.6-winx64\bin\mysqld.exe" "--defaults-file=C:\Users\RotemSRS_ERP\srs_stack\mysql-8.4.6-winx64\my.ini"
.\nssm.exe set SRS-MySQL Start SERVICE_AUTO_START

# Service للـ PHP
.\nssm.exe install SRS-Web "C:\Users\RotemSRS_ERP\srs_stack\php\php.exe" "-S 0.0.0.0:8000 -t C:\Users\RotemSRS_ERP\srs_stack\srserp\SRS-Backend\public"
.\nssm.exe set SRS-Web AppDirectory "C:\Users\RotemSRS_ERP\srs_stack\srserp\SRS-Backend"
.\nssm.exe set SRS-Web Start SERVICE_AUTO_START

# تشغيل
Start-Service SRS-MySQL, SRS-Web
```

النتيجة: Services حقيقية، logs في Event Viewer، auto-start.

### 7. Machine Lock — خليها اختيارية

عدّل `SRS-Backend/app/Http/Middleware/VerifyMachineLicense.php`:
```php
public function handle(Request $request, Closure $next)
{
    if (! env('MACHINE_LOCK_ENABLED', true)) {
        return $next($request);
    }
    if ($this->isAuthorized()) {
        return $next($request);
    }
    return response()->json([
        'error' => 'License violation',
        'message' => 'This installation is bound to a different machine.',
    ], 403);
}
```
وأضف في `.env`: `MACHINE_LOCK_ENABLED=true`

### 8. Reset command للـ machine lock

أنشئ `SRS-Backend/app/Console/Commands/MachineLockReset.php`:
```php
<?php
namespace App\Console\Commands;
use Illuminate\Console\Command;
class MachineLockReset extends Command {
    protected $signature = 'machine-lock:reset';
    protected $description = 'Delete stored machine fingerprint to allow re-binding on next request';
    public function handle() {
        $path = storage_path('app/.machine_lock');
        if (file_exists($path)) { unlink($path); $this->info('Reset done. Next request will re-capture.'); }
        else { $this->warn('No .machine_lock file to remove.'); }
    }
}
```
استخدام: `php artisan machine-lock:reset`

### 9. Firewall rules محددة
```powershell
# اسمح فقط للـ port 8000 من الشبكة الداخلية
New-NetFirewallRule -DisplayName "SRS-Web" -Direction Inbound -LocalPort 8000 -Protocol TCP -Action Allow -Profile Private
# امنع الوصول من Public
Set-NetFirewallProfile -Profile Public -DefaultInboundAction Block
```

---

## 🟢 اختبارات قبل التسليم (Smoke tests)

بعد كل التغييرات + **Restart كامل للسيرفر**:
- [ ] Services شغالة تلقائي: `Get-Service SRS-MySQL, SRS-Web`
- [ ] Login بـ `admin@srs.com` من جهاز آخر على الشبكة
- [ ] Attendance upload (Excel file)
- [ ] LRF Word export
- [ ] Salary Excel export
- [ ] إضافة موظف جديد
- [ ] رفع Asset مع صورة
- [ ] Notification click ينقل للـ leave request
- [ ] **Machine lock**: انسخ الفولدر لجهاز تاني وشغّل — لازم يرد 403
- [ ] Backup file اتعمل ساعة 2 AM
- [ ] استرجاع Backup على قاعدة تجريبية

---

## ⚙️ إعدادات .env النهائية

```env
APP_NAME=SRS
APP_ENV=production
APP_KEY=(احتفظ بالقيمة الحالية - لا تغيّرها!)
APP_DEBUG=false
APP_URL=http://192.168.0.30:8000

LOG_CHANNEL=stack
LOG_LEVEL=warning

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=srs
DB_USERNAME=srs_app
DB_PASSWORD=(باسورد قوي هنا)

CACHE_DRIVER=file
QUEUE_CONNECTION=sync
SESSION_DRIVER=file
SESSION_LIFETIME=480

FILESYSTEM_DISK=local
MAIL_MAILER=log

FRONTEND_ORIGINS=http://192.168.0.30:8000
SANCTUM_STATEFUL_DOMAINS=192.168.0.30:8000

MACHINE_LOCK_ENABLED=true
```

---

## 🚨 حفظ الـ APP_KEY

الملف: `C:\Users\RotemSRS_ERP\srs_stack\srserp\SRS-Backend\.env`

**السطر ده:**
```
APP_KEY=base64:xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx=
```

انسخه في:
1. Password manager (LastPass/1Password/Bitwarden)
2. ملف txt على قرص آخر
3. طبعه على ورق

**لو ضاع الـ APP_KEY:**
- Sessions القديمة تنتهي
- Cookies المشفرة تفشل
- أي حقل مشفر في DB بيبقى غير قابل للقراءة

---

## المشاكل المعروفة (Known Issues)

### 1. Frontend baseURL مبني غلط (قيد الإصلاح)
- المشكلة: `baseURL: C:/Program Files/Git/api` بدل `/api`
- السبب: Git Bash حوّل الـ path
- الحل الجاهز: `scripts/fix-frontend-baseurl.ps1` — شغّله مرة واحدة
- منع تكراره: ابني frontend من PowerShell، **لا Git Bash**

### 2. PHP یعتمد على DLLs من Edge
- الحل الدائم: تنصيب VC++ Redistributable (بند 4 فوق)

### 3. Docker Desktop مثبت بس مش شغال
- Linux Engine بيرجع HTTP 500
- الحل يحتاج WSL2 install (UAC)
- **مش محتاجينه — بنستخدم portable stack**

---

## GitHub Releases

- `v-deploy-2026-07-23`
  - `srs-deploy.zip` (36MB): Laravel + vendor + built frontend
  - `public-only.zip` (1.1MB): Frontend فقط (النسخة المصححة)
- `v-mysql-portable-2026-07-23`
  - `mysql.zip` (249MB): MySQL 8.4.6 portable
  - `mysql-data.zip` (7MB): pre-initialized data directory

---

## المسارات المهمة على السيرفر

| المسار | ما يحتويه |
|---|---|
| `C:\Users\RotemSRS_ERP\srs_stack\` | كل السوفتوير + المشروع |
| `srs_stack\srserp\SRS-Backend\` | Laravel backend |
| `srs_stack\srserp\SRS-Backend\.env` | إعدادات (احفظ نسخة!) |
| `srs_stack\srserp\SRS-Backend\public\` | Frontend files + Laravel entry |
| `srs_stack\srserp\SRS-Backend\storage\` | Uploads + logs + machine_lock |
| `srs_stack\mysql-data\` | قاعدة البيانات (backup ده!) |
| `srs_stack\php\php.ini` | إعدادات PHP |
| `srs_stack\mysql-8.4.6-winx64\my.ini` | إعدادات MySQL |
| `C:\Users\RotemSRS_ERP\Desktop\*.log` | logs من الـ scripts |

---

## أوامر تشغيل سريعة

**بدء الموقع يدوياً (بعد Restart):**
```powershell
& 'C:\Users\RotemSRS_ERP\srs_stack\srs-launcher.ps1'
```

**إيقاف:**
```powershell
& 'C:\Users\RotemSRS_ERP\srs_stack\srs-stop.ps1'
```

**check حالة:**
```powershell
Get-Process mysqld, php
```

**فحص الموقع من الـ CLI:**
```powershell
Invoke-WebRequest http://127.0.0.1:8000 -UseBasicParsing
```

---

## ملخص التقييم

| المعيار | التقييم |
|---|---|
| يشغل الموقع في الشبكة | ✅ نعم |
| مناسب للتجربة | ✅ نعم |
| **جاهز للاعتماد النهائي** | ❌ **لا** — يحتاج بنود 1-5 |
| قابل للتحويل لـ production | ✅ نعم بعد التقفيل |

---

**آخر ملاحظة:** لا تعيد التثبيت من الصفر، ولا تركب XAMPP. الأساس الحالي (PHP portable + MySQL portable) أخف وأنظف من XAMPP. المطلوب فقط تقفيل خطوات التشغيل والأمان اللي فوق.
