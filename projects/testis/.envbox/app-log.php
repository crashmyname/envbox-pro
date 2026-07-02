<?php
    // EnvBox App Logger
    function app_log($message, $level = 'INFO') {
        $logFile = 'C:/laragon/www/envbox-pro/projects/testis/logs/app.log';
        $log = sprintf("[%s] %s: %s\n", date('Y-m-d H:i:s'), strtoupper($level), $message);
        file_put_contents($logFile, $log, FILE_APPEND | LOCK_EX);
    }

    // Auto-log script execution
    app_log("Script executed: " . $_SERVER['REQUEST_URI'], 'INFO');
    ?>