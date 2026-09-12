<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ReleaseNoteActivity extends Model
{
    protected $table = 'release_note_activities';

    protected $fillable = [
        'release_note_id',
        'user_id',
        'kind',
        'item_no',
        'details',
    ];

    protected $casts = [
        'details' => 'array',
    ];

    public function releaseNote()
    {
        return $this->belongsTo(ReleaseNote::class, 'release_note_id');
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
