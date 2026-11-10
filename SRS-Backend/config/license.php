<?php

return [
    // Licences are signed with the matching private key, which never leaves
    // the issuer's machine. Only the public key ships with the application.
    'public_key' => <<<'PEM'
-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEe1cBbZFcVfSwp4BQhrA4HecgBCzF
INV9+wopRV/7bdaLP5aH6bbRL44W0TekmrOK/3G3uwhtLGXkFK5rEu0EjA==
-----END PUBLIC KEY-----
PEM,

    // An installation without a licence keeps working this long after it was
    // first started, so an update never locks a running system by surprise.
    'grace_days' => 14,

    // Admins are warned this many days before the licence ends, unless the
    // licence itself says otherwise.
    'warn_days' => 30,
];
