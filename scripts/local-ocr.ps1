param(
    [Parameter(Mandatory = $true)]
    [string]$InputFile,

    [string]$OutputFile,

    [string]$Language = 'eng+ara',

    [int]$Dpi = 250
)

$ErrorActionPreference = 'Stop'

function Find-LocalCommand {
    param([string]$Name, [string[]]$CommonPaths = @())

    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }

    foreach ($path in $CommonPaths) {
        if (Test-Path -LiteralPath $path) { return $path }
    }

    return $null
}

$resolvedInput = (Resolve-Path -LiteralPath $InputFile).Path
if (-not $OutputFile) {
    $OutputFile = [System.IO.Path]::ChangeExtension($resolvedInput, '.txt')
}
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputFile)

$tesseract = Find-LocalCommand 'tesseract' @(
    'C:\Program Files\Tesseract-OCR\tesseract.exe',
    'C:\Program Files (x86)\Tesseract-OCR\tesseract.exe'
)
if (-not $tesseract) {
    throw 'Tesseract OCR is not installed. Install Tesseract with English and Arabic language data, then run this command again.'
}

$extension = [System.IO.Path]::GetExtension($resolvedInput).ToLowerInvariant()
$images = @()
$tempDirectory = $null

try {
    if ($extension -eq '.pdf') {
        $pdftoppm = Find-LocalCommand 'pdftoppm'
        if (-not $pdftoppm) {
            throw 'Poppler pdftoppm is required for scanned PDF files and was not found in PATH.'
        }

        $tempDirectory = Join-Path $env:TEMP ('srs-ocr-' + [guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $tempDirectory | Out-Null
        $prefix = Join-Path $tempDirectory 'page'

        & $pdftoppm -png -r $Dpi $resolvedInput $prefix
        if ($LASTEXITCODE -ne 0) { throw 'Could not convert the PDF pages to images.' }

        $images = @(Get-ChildItem -LiteralPath $tempDirectory -Filter 'page-*.png' | Sort-Object Name | Select-Object -ExpandProperty FullName)
        if ($images.Count -eq 0) { throw 'No pages were generated from the PDF.' }
    } elseif ($extension -in @('.png', '.jpg', '.jpeg', '.bmp', '.tif', '.tiff', '.webp')) {
        $images = @($resolvedInput)
    } else {
        throw 'Supported files: PDF, PNG, JPG, JPEG, BMP, TIFF and WEBP.'
    }

    $pages = New-Object System.Collections.Generic.List[string]
    foreach ($image in $images) {
        $text = & $tesseract $image stdout -l $Language 2>$null
        if ($LASTEXITCODE -ne 0 -and $Language -ne 'eng') {
            $text = & $tesseract $image stdout -l eng 2>$null
        }
        $pages.Add(($text -join [Environment]::NewLine).Trim())
    }

    $result = ($pages -join ([Environment]::NewLine + [Environment]::NewLine + '--- PAGE BREAK ---' + [Environment]::NewLine + [Environment]::NewLine)).Trim()
    [System.IO.File]::WriteAllText($resolvedOutput, $result, [System.Text.UTF8Encoding]::new($true))

    Write-Host "OCR complete: $resolvedOutput" -ForegroundColor Green
    Write-Host "Pages processed: $($images.Count)" -ForegroundColor DarkGray
} finally {
    if ($tempDirectory -and (Test-Path -LiteralPath $tempDirectory)) {
        Remove-Item -LiteralPath $tempDirectory -Recurse -Force
    }
}
