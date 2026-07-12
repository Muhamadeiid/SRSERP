<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FleetCheckItem extends Model
{
    protected $fillable = ['fleet_check_id', 'item_name', 'result', 'remarks'];

    public function fleetCheck()
    {
        return $this->belongsTo(FleetCheck::class);
    }
}
