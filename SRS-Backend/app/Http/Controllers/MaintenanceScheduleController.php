<?php

namespace App\Http\Controllers;

use App\Models\MaintenanceCode;
use App\Models\MaintenanceSchedule;
use App\Models\ScheduleDayMeta;
use App\Models\Train;
use App\Models\User;
use App\Services\MaintenanceScheduleGenerator;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\IOFactory;

class MaintenanceScheduleController extends Controller
{
    public function generate(Request $request, MaintenanceScheduleGenerator $generator): JsonResponse
    {
        $this->authorizeSchedule($request->user());
        $data = $request->validate([
            'year' => ['required', 'integer', 'between:2020,2100'],
            'month' => ['required', 'integer', 'between:1,12'],
        ]);

        return response()->json([
            'success' => true,
            'data' => $generator->preview((int) $data['year'], (int) $data['month']),
        ]);
    }

    /**
     * Every saved maintenance visit per train from January of the earliest
     * requested year up to the end of the given month (default: this month),
     * oldest first. Used to check the B/G cycle the generator relies on.
     *
     * GET /api/schedule/history?from=2026-01&to=2026-11
     */
    public function history(Request $request): JsonResponse
    {
        $this->authorizeSchedule($request->user());
        $data = $request->validate([
            'from' => ['nullable', 'date_format:Y-m'],
            'to' => ['nullable', 'date_format:Y-m'],
        ]);
        $from = Carbon::createFromFormat('Y-m', $data['from'] ?? now()->format('Y') . '-01')->startOfMonth();
        $to = Carbon::createFromFormat('Y-m', $data['to'] ?? now()->format('Y-m'))->endOfMonth();
        abort_if($from->gt($to) || $from->diffInMonths($to) > 36, 422, 'Choose a range of up to three years.');

        $visits = MaintenanceSchedule::query()
            ->whereBetween('schedule_date', [$from->toDateString(), $to->toDateString()])
            ->orderBy('schedule_date')
            ->get(['schedule_date', 'train_id', 'code'])
            ->groupBy('train_id')
            ->map(fn ($rows) => $rows->map(fn ($row) => [$row->schedule_date->toDateString(), $row->code])->values());

        return response()->json([
            'success' => true,
            'data' => [
                'from' => $from->toDateString(),
                'to' => $to->toDateString(),
                'trains' => Train::orderBy('display_order')->get(['id', 'name']),
                'visits' => $visits,
            ],
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $this->authorizeSchedule($request->user());
        $data = $request->validate([
            'year' => ['required', 'integer', 'between:2020,2100'],
            'month' => ['required', 'integer', 'between:1,12'],
        ]);
        $start = Carbon::create($data['year'], $data['month'], 1)->startOfMonth();
        $end = $start->copy()->endOfMonth();

        $entries = MaintenanceSchedule::query()
            ->whereBetween('schedule_date', [$start->toDateString(), $end->toDateString()])
            ->get(['schedule_date', 'train_id', 'code'])
            ->groupBy(fn ($entry) => $entry->schedule_date->toDateString())
            ->map(fn ($day) => $day->pluck('code', 'train_id'));
        $meta = ScheduleDayMeta::query()
            ->whereBetween('schedule_date', [$start->toDateString(), $end->toDateString()])
            ->get()
            ->keyBy(fn ($item) => $item->schedule_date->toDateString());

        return response()->json([
            'success' => true,
            'data' => [
                'year' => (int) $data['year'],
                'month' => (int) $data['month'],
                'days_in_month' => $start->daysInMonth,
                'trains' => Train::orderBy('display_order')->get(['id', 'name', 'display_order']),
                'codes' => MaintenanceCode::all()->sortBy(fn ($code) => array_search($code->code, ['A', 'B1', 'B2', 'B3', 'C', 'A+C', 'G', '9Y'], true))->values(),
                'entries' => $entries,
                'meta' => $meta,
            ],
        ]);
    }

    public function storeEntry(Request $request): JsonResponse
    {
        $this->authorizeSchedule($request->user());
        $data = $this->validateEntry($request);
        $entry = MaintenanceSchedule::updateOrCreate(
            ['schedule_date' => $data['date'], 'train_id' => $data['train_id']],
            ['code' => $data['code']]
        );
        return response()->json(['success' => true, 'data' => $entry]);
    }

    public function destroyEntry(Request $request): JsonResponse
    {
        $this->authorizeSchedule($request->user());
        $data = $request->validate([
            'date' => ['required', 'date_format:Y-m-d'],
            'train_id' => ['required', 'exists:trains,id'],
        ]);
        MaintenanceSchedule::where('schedule_date', $data['date'])->where('train_id', $data['train_id'])->delete();
        return response()->json(['success' => true]);
    }

    public function saveBatch(Request $request): JsonResponse
    {
        $this->authorizeSchedule($request->user());
        $request->merge([
            'meta' => collect($request->input('meta', []))->map(function ($meta) {
                foreach (['k6', 'k5', 'c_col', 'k19', 'remark'] as $field) {
                    if (array_key_exists($field, $meta) && $meta[$field] !== null) {
                        $meta[$field] = (string) $meta[$field];
                    }
                }
                return $meta;
            })->all(),
        ]);
        $data = $request->validate([
            'changes' => ['present', 'array', 'max:1000'],
            'changes.*.date' => ['required', 'date_format:Y-m-d'],
            'changes.*.train_id' => ['required', 'exists:trains,id'],
            'changes.*.code' => ['nullable', 'string', Rule::exists('maintenance_codes', 'code')],
            'meta' => ['sometimes', 'array', 'max:31'],
            'meta.*.date' => ['required', 'date_format:Y-m-d'],
            'meta.*.k6' => ['nullable', 'string', 'max:20'],
            'meta.*.k5' => ['nullable', 'string', 'max:20'],
            'meta.*.c_col' => ['nullable', 'string', 'max:20'],
            'meta.*.k19' => ['nullable', 'string', 'max:20'],
            'meta.*.remark' => ['nullable', 'string', 'max:255'],
        ]);

        DB::transaction(function () use ($data) {
            $upserts = [];
            foreach ($data['changes'] as $change) {
                if (blank($change['code'] ?? null)) {
                    MaintenanceSchedule::where('schedule_date', $change['date'])
                        ->where('train_id', $change['train_id'])->delete();
                    continue;
                }
                $upserts[] = [
                    'schedule_date' => $change['date'], 'train_id' => $change['train_id'],
                    'code' => $change['code'], 'created_at' => now(), 'updated_at' => now(),
                ];
            }
            if ($upserts) {
                MaintenanceSchedule::upsert($upserts, ['schedule_date', 'train_id'], ['code', 'updated_at']);
            }
            foreach ($data['meta'] ?? [] as $meta) {
                $date = $meta['date'];
                unset($meta['date']);
                ScheduleDayMeta::updateOrCreate(['schedule_date' => $date], $meta);
            }
        });

        return response()->json(['success' => true]);
    }

    public function updateMeta(Request $request, string $date): JsonResponse
    {
        $this->authorizeSchedule($request->user());
        abort_unless((bool) preg_match('/^\d{4}-\d{2}-\d{2}$/', $date), 422, 'Invalid date.');
        $data = $request->validate([
            'k6' => ['nullable', 'string', 'max:20'], 'k5' => ['nullable', 'string', 'max:20'],
            'c_col' => ['nullable', 'string', 'max:20'], 'k19' => ['nullable', 'string', 'max:20'],
            'remark' => ['nullable', 'string', 'max:255'],
        ]);
        $meta = ScheduleDayMeta::updateOrCreate(['schedule_date' => $date], $data);
        return response()->json(['success' => true, 'data' => $meta]);
    }

    public function upload(Request $request): JsonResponse
    {
        $this->authorizeSchedule($request->user());
        $data = $request->validate([
            'file' => ['required', 'file', 'mimes:xlsx,xls', 'max:10240'],
            'year' => ['nullable', 'integer', 'between:2020,2100'],
            'month' => ['nullable', 'integer', 'between:1,12'],
        ]);

        $reader = IOFactory::createReaderForFile($data['file']->getRealPath());
        $reader->setReadDataOnly(true);
        $spreadsheet = $reader->load($data['file']->getRealPath());
        $sheet = $spreadsheet->getSheetByName('Schedule Template');
        if (!$sheet) {
            foreach ($spreadsheet->getWorksheetIterator() as $candidate) {
                if (preg_match('/^20\d{2}-(1[0-2]|0?[1-9])$/', trim($candidate->getTitle()))) {
                    $sheet = $candidate;
                    break;
                }
            }
        }
        $sheet ??= $spreadsheet->getActiveSheet();

        $validCodes = MaintenanceCode::pluck('code')->all();
        $validTrains = Train::pluck('id')->all();
        $exported = $this->readExportedSchedule($sheet, $data['year'] ?? null, $data['month'] ?? null, $validCodes, $validTrains);
        if ($exported) {
            [$year, $month, $rows, $metaRows, $skipped] = $exported;
        } else {
            [$year, $month, $headerRow, $dayColumns] = $this->readScheduleHeader($sheet, $data['year'] ?? null, $data['month'] ?? null);
            $rows = [];
            $metaRows = [];
            $skipped = 0;
            $trainRows = 0;
            for ($row = $headerRow + 1; $row <= $sheet->getHighestDataRow(); $row++) {
                $label = trim((string) $sheet->getCell([1, $row])->getFormattedValue());
                if (! preg_match('/(?:Train\s*)?(\d{1,2})/i', $label, $match)) continue;
                $trainId = str_pad($match[1], 2, '0', STR_PAD_LEFT);
                if (! in_array($trainId, $validTrains, true)) continue;
                $trainRows++;
                foreach ($dayColumns as $column => $day) {
                    $code = strtoupper(trim((string) $sheet->getCell([$column, $row])->getFormattedValue()));
                    if ($code === '') continue;
                    if (! in_array($code, $validCodes, true)) { $skipped++; continue; }
                    if (! checkdate($month, $day, $year)) { $skipped++; continue; }
                    $rows[] = ['schedule_date' => sprintf('%04d-%02d-%02d', $year, $month, $day), 'train_id' => $trainId, 'code' => $code, 'created_at' => now(), 'updated_at' => now()];
                }
            }
            abort_unless($trainRows > 0, 422, 'No valid train rows were found in the workbook.');
        }
        $start = Carbon::create($year, $month, 1)->startOfMonth()->toDateString();
        $end = Carbon::create($year, $month, 1)->endOfMonth()->toDateString();
        DB::transaction(function () use ($start, $end, $rows, $metaRows) {
            MaintenanceSchedule::whereBetween('schedule_date', [$start, $end])->delete();
            if ($rows) MaintenanceSchedule::upsert($rows, ['schedule_date', 'train_id'], ['code', 'updated_at']);
            if ($metaRows) {
                ScheduleDayMeta::whereBetween('schedule_date', [$start, $end])->delete();
                ScheduleDayMeta::upsert($metaRows, ['schedule_date'], ['k6', 'k5', 'c_col', 'k19', 'remark', 'updated_at']);
            }
        });
        $spreadsheet->disconnectWorksheets();

        return response()->json(['success' => true, 'data' => [
            'year' => $year, 'month' => $month, 'imported' => count($rows), 'skipped' => $skipped,
        ]]);
    }

    private function readExportedSchedule($sheet, ?int $fallbackYear, ?int $fallbackMonth, array $validCodes, array $validTrains): ?array
    {
        $headerRow = null;
        for ($row = 1; $row <= min(10, $sheet->getHighestDataRow()); $row++) {
            $first = strtolower(trim((string) $sheet->getCell([1, $row])->getFormattedValue()));
            $second = strtolower(trim((string) $sheet->getCell([2, $row])->getFormattedValue()));
            if ($first === 'no' && $second === 'date') { $headerRow = $row; break; }
        }
        if (!$headerRow) return null;

        $year = $fallbackYear;
        $month = $fallbackMonth;
        foreach ([$sheet->getTitle(), (string) $sheet->getCell([1, 1])->getFormattedValue()] as $source) {
            if (preg_match('/(20\d{2})[-_\/ ](1[0-2]|0?[1-9])(?!\d)/', $source, $match)) {
                $year = (int) $match[1];
                $month = (int) $match[2];
                break;
            }
        }
        abort_unless($year && $month >= 1 && $month <= 12, 422, 'Year and month could not be determined from the workbook.');

        $trainColumns = [];
        $metaColumns = [];
        $metaLabels = ['k6' => 'k6', 'k5' => 'k5', 'c' => 'c_col', 'k19' => 'k19', 'remark' => 'remark'];
        $lastColumn = Coordinate::columnIndexFromString($sheet->getHighestDataColumn());
        for ($column = 4; $column <= $lastColumn; $column++) {
            $label = trim((string) $sheet->getCell([$column, $headerRow])->getFormattedValue());
            $trainId = str_pad($label, 2, '0', STR_PAD_LEFT);
            if (in_array($trainId, $validTrains, true)) $trainColumns[$column] = $trainId;
            $metaKey = $metaLabels[strtolower($label)] ?? null;
            if ($metaKey) $metaColumns[$metaKey] = $column;
        }
        abort_unless($trainColumns, 422, 'No valid train columns were found in the workbook.');

        $rows = [];
        $metaRows = [];
        $skipped = 0;
        for ($row = $headerRow + 1; $row <= $sheet->getHighestDataRow(); $row++) {
            $day = (int) $sheet->getCell([1, $row])->getValue();
            if ($day < 1 || $day > 31 || !checkdate($month, $day, $year)) continue;
            $date = sprintf('%04d-%02d-%02d', $year, $month, $day);
            foreach ($trainColumns as $column => $trainId) {
                $code = strtoupper(trim((string) $sheet->getCell([$column, $row])->getFormattedValue()));
                if ($code === '') continue;
                if (!in_array($code, $validCodes, true)) { $skipped++; continue; }
                $rows[] = ['schedule_date' => $date, 'train_id' => $trainId, 'code' => $code, 'created_at' => now(), 'updated_at' => now()];
            }
            if ($metaColumns) {
                $meta = ['schedule_date' => $date, 'k6' => null, 'k5' => null, 'c_col' => null, 'k19' => null, 'remark' => null, 'created_at' => now(), 'updated_at' => now()];
                foreach ($metaColumns as $key => $column) {
                    $value = trim((string) $sheet->getCell([$column, $row])->getFormattedValue());
                    $meta[$key] = $value !== '' ? $value : null;
                }
                $metaRows[] = $meta;
            }
        }

        return [$year, $month, $rows, $metaRows, $skipped];
    }

    private function readScheduleHeader($sheet, ?int $fallbackYear, ?int $fallbackMonth): array
    {
        for ($row = 1; $row <= min(20, $sheet->getHighestDataRow()); $row++) {
            $first = trim((string) $sheet->getCell([1, $row])->getFormattedValue());
            if (! str_contains(strtolower($first), 'train')) continue;
            preg_match('/(20\d{2})[-\/]([01]?\d)/', $first, $match);
            $year = isset($match[1]) ? (int) $match[1] : $fallbackYear;
            $month = isset($match[2]) ? (int) $match[2] : $fallbackMonth;
            abort_unless($year && $month >= 1 && $month <= 12, 422, 'Year and month were not found in the Schedule Template header.');
            $columns = [];
            $lastColumn = Coordinate::columnIndexFromString($sheet->getHighestDataColumn());
            for ($column = 2; $column <= $lastColumn; $column++) {
                $day = (int) $sheet->getCell([$column, $row])->getValue();
                if ($day >= 1 && $day <= 31) $columns[$column] = $day;
            }
            abort_unless($columns, 422, 'No day columns were found in Schedule Template.');
            return [$year, $month, $row, $columns];
        }
        abort(422, 'The Schedule Template header row was not found.');
    }

    private function validateEntry(Request $request): array
    {
        return $request->validate([
            'date' => ['required', 'date_format:Y-m-d'],
            'train_id' => ['required', 'exists:trains,id'],
            'code' => ['required', 'string', Rule::exists('maintenance_codes', 'code')],
        ]);
    }

    private function authorizeSchedule(User $user): void
    {
        $maintenanceManager = ($user->role === 'manager' || $user->is_team_manager)
            && in_array(strtolower((string) $user->department), ['pm', 'maintenance'], true);
        abort_unless(in_array($user->role, ['admin', 'depot_manager'], true) || $maintenanceManager, 403);
    }
}
