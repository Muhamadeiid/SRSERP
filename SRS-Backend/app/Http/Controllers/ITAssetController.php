<?php

namespace App\Http\Controllers;

use App\Models\ITAsset;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Shared\Date as ExcelDate;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ITAssetController extends Controller
{
    // GET /api/it-assets
    public function index(Request $request): JsonResponse
    {
        $q = ITAsset::latest();

        if ($request->filled('search')) {
            $term = $request->search;
            $q->where(function ($inner) use ($term) {
                $inner->where('item',         'like', "%{$term}%")
                      ->orWhere('asset_no',   'like', "%{$term}%")
                      ->orWhere('name',        'like', "%{$term}%")
                      ->orWhere('serial_number','like', "%{$term}%")
                      ->orWhere('user_name',   'like', "%{$term}%")
                      ->orWhere('location',    'like', "%{$term}%");
            });
        }

        if ($request->filled('item')) {
            $q->where('item', $request->item);
        }

        if ($request->filled('status') && $request->status !== 'all') {
            $q->where('status', $request->status);
        }

        if ($request->filled('condition') && $request->condition !== 'all') {
            $q->where('condition', $request->condition);
        }

        $perPage = (int) $request->get('per_page', 50);
        $result  = $q->paginate($perPage);
        $items = ITAsset::query()
            ->whereNotNull('item')
            ->where('item', '<>', '')
            ->distinct()
            ->orderBy('item')
            ->pluck('item')
            ->values();

        return response()->json([
            'success'    => true,
            'data'       => $result->items(),
            'filters'    => ['items' => $items],
            'pagination' => [
                'total'        => $result->total(),
                'per_page'     => $result->perPage(),
                'current_page' => $result->currentPage(),
                'last_page'    => $result->lastPage(),
            ],
        ]);
    }

    public function stats(): JsonResponse
    {
        $counts = ITAsset::selectRaw('status, COUNT(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');

        return response()->json([
            'total'       => (int) $counts->sum(),
            'available'   => (int) ($counts['Available'] ?? 0),
            'assigned'    => (int) ($counts['Assigned'] ?? 0),
            'damaged'     => (int) ($counts['Damaged'] ?? 0),
            'lost'        => (int) ($counts['Lost'] ?? 0),
            'maintenance' => (int) ($counts['Maintenance'] ?? 0),
            'good'        => ITAsset::where('condition', 'Good')->count(),
        ]);
    }

    // POST /api/it-assets
    public function store(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'item'                  => 'required|string|max:100',
            'asset_no'              => 'nullable|string|max:100',
            'name'                  => 'required|string|max:255',
            'qty'                   => 'nullable|integer|min:1',
            'serial_number'         => 'nullable|string|max:100',
            'purpose'               => 'nullable|string|max:255',
            'location'              => 'nullable|string|max:255',
            'registration_date'     => 'nullable|date',
            'account_registration'  => 'nullable|string|max:100',
            'user_name'             => 'nullable|string|max:255',
            'managing_staff'        => 'nullable|string|max:255',
            'maintenance_frequency' => 'nullable|string|max:100',
            'activity'              => 'nullable|string|max:255',
            'condition'             => 'nullable|in:Good,Damaged,Lost',
            'status'                => 'nullable|in:Available,Assigned,Damaged,Lost,Maintenance',
            'notes'                 => 'nullable|string|max:1000',
        ]);

        if ($validator->fails())
            return response()->json(['success' => false, 'errors' => $validator->errors()], 422);

        $validated = $validator->validated();
        if (!empty($validated['user_name']) && empty($validated['status'])) {
            $validated['status'] = 'Assigned';
        }

        $asset = ITAsset::create([
            ...$validated,
            'qty'        => $request->input('qty', 1),
            'created_by' => auth()->id(),
        ]);

        return response()->json(['success' => true, 'data' => $asset], 201);
    }

    // PUT /api/it-assets/{id}
    public function update(Request $request, ITAsset $itAsset): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'item'                  => 'sometimes|required|string|max:100',
            'asset_no'              => 'nullable|string|max:100',
            'name'                  => 'sometimes|required|string|max:255',
            'qty'                   => 'nullable|integer|min:1',
            'serial_number'         => 'nullable|string|max:100',
            'purpose'               => 'nullable|string|max:255',
            'location'              => 'nullable|string|max:255',
            'registration_date'     => 'nullable|date',
            'account_registration'  => 'nullable|string|max:100',
            'user_name'             => 'nullable|string|max:255',
            'managing_staff'        => 'nullable|string|max:255',
            'maintenance_frequency' => 'nullable|string|max:100',
            'activity'              => 'nullable|string|max:255',
            'condition'             => 'nullable|in:Good,Damaged,Lost',
            'status'                => 'nullable|in:Available,Assigned,Damaged,Lost,Maintenance',
            'notes'                 => 'nullable|string|max:1000',
        ]);

        if ($validator->fails())
            return response()->json(['success' => false, 'errors' => $validator->errors()], 422);

        $data = $validator->validated();
        $activeHolder = $itAsset->employeeAssets()
            ->where('status', 'Active')
            ->with('employee:id,name')
            ->first();

        if ($activeHolder) {
            $data['status'] = 'Assigned';
            $data['condition'] = 'Good';
            $data['user_name'] = $activeHolder->employee?->name;
        } else {
            $condition = $data['condition'] ?? $itAsset->condition;
            if ($condition === 'Damaged') $data['status'] = 'Damaged';
            if ($condition === 'Lost') $data['status'] = 'Lost';
            if (($data['status'] ?? null) === 'Available') $data['condition'] = 'Good';
            if (($data['status'] ?? null) === 'Assigned') $data['status'] = 'Available';
        }

        $itAsset->update($data);

        return response()->json(['success' => true, 'data' => $itAsset->fresh()]);
    }

    // DELETE /api/it-assets/{id}
    public function destroy(ITAsset $itAsset): JsonResponse
    {
        if ($itAsset->employeeAssets()->where('status', 'Active')->exists()) {
            return response()->json([
                'success' => false,
                'message' => 'Return this asset before deleting it',
            ], 422);
        }
        $itAsset->delete();
        return response()->json(['success' => true]);
    }

    /**
     * POST /api/it-assets/{itAsset}/assign
     * Hand this inventory item to an employee: creates a linked
     * employee_assets row so the clearance form and asset return flow
     * stay in sync with the IT registry.
     */
    public function assign(Request $request, ITAsset $itAsset): JsonResponse
    {
        $data = $request->validate([
            'employee_id'       => 'required|exists:employees,id',
            'issuing_source_id' => 'nullable|exists:issuing_sources,id',
            'received_date'     => 'nullable|date',
            'condition'         => 'nullable|in:Good,Damaged,Lost',
            'notes'             => 'nullable|string|max:1000',
        ]);

        if ($itAsset->status !== 'Available' || $itAsset->condition !== 'Good') {
            return response()->json([
                'success' => false,
                'message' => 'This IT asset is not available for assignment',
            ], 422);
        }

        $activeHolder = \App\Models\EmployeeAsset::where('it_asset_id', $itAsset->id)
            ->where('status', 'Active')
            ->with('employee:id,name')
            ->first();

        if ($activeHolder) {
            return response()->json([
                'success' => false,
                'message' => 'This IT asset is already assigned to ' . ($activeHolder->employee?->name ?? 'another employee'),
            ], 422);
        }

        // Default the source to whichever issuing_source has key='it'.
        $sourceId = $data['issuing_source_id']
            ?? \App\Models\IssuingSource::where('key', 'it')->value('id');

        $asset = \App\Models\EmployeeAsset::create([
            'employee_id'         => $data['employee_id'],
            'issuing_source_id'   => $sourceId,
            'it_asset_id'         => $itAsset->id,
            'issuing_department'  => 'IT',
            'asset_name'          => trim(($itAsset->item ?? '') . ' — ' . ($itAsset->name ?? ''), ' —'),
            'asset_code'          => $itAsset->asset_no,
            'asset_category'      => 'Device',
            'received_date'       => $data['received_date'] ?? now()->toDateString(),
            'condition'           => $data['condition'] ?? 'Good',
            'status'              => 'Active',
            'notes'               => $data['notes'] ?? null,
            'created_by'          => auth()->id(),
        ]);

        // Mirror the current holder on the IT record so the inventory
        // dashboard reflects who's using the item today.
        $emp = \App\Models\Employee::find($data['employee_id']);
        if ($emp) {
            $itAsset->update(['user_name' => $emp->name, 'status' => 'Assigned']);
        }

        return response()->json([
            'success' => true,
            'message' => 'Assigned',
            'data'    => $asset->load('employee:id,name,ibs_code,department', 'itAsset', 'issuingSource'),
        ], 201);
    }

    // ─────────────────────────────────────────────────────────────────
    // Excel Import / Export — matches the physical "IT Asset List" sheet
    // that the IT team maintains. Column order (row 2 in the template):
    //   1 Item · 2 Asset no. · 3 Name (Des.) · 4 QTY · 5 Serial number
    //   6 Purpose · 7 Location · 8 Registration date · 9 Account register
    //   10 User · 11 M Frequency · 12 Activity · 13 2026 IQ · 14 Date
    //   15 Report · 16 Quarter check Date · 17 Scrap report
    // ─────────────────────────────────────────────────────────────────

    private const HEADERS = [
        'Item', 'Asset no.', 'Name (Des.)', 'QTY', 'Serial number',
        'Purpose', 'Location', 'Registration date', 'Account register', 'User',
        'M Frequency', 'Activity', '2026 IQ', 'Date', 'Report',
        'Quarter check Date', 'Scrap report',
    ];

    // POST /api/it-assets/import  (multipart: file=xlsx)
    public function import(Request $request): JsonResponse
    {
        $request->validate([
            'file' => 'required|file|mimes:xlsx,xls|max:10240',
        ]);

        try {
            $spreadsheet = IOFactory::load($request->file('file')->getRealPath());
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'message' => 'Cannot read the Excel file: '.$e->getMessage()], 422);
        }

        $sheet   = $spreadsheet->getActiveSheet();
        $rows    = $sheet->toArray(null, true, true, false); // 0-indexed
        $headers = [];
        $dataStart = 0;

        // Auto-detect header row (looks for the row that contains "Asset no." + "Name")
        foreach ($rows as $idx => $row) {
            $normalized = array_map(fn($c) => is_string($c) ? strtolower(trim($c)) : $c, $row);
            if (in_array('asset no.', $normalized, true) || in_array('asset no', $normalized, true)) {
                $headers   = $row;
                $dataStart = $idx + 1;
                break;
            }
        }

        if (!$headers) {
            return response()->json([
                'success' => false,
                'message' => 'Header row not found. Expected columns like "Item", "Asset no.", "Name (Des.)"…',
            ], 422);
        }

        $map = $this->buildColumnMap($headers);

        $imported = 0; $updated = 0; $skipped = 0; $errors = []; $skippedRows = [];
        $currentItem = null;   // forward-fill: the Item cell is only set on the first row of each group

        foreach ($rows as $idx => $row) {
            if ($idx < $dataStart) continue;
            if ($this->isBlankRow($row))  continue;

            try {
                $itemCell = $map['item'] !== null ? ($row[$map['item']] ?? null) : null;
                if ($itemCell !== null && trim((string) $itemCell) !== '') {
                    $currentItem = trim((string) $itemCell);
                }

                $payload = $this->rowToPayload($row, $map, $currentItem);

                if (empty($payload['name']) && empty($payload['asset_no'])) {
                    $skipped++;
                    $skippedRows[] = [
                        'row' => $idx + 1,
                        'reason' => 'Both Asset no. and Name (Des.) are empty.',
                        'item' => $payload['item'] ?? null,
                    ];
                    continue;
                }

                $existing = null;
                if (!empty($payload['asset_no'])) {
                    $existing = ITAsset::where('asset_no', $payload['asset_no'])->first();
                }

                if ($existing) {
                    $existing->update($payload);
                    $updated++;
                } else {
                    $payload['created_by'] = auth()->id();
                    ITAsset::create($payload);
                    $imported++;
                }
            } catch (\Throwable $e) {
                $errors[] = 'Row '.($idx + 1).': '.$e->getMessage();
                $skippedRows[] = [
                    'row' => $idx + 1,
                    'reason' => $e->getMessage(),
                ];
                $skipped++;
            }
        }

        return response()->json([
            'success'  => true,
            'imported' => $imported,
            'updated'  => $updated,
            'skipped'  => $skipped,
            'skipped_rows' => array_slice($skippedRows, 0, 50),
            'errors'   => array_slice($errors, 0, 20),
        ]);
    }

    // GET /api/it-assets/export  (all rows, filters honoured)
    public function export(Request $request): StreamedResponse
    {
        $q = ITAsset::query()->orderBy('item')->orderBy('asset_no');

        if ($request->filled('item'))      $q->where('item', $request->item);
        if ($request->filled('status') && $request->status !== 'all')
            $q->where('status', $request->status);
        if ($request->filled('condition') && $request->condition !== 'all')
            $q->where('condition', $request->condition);
        if ($request->filled('search')) {
            $term = $request->search;
            $q->where(function ($inner) use ($term) {
                $inner->where('item', 'like', "%{$term}%")
                      ->orWhere('asset_no', 'like', "%{$term}%")
                      ->orWhere('name', 'like', "%{$term}%")
                      ->orWhere('serial_number', 'like', "%{$term}%")
                      ->orWhere('user_name', 'like', "%{$term}%")
                      ->orWhere('location', 'like', "%{$term}%");
            });
        }

        $assets = $q->get();
        $spreadsheet = $this->buildWorkbook($assets);

        $writer   = new Xlsx($spreadsheet);
        $filename = 'IT_Asset_List_'.now()->format('Y-m-d').'.xlsx';

        return response()->streamDownload(
            fn () => $writer->save('php://output'),
            $filename,
            ['Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
        );
    }

    // GET /api/it-assets/template  (empty template — same layout, no rows)
    public function template(): StreamedResponse
    {
        $spreadsheet = $this->buildWorkbook(collect());
        $writer   = new Xlsx($spreadsheet);
        $filename = 'IT_Asset_List_Template.xlsx';

        return response()->streamDownload(
            fn () => $writer->save('php://output'),
            $filename,
            ['Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
        );
    }

    // ── helpers ──────────────────────────────────────────────────────

    private function buildColumnMap(array $headers): array
    {
        $key = fn ($h) => is_string($h) ? strtolower(preg_replace('/\s+/', ' ', trim($h))) : '';
        $lookup = [];
        foreach ($headers as $i => $h) $lookup[$key($h)] = $i;

        $find = function (...$candidates) use ($lookup) {
            foreach ($candidates as $c) {
                if (array_key_exists(strtolower($c), $lookup)) return $lookup[strtolower($c)];
            }
            return null;
        };

        return [
            'item'          => $find('item'),
            'asset_no'      => $find('asset no.', 'asset no', 'asset number'),
            'name'          => $find('name (des.)', 'name', 'description'),
            'qty'           => $find('qty', 'quantity'),
            'serial_number' => $find('serial number', 'serial no.', 'serial no', 'serial'),
            'purpose'       => $find('purpose'),
            'location'      => $find('location'),
            'reg_date'      => $find('registration date', 'reg. date', 'reg date'),
            'account_reg'   => $find('account register', 'acct. reg.', 'account registration'),
            'user'          => $find('user'),
            'frequency'     => $find('m frequency', 'maintenance frequency', 'frequency'),
            'activity'      => $find('activity'),
            'iq'            => $find('2026 iq', '2025 iq', 'iq'),
            'check_date'    => $find('date', 'check date'),
            'report'        => $find('report'),
            'quarter_date'  => $find('quarter check date'),
            'scrap_report'  => $find('scrap report'),
        ];
    }

    private function rowToPayload(array $row, array $map, ?string $forwardFilledItem): array
    {
        $cell = fn ($k) => $map[$k] !== null ? ($row[$map[$k]] ?? null) : null;
        $clean = function ($v) {
            if ($v === null) return null;
            $s = trim((string) $v);
            if ($s === '' || $s === '.' || strcasecmp($s, 'n/a') === 0) return null;
            return $s;
        };

        $iq       = $cell('iq');
        $report   = $cell('report');
        $scrapRep = $cell('scrap_report');
        $user     = $clean($cell('user'));
        $purpose  = $clean($cell('purpose'));
        $location = $clean($cell('location'));

        // "Available" placeholder in User/Purpose/Location means the item is on the shelf
        $availableMarker = fn ($v) => $v !== null && strcasecmp($v, 'available') === 0;
        $isAvailable = $availableMarker($user) || $availableMarker($purpose) || $availableMarker($location);
        if ($isAvailable) { $user = null; $purpose = null; $location = null; }

        // Condition / status inference
        $condition = 'Good'; $status = 'Available';
        $reportStr = strtolower((string) $report);
        $scrapStr  = trim((string) $scrapRep);
        $isScrap   = $scrapStr !== '' || str_contains($reportStr, 'scrap');

        if ($isScrap) {
            $condition = 'Lost'; $status = 'Lost';
        } elseif ($iq !== null && str_contains((string) $iq, '✗')) {
            $condition = 'Damaged'; $status = 'Damaged';
        } elseif (!empty($user)) {
            $condition = 'Good'; $status = 'Assigned';
        }

        // Build notes from the extra columns so nothing is lost
        $noteBits = [];
        if (($cell('check_date') ?? '') !== '') $noteBits[] = 'Last check: '.trim((string) $cell('check_date'));
        if (($report ?? '') !== '')             $noteBits[] = 'Report: '.trim((string) $report);
        if (($cell('quarter_date') ?? '') !== '') $noteBits[] = 'Quarter check: '.trim((string) $cell('quarter_date'));
        if ($scrapStr !== '')                    $noteBits[] = 'Scrap report: '.$scrapStr;

        return [
            'item'                  => $forwardFilledItem ?: $clean($cell('item')),
            'asset_no'              => $clean($cell('asset_no')),
            'name'                  => $clean($cell('name')) ?? '',
            'qty'                   => (int) ($cell('qty') ?: 1) ?: 1,
            'serial_number'         => $clean($cell('serial_number')),
            'purpose'               => $purpose,
            'location'              => $location,
            'registration_date'     => $this->parseExcelDate($cell('reg_date')),
            'account_registration'  => $clean($cell('account_reg')),
            'user_name'             => $user,
            'maintenance_frequency' => $clean($cell('frequency')),
            'activity'              => $clean($cell('activity')),
            'condition'             => $condition,
            'status'                => $status,
            'notes'                 => $noteBits ? implode(' · ', $noteBits) : null,
        ];
    }

    private function parseExcelDate($value): ?string
    {
        if ($value === null || $value === '' || $value === '.') return null;
        if (is_numeric($value)) {
            try { return Carbon::instance(ExcelDate::excelToDateTimeObject((float) $value))->toDateString(); }
            catch (\Throwable $e) { return null; }
        }
        $s = trim((string) $value);
        foreach (['Y-m-d','d/m/Y','m/d/Y','d-m-Y','d/n/Y','n/j/Y','j/n/Y'] as $fmt) {
            try { return Carbon::createFromFormat($fmt, $s)->toDateString(); }
            catch (\Throwable $e) {}
        }
        try { return Carbon::parse($s)->toDateString(); }
        catch (\Throwable $e) { return null; }
    }

    private function isBlankRow(array $row): bool
    {
        foreach ($row as $c) {
            if ($c !== null && trim((string) $c) !== '') return false;
        }
        return true;
    }

    private function buildWorkbook($assets): Spreadsheet
    {
        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Asset List');

        // Row 1 — title banner
        $sheet->setCellValue('A1', 'IT Asset List — '.now()->format('d M Y'));
        $sheet->mergeCells('A1:Q1');
        $sheet->getStyle('A1')->getFont()->setBold(true)->setSize(13);
        $sheet->getStyle('A1')->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);
        $sheet->getRowDimension(1)->setRowHeight(24);

        // Row 2 — headers
        foreach (self::HEADERS as $i => $h) {
            $sheet->setCellValueByColumnAndRow($i + 1, 2, $h);
        }
        $sheet->getStyle('A2:Q2')->applyFromArray([
            'font' => ['bold' => true, 'color' => ['argb' => 'FFFFFFFF']],
            'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['argb' => 'FF1F2937']],
            'alignment' => ['horizontal' => Alignment::HORIZONTAL_CENTER, 'vertical' => Alignment::VERTICAL_CENTER],
            'borders'   => ['allBorders' => ['borderStyle' => Border::BORDER_THIN, 'color' => ['argb' => 'FF9CA3AF']]],
        ]);
        $sheet->getRowDimension(2)->setRowHeight(22);

        // Rows 3+ — data
        $row = 3;
        $lastItem = null;
        foreach ($assets as $a) {
            $itemShown = ($a->item !== $lastItem) ? $a->item : '';
            $lastItem  = $a->item;

            $noteBits = $a->notes ? explode(' · ', $a->notes) : [];
            $get = function ($prefix) use ($noteBits) {
                foreach ($noteBits as $b) if (str_starts_with($b, $prefix)) return trim(substr($b, strlen($prefix)));
                return '';
            };

            $isScrap = in_array($a->status, ['Lost']) || in_array($a->condition, ['Lost']);
            $iq = $isScrap || $a->condition === 'Damaged' ? '✗' : '✓';

            $sheet->fromArray([[
                $itemShown,
                $a->asset_no,
                $a->name,
                $a->qty,
                $a->serial_number ?? 'N/A',
                $a->purpose ?? ($a->status === 'Available' ? 'Available' : 'N/A'),
                $a->location ?? ($a->status === 'Available' ? 'Available' : 'N/A'),
                $a->registration_date?->format('d/m/Y') ?? '',
                $a->account_registration ?? 'N/A',
                $a->user_name ?? ($a->status === 'Available' ? 'Available' : ''),
                $a->maintenance_frequency,
                $a->activity,
                $iq,
                $get('Last check: ') ?: '',
                $get('Report: ') ?: ($isScrap ? 'Scraped' : ($a->condition === 'Good' ? 'Serviced - No Problems Found' : '')),
                $get('Quarter check: '),
                $get('Scrap report: '),
            ]], null, "A{$row}");
            $row++;
        }

        // Borders on data
        if ($row > 3) {
            $sheet->getStyle("A3:Q".($row - 1))->applyFromArray([
                'borders' => ['allBorders' => ['borderStyle' => Border::BORDER_THIN, 'color' => ['argb' => 'FFE5E7EB']]],
                'alignment' => ['vertical' => Alignment::VERTICAL_CENTER],
            ]);
        }

        // Column widths — tuned to match the source layout
        $widths = [12, 13, 32, 6, 22, 15, 22, 15, 15, 22, 13, 20, 8, 12, 30, 15, 15];
        foreach ($widths as $i => $w) {
            $sheet->getColumnDimensionByColumn($i + 1)->setWidth($w);
        }
        $sheet->freezePane('A3');

        return $spreadsheet;
    }
}
