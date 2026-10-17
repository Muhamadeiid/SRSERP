<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        \PhpOffice\PhpSpreadsheet\Cell\Cell::setValueBinder(new \App\Support\FormulaSafeValueBinder());
    }
}
