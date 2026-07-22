#!/bin/bash
set -e

echo "[SRS] Starting up..."

if [ ! -f .env ]; then
    echo "[SRS] Creating .env from .env.example..."
    cp .env.example .env
fi

# Render sets PORT dynamically — reconfigure Apache to match
if [ -n "$PORT" ]; then
    sed -i "s/Listen 80/Listen $PORT/" /etc/apache2/ports.conf
    sed -i "s/:80>/:$PORT>/" /etc/apache2/sites-available/000-default.conf
    echo "[SRS] Apache configured on port $PORT"
fi

mkdir -p storage/app storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs bootstrap/cache
chown -R www-data:www-data storage bootstrap/cache
chmod -R 775 storage bootstrap/cache

# Clear cached config so env vars are picked up fresh
php artisan config:clear
php artisan cache:clear

# Generate a stable APP_KEY once and keep it in the persisted storage volume.
if [ -z "$APP_KEY" ] && ! grep -q '^APP_KEY=base64:' .env; then
    KEY_FILE="storage/app/docker_app_key"
    mkdir -p storage/app
    if [ ! -f "$KEY_FILE" ]; then
        echo "[SRS] Generating Docker APP_KEY..."
        php artisan key:generate --show > "$KEY_FILE"
    fi
    export APP_KEY="$(cat "$KEY_FILE")"
fi

if [ "$DB_CONNECTION" = "mysql" ]; then
    echo "[SRS] Waiting for MySQL at ${DB_HOST}:${DB_PORT:-3306}..."
    until php -r "
        try {
            new PDO('mysql:host=' . getenv('DB_HOST') . ';port=' . (getenv('DB_PORT') ?: 3306), getenv('DB_USERNAME'), getenv('DB_PASSWORD'));
            exit(0);
        } catch (Throwable \$e) {
            exit(1);
        }
    "; do
        sleep 2
    done
fi

# Run migrations
echo "[SRS] Running migrations..."
php artisan migrate --force

# Seed default users
echo "[SRS] Seeding default users..."
php artisan db:seed --class=UsersSeeder --force

# Cache config for performance
php artisan config:cache
php artisan route:cache
php artisan event:cache

echo "[SRS] Starting Apache..."
apache2-foreground
