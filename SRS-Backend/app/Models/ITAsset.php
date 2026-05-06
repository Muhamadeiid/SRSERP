<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ITAsset extends Model
{
    use HasFactory;

    protected $table = 'it_assets';

    protected $fillable = [
        'item',
        'asset_no',
        'name',
        'qty',
        'serial_number',
        'purpose',
        'location',
        'registration_date',
        'account_registration',
        'user_name',
        'managing_staff',
        'maintenance_frequency',
        'activity',
        'notes',
        'created_by',
    ];

    protected $casts = [
        'registration_date' => 'date',
        'qty'               => 'integer',
    ];

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
