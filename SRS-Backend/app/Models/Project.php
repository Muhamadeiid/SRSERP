<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Project extends Model
{
    protected $fillable = [
        'code', 'name', 'name_ar', 'match_prefix', 'match_locations', 'is_default', 'is_active', 'sort',
    ];

    protected $casts = [
        'is_default' => 'boolean',
        'is_active'  => 'boolean',
        'sort'       => 'integer',
    ];

    /**
     * All active projects, cached per-request. Keeps Employee::project_code
     * cheap even when it fires on hundreds of rows in one response.
     */
    protected static ?array $activeCache = null;

    public static function activeList(): array
    {
        if (self::$activeCache === null) {
            self::$activeCache = self::where('is_active', true)
                ->orderBy('sort')->orderBy('id')
                ->get()
                ->all();
        }
        return self::$activeCache;
    }

    public static function clearCache(): void
    {
        self::$activeCache = null;
    }

    /**
     * Resolve a project code from an employee's work location or project_budget string.
     * Location matches are strongest; then budget prefix; then default project.
     */
    public static function codeFor(?string $projectBudget, ?string $workLocation = null): string
    {
        $projects = self::activeList();

        $location = strtolower(trim($workLocation ?? ''));
        if ($location !== '') {
            foreach ($projects as $p) {
                foreach (self::splitLocations($p->match_locations) as $matchLocation) {
                    if ($location === strtolower($matchLocation)) {
                        return $p->code;
                    }
                }
            }
        }

        $needle = strtolower(trim($projectBudget ?? ''));
        if ($needle !== '') {
            foreach ($projects as $p) {
                if (!$p->match_prefix) continue;
                if (str_starts_with($needle, strtolower($p->match_prefix))) {
                    return $p->code;
                }
            }
        }

        foreach ($projects as $p) {
            if ($p->is_default) return $p->code;
        }
        return $projects[0]->code ?? 'EG1';
    }

    public static function splitLocations(?string $locations): array
    {
        return array_values(array_filter(array_map(
            fn ($value) => trim($value),
            preg_split('/[,;\r\n]+/', (string) $locations)
        )));
    }

    protected static function booted(): void
    {
        static::saved(fn () => self::clearCache());
        static::deleted(fn () => self::clearCache());
    }
}
