<?php
    // EnvBox Access Log Router
    $accessLog = 'C:/laragon/www/envbox-pro/projects/testis/logs/access.log';
    $log = sprintf("[%s] %s %s %s\n", date('Y-m-d H:i:s'), $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1', $_SERVER['REQUEST_METHOD'] ?? 'GET', $_SERVER['REQUEST_URI'] ?? '/');
    file_put_contents($accessLog, $log, FILE_APPEND | LOCK_EX);

    // Serve the actual file
    $path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    $file = __DIR__ . '/../public' . $path;

    if (is_file($file)) {
        return false; // Let PHP serve the file
    }

    // Jika file gak ada, tetep return false (PHP handle 404)
    return false;
    ?>