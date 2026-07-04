<?php

namespace App\Http\Controllers;

use App\Models\ClearanceReport;
use App\Models\Employee;
use App\Models\EmployeeAsset;
use App\Models\IssuingSource;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use ZipArchive;

class ClearanceReportController extends Controller
{
    // A4 page in twips (1 twip = 1/1440 inch)
    private const PW = 11906;
    private const PH = 16838;
    // Margins: 1.5 cm top/bottom, 1.8 cm left/right (1 cm ≈ 567 twips)
    private const MT = 851;
    private const MB = 851;
    private const ML = 1021;
    private const MR = 1021;
    // Available content width = PW - ML - MR
    private const AW = 9864;

    // ── Entry point ──────────────────────────────────────────────────────────

    public function generate(int $employeeId)
    {
        $employee = Employee::findOrFail($employeeId);

        $active = EmployeeAsset::forEmployee($employeeId)
            ->where('status', 'Active')
            ->with('issuingSource:id,key,label_en,manager_name,manager_user_id', 'issuingSource.manager:id,name')
            ->orderBy('issuing_source_id')
            ->orderBy('received_date')
            ->get();

        // Group by the new source_id when present, fall back to the legacy enum
        // so historic records still render on the right page section.
        $bySourceKey = $active->groupBy(function ($a) {
            if ($a->issuingSource) return $a->issuingSource->key;
            return match ($a->issuing_department) {
                'EHS'                    => 'ehs',
                'IT'                     => 'it',
                'HR'                     => 'hr',
                'Inventory'              => 'inventory',
                'Corrective Maintenance' => 'cm',
                'Preventive Maintenance' => 'pm',
                default                  => 'other',
            };
        });

        // Reserve a unique tracking number and record the report event.
        $trackingNo = ClearanceReport::nextTrackingNo($employee->project_code);
        ClearanceReport::create([
            'employee_id'                 => $employee->id,
            'tracking_no'                 => $trackingNo,
            'generated_by'                => auth()->id(),
            'active_assets_at_generation' => $active->count(),
        ]);

        $sources = IssuingSource::orderBy('sort')->orderBy('id')->get()->keyBy('key');

        $clearanceDocx   = $this->buildClearanceForm($employee, $bySourceKey, $trackingNo, $sources);
        $assetReturnDocx = $this->buildAssetReturnForm($employee, $active);

        $zipPath  = sys_get_temp_dir() . '/report_' . $employeeId . '_' . time() . '.zip';
        $zip = new ZipArchive();
        $zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE);

        $safeName = preg_replace('/[^A-Za-z0-9_\-]/', '_', $employee->name);
        $zip->addFromString("Clearance_Form_{$safeName}.docx",  $clearanceDocx);
        $zip->addFromString("Asset_Return_{$safeName}.docx",    $assetReturnDocx);
        $zip->close();

        return response()->download($zipPath, "Reports_{$safeName}.zip")
                         ->deleteFileAfterSend(true);
    }

    // ── Clearance Form (2 pages) ─────────────────────────────────────────────

    private function buildClearanceForm(Employee $emp, Collection $bySourceKey, string $trackingNo, Collection $sources): string
    {
        $today   = Carbon::today()->format('d-F-Y');
        $name    = $emp->name;
        $ibs     = $emp->ibs_code  ?? '-';
        $dept    = $emp->department ?? '-';
        $pos     = $emp->position  ?? '-';
        $AW      = self::AW;

        // Live project resolution and last-working-date pulled from the DB.
        $projectName    = $this->projectDisplayName($emp);
        $lastWorkingDay = $emp->last_working_date ? Carbon::parse($emp->last_working_date)->format('d-F-Y') : '-';
        // Depot manager and HR officer are resolved from live user records.
        $depotManagerName = optional(User::where('role', 'depot_manager')->where('is_active', true)->first())->name ?? '-';
        $hrOfficerName    = optional(User::where('role', 'hr')->where('is_active', true)->first())->name ?? '-';

        $get = fn(string $key) => $bySourceKey->get($key, collect());
        $signatoryFor = function (string $key) use ($sources) {
            $src = $sources->get($key);
            if (!$src) return '—';
            if ($src->manager) return $src->manager->name;
            return $src->manager_name ?: '—';
        };

        $b = '';

        // ─ PAGE 1 ────────────────────────────────────────────────────────────

        $b .= $this->docHeader('Employee Clearance Form', 20);
        $b .= $this->hline();
        $b .= $this->p($this->run('Employee Clearance Form', true, 22), 'center');
        $b .= $this->p($this->run("Tracking No: {$trackingNo}", true, 20));
        $b .= $this->p($this->run('The following information is filled out by the employee', true, 20));

        // Employee info table  (22/28/22/28)
        $eiC = $this->splitCols([22, 28, 22, 28], $AW);
        $b .= $this->tbl([
            [$this->tc('Employee Name:', $eiC[0], true, 18), $this->tc($name,    $eiC[1], false, 18), $this->tc('Project Name', $eiC[2], true, 18), $this->tc($projectName,   $eiC[3], false, 18)],
            [$this->tc('Emp. No.:',      $eiC[0], true, 18), $this->tc($ibs,     $eiC[1], false, 18), $this->tc('Department',   $eiC[2], true, 18), $this->tc($dept,          $eiC[3], false, 18)],
            [$this->tc('Job Title:',     $eiC[0], true, 18), $this->tc($pos,     $eiC[1], false, 18), $this->tc('Date:',        $eiC[2], true, 18), $this->tc($today,         $eiC[3], false, 18)],
            [$this->tc('Resignation Date:', $eiC[0], true, 18), $this->tc($lastWorkingDay, $eiC[1], false, 18), $this->tc('Last Work date:', $eiC[2], true, 18), $this->tc($lastWorkingDay, $eiC[3], false, 18)],
        ], $eiC, true);
        $b .= $this->emptyP();

        // Section 1 — EHS / Material Controlling
        $b .= $this->sectionHeading('Section 1 : Material Controlling', '( The Following Assets Related To Material Controlling Department Tick v to asset condition )');
        $b .= $this->assetTable6($get('ehs'), [18, 28, 13, 15, 14, 12], $AW, 'Brand new', 6);
        $b .= $this->sigRow('Material Controller / Receiver  Name:    ' . $signatoryFor('ehs'), 'Material Controller / Receiver  Signature: ___________________', $AW);
        $b .= $this->emptyP();

        // Section 2 — IT
        $b .= $this->sectionHeading('Section 2 : Information Technology IT Section', '(The Following Assets Related To IT Department Tick v to asset condition)');
        $b .= $this->assetTable6($get('it'), [18, 28, 13, 15, 14, 12], $AW, 'As Received', 7);
        $b .= $this->sigRow('IT Manager / Receiver  Name:    ' . $signatoryFor('it'), 'IT Manager / Receiver  Signature: ___________________', $AW);

        // Footer page 1
        $b .= $this->docFooter('Page 1 of 2', $AW);

        // ─ PAGE BREAK ────────────────────────────────────────────────────────
        $b .= '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';

        // ─ PAGE 2 ────────────────────────────────────────────────────────────

        $b .= $this->docHeader('Employee Clearance Form', 20);
        $b .= $this->emptyP();

        // Section 3 — PM
        $b .= $this->sectionHeading('Section 3 : Preventative Maintenance " PM "', '(The Following Assets Related To Tech Department Tick v to asset condition)');
        $b .= $this->assetTable6($get('pm'), [18, 28, 13, 15, 14, 12], $AW, 'As Received', 5);
        $b .= $this->sigRow('Dep-Tech Manager / Receiver  Name:    ' . $signatoryFor('pm'), 'Dep-Tech Manager / Receiver  Signature: ___________________', $AW);
        $b .= $this->emptyP();

        // Section 4 — CM
        $b .= $this->sectionHeading('Section 4 : Corrective Maintenance " CM "', '(The Following Assets Related To Tech Department Tick v to asset condition)');
        $b .= $this->assetTable6($get('cm'), [18, 28, 13, 15, 14, 12], $AW, 'As Received', 5);
        $b .= $this->sigRow('Dep-Tech Manager / Receiver  Name:    ' . $signatoryFor('cm'), 'Dep-Tech Manager / Receiver  Signature: ___________________', $AW);
        $b .= $this->sigRow('Depot Manager Name:    ' . $depotManagerName, 'Depot Manager Signature: ___________________', $AW);
        $b .= $this->emptyP();

        $b .= $this->p($this->run('Please note:', true, 18));
        $b .= $this->p($this->run('The following form will not be signed by the Human Resources Department / its representative until all previous departments have completed the signature by discharging the employee attached to the signature of the Manager of the department', true, 18));
        $b .= $this->emptyP();

        // Section 5 — HR (+ Inventory + Other)
        $hrAssets = collect()
            ->merge($get('hr'))
            ->merge($get('inventory'))
            ->merge($get('other'))
            ->values();
        $b .= $this->sectionHeading('Section 5: Human Resources', '(The Following Assets Related Human Resources Department Tick v to asset condition)');
        $b .= $this->assetTable3($hrAssets, $AW);
        $b .= $this->sigRow('HR Manager / Receiver  Name:    ' . ($signatoryFor('hr') !== '—' ? $signatoryFor('hr') : $hrOfficerName), 'HR Manager / Receiver  Signature: ___________________', $AW);

        // Footer page 2
        $b .= $this->docFooter('Page 2 of 2', $AW);

        $b .= $this->sectPr();

        return $this->packDocx($b);
    }

    /**
     * Resolve a human-readable project name from the employee's project record.
     * Falls back to the project code (e.g. EG1) if the projects table doesn't
     * hold a matching entry — but the code itself is already dynamic since it
     * comes from Project::codeFor().
     */
    private function projectDisplayName(Employee $emp): string
    {
        $code = $emp->project_code;
        $proj = \App\Models\Project::where('code', $code)->first();
        return $proj?->name ?? $code;
    }

    // ── Asset Return Form (1 page) ───────────────────────────────────────────

    private function buildAssetReturnForm(Employee $emp, Collection $assets): string
    {
        $templatePath = storage_path('app/templates/asset_return_template.docx');

        $today      = Carbon::today()->format('d-M-Y');
        $trackingNo = 'ARF-' . $emp->ibs_code . '-' . Carbon::today()->format('Ymd');

        // ── Build asset rows XML ──────────────────────────────────────────────
        // Same structure as the template's empty data rows
        $rowXml = '';
        $i = 1;
        foreach ($assets as $asset) {
            $rowXml .= $this->templateAssetRow($i++, $asset->asset_name ?? '-', $asset->asset_code ?? 'N/A', '-', $asset->condition ?? '-');
        }
        // Minimum 4 rows
        while ($i <= 4) {
            $rowXml .= $this->templateAssetRow($i++, '', '', '', '');
        }

        // ── Read template and replace placeholders ────────────────────────────
        $zip = new ZipArchive();
        $zip->open($templatePath);
        $xml = $zip->getFromName('word/document.xml');

        // Collect all files
        $files = [];
        for ($f = 0; $f < $zip->numFiles; $f++) {
            $name = $zip->getNameIndex($f);
            $files[$name] = $zip->getFromIndex($f);
        }
        $zip->close();

        $xml = str_replace('{{TRACKING_NO}}',  htmlspecialchars($trackingNo,        ENT_XML1), $xml);
        $xml = str_replace('{{EMPLOYEE_NAME}}', htmlspecialchars($emp->name,         ENT_XML1), $xml);
        $xml = str_replace('{{JOB_TITLE}}',     htmlspecialchars($emp->position ?? '-', ENT_XML1), $xml);
        $xml = str_replace('{{DEPARTMENT}}',    htmlspecialchars($emp->department ?? '-', ENT_XML1), $xml);
        $xml = str_replace('{{ASSET_ROWS}}',    $rowXml, $xml);

        $files['word/document.xml'] = $xml;

        // ── Pack new DOCX ─────────────────────────────────────────────────────
        $tmpPath = sys_get_temp_dir() . '/asset_return_' . $emp->id . '_' . time() . '.docx';
        $outZip  = new ZipArchive();
        $outZip->open($tmpPath, ZipArchive::CREATE | ZipArchive::OVERWRITE);
        foreach ($files as $name => $content) {
            $outZip->addFromString($name, $content);
        }
        $outZip->close();

        $result = file_get_contents($tmpPath);
        unlink($tmpPath);
        return $result;
    }

    /** Build one asset table row matching the template row structure */
    private function templateAssetRow(int $n, string $desc, string $code, string $serial, string $remarks): string
    {
        $cell = fn(string $text, string $w, string $align = 'center') =>
            '<w:tc><w:tcPr><w:tcW w:w="' . $w . '" w:type="pct"/>'
            . '<w:shd w:val="clear" w:color="auto" w:fill="auto"/>'
            . '<w:vAlign w:val="center"/></w:tcPr>'
            . '<w:p><w:pPr><w:spacing w:after="0"/>'
            . ($align !== 'left' ? '<w:jc w:val="' . $align . '"/>' : '')
            . '<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>'
            . '<w:sz w:val="20"/></w:rPr></w:pPr>'
            . '<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>'
            . '<w:sz w:val="20"/></w:rPr>'
            . '<w:t>' . htmlspecialchars($text, ENT_XML1) . '</w:t></w:r>'
            . '</w:p></w:tc>';

        return '<w:tr><w:trPr><w:trHeight w:val="292"/></w:trPr>'
            . $cell((string)$n,   '300',  'center')
            . $cell($desc,        '1600', 'left')
            . $cell($code,        '900',  'center')
            . $cell($serial,      '1300', 'center')
            . $cell($remarks,     '900',  'center')
            . '</w:tr>';
    }

    // ── Building blocks ──────────────────────────────────────────────────────

    /** Document header: "Rotem SRS / EGYPT" box + title */
    private function docHeader(string $title, int $titlePt): string
    {
        $AW  = self::AW;
        $c1w = (int)($AW * 0.22);
        $c2w = $AW - $c1w;
        $tsz = $titlePt * 2;

        $cellBdr = '<w:tcBorders>'
            . '<w:top w:val="single" w:sz="12" w:space="0" w:color="000000"/>'
            . '<w:left w:val="single" w:sz="12" w:space="0" w:color="000000"/>'
            . '<w:bottom w:val="single" w:sz="12" w:space="0" w:color="000000"/>'
            . '<w:right w:val="single" w:sz="12" w:space="0" w:color="000000"/>'
            . '</w:tcBorders>';
        $noBdr = '<w:tcBorders>'
            . '<w:top w:val="none" w:sz="0"/><w:left w:val="none" w:sz="0"/>'
            . '<w:bottom w:val="none" w:sz="0"/><w:right w:val="none" w:sz="0"/>'
            . '</w:tcBorders>';

        $c1 = "<w:tc><w:tcPr><w:tcW w:w=\"{$c1w}\" w:type=\"dxa\"/><w:vAlign w:val=\"center\"/>{$cellBdr}</w:tcPr>"
            . '<w:p><w:pPr><w:jc w:val="center"/></w:pPr>'
            . '<w:r><w:rPr><w:b/><w:bCs/><w:sz w:val="26"/><w:szCs w:val="26"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/></w:rPr>'
            . '<w:t>Rotem SRS</w:t></w:r></w:p>'
            . '<w:p><w:pPr><w:jc w:val="center"/></w:pPr>'
            . '<w:r><w:rPr><w:b/><w:bCs/><w:sz w:val="26"/><w:szCs w:val="26"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/></w:rPr>'
            . '<w:t>EGYPT</w:t></w:r></w:p>'
            . '</w:tc>';

        $c2 = "<w:tc><w:tcPr><w:tcW w:w=\"{$c2w}\" w:type=\"dxa\"/><w:vAlign w:val=\"center\"/>{$noBdr}</w:tcPr>"
            . "<w:p><w:pPr><w:jc w:val=\"center\"/></w:pPr>"
            . "<w:r><w:rPr><w:b/><w:bCs/><w:sz w:val=\"{$tsz}\"/><w:szCs w:val=\"{$tsz}\"/>"
            . '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/></w:rPr>'
            . '<w:t>' . htmlspecialchars($title) . '</w:t></w:r></w:p>'
            . '</w:tc>';

        $noBdrTbl = '<w:tblBorders>'
            . '<w:top w:val="none" w:sz="0"/><w:left w:val="none" w:sz="0"/>'
            . '<w:bottom w:val="none" w:sz="0"/><w:right w:val="none" w:sz="0"/>'
            . '<w:insideH w:val="none" w:sz="0"/><w:insideV w:val="none" w:sz="0"/>'
            . '</w:tblBorders>';
        $grid = "<w:tblGrid><w:gridCol w:w=\"{$c1w}\"/><w:gridCol w:w=\"{$c2w}\"/></w:tblGrid>";

        return "<w:tbl><w:tblPr><w:tblW w:w=\"5000\" w:type=\"pct\"/>{$noBdrTbl}</w:tblPr>{$grid}"
             . "<w:tr>{$c1}{$c2}</w:tr></w:tbl>";
    }

    /** Horizontal rule paragraph */
    private function hline(): string
    {
        return '<w:p><w:pPr><w:pBdr>'
             . '<w:bottom w:val="double" w:sz="6" w:space="1" w:color="000000"/>'
             . '</w:pBdr></w:pPr></w:p>';
    }

    /** Empty spacing paragraph */
    private function emptyP(): string
    {
        return '<w:p><w:pPr><w:rPr><w:sz w:val="16"/></w:rPr></w:pPr></w:p>';
    }

    /** Text run */
    private function run(string $text, bool $bold = false, int $sz = 18): string
    {
        $b = $bold ? '<w:b/><w:bCs/>' : '';
        return '<w:r><w:rPr>' . $b
             . "<w:sz w:val=\"{$sz}\"/><w:szCs w:val=\"{$sz}\"/>"
             . '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>'
             . '</w:rPr><w:t xml:space="preserve">' . htmlspecialchars($text) . '</w:t></w:r>';
    }

    /** Paragraph */
    private function p(string $runs, string $align = 'left'): string
    {
        $jc = ($align !== 'left') ? "<w:jc w:val=\"{$align}\"/>" : '';
        return "<w:p><w:pPr>{$jc}</w:pPr>{$runs}</w:p>";
    }

    /** Table cell */
    private function tc(string $text, int $w, bool $bold = false, int $sz = 18, string $align = 'left', string $extraTcPr = ''): string
    {
        $jc = ($align !== 'left') ? "<w:jc w:val=\"{$align}\"/>" : '';
        $para = "<w:p><w:pPr>{$jc}<w:rPr><w:sz w:val=\"{$sz}\"/>"
              . '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>'
              . "</w:rPr></w:pPr>" . $this->run($text, $bold, $sz) . "</w:p>";
        return "<w:tc><w:tcPr><w:tcW w:w=\"{$w}\" w:type=\"dxa\"/>"
             . "<w:vAlign w:val=\"center\"/>{$extraTcPr}</w:tcPr>{$para}</w:tc>";
    }

    /** Merged cell spanning all columns in a row */
    private function mergedCell(string $text, int $span, array $cols, bool $bold, int $sz): string
    {
        $totalW = array_sum($cols);
        $para = "<w:p><w:pPr></w:pPr>" . $this->run($text, $bold, $sz) . "</w:p>";
        return "<w:tc><w:tcPr>"
             . "<w:tcW w:w=\"{$totalW}\" w:type=\"dxa\"/>"
             . "<w:gridSpan w:val=\"{$span}\"/>"
             . "<w:vAlign w:val=\"top\"/>"
             . "</w:tcPr>{$para}</w:tc>";
    }

    /** Build a bordered or borderless table */
    private function tbl(array $rows, array $cols, bool $bordered): string
    {
        if ($bordered) {
            $bdr = '<w:tblBorders>'
                 . '<w:top w:val="single" w:sz="12" w:space="0" w:color="000000"/>'
                 . '<w:left w:val="single" w:sz="12" w:space="0" w:color="000000"/>'
                 . '<w:bottom w:val="single" w:sz="12" w:space="0" w:color="000000"/>'
                 . '<w:right w:val="single" w:sz="12" w:space="0" w:color="000000"/>'
                 . '<w:insideH w:val="single" w:sz="6" w:space="0" w:color="000000"/>'
                 . '<w:insideV w:val="single" w:sz="6" w:space="0" w:color="000000"/>'
                 . '</w:tblBorders>';
        } else {
            $bdr = '<w:tblBorders>'
                 . '<w:top w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
                 . '<w:left w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
                 . '<w:bottom w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
                 . '<w:right w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
                 . '<w:insideH w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
                 . '<w:insideV w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
                 . '</w:tblBorders>';
        }

        $grid = '<w:tblGrid>';
        foreach ($cols as $cw) {
            $grid .= "<w:gridCol w:w=\"{$cw}\"/>";
        }
        $grid .= '</w:tblGrid>';

        $xml = "<w:tbl><w:tblPr><w:tblW w:w=\"5000\" w:type=\"pct\"/>{$bdr}</w:tblPr>{$grid}";

        foreach ($rows as $row) {
            if (isset($row['_height'])) {
                $h   = $row['_height'];
                $xml .= "<w:tr><w:trPr><w:trHeight w:val=\"{$h}\" w:hRule=\"atLeast\"/></w:trPr>";
                foreach ($row['cells'] as $cell) {
                    $xml .= $cell;
                }
            } else {
                $xml .= '<w:tr>';
                foreach ($row as $cell) {
                    $xml .= $cell;
                }
            }
            $xml .= '</w:tr>';
        }

        $xml .= '</w:tbl>';
        return $xml;
    }

    /** 6-column asset table for sections 1–4 */
    private function assetTable6(Collection $assets, array $pcts, int $AW, string $col3, int $minRows): string
    {
        $cols = $this->splitCols($pcts, $AW);
        $rows = [[
            $this->tc('Asset Serial',          $cols[0], true, 16, 'center'),
            $this->tc('Asset Return Info/Name', $cols[1], true, 16, 'center'),
            $this->tc($col3,                    $cols[2], true, 16, 'center'),
            $this->tc('Good Condition',         $cols[3], true, 16, 'center'),
            $this->tc('Poor Condition',         $cols[4], true, 16, 'center'),
            $this->tc('Damaged',                $cols[5], true, 16, 'center'),
        ]];

        $list     = $assets->values();
        $rowCount = max($minRows, $list->count());

        for ($i = 0; $i < $rowCount; $i++) {
            $a = $list->get($i);
            if ($a) {
                $cond      = $a->condition ?? '';
                $brandNew  = $cond === 'Brand new' ? 'v' : '-';
                $good      = $cond === 'Good'      ? 'v' : '-';
                $poor      = (!in_array($cond, ['Good', 'Brand new', 'Damaged']) && $cond !== '') ? 'v' : '-';
                $damaged   = $cond === 'Damaged'   ? 'v' : '-';
                $rows[] = [
                    $this->tc(($i + 1) . '. ' . ($a->asset_code ?? 'N/A'), $cols[0], false, 18),
                    $this->tc($a->asset_name ?? '-',  $cols[1], false, 18),
                    $this->tc($brandNew, $cols[2], false, 18, 'center'),
                    $this->tc($good,     $cols[3], false, 18, 'center'),
                    $this->tc($poor,     $cols[4], false, 18, 'center'),
                    $this->tc($damaged,  $cols[5], false, 18, 'center'),
                ];
            } else {
                $rows[] = [
                    $this->tc(($i + 1) . '.', $cols[0], false, 18),
                    $this->tc('-',            $cols[1], false, 18),
                    $this->tc('-', $cols[2], false, 18, 'center'),
                    $this->tc('-', $cols[3], false, 18, 'center'),
                    $this->tc('-', $cols[4], false, 18, 'center'),
                    $this->tc('-', $cols[5], false, 18, 'center'),
                ];
            }
        }

        // Comments row (merged across all 6 cols)
        $rows[] = ['_height' => 800, 'cells' => [$this->mergedCell('Comments:', 6, $cols, true, 18)]];

        return $this->tbl($rows, $cols, true);
    }

    /** 3-column asset table for Section 5 (HR) */
    private function assetTable3(Collection $assets, int $AW): string
    {
        $w    = (int)($AW / 3);
        $cols = [$w, $w, $AW - 2 * $w];
        $rows = [[
            $this->tc('Asset Info/Name', $cols[0], true, 18, 'center'),
            $this->tc('Delivered To',    $cols[1], true, 18, 'center'),
            $this->tc('Notes',           $cols[2], true, 18, 'center'),
        ]];

        $list     = $assets->values();
        $rowCount = max(5, $list->count());

        for ($i = 0; $i < $rowCount; $i++) {
            $a = $list->get($i);
            $rows[] = $a ? [
                $this->tc(($i + 1) . '. ' . $a->asset_name, $cols[0], false, 18),
                $this->tc('-',              $cols[1], false, 18, 'center'),
                $this->tc($a->condition ?? '-', $cols[2], false, 18, 'center'),
            ] : [
                $this->tc(($i + 1) . '. N/A', $cols[0], false, 18),
                $this->tc('-', $cols[1], false, 18, 'center'),
                $this->tc('-', $cols[2], false, 18, 'center'),
            ];
        }

        $rows[] = ['_height' => 900, 'cells' => [$this->mergedCell('Comments:', 3, $cols, true, 18)]];

        return $this->tbl($rows, $cols, true);
    }

    /** Section heading: bold part + normal part in one paragraph */
    private function sectionHeading(string $boldPart, string $normalPart): string
    {
        return '<w:p><w:pPr></w:pPr>'
             . $this->run($boldPart . ' ', true, 20)
             . $this->run($normalPart, false, 20)
             . '</w:p>';
    }

    /** No-border 2-column signature row */
    private function sigRow(string $left, string $right, int $AW): string
    {
        $w    = (int)($AW / 2);
        $cols = [$w, $AW - $w];
        return $this->tbl([[
            $this->tc($left,  $cols[0], false, 18),
            $this->tc($right, $cols[1], false, 18),
        ]], $cols, false);
    }

    /** Footer table with top border line */
    private function docFooter(string $pageText, int $AW): string
    {
        $w    = (int)($AW / 2);
        $cols = [$w, $AW - $w];
        $topBdr = '<w:tcBorders><w:top w:val="single" w:sz="12" w:space="0" w:color="000000"/></w:tcBorders>';

        $docNo = 'Document No: SRS HR P05 F05|Rev.: 02|Rev. Date: 04/05/2025';
        $c1 = "<w:tc><w:tcPr><w:tcW w:w=\"{$cols[0]}\" w:type=\"dxa\"/>{$topBdr}</w:tcPr>"
            . $this->p($this->run($docNo, true, 18))
            . '</w:tc>';
        $c2 = "<w:tc><w:tcPr><w:tcW w:w=\"{$cols[1]}\" w:type=\"dxa\"/>{$topBdr}</w:tcPr>"
            . $this->p($this->run('| ' . $pageText, true, 18), 'right')
            . '</w:tc>';

        $noBdrTbl = '<w:tblBorders>'
            . '<w:top w:val="none" w:sz="0"/><w:left w:val="none" w:sz="0"/>'
            . '<w:bottom w:val="none" w:sz="0"/><w:right w:val="none" w:sz="0"/>'
            . '<w:insideH w:val="none" w:sz="0"/><w:insideV w:val="none" w:sz="0"/>'
            . '</w:tblBorders>';
        $grid = "<w:tblGrid><w:gridCol w:w=\"{$cols[0]}\"/><w:gridCol w:w=\"{$cols[1]}\"/></w:tblGrid>";

        return "<w:tbl><w:tblPr><w:tblW w:w=\"5000\" w:type=\"pct\"/>{$noBdrTbl}</w:tblPr>{$grid}"
             . "<w:tr>{$c1}{$c2}</w:tr></w:tbl>";
    }

    /** Section properties (page size + margins) */
    private function sectPr(): string
    {
        return '<w:sectPr>'
             . '<w:pgSz w:w="' . self::PW . '" w:h="' . self::PH . '"/>'
             . '<w:pgMar w:top="' . self::MT . '" w:right="' . self::MR
             . '" w:bottom="' . self::MB . '" w:left="' . self::ML
             . '" w:header="708" w:footer="708" w:gutter="0"/>'
             . '</w:sectPr>';
    }

    /**
     * Split AW into column widths based on percentage array.
     * Last column absorbs any rounding remainder.
     */
    private function splitCols(array $pcts, int $AW): array
    {
        $cols = array_map(fn($p) => (int)($AW * $p / 100), $pcts);
        $cols[count($cols) - 1] += $AW - array_sum($cols);
        return $cols;
    }

    // ── DOCX packaging ───────────────────────────────────────────────────────

    private function packDocx(string $bodyXml): string
    {
        $tmp = sys_get_temp_dir() . '/tmp_' . uniqid() . '.docx';
        $zip = new ZipArchive();
        $zip->open($tmp, ZipArchive::CREATE | ZipArchive::OVERWRITE);

        $zip->addFromString('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            . '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            . '<Default Extension="xml" ContentType="application/xml"/>'
            . '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
            . '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
            . '</Types>');

        $zip->addFromString('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
            . '</Relationships>');

        $zip->addFromString('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
            . '</Relationships>');

        $zip->addFromString('word/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            . '<w:docDefaults><w:rPrDefault><w:rPr>'
            . '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>'
            . '<w:sz w:val="18"/><w:szCs w:val="18"/>'
            . '</w:rPr></w:rPrDefault></w:docDefaults>'
            . '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">'
            . '<w:name w:val="Normal"/>'
            . '<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="18"/></w:rPr>'
            . '</w:style></w:styles>');

        $ns  = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
             . ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
        $zip->addFromString('word/document.xml',
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . "<w:document {$ns}><w:body>{$bodyXml}</w:body></w:document>");

        $zip->close();

        $content = file_get_contents($tmp);
        unlink($tmp);
        return $content;
    }
}
