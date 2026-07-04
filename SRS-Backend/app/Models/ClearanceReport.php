<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

class ClearanceReport extends Model
{
    protected $fillable = [
        'employee_id', 'tracking_no', 'generated_by', 'active_assets_at_generation',
    ];

    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }

    /**
     * Reserve the next sequential tracking number for the year and project.
     * Uses a DB transaction + row-level lock so concurrent clearances
     * never collide.
     * Returns something like "ECF-EG1-2026-0004".
     */
    public static function nextTrackingNo(string $projectCode): string
    {
        $year = date('Y');
        return DB::transaction(function () use ($projectCode, $year) {
            $count = self::where('tracking_no', 'like', "ECF-{$projectCode}-{$year}-%")
                ->lockForUpdate()
                ->count();
            $seq = str_pad((string)($count + 1), 4, '0', STR_PAD_LEFT);
            return "ECF-{$projectCode}-{$year}-{$seq}";
        });
    }
}
