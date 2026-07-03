<?php

namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, Notifiable;

    protected $fillable = [
        'name', 'email', 'password', 'role', 'department', 'is_active', 'e_signature', 'manager_id',
    ];

    protected $hidden = [
        'password', 'remember_token',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    // ── Relationships ────────────────────────────────────────

    /** The manager this user reports to */
    public function manager(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(User::class, 'manager_id');
    }

    /** All users who report directly to this user */
    public function subordinates(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(User::class, 'manager_id');
    }

    /** Employees assigned to this user as their manager (from OrgChart / User Management) */
    public function assignedEmployees(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(\App\Models\Employee::class, 'user_manager_id');
    }

    // ── Helpers ──────────────────────────────────────────────

    public function isAdmin(): bool
    {
        return $this->role === 'admin';
    }

    /**
     * HR access: admin, depot_manager, or a user with the hr role
     */
    public function isHR(): bool
    {
        return in_array($this->role, ['admin', 'depot_manager', 'hr']);
    }

    public function isManager(): bool
    {
        return in_array($this->role, ['admin', 'depot_manager', 'manager', 'hr']);
    }

    public function hasAccessTo(string $department): bool
    {
        if (in_array($this->role, ['admin', 'depot_manager', 'hr'])) return true;
        return $this->department === $department;
    }

    // ── Procurement role helpers ────────────────────────────
    public function isProcurement(): bool
    {
        return $this->role === 'procurement' || $this->role === 'admin';
    }

    public function isEHS(): bool
    {
        return $this->role === 'ehs' || $this->role === 'admin';
    }

    public function isDepotManager(): bool
    {
        return $this->role === 'depot_manager' || $this->role === 'admin';
    }

    /**
     * Permission check driven by the role_permissions table.
     * Cached per-request to avoid repeat DB reads inside a single call.
     */
    protected ?array $permissionKeys = null;

    public function hasPermission(string $key): bool
    {
        if ($this->permissionKeys === null) {
            $this->permissionKeys = \DB::table('role_permissions')
                ->where('role', $this->role)
                ->pluck('permission_key')
                ->all();
        }
        return in_array($key, $this->permissionKeys, true);
    }

    public function permissionsList(): array
    {
        if ($this->permissionKeys === null) {
            $this->permissionKeys = \DB::table('role_permissions')
                ->where('role', $this->role)
                ->pluck('permission_key')
                ->all();
        }
        return $this->permissionKeys;
    }
}
