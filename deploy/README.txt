═══════════════════════════════════════════════════════════════
  SRS — دليل النشر على السيرفر
═══════════════════════════════════════════════════════════════

─── البرامج المطلوبة على السيرفر ────────────────────────────
  ✅ PHP 8.2      (+ extensions: mysql, mbstring, xml, curl, zip, bcmath)
  ✅ MySQL 8.0    (أو MariaDB 10.6+)
  ✅ Nginx        (أو Apache)
  ✅ Composer 2

  ⬇️  روابط التنزيل (Windows Server):
  PHP:      https://windows.php.net/download/
  MySQL:    https://dev.mysql.com/downloads/installer/
  Nginx:    https://nginx.org/en/download.html
  Composer: https://getcomposer.org/Composer-Setup.exe

─── الخطوات ─────────────────────────────────────────────────

  1. اشغّل build_frontend.bat
     → هيسألك عن IP السيرفر
     → هيعمل dist/ جاهز للنشر

  2. انسخ الملفات للسيرفر:
     Backend  → /var/www/srs/backend   (كل مجلد SRS-Backend)
     Frontend → /var/www/srs/frontend  (مجلد dist/ بس)

  3. على السيرفر:
     cp deploy/backend.env.production /var/www/srs/backend/.env
     (غيّر YOUR_SERVER_IP و YOUR_DB_PASSWORD في الملف)

  4. شغّل على السيرفر:
     cd /var/www/srs/backend
     composer install --no-dev
     php artisan migrate --force
     php artisan config:cache

  5. ضع nginx.conf في /etc/nginx/sites-available/srs
     (غيّر YOUR_SERVER_IP بالـ IP الحقيقي)

─── ليه الـ WiFi بيقطع؟ ─────────────────────────────────────

  المشكلة: php artisan serve --host=0.0.0.0
  → بيبث على كل واجهات الشبكة
  → مع VPN/ShadowCube بيعمل تعارض في الـ routing
  → الراوتر بيتخبط ويقطع الشبكة

  الحل على السيرفر: استخدم Nginx + PHP-FPM
  → Laravel بيشتغل على 127.0.0.1 فقط (داخلي)
  → Nginx هو اللي بيتكلم مع الشبكة
  → مفيش تعارض خالص ✅

  الحل المؤقت على اللابتوب:
  → شغّل بـ --host=127.0.0.1 بدل 0.0.0.0
  → بس مش هيقدر حد تاني يوصله

─── اكونتات النظام ──────────────────────────────────────────

  admin@srs.com        / Admin@1234      (Admin)
  awad@srs.com         / (باسورده)       (Depot Manager)
  abdallah@rotem.com   / (باسورده)       (Admin)
  ccp@rotem.com        / Rotem001!       (Staff)
  eid@rotem.com        / Rotem001!       (Manager)
  ehab@srs.com         / Rotem001!       (Manager)
  hr@srs.com           / Rotem001!       (HR Staff)

═══════════════════════════════════════════════════════════════
