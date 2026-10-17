<?php

namespace App\Support;

use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\Cell\DefaultValueBinder;

/**
 * Exports write user-entered text (notes, names, asset descriptions) into cells.
 * The default binder turns any string starting with "=" into a live formula, so
 * a note such as =HYPERLINK(...) would execute when the exported file is opened.
 * No export builds formulas through setCellValue, so treat them all as text.
 */
class FormulaSafeValueBinder extends DefaultValueBinder
{
    public static function dataTypeForValue(mixed $value): string
    {
        if (is_string($value) && str_starts_with($value, '=')) {
            return DataType::TYPE_STRING;
        }

        return parent::dataTypeForValue($value);
    }
}
