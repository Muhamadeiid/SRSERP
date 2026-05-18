#!/bin/bash
set -e

# Render sets PORT dynamically — reconfigure Apache to match
if [ -n "$PORT" ]; then
    sed -i "s/Listen 80/Listen $PORT/" /etc/apache2/ports.conf
    sed -i "s/:80>/:$PORT>/" /etc/apache2/sites-available/000-default.conf
fi

php artisan config:clear
php artisan migrate --force

apache2-foreground
