# دليل تجهيز وتسليم SRS ERP على سيرفر الشركة

هذا الملف هو ترتيب التنفيذ النهائي. نفذ الخطوات بالترتيب، ولا تنتقل إلى خطوة جديدة قبل التأكد أن السابقة نجحت.

## 1. قبل ما تبدأ

جهز الآتي:

- صلاحية Administrator على السيرفر.
- IP ثابت أو DHCP Reservation من مسؤول الشبكة.
- قرص آخر أو External Drive للنسخ الاحتياطي.
- باسورد قوي لمستخدم قاعدة البيانات `srs_app`.
- باسورد مختلف وقوي لمستخدم MySQL `root`.
- نسخة محفوظة من ملف `.env` الحالي، خصوصا سطر `APP_KEY`.

المسار الحالي للمشروع:

```text
C:\Users\RotemSRS_ERP\srs_stack\srserp
```

مسار إعدادات Laravel:

```text
C:\Users\RotemSRS_ERP\srs_stack\srserp\SRS-Backend\.env
```

مهم جدا: لا تشغل `php artisan key:generate` مرة أخرى ولا تغير `APP_KEY` بعد بدء استخدام النظام.

## 2. البرامج الموجودة حاليا

الموجود داخل:

```text
C:\Users\RotemSRS_ERP\srs_stack
```

- PHP 8.2.28 Portable.
- MySQL Server 8.4.6 Portable.
- Node.js 24.18.0 Portable.
- Composer.
- ملفات المشروع.

Node.js وComposer مطلوبان عند تحديث أو بناء المشروع فقط، ولا يحتاجان للعمل طوال اليوم.

Chrome أو Edge يستخدم لفتح الموقع فقط، وليس جزءا من تشغيل السيرفر.

## 3. البرامج والمكونات المطلوب تثبيتها

ثبت بالترتيب:

1. Microsoft Visual C++ Redistributable x64 الرسمي.
2. Git for Windows لتحديث المشروع لاحقا.
3. IIS من Windows Features.
4. ميزة CGI الخاصة بـ IIS لتشغيل PHP عن طريق FastCGI.
5. IIS URL Rewrite Module.

لا تثبت XAMPP، ولا تحتاج Nginx أو Caddy في هذا التجهيز.

بعد تثبيت VC++ Redistributable، لا تحذف DLLs المنسوخة من Edge إلا بعد التأكد أن:

```powershell
C:\Users\RotemSRS_ERP\srs_stack\php\php.exe -v
```

يعمل بدون أخطاء.

## 4. احتفظ بنسخة أمان قبل أي تعديل

أنشئ فولدر:

```text
D:\SRS-Backups\before-handover
```

انسخ إليه:

- ملف `.env` الحالي.
- فولدر `SRS-Backend\storage`.
- نسخة SQL كاملة من قاعدة `srs`.

احفظ قيمة `APP_KEY` أيضا في Password Manager أو مكان إداري آمن.

## 5. تأمين MySQL

افتح PowerShell كمسؤول، ثم افتح MySQL:

```powershell
C:\Users\RotemSRS_ERP\srs_stack\mysql-8.4.6-winx64\bin\mysql.exe -u root
```

نفذ الأوامر التالية داخل MySQL بعد استبدال الباسوردات:

```sql
CREATE USER IF NOT EXISTS 'srs_app'@'localhost'
IDENTIFIED BY 'CHANGE_ME_STRONG_APP_PASSWORD';

ALTER USER 'srs_app'@'localhost'
IDENTIFIED BY 'CHANGE_ME_STRONG_APP_PASSWORD';

GRANT ALL PRIVILEGES ON srs.* TO 'srs_app'@'localhost';

ALTER USER 'root'@'localhost'
IDENTIFIED BY 'CHANGE_ME_DIFFERENT_ROOT_PASSWORD';

FLUSH PRIVILEGES;
```

اخرج:

```sql
exit
```

اختبر المستخدم الجديد:

```powershell
C:\Users\RotemSRS_ERP\srs_stack\mysql-8.4.6-winx64\bin\mysql.exe -u srs_app -p -e "USE srs; SHOW TABLES;"
```

ممنوع وضع باسورد `root` في ملف `.env`.

## 6. تشغيل MySQL كخدمة Windows

افتح PowerShell كمسؤول:

```powershell
C:\Users\RotemSRS_ERP\srs_stack\mysql-8.4.6-winx64\bin\mysqld.exe --install SRS-MySQL --defaults-file="C:\Users\RotemSRS_ERP\srs_stack\mysql-8.4.6-winx64\my.ini"
```

ثم:

```powershell
Set-Service -Name SRS-MySQL -StartupType Automatic
Start-Service -Name SRS-MySQL
Get-Service -Name SRS-MySQL
```

الحالة المطلوبة: `Running`.

لو كانت هناك نسخة MySQL تعمل يدويا، أوقفها قبل تثبيت الخدمة حتى لا يحدث تعارض على Port 3306.

## 7. إعداد PHP

تأكد أن الإضافات التالية مفعلة في `php.ini`:

```ini
extension=curl
extension=fileinfo
extension=gd
extension=mbstring
extension=openssl
extension=pdo_mysql
extension=zip
extension=bcmath
extension=exif
extension=intl
```

اختبرها:

```powershell
C:\Users\RotemSRS_ERP\srs_stack\php\php.exe -m
```

لابد أن يظهر `pdo_mysql`.

## 8. إعداد IIS وFastCGI

من Windows افتح:

```text
Turn Windows features on or off
```

فعل:

- Internet Information Services.
- Web Management Tools.
- IIS Management Console.
- World Wide Web Services.
- Application Development Features.
- CGI.
- Static Content.
- Default Document.

بعدها افتح IIS Manager:

1. اعمل `Add Website`.
2. Site name: `SRS-ERP`.
3. Physical path:

```text
C:\Users\RotemSRS_ERP\srs_stack\srserp\SRS-Backend\public
```

4. Port: `8000`.
5. IP Address: `All Unassigned` في البداية.
6. أضف FastCGI Handler للملفات `*.php`.
7. استخدم:

```text
C:\Users\RotemSRS_ERP\srs_stack\php\php-cgi.exe
```

8. اجعل `index.php` ضمن Default Documents.
9. ثبت URL Rewrite Module ثم أضف Laravel rewrite rule.
10. امنح IIS صلاحية `Read & Execute` على المشروع.
11. امنح IIS صلاحية `Modify` فقط على:

```text
SRS-Backend\storage
SRS-Backend\bootstrap\cache
```

بعد نجاح IIS، أوقف تشغيل `php -S`. لا تسجله كخدمة Windows لأنه سيرفر تطوير.

## 9. إعداد IP ثابت

الطريقة المفضلة:

1. افتح إعدادات الراوتر أو اطلب من مسؤول الشبكة.
2. اعمل DHCP Reservation للسيرفر.
3. اربط MAC Address الخاص بالسيرفر بالعنوان `192.168.0.30`.
4. اعمل Restart للسيرفر.
5. نفذ:

```powershell
ipconfig
```

6. تأكد أن العنوان أصبح `192.168.0.30`.

لا تستخدم أمر `netsh` قبل التأكد من:

- اسم كارت الشبكة.
- Subnet Mask.
- Default Gateway.
- DNS الخاص بالشركة.

الأفضل أيضا عمل اسم داخلي مثل:

```text
srs-erp
```

## 10. ملف `.env` النهائي

خذ نسخة من `.env` أولا، ثم عدله ليكون بالشكل التالي:

```env
APP_NAME=SRS
APP_ENV=production
APP_KEY=ضع_نفس_القيمة_الحالية_بدون_تغيير
APP_DEBUG=false
APP_URL=http://192.168.0.30:8000

LOG_CHANNEL=stack
LOG_LEVEL=warning

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=srs
DB_USERNAME=srs_app
DB_PASSWORD=CHANGE_ME_STRONG_APP_PASSWORD

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

لو تم اعتماد hostname داخلي، أضفه أيضا إلى `APP_URL` وقوائم Origins/Domains حسب العنوان المستخدم فعليا.

لا تضع مسافات حول علامة `=`، ولا ترسل ملف `.env` على GitHub.

بعد التعديل:

```powershell
cd C:\Users\RotemSRS_ERP\srs_stack\srserp\SRS-Backend
C:\Users\RotemSRS_ERP\srs_stack\php\php.exe artisan optimize:clear
C:\Users\RotemSRS_ERP\srs_stack\php\php.exe artisan config:cache
C:\Users\RotemSRS_ERP\srs_stack\php\php.exe artisan route:cache
```

## 11. Machine Lock

قبل التسليم يجب تعديل الكود ليقرأ:

```env
MACHINE_LOCK_ENABLED=true
```

ويجب إضافة أمر إداري واضح لإعادة ربط الجهاز عند:

- تغيير اسم السيرفر.
- إعادة تثبيت Windows.
- نقل النظام إلى سيرفر بديل.

لا تختبر إعادة الربط بحذف ملفات عشوائيا. احتفظ بنسخة من:

```text
SRS-Backend\storage\app\.machine_lock
```

## 12. Firewall

افتح PowerShell كمسؤول:

```powershell
New-NetFirewallRule -DisplayName "SRS ERP Web" -Direction Inbound -LocalPort 8000 -Protocol TCP -Action Allow -Profile Domain,Private
```

لا تفتح Port 3306 للشبكة. قاعدة البيانات يجب أن تظل متاحة من نفس السيرفر فقط.

لا تغير إعدادات Public Firewall العامة قبل مراجعة مسؤول الشبكة، لأن السيرفر قد يشغل مواقع أو خدمات أخرى.

## 13. النسخ الاحتياطي اليومي

المطلوب:

- نسخة SQL يومية الساعة 2 صباحا.
- الاحتفاظ بآخر 30 يوما.
- الحفظ على `D:` أو External Drive، وليس نفس قرص النظام فقط.
- اختبار Restore فعلي قبل التسليم.

أمر النسخ الأساسي:

```powershell
C:\Users\RotemSRS_ERP\srs_stack\mysql-8.4.6-winx64\bin\mysqldump.exe --single-transaction --routines --triggers -u srs_app -p srs
```

لا تضع الباسورد كنص واضح داخل Task Scheduler. استخدم MySQL login path أو ملف إعدادات بصلاحيات مقيدة.

اعمل Scheduled Task باسم:

```text
SRS ERP Daily Backup
```

واجعله يعمل يوميا الساعة `02:00 AM` سواء المستخدم عامل Login أو لا.

## 14. تحديث المشروع مستقبلا

قبل أي تحديث:

1. اعمل Backup لقاعدة البيانات.
2. اعمل Backup لملف `.env`.
3. اعمل Backup لفولدر `storage`.
4. اسحب النسخة الجديدة من Git.
5. شغل Composer بدون حزم التطوير.
6. شغل migrations.
7. ابن الواجهة من PowerShell، وليس Git Bash.
8. امسح Laravel cache وأعد بناءه.
9. أعد تشغيل IIS Site.
10. نفذ اختبارات التسليم مرة أخرى.

متغيرات بناء الواجهة:

```powershell
$env:VITE_API_URL='/api'
$env:VITE_API_BASE='/api'
npm run build
```

بعد البناء تأكد أن الملفات لا تحتوي على:

```text
C:/Program Files/Git/api
```

## 15. اختبارات التسليم

بعد Restart كامل للسيرفر، اختبر من جهاز آخر على الشبكة:

- [ ] الموقع يفتح من `http://192.168.0.30:8000`.
- [ ] Login يعمل بحساب Admin.
- [ ] إضافة موظف جديد تعمل.
- [ ] تعديل الموظف والمدير المباشر يعمل.
- [ ] رفع ملف Attendance يعمل.
- [ ] حساب Check-in وCheck-out يعمل لليوم السابق والحالي.
- [ ] إنشاء Leave Request يعمل.
- [ ] دورة موافقات المدير المباشر وHR وDepot Manager تعمل.
- [ ] رصيد الإجازات يخصم بعد الاعتماد فقط.
- [ ] تحميل LRF Word يعمل والتوقيعات صحيحة.
- [ ] تحميل Weekly Leave Excel يعمل.
- [ ] Salary Excel export يعمل.
- [ ] إضافة Asset وربطه بموظف تعمل.
- [ ] إرجاع Asset يعيده إلى Available.
- [ ] Disciplinary case يرتبط بالموظف.
- [ ] Backup يومي يتم إنشاؤه.
- [ ] Restore تجريبي نجح على قاعدة اختبار.
- [ ] الموقع يعمل تلقائيا بعد Restart بدون فتح أي نافذة.
- [ ] Machine Lock يرفض نسخة منقولة لجهاز آخر.
- [ ] أجهزة غير مصرح لها خارج شبكة الشركة لا تصل للموقع.

## 16. ترتيب التنفيذ المختصر

نفذ بهذا الترتيب:

1. خذ Backup كامل.
2. احفظ `APP_KEY`.
3. ثبت VC++ Redistributable.
4. ثبت Git.
5. ثبت IIS + CGI + URL Rewrite.
6. أنشئ مستخدم MySQL منفصل وغير باسورد `root`.
7. شغل MySQL كخدمة Windows.
8. فعل `pdo_mysql` في PHP.
9. اربط IIS بـ `php-cgi.exe` ومجلد `public`.
10. ثبت IP من الراوتر.
11. عدل `.env`.
12. جهز Machine Lock وإعادة الربط.
13. افتح Port 8000 للشبكة الداخلية.
14. جهز Backup يومي.
15. اعمل Restart كامل.
16. نفذ كل اختبارات التسليم.
17. سلم مسؤول الشركة نسخة من كلمات المرور و`APP_KEY` وإجراءات الاسترجاع في مكان آمن.

## 17. النتيجة المطلوبة عند التسليم

التسليم يعتبر مكتمل فقط عندما:

- الموقع يعمل بدون Docker Desktop وبدون فتح PowerShell.
- IIS وMySQL يعملان تلقائيا بعد Restart.
- قاعدة البيانات لا تستخدم `root`.
- يوجد Backup يومي مجرب.
- IP أو hostname ثابت.
- كل اختبارات الإجازات والحضور والتقارير والأصول نجحت.
- يوجد شخص مسؤول لديه كلمات المرور ونسخة `APP_KEY` وطريقة Restore.
