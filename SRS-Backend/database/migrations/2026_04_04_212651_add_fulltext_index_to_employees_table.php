<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // FULLTEXT indexes for fast multi-word name search (MySQL / MariaDB)
        DB::statement('ALTER TABLE employees ADD FULLTEXT INDEX ft_name          (name)');
        DB::statement('ALTER TABLE employees ADD FULLTEXT INDEX ft_arabic_name   (arabic_name)');
        DB::statement('ALTER TABLE employees ADD FULLTEXT INDEX ft_name_combined (name, arabic_name)');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE employees DROP INDEX ft_name');
        DB::statement('ALTER TABLE employees DROP INDEX ft_arabic_name');
        DB::statement('ALTER TABLE employees DROP INDEX ft_name_combined');
    }
};
