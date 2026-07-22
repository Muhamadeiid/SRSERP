# دليل تشغيل SRS ERP على سيرفر الشركة

هذا الدليل معمول كخطوات عملية. امشي بالترتيب، ولو خطوة نجحت كمل اللي بعدها.

## أسرع طريقة جاهزة

لو Docker Desktop متثبت وشغال على السيرفر، افتح فولدر المشروع واضغط:

`START_SRS_ERP.bat`

هذا الملف يعمل الآتي تلقائيًا:

1. يتأكد إن Docker شغال.
2. يعمل ملف `.env` لو مش موجود.
3. يحمل صور Docker الجاهزة لو موجودة في فولدر `offline`.
4. يبني الصور لو مش موجودة والسيرفر عنده إنترنت.
5. يشغل الموقع والباك إند والداتابيز.
6. يفتح لك رابط الموقع.

لإيقاف النظام اضغط:

`STOP_SRS_ERP.bat`

لعمل نسخة احتياطية:

`BACKUP_SRS_ERP.bat`

لاسترجاع نسخة احتياطية:

`RESTORE_SRS_ERP.bat`

لتجهيز نسخة Docker Offline من جهاز عنده إنترنت ومساحة فاضية:

`MAKE_OFFLINE_DOCKER_PACKAGE.bat`

## الفكرة ببساطة

المشروع هيشتغل على السيرفر من خلال Docker.

Docker هيشغل 3 أجزاء:

1. الموقع نفسه: الصفحة اللي الناس هتفتحها من المتصفح.
2. الباك إند: الجزء اللي بيحفظ ويقرأ البيانات.
3. قاعدة البيانات MySQL: مكان تخزين الموظفين، الإجازات، الحضور، الأصول، والتحذيرات.

الموظفين هيفتحوا الموقع من أجهزة الشركة عن طريق IP السيرفر، مثل:

`http://192.168.1.50:5175/login`

## قبل ما تبدأ

تأكد إن السيرفر فيه:

- مساحة فاضية لا تقل عن 30GB، والأفضل 50GB أو أكثر.
- RAM لا تقل عن 8GB، والأفضل 16GB.
- Windows 10/11 Pro أو Windows Server مناسب لتشغيل Docker.
- كابل شبكة ثابت، وليس Wi-Fi.
- IP ثابت للسيرفر.

لو الهارد HDD، الموقع هيشتغل، لكن أول تشغيل ورفع ملفات كبيرة وتقارير Excel ممكن يبقوا أبطأ من SSD.

## البرامج المطلوبة

ثبت البرامج دي على السيرفر:

1. Docker Desktop
2. Git for Windows
3. Google Chrome أو Microsoft Edge
4. 7-Zip اختياري لو هتنقل ملفات مضغوطة

لو السيرفر مش هيتوصل بالإنترنت نهائيًا، لازم نجهز ملفات Docker من جهاز آخر وننقلها للسيرفر. التفاصيل موجودة تحت في جزء "لو السيرفر Offline".

## تثبيت Docker

1. افتح Docker Desktop Installer.
2. كمل Next عادي.
3. لو طلب تفعيل WSL أو Virtualization وافق.
4. اعمل Restart للسيرفر لو طلب.
5. افتح Docker Desktop.
6. استنى لحد ما يظهر إن Docker Engine شغال.

لو فضل واقف على رسالة مثل:

`Engine is the underlying technology that runs containers`

اعمل الآتي:

1. اقفل Docker Desktop.
2. اعمل Restart للسيرفر.
3. افتح Docker Desktop تاني.
4. استنى 3 إلى 5 دقائق.

لو لسه واقف، غالبًا Virtualization مش مفعلة من BIOS أو WSL مش متثبت صح.

## تثبيت Git

ثبت Git for Windows بالإعدادات العادية.

بعد التثبيت افتح Start واكتب:

`PowerShell`

وافتحه كمسؤول Administrator.

## تجهيز مكان المشروع

اعمل فولدر للمشروع:

```powershell
mkdir C:\SRS
cd C:\SRS
```

هات المشروع من GitHub:

```powershell
git clone YOUR_GITHUB_REPO_URL srserp
cd C:\SRS\srserp
```

استبدل `YOUR_GITHUB_REPO_URL` برابط المشروع من GitHub.

لو السيرفر Offline، بدل GitHub هتنقل فولدر المشروع بفلاشة أو من الشبكة وتحطه في:

`C:\SRS\srserp`

## تجهيز ملف الإعدادات

في فولدر المشروع افتح PowerShell واكتب:

```powershell
copy .env.docker.example .env
notepad .env
```

اكتب الإعدادات المهمة بالشكل ده:

```env
APP_NAME=SRS
APP_ENV=production
APP_DEBUG=false

FRONTEND_PORT=5175
API_PORT=8000
MYSQL_PORT=3307

MYSQL_DATABASE=srs
MYSQL_ROOT_PASSWORD=Change_This_Password_Only_You_Know

APP_URL=http://192.168.1.50:8000
FRONTEND_ORIGINS=http://192.168.1.50:5175,http://localhost:5175,http://127.0.0.1:5175
```

غير `192.168.1.50` إلى IP السيرفر الحقيقي.

اختار IP ثابت واضح، مثل:

- `192.168.1.50`
- `192.168.1.60`
- `192.168.10.50`

بلاش تستخدم أرقام غالبًا الراوتر أو الأجهزة التلقائية بتاخدها مثل `.1` أو `.2`.

## لو فيه موقع تاني على نفس السيرفر

مفيش مشكلة طالما كل موقع شغال على Port مختلف.

الموقع ده افتراضيًا بيستخدم:

- `5175` للموقع
- `8000` للباك إند
- `3307` للداتابيز

لو Port 5175 مستخدم، غيره في `.env` مثل:

```env
FRONTEND_PORT=8085
```

ساعتها الموقع يفتح من:

`http://192.168.1.50:8085/login`

## تشغيل المشروع

من PowerShell داخل فولدر المشروع:

```powershell
cd C:\SRS\srserp
docker compose up -d --build
```

أول مرة ممكن تاخد وقت طويل، خصوصًا مع HDD.

بعد ما يخلص، راجع الحالة:

```powershell
docker compose ps
```

لازم تشوف 3 حاجات شغالة:

- `srs-erp-frontend`
- `srs-erp-api`
- `srs-erp-db`

افتح الموقع من السيرفر:

`http://127.0.0.1:5175/login`

وافتحه من جهاز تاني على نفس الشبكة:

`http://SERVER-IP:5175/login`

مثال:

`http://192.168.1.50:5175/login`

## حساب الدخول الافتراضي

```text
Email: admin@srs.com
Password: password
```

بعد أول دخول، غير الباسورد أو اعمل حسابات حقيقية من النظام.

## فتح الموقع لباقي أجهزة الشركة

افتح Windows Defender Firewall.

اعمل Allow للـ Port الخاص بالموقع:

`5175`

لو غيرته إلى `8085` افتح `8085` بدل `5175`.

غالبًا المستخدمين مش محتاجين يفتحوا `8000` أو `3307` من أجهزتهم، لأن الموقع نفسه بيكلم الباك إند داخليًا.

## لو السيرفر Offline

لو السيرفر مش هيدخل إنترنت نهائيًا، عندك طريقتين:

### الطريقة الأسهل

وصل السيرفر بالإنترنت مرة واحدة فقط وقت أول تشغيل:

```powershell
docker compose up -d --build
```

بعد ما يشتغل، افصل الإنترنت. الموقع هيكمل شغال على شبكة الشركة.

### الطريقة بدون إنترنت نهائيًا

على جهاز عنده إنترنت شغل المشروع وابني Docker، ثم اعمل Export للصور:

```powershell
docker save mysql:8.0 srserp-api srserp-frontend -o srs-docker-images.tar
```

انقل الملف `srs-docker-images.tar` للسيرفر.

على السيرفر:

```powershell
docker load -i srs-docker-images.tar
docker compose up -d
```

مهم: لو عدلت في الكود بعد تصدير الصور، لازم تعمل Export جديد للصور.

## نقل الداتا من جهازك للسيرفر

لو عايز نفس الداتا الموجودة عندك حاليًا، لازم نعمل Backup من MySQL وننقله.

على الجهاز القديم:

```powershell
docker exec srs-erp-db mysqldump -uroot -p srs > srs_backup.sql
```

هيطلب باسورد MySQL. اكتب الباسورد الموجود في `.env`.

على السيرفر، بعد تشغيل Docker:

```powershell
docker exec -i srs-erp-db mysql -uroot -p srs < srs_backup.sql
```

لو الداتا جديدة وفاضية، تخطى الجزء ده واعمل Import من داخل الموقع.

## التشغيل اليومي

لتشغيل الموقع:

```powershell
cd C:\SRS\srserp
docker compose up -d
```

لإيقاف الموقع:

```powershell
cd C:\SRS\srserp
docker compose stop
```

لإعادة التشغيل:

```powershell
cd C:\SRS\srserp
docker compose restart
```

لا تستخدم حذف أو Reset إلا لو فاهم إن ده ممكن يمسح الداتا.

## تحديث المشروع من GitHub

لو السيرفر متوصل بالإنترنت:

```powershell
cd C:\SRS\srserp
git pull
docker compose up -d --build
```

لو السيرفر Offline:

1. نزل آخر نسخة من المشروع على جهاز تاني.
2. انقلها للسيرفر.
3. شغل:

```powershell
docker compose up -d --build
```

لو السيرفر Offline تمامًا، هتحتاج كمان صور Docker جاهزة كما في جزء Offline.

## Backup يومي مهم جدًا

اعمل فولدر للباك أب:

```powershell
mkdir C:\SRS_Backups
```

اعمل Backup:

```powershell
docker exec srs-erp-db mysqldump -uroot -p srs > C:\SRS_Backups\srs_backup.sql
```

الأفضل تعمل Backup يومي في آخر اليوم، وتنسخه على هارد خارجي أو مكان آمن على الشبكة.

## نصائح مهمة عشان السرعة على HDD

1. خلي السيرفر متوصل بكابل شبكة.
2. خلي RAM لا تقل عن 8GB، والأفضل 16GB.
3. اقفل البرامج غير المهمة على السيرفر.
4. خليه جهاز مخصص للنظام قدر الإمكان.
5. متفتحش Excel كبير أو برامج تقيلة على نفس السيرفر أثناء شغل الناس.
6. خلي Windows Defender أو أي Antivirus مايفحصش فولدر Docker باستمرار لو ده متاح عند IT.
7. خلي Backup يتعمل بعد مواعيد الشغل، مش وقت رفع Attendance أو تقارير.
8. متخليش المساحة تقل عن 15GB فاضي.
9. لو الداتا كبرت جدًا أو Attendance بقى تقيل، أفضل ترقية هي نقل Docker وملفات الداتا إلى SSD.

## علامات إن كل شيء شغال

لما تكتب:

```powershell
docker compose ps
```

لازم تلاقي:

- Frontend: Up
- API: Up
- DB: Up / healthy

ولما تفتح:

`http://SERVER-IP:5175/login`

تظهر صفحة تسجيل الدخول.

## مشاكل شائعة

### الموقع مش بيفتح من جهاز تاني

راجع 3 حاجات:

1. الجهازين على نفس الشبكة.
2. IP السيرفر صحيح.
3. Firewall فاتح Port الموقع.

### Invalid credentials

جرب:

```text
admin@srs.com
password
```

لو اتغير الباسورد، استخدم الحساب الجديد أو اعمل Reset من الداتابيز.

### Backend مش شغال

راجع:

```powershell
docker compose ps
docker logs srs-erp-api --tail 100
```

### Database مش شغالة

راجع:

```powershell
docker logs srs-erp-db --tail 100
```

### المساحة خلصت

اعرف استهلاك Docker:

```powershell
docker system df
```

تنظيف آمن غالبًا:

```powershell
docker builder prune -f
docker image prune -f
```

لا تستخدم حذف Volumes إلا لو عارف إنك عندك Backup، لأن الـ Volumes فيها الداتابيز.

## أهم تحذير

الداتابيز محفوظة داخل Docker Volume.

يعني:

- `docker compose stop` آمن.
- `docker compose restart` آمن.
- `docker compose down` غالبًا آمن لو من غير `-v`.
- `docker compose down -v` خطر لأنه يحذف الداتابيز.

متستخدمش أي أمر فيه `-v` أو `volume prune` إلا بعد Backup واضح.
