#!/bin/bash
set -e

echo "[SRS] Starting up..."

# Render sets PORT dynamically — reconfigure Apache to match
if [ -n "$PORT" ]; then
    sed -i "s/Listen 80/Listen $PORT/" /etc/apache2/ports.conf
    sed -i "s/:80>/:$PORT>/" /etc/apache2/sites-available/000-default.conf
    echo "[SRS] Apache configured on port $PORT"
fi

# Clear cached config so env vars are picked up fresh
php artisan config:clear
php artisan cache:clear

# Generate APP_KEY if not set
if [ -z "$APP_KEY" ]; then
    echo "[SRS] Generating APP_KEY..."
    php artisan key:generate --force
fi

# Run migrations
echo "[SRS] Running migrations..."
php artisan migrate --force

# Cache config for performance
php artisan config:cache
php artisan route:cache
php artisan event:cache

echo "[SRS] Starting Apache..."
apache2-foreground
