<?php

use Illuminate\Support\Facades\Route;

Route::get('/{any}', function () {
    $index = public_path('index.html');
    if (! file_exists($index)) {
        return response('Frontend not built. Missing public/index.html', 500);
    }
    return response(file_get_contents($index), 200, [
        'Content-Type'  => 'text/html',
        'Cache-Control' => 'no-cache, no-store, must-revalidate',
        'Pragma'        => 'no-cache',
        'Expires'       => '0',
    ]);
})->where('any', '^(?!api).*$');
