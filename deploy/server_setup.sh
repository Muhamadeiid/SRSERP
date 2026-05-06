#!/bin/bash
# ═══════════════════════════════════════════════════════
#  SRS Server Setup Script — Ubuntu/Debian
#  شغّل بـ: sudo bash server_setup.sh YOUR_SERVER_IP
# ═══════════════════════════════════════════════════════

SERVER_IP=${1:-"YOUR_SERVER_IP"}

echo "🚀 Setting up SRS on $SERVER_IP ..."

# ─── 1. تحديث النظام ─────────────────────────────────
apt update && apt upgrade -y

# ─── 2. تثبيت PHP 8.2 ───────────────────────────────
apt install -y software-properties-common
add-apt-repository ppa:ondrej/php -y
apt update
apt install -y php8.2 php8.2-fpm php8.2-mysql php8.2-mbstring \
    php8.2-xml php8.2-curl php8.2-zip php8.2-bcmath \
    php8.2-tokenizer php8.2-fileinfo php8.2-gd

# ─── 3. تثبيت Nginx ─────────────────────────────────
apt install -y nginx

# ─── 4. تثبيت MySQL ─────────────────────────────────
apt install -y mysql-server
mysql -e "CREATE DATABASE IF NOT EXISTS srs CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -e "CREATE USER IF NOT EXISTS 'srs_user'@'localhost' IDENTIFIED BY 'SrsDb@2024';"
mysql -e "GRANT ALL PRIVILEGES ON srs.* TO 'srs_user'@'localhost';"
mysql -e "FLUSH PRIVILEGES;"

# ─── 5. تثبيت Composer ──────────────────────────────
curl -sS https://getcomposer.org/installer | php
mv composer.phar /usr/local/bin/composer

# ─── 6. نسخ ملفات المشروع ────────────────────────────
mkdir -p /var/www/srs/backend
mkdir -p /var/www/srs/frontend

# انسخ ملفات الـ backend
cp -r /tmp/srs/SRS-Backend/. /var/www/srs/backend/
cp /tmp/srs/deploy/backend.env.production /var/www/srs/backend/.env

# انسخ ملفات الـ frontend (dist فقط)
cp -r /tmp/srs/frontend-dist/. /var/www/srs/frontend/dist/

# ─── 7. إعداد Laravel ────────────────────────────────
cd /var/www/srs/backend
composer install --no-dev --optimize-autoloader
php artisan key:generate
php artisan migrate --force
php artisan config:cache
php artisan route:cache
php artisan view:cache

# صلاحيات المجلدات
chown -R www-data:www-data /var/www/srs
chmod -R 755 /var/www/srs/backend/storage
chmod -R 755 /var/www/srs/backend/bootstrap/cache

# ─── 8. إعداد Nginx ──────────────────────────────────
# استبدل YOUR_SERVER_IP بالـ IP الحقيقي
sed "s/YOUR_SERVER_IP/$SERVER_IP/g" /tmp/srs/deploy/nginx.conf > /etc/nginx/sites-available/srs
ln -sf /etc/nginx/sites-available/srs /etc/nginx/sites-enabled/srs
nginx -t && systemctl reload nginx

# ─── 9. تشغيل PHP-FPM ────────────────────────────────
systemctl enable php8.2-fpm
systemctl start php8.2-fpm

# ─── 10. تشغيل Laravel بـ PHP-FPM ────────────────────
# خلي Laravel يشتغل على 127.0.0.1:8000
cat > /etc/systemd/system/srs-backend.service << EOF
[Unit]
Description=SRS Laravel Backend
After=network.target

[Service]
User=www-data
WorkingDirectory=/var/www/srs/backend
ExecStart=/usr/bin/php artisan serve --host=127.0.0.1 --port=8000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable srs-backend
systemctl start srs-backend

echo ""
echo "✅ SRS جاهز على: http://$SERVER_IP"
echo "   API: http://$SERVER_IP/api"
echo ""
echo "⚠️  غيّر باسورد الداتابيز في: /var/www/srs/backend/.env"
