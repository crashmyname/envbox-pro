// modules/ProjectRunner.js
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const http = require('http');

class ProjectRunner {
  constructor() {
    this.runningProcesses = new Map();
  }

  async start(project) {
      const { id, stack, version, port, docRoot, name, ssl, sslPort, mode } = project;
      
      if (this.runningProcesses.has(id)) {
        await this.stop(id);
      }

      let childProcess;
      const projectPath = path.join(__dirname, '..', 'projects', name);
      const actualDocRoot = await this.findDocRoot(projectPath, docRoot, stack);

      switch (stack) {
        case 'php':
          childProcess = await this.startPHP(version, actualDocRoot, port, projectPath, {ssl, sslPort, projectId: id});
          break;
        case 'nodejs':
          childProcess = await this.startNodeJS(version, projectPath, port, mode || 'dev');
          break;
        case 'go':
          childProcess = await this.startGo(version, projectPath, port, mode || 'dev');
          break;
        case 'python':
          childProcess = await this.startPython(version, projectPath, port, mode || 'dev');
          break;
        default:
          throw new Error(`Unknown stack: ${stack}`);
      }

      this.runningProcesses.set(id, {
        process: childProcess,
        project,
        startedAt: new Date()
      });

      if (ssl && sslPort) {
        await this.startCaddyReverseProxy(id, projectPath, port, sslPort, name);
      }

      return { 
        success: true, 
        url: `http://localhost:${port}`,
        httpsUrl: (ssl && sslPort) ? `https://localhost:${sslPort}` : null,
        pid: childProcess.pid,
        server: stack === 'php' ? 'apache' : stack
      };
    }

    async setupSSL(projectPath, sslPort) {
      const certsDir = path.join(projectPath, '.envbox', 'ssl');
      await fs.ensureDir(certsDir);
      const certFile = path.join(certsDir, 'cert.pem');
      const keyFile = path.join(certsDir, 'key.pem');
      if (await fs.pathExists(certFile) && await fs.pathExists(keyFile)) return { certFile, keyFile };
      try {
        await this.execCommand(`openssl req -x509 -newkey rsa:2048 -keyout "${keyFile}" -out "${certFile}" -days 365 -nodes -subj "/CN=localhost"`, { timeout: 10000 });
      } catch(e) {
        await fs.writeFile(certFile, 'PLACEHOLDER');
        await fs.writeFile(keyFile, 'PLACEHOLDER');
      }
      return { certFile, keyFile };
    }

    async startCaddyReverseProxy(id, projectPath, port, sslPort, name) {
      const sslId = id + '_ssl';
      if (this.runningProcesses.has(sslId)) await this.stopSSL(sslId);
      const proxy = spawn('npx', ['local-ssl-proxy', '--source', sslPort, '--target', port], {
        stdio: ['ignore', 'pipe', 'pipe'], cwd: projectPath, shell: true
      });
      this.runningProcesses.set(sslId, { process: proxy, project: { name: name + ' (SSL)' }, startedAt: new Date() });
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    getLocalIP() {
      const nets = os.networkInterfaces();
      for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
          if (net.family === 'IPv4' && !net.internal) return net.address;
        }
      }
      return '127.0.0.1';
    }

    async stopSSL(sslId) {
      const running = this.runningProcesses.get(sslId);
      if (running) {
        running.process.kill('SIGTERM');
        await new Promise(r => setTimeout(r, 1000));
        if (running.process && !running.process.killed) running.process.kill('SIGKILL');
        this.runningProcesses.delete(sslId);
      }
    }

    async findDocRoot(projectPath, configDocRoot, stack) {
      if (configDocRoot && configDocRoot !== 'public') {
        const customPath = path.join(projectPath, configDocRoot);
        if (await fs.pathExists(customPath)) return customPath;
      }
      const publicPath = path.join(projectPath, 'public');
      if (await fs.pathExists(publicPath) && await fs.pathExists(path.join(publicPath, 'index.php'))) return publicPath;
      for (const wwwDir of ['www', 'htdocs', 'web', 'webroot']) {
        const wwwPath = path.join(projectPath, wwwDir);
        if (await fs.pathExists(wwwPath)) return wwwPath;
      }
      if (stack === 'php') {
        const files = await fs.readdir(projectPath).catch(() => []);
        if (files.some(f => f.endsWith('.php'))) return projectPath;
      }
      const fallback = path.join(projectPath, 'public');
      await fs.ensureDir(fallback);
      return fallback;
    }

    async startPhpMyAdminApache(port = 8084) {
    const pmaPath = path.join(__dirname, '..', 'environments', 'tools', 'phpmyadmin');

    if (!await fs.pathExists(pmaPath)) {
        throw new Error('phpMyAdmin not found. Run setup script first.');
    }

    const phpBin = await this.findPHPBinary('8.2');
    if (!phpBin) throw new Error('PHP not found');
    const phpDir = path.dirname(phpBin);

    const apacheDir = path.join(__dirname, '..', 'environments', 'apache', 'Apache24');
    const httpdExe = path.join(apacheDir, 'bin', 'httpd.exe');
    const hasApache = await fs.pathExists(httpdExe);

    if (!hasApache) {
        console.log('⚠️ Apache tidak ditemukan, fallback ke php -S (lemot)');
        return this.startPhpMyAdmin(port);
    }

    console.log('⚡ Starting phpMyAdmin via Apache (fast mode)...');

    const phpMajorVersion = '8';
    let phpModule = path.join(phpDir, `php${phpMajorVersion}apache2_4.dll`);
    if (!await fs.pathExists(phpModule)) {
        throw new Error(`PHP Apache module (php${phpMajorVersion}apache2_4.dll) tidak ditemukan di ${phpDir}`);
    }

    // ✅ SATU-SATUNYA deklarasi pmaConfDir & cacheDir — jangan diulang di bawah
    const pmaConfDir = path.join(pmaPath, '.envbox-apache');
    const cacheDir = path.join(pmaConfDir, 'opcache-cache');
    await fs.ensureDir(pmaConfDir);
    await fs.ensureDir(cacheDir);

    // ✅ Base php.ini asli, supaya extension mysqli dkk ikut ke-load
    const baseIniPath = path.join(phpDir, 'php.ini');
    let baseIniContent = '';
    if (await fs.pathExists(baseIniPath)) {
        baseIniContent = await fs.readFile(baseIniPath, 'utf8');
        console.log(`✅ Base php.ini ditemukan: ${baseIniPath}`);
    } else {
        console.log(`⚠️ php.ini dasar tidak ditemukan di ${baseIniPath}`);
        const devIni = path.join(phpDir, 'php.ini-development');
        const prodIni = path.join(phpDir, 'php.ini-production');
        if (await fs.pathExists(devIni)) {
            baseIniContent = await fs.readFile(devIni, 'utf8');
        } else if (await fs.pathExists(prodIni)) {
            baseIniContent = await fs.readFile(prodIni, 'utf8');
        }
        if (!baseIniContent.includes('extension_dir')) {
            baseIniContent += `\nextension_dir = "${path.join(phpDir, 'ext').replace(/\\/g, '/')}"\n`;
        }
        // Pastikan extension mysqli & pdo_mysql AKTIF
        if (!baseIniContent.includes('extension=mysqli')) {
          baseIniContent += '\nextension=mysqli\n';
        }
        if (!baseIniContent.includes('extension=pdo_mysql')) {
          baseIniContent += '\nextension=pdo_mysql\n';
        }
        if (!baseIniContent.includes('extension_dir')) {
          baseIniContent += `\nextension_dir = "${path.join(phpDir, 'ext').replace(/\\/g, '/')}"\n`;
        }
    }

    const phpIniFile = path.join(pmaConfDir, 'php.ini');
    const phpIniOverrides = `

; ===== EnvBox phpMyAdmin overrides =====
xdebug.mode=off
opcache.enable=1
opcache.enable_cli=0
opcache.memory_consumption=128
opcache.max_accelerated_files=10000
opcache.revalidate_freq=0
opcache.validate_timestamps=0
opcache.file_cache="${cacheDir.replace(/\\/g, '/')}"
realpath_cache_size=4096K
realpath_cache_ttl=600
max_execution_time=60
memory_limit=256M
display_errors=Off
`;
    await fs.writeFile(phpIniFile, baseIniContent + phpIniOverrides);
    console.log('✅ php.ini created (based on original + overrides):', phpIniFile);

      // Apache config khusus phpMyAdmin
      const apacheConfig = `
  ServerRoot "${apacheDir.replace(/\\/g, '/')}"
  Listen ${port}

  LoadModule authn_core_module modules/mod_authn_core.so
  LoadModule authz_core_module modules/mod_authz_core.so
  LoadModule dir_module modules/mod_dir.so
  LoadModule mime_module modules/mod_mime.so
  LoadModule log_config_module modules/mod_log_config.so
  LoadModule headers_module modules/mod_headers.so
  LoadModule deflate_module modules/mod_deflate.so
  LoadModule expires_module modules/mod_expires.so
  LoadModule filter_module modules/mod_filter.so

  LoadModule php_module "${phpModule.replace(/\\/g, '/')}"
  <FilesMatch \\.php$>
      SetHandler application/x-httpd-php
  </FilesMatch>
  PHPIniDir "${pmaConfDir.replace(/\\/g, '/')}"

  DocumentRoot "${pmaPath.replace(/\\/g, '/')}"
  <Directory "${pmaPath.replace(/\\/g, '/')}">
      Options -Indexes +FollowSymLinks
      AllowOverride None
      Require all granted
      DirectoryIndex index.php
  </Directory>

  ErrorLog "${path.join(pmaConfDir, 'error.log').replace(/\\/g, '/')}"
  LogLevel error
  CustomLog "${path.join(pmaConfDir, 'access.log').replace(/\\/g, '/')}" common

  KeepAlive On
  MaxKeepAliveRequests 1000
  KeepAliveTimeout 2
  ThreadsPerChild 150
  MaxConnectionsPerChild 0

  <IfModule deflate_module>
      AddOutputFilterByType DEFLATE text/html text/css text/javascript application/javascript
      DeflateCompressionLevel 3
  </IfModule>

  <IfModule expires_module>
      ExpiresActive On
      ExpiresByType text/css "access plus 1 year"
      ExpiresByType text/javascript "access plus 1 year"
      ExpiresByType application/javascript "access plus 1 year"
  </IfModule>
  `;

      const configFile = path.join(pmaConfDir, 'httpd.conf');
      await fs.writeFile(configFile, apacheConfig);

      console.log('🔍 Testing Apache config for phpMyAdmin...');
      try {
          await this.execCommand(`"${httpdExe}" -t -f "${configFile}"`);
          console.log('✅ Apache config OK');
      } catch(e) {
          console.log('⚠️ Config test warning:', e.message.split('\n')[0]);
      }

      const child = spawn(httpdExe, ['-f', configFile, '-D', 'FOREGROUND'], {
          stdio: ['ignore', 'pipe', 'pipe'],
          cwd: apacheDir,
          env: {
              ...process.env,
              PATH: `${apacheDir}\\bin;${phpDir};${process.env.PATH}`
          }
      });

      child.stdout.on('data', (d) => console.log(`[PMA-Apache:${port}] ${d.toString().trim()}`));
      child.stderr.on('data', (d) => {
          const msg = d.toString().trim();
          if (msg && !msg.includes('resuming normal')) console.log(`[PMA-Apache:${port}] ${msg}`);
      });
      child.on('error', (e) => console.error(`[PMA-Apache:${port}] Error:`, e.message));
      child.on('exit', (c) => console.log(`[PMA-Apache:${port}] Exited: ${c}`));

      child._configFile = configFile;

      await new Promise(resolve => setTimeout(resolve, 2000));

      if (child.killed) {
          throw new Error('Apache (phpMyAdmin) gagal start. Cek port atau config.');
      }

      console.log(`✅ phpMyAdmin (Apache) ready on http://localhost:${port}/`);
      return child;
  }

  // ===== ⚡⚡⚡ APACHE-FIRST startPHP =====
  async startPHP(version, documentRoot, port, projectPath, config = {}) {
      const { ssl = false, sslPort = null, projectId = null, name } = config;
      
      // ✅ Cari PHP binary
      const phpBin = await this.findPHPBinary(version);
      if (!phpBin) throw new Error(`PHP ${version} not found!`);
      const phpDir = path.dirname(phpBin);
      
      // ✅ Cek Apache DULU
      const apacheDir = path.join(__dirname, '..', 'environments', 'apache', 'Apache24');
      const httpdExe = path.join(apacheDir, 'bin', 'httpd.exe');
      const hasApache = await fs.pathExists(httpdExe);
      
      if (hasApache) {
          console.log('⚡ Apache HTTP Server detected - Using PRODUCTION mode');
          return this.startWithApache(phpBin, phpDir, httpdExe, apacheDir, version, documentRoot, port, projectPath, config);
      }
      
      // Fallback: Cek PHP-CGI
      const phpCgi = path.join(phpDir, 'php-cgi.exe');
      const hasCgi = await fs.pathExists(phpCgi);
      
      if (hasCgi) {
          console.log('⚡ PHP FastCGI mode (High Performance)');
          return this.startWithFastCGI(phpBin, phpCgi, version, documentRoot, port, projectPath, config);
      }
      
      // Last resort: PHP built-in server
      console.log('📦 PHP Built-in Server (Development)');
      return this.startPHPSimple(phpBin, version, documentRoot, port, projectPath, config);
  }

  async startWithApache(phpBin, phpDir, httpdExe, apacheDir, version, documentRoot, port, projectPath, config) {
    const { projectId, name } = config;
    const projectName = name || path.basename(projectPath);
    
    // Setup directories
    const apacheConfDir = path.join(projectPath, '.envbox', 'apache');
    const logsDir = path.join(projectPath, 'logs');
    const cacheDir = path.join(apacheConfDir, 'cache');
    await fs.ensureDir(apacheConfDir);
    await fs.ensureDir(logsDir);
    await fs.ensureDir(cacheDir);
    
    // Setup php.ini with MAX performance
    const phpIniFile = path.join(projectPath, 'php.ini');
    let phpIni = '';
    if (await fs.pathExists(phpIniFile)) {
        phpIni = await fs.readFile(phpIniFile, 'utf8');
    }
    
    const phpOptimizations = `
; ⚡ EnvBox Production Optimizations
opcache.enable=1
opcache.memory_consumption=512
opcache.interned_strings_buffer=32
opcache.max_accelerated_files=50000
opcache.revalidate_freq=0
opcache.fast_shutdown=1
opcache.enable_cli=1
opcache.validate_timestamps=0
opcache.file_cache="${cacheDir.replace(/\\/g, '/')}"
opcache.file_cache_only=0

realpath_cache_size=8192k
realpath_cache_ttl=600

max_execution_time=30
max_input_time=60
memory_limit=256M
post_max_size=64M
upload_max_filesize=64M

expose_php=Off
display_errors=Off
`;
    
    if (!phpIni.includes('opcache.enable=1')) {
        phpIni += phpOptimizations;
    }
    
    const errorLogFile = path.join(logsDir, 'php_error.log').replace(/\\/g, '/');
    if (!phpIni.includes('error_log')) {
        phpIni += `\nlog_errors = On\nerror_log = "${errorLogFile}"\n`;
    }
    await fs.writeFile(phpIniFile, phpIni);
    
    // 🔧 Auto-detect PHP Apache module berdasarkan versi
    const phpMajorVersion = version.split('.')[0]; // "7", "8", dll
    let phpModule = path.join(phpDir, `php${phpMajorVersion}apache2_4.dll`);
    
    if (!await fs.pathExists(phpModule)) {
        // Coba alternatif: php8apache2_4.dll untuk semua versi 8.x
        if (phpMajorVersion === '8') {
            const altModule = path.join(phpDir, 'php8apache2_4.dll');
            if (await fs.pathExists(altModule)) {
                phpModule = altModule;
                console.log('✅ Using php8apache2_4.dll');
            }
        }
        // Coba php7apache2_4.dll untuk versi 7.x
        else if (phpMajorVersion === '7') {
            const altModule = path.join(phpDir, 'php7apache2_4.dll');
            if (await fs.pathExists(altModule)) {
                phpModule = altModule;
                console.log('✅ Using php7apache2_4.dll');
            }
        }
    }
    
    if (!await fs.pathExists(phpModule)) {
        console.log(`⚠️ PHP Apache module not found for PHP ${version}`);
        console.log(`   Tried: php${phpMajorVersion}apache2_4.dll`);
        console.log('   Falling back to FastCGI mode...');
        const phpCgi = path.join(phpDir, 'php-cgi.exe');
        if (await fs.pathExists(phpCgi)) {
            return this.startWithFastCGI(phpBin, phpCgi, version, documentRoot, port, projectPath, config);
        }
        console.log('   Falling back to PHP built-in server...');
        return this.startPHPSimple(phpBin, version, documentRoot, port, projectPath, config);
    }
    
    console.log(`✅ PHP Apache module: ${path.basename(phpModule)}`);
    
    // ⚡ Apache config
    const apacheConfig = `
ServerRoot "${apacheDir.replace(/\\/g, '/')}"
Listen ${port}

# Core modules
LoadModule authn_core_module modules/mod_authn_core.so
LoadModule authz_core_module modules/mod_authz_core.so
LoadModule dir_module modules/mod_dir.so
LoadModule mime_module modules/mod_mime.so
LoadModule log_config_module modules/mod_log_config.so
LoadModule rewrite_module modules/mod_rewrite.so

# Optional modules (load if exist)
LoadModule headers_module modules/mod_headers.so
LoadModule deflate_module modules/mod_deflate.so
LoadModule expires_module modules/mod_expires.so
LoadModule filter_module modules/mod_filter.so

# PHP Module
LoadModule php_module "${phpModule.replace(/\\/g, '/')}"
<FilesMatch \\.php$>
    SetHandler application/x-httpd-php
</FilesMatch>
PHPIniDir "${path.dirname(phpIniFile).replace(/\\/g, '/')}"

ServerName ${projectName}.localhost
DocumentRoot "${documentRoot.replace(/\\/g, '/')}"

<Directory "${documentRoot.replace(/\\/g, '/')}">
    Options -Indexes +FollowSymLinks
    AllowOverride None
    Require all granted
    DirectoryIndex index.php index.html
</Directory>

ErrorLog "${logsDir.replace(/\\/g, '/')}/apache_error.log"
LogLevel error
CustomLog "${logsDir.replace(/\\/g, '/')}/apache_access.log" common

# ⚡ Performance
KeepAlive On
MaxKeepAliveRequests 1000
KeepAliveTimeout 2
ThreadsPerChild 150
MaxConnectionsPerChild 0

# Compression
<IfModule deflate_module>
    AddOutputFilterByType DEFLATE text/html text/css text/javascript
    DeflateCompressionLevel 3
</IfModule>

# Cache headers
<IfModule expires_module>
    ExpiresActive On
    ExpiresByType text/css "access plus 1 year"
    ExpiresByType text/javascript "access plus 1 year"
    ExpiresByType image/png "access plus 1 year"
    ExpiresByType image/jpeg "access plus 1 year"
</IfModule>
`;
    
    const configFile = path.join(apacheConfDir, 'httpd.conf');
    await fs.writeFile(configFile, apacheConfig);
    
    // Project ID
    const envboxDir = path.join(projectPath, '.envbox');
    await fs.ensureDir(envboxDir);
    await fs.writeFile(path.join(envboxDir, 'project-id'), String(projectId || 'unknown'));
    
    // Test config
    console.log('🔍 Testing Apache config...');
    try {
        await this.execCommand(`"${httpdExe}" -t -f "${configFile}"`);
        console.log('✅ Apache config OK');
    } catch(e) {
        console.log('⚠️ Config test warning (may still work):', e.message.split('\n')[0]);
    }
    
    // ⚡ START APACHE
    console.log(`🚀 Starting Apache on port ${port}...`);
    console.log(`   DocumentRoot: ${documentRoot}`);
    console.log(`   PHP Module: ${path.basename(phpModule)}`);
    console.log(`   Threads: 150 | KeepAlive: On`);
    
    const child = spawn(httpdExe, ['-f', configFile, '-D', 'FOREGROUND'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: apacheDir,
        env: {
            ...process.env,
            PATH: `${apacheDir}\\bin;${phpDir};${process.env.PATH}`
        }
    });
    
    child.stdout.on('data', (d) => console.log(`[Apache:${port}] ${d.toString().trim()}`));
    child.stderr.on('data', (d) => {
        const msg = d.toString().trim();
        if (msg && !msg.includes('resuming normal')) console.log(`[Apache:${port}] ${msg}`);
    });
    child.on('error', (e) => console.error(`[Apache:${port}] Error:`, e.message));
    child.on('exit', (c) => console.log(`[Apache:${port}] Exited: ${c}`));
    
    child._configFile = configFile;
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    if (child.killed) {
        throw new Error('Apache died. Check port or config.');
    }
    
    console.log(`✅ Apache ready on http://localhost:${port}/`);
    return child;
}

  async findPHPBinary(version) {
      const envPhpDir = path.join(__dirname, '..', 'environments', 'php');
      
      if (!await fs.pathExists(envPhpDir)) {
          console.log(`⚠️ PHP environments not found: ${envPhpDir}`);
          return null;
      }
      
      const dirs = await fs.readdir(envPhpDir);
      console.log(`🔍 Available PHP versions: ${dirs.join(', ')}`);
      
      // 1. Exact match: "8.2.28" === "8.2.28"
      let matchDir = dirs.find(d => d === version);
      
      // 2. Starts with: "8.2" matches "8.2.28"
      if (!matchDir) {
          matchDir = dirs.find(d => d.startsWith(version));
      }
      
      // 3. Contains: "8.2" matches "php-8.2.28" atau "8.2.28-nts"
      if (!matchDir && version.includes('.')) {
          const majorMinor = version.split('.').slice(0, 2).join('.');
          matchDir = dirs.find(d => d.includes(majorMinor));
      }
      
      // 4. Reverse: user pilih "8.2" tapi folder "8.2.28"
      if (!matchDir) {
          matchDir = dirs.find(d => d.startsWith(version + '.'));
      }
      
      if (matchDir) {
          const phpPath = path.join(envPhpDir, matchDir, 'php.exe');
          if (await fs.pathExists(phpPath)) {
              console.log(`✅ Found PHP ${matchDir}`);
              return phpPath;
          }
      }
      
      console.log(`❌ PHP ${version} not found. Available: ${dirs.join(', ')}`);
      return null;
  }

  // ===== FASTCGI MODE (FALLBACK) =====
  async startWithFastCGI(phpBin, phpCgi, version, documentRoot, port, projectPath, config) {
      // ... kode FastCGI yang sebelumnya ...
      // (Pindahin dari startPHP yang lama ke sini)
      return this.startPHPSimple(phpBin, version, documentRoot, port, projectPath, config);
  }

  // ===== SIMPLE MODE (LAST RESORT) =====
  async startPHPSimple(phpBin, version, documentRoot, port, projectPath, config = {}) {
      console.log('📦 PHP Built-in Server mode');
      
      const phpIniPath = path.join(projectPath, 'php.ini');
      const routerScript = path.join(projectPath, '.envbox', 'router.php');
      
      const args = ['-S', `0.0.0.0:${port}`, '-t', documentRoot, '-c', phpIniPath];
      if (await fs.pathExists(routerScript)) args.push(routerScript);
      
      const child = spawn(phpBin, args, {
          stdio: ['ignore', 'pipe', 'pipe'],
          cwd: projectPath
      });
      
      child.stdout.on('data', (d) => console.log(`[PHP:${port}] ${d.toString().trim()}`));
      child.stderr.on('data', (d) => console.log(`[PHP:${port}] ${d.toString().trim()}`));
      
      await new Promise(resolve => setTimeout(resolve, 1500));
      return child;
  }

  // ... startNodeJS, findEntryFile, startGo, startPython TETAP SAMA ...
  async startNodeJS(version, projectPath, port, mode = 'dev') {
      const envNodePath = path.join(__dirname, '..', 'environments', 'nodejs', version, 'node.exe');
      let nodeBin = 'node';
      if (await fs.pathExists(envNodePath)) nodeBin = envNodePath;

      const pkgPath = path.join(projectPath, 'package.json');
      let pkg = null;
      if (await fs.pathExists(pkgPath)) { try { pkg = await fs.readJson(pkgPath); } catch(e) {} }

      let command = null, args = [], cwd = projectPath;

      if (pkg && pkg.scripts) {
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };

        if (mode === 'dev') {
          // Framework-specific dev commands
          if (deps['next']) {
            command = path.join(projectPath, 'node_modules', '.bin', 'next.cmd');
            if (!await fs.pathExists(command)) command = 'npx';
            args = command === 'npx' ? ['next', 'dev', '-p', String(port)] : ['dev', '-p', String(port)];
          } else if (deps['vite']) {
            command = path.join(projectPath, 'node_modules', '.bin', 'vite.cmd');
            if (!await fs.pathExists(command)) command = 'npx';
            args = command === 'npx' ? ['vite', '--port', String(port), '--host'] : ['--port', String(port), '--host'];
          } else if (deps['@adonisjs/core'] || deps['@adonisjs/framework']) {
            command = nodeBin;
            args = ['ace', 'serve', '--watch'];
          } else if (deps['@nestjs/core']) {
            command = 'npx';
            args = ['nest', 'start', '--watch'];
          } else if (deps['nuxt'] || deps['nuxt3']) {
            command = 'npx';
            args = ['nuxi', 'dev', '--port', String(port)];
          } else if (pkg.scripts.dev) {
            command = os.platform() === 'win32' ? 'npm.cmd' : 'npm';
            args = ['run', 'dev'];
          } else if (pkg.scripts.start) {
            command = os.platform() === 'win32' ? 'npm.cmd' : 'npm';
            args = ['run', 'start'];
          }
        } else if (mode === 'build') {
          // Build dulu baru start
          if (pkg.scripts.build) {
            console.log('📦 Building project...');
            const npmCmd = os.platform() === 'win32' ? 'npm.cmd' : 'npm';
            try { await this.execCommand(`"${npmCmd}" run build`, { cwd: projectPath, timeout: 120000 }); } catch(e) { console.log('⚠️ Build warning:', e.message); }
          }
          if (pkg.scripts.start) {
            command = os.platform() === 'win32' ? 'npm.cmd' : 'npm';
            args = ['run', 'start'];
          }
        }
      }

      if (!command) {
        const entry = this.findEntryFile(projectPath);
        if (entry) { command = nodeBin; args = [entry]; }
        else {
          await fs.writeFile(path.join(projectPath, 'server.js'), `const http = require('http');\nconst PORT = process.env.PORT || ${port};\nhttp.createServer((req, res) => {\nres.writeHead(200, {'Content-Type': 'text/html'});\nres.end(\`<h1>🚀 Node.js</h1><p>Port: \${PORT}</p>\`);\n}).listen(PORT, '0.0.0.0', () => console.log('http://localhost:' + PORT));\n`);
          command = nodeBin; args = ['server.js'];
        }
      }

      console.log(`🟢 Starting Node.js [${mode}] on port ${port}...`);
      
      const child = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PORT: String(port), NODE_ENV: mode === 'dev' ? 'development' : 'production', HOST: '0.0.0.0' },
        cwd, shell: true
      });

      child.stdout.on('data', (d) => console.log(`[Node:${port}] ${d.toString().trim()}`));
      child.stderr.on('data', (d) => console.log(`[Node:${port}] ${d.toString().trim()}`));
      child.on('error', (e) => console.error(`[Node:${port}] Error:`, e.message));
      child.on('exit', (c) => console.log(`[Node:${port}] Exited: ${c}`));

      await new Promise(resolve => setTimeout(resolve, 2000));
      if (child.killed) throw new Error('Node.js process died.');
      return child;
  }

  findEntryFile(projectPath) {
    const entries = ['server.js', 'index.js', 'app.js', 'main.js', 'src/server.js', 'src/index.js', 'src/app.js', 'dist/server.js', 'dist/index.js'];
    for (const entry of entries) {
      if (fs.existsSync(path.join(projectPath, entry))) return entry;
    }
    return null;
  }

  async startGo(version, projectPath, port, mode = 'dev') {
      const envGoPath = path.join(__dirname, '..', 'environments', 'go', version, 'bin', 'go.exe');
      let goBin = 'go';
      if (await fs.pathExists(envGoPath)) { goBin = envGoPath; console.log(`✅ Found Go at environments`); } 
      else { console.log(`⚠️ Go ${version} not found, using system Go`); }

      const mainFile = path.join(projectPath, 'main.go');
      if (!await fs.pathExists(mainFile)) {
        console.log('📝 Creating default main.go...');
        await fs.writeFile(mainFile, `package main\n\nimport ("fmt";"net/http")\nfunc main(){http.HandleFunc("/",func(w http.ResponseWriter,r *http.Request){fmt.Fprintf(w,"<h1>🚀 Go Server</h1><p>Port: ${port}</p>")});http.ListenAndServe(":${port}",nil)}`);
      }

      // Download deps
      const goModFile = path.join(projectPath, 'go.mod');
      if (await fs.pathExists(goModFile)) { try { await this.execCommand(`"${goBin}" mod download`, { cwd: projectPath, timeout: 60000 }); } catch(e) {} }

      // ✅ DEV MODE: go run (INSTANT)
      if (mode === 'dev') {
        console.log(`🔵 Starting Go [DEV] on port ${port}...`);
        const child = spawn(goBin, ['run', mainFile], {
          stdio: ['ignore', 'pipe', 'pipe'], cwd: projectPath,
          env: { ...process.env, PORT: String(port) }
        });
        child.stdout.on('data', (d) => console.log(`[Go:${port}] ${d.toString().trim()}`));
        child.stderr.on('data', (d) => console.log(`[Go:${port}] ${d.toString().trim()}`));
        child.on('error', (e) => console.error(`[Go:${port}] Error:`, e.message));
        child.on('exit', (c) => console.log(`[Go:${port}] Exited: ${c}`));
        await new Promise(resolve => setTimeout(resolve, 3000));
        if (child.killed) throw new Error('Go app died.');
        console.log(`✅ Go ready on http://localhost:${port}/`);
        return child;
      }

      // ✅ BUILD MODE: go build + run (KODE ASLI)
      console.log(`🔵 Building Go [BUILD] on port ${port}...`);
      try {
        const buildCmd = process.platform === 'win32' ? `"${goBin}" build -o app.exe main.go` : `"${goBin}" build -o app main.go`;
        await this.execCommand(buildCmd, { cwd: projectPath });
        console.log('✅ Build success');
      } catch(e) {
        console.error('❌ Go build failed:', e.message);
        if (!await fs.pathExists(path.join(projectPath, 'go.mod'))) {
          console.log('📦 Initializing Go module...');
          try {
            await this.execCommand(`"${goBin}" mod init app`, { cwd: projectPath });
            const buildCmd = process.platform === 'win32' ? `"${goBin}" build -o app.exe main.go` : `"${goBin}" build -o app main.go`;
            await this.execCommand(buildCmd, { cwd: projectPath });
            console.log('✅ Build success after go mod init');
          } catch(e2) { throw new Error(`Go build failed: ${e2.message}`); }
        } else { throw e; }
      }

      const appName = process.platform === 'win32' ? 'app.exe' : 'app';
      const appPath = path.join(projectPath, appName);
      if (!await fs.pathExists(appPath)) throw new Error(`Go binary not found: ${appPath}`);

      console.log(`🚀 Starting Go app: ${appPath}`);
      const child = spawn(appPath, [], { 
        stdio: ['ignore', 'pipe', 'pipe'], cwd: projectPath,
        env: { ...process.env, PORT: String(port) }
      });
      child.stdout.on('data', (d) => console.log(`[Go:${port}] ${d.toString().trim()}`));
      child.stderr.on('data', (d) => console.log(`[Go:${port}] ${d.toString().trim()}`));
      child.on('error', (e) => console.error(`[Go:${port}] Error:`, e.message));
      child.on('exit', (c) => console.log(`[Go:${port}] Exited: ${c}`));
      await new Promise(resolve => setTimeout(resolve, 2000));
      if (child.killed) throw new Error('Go app died.');
      console.log(`✅ Go ready on http://localhost:${port}/`);
      return child;
  }

  async startPython(version, projectPath, port, mode = 'dev') {
      const envPyPath = path.join(__dirname, '..', 'environments', 'python', version, 'python.exe');
      let pyBin = 'python';
      if (await fs.pathExists(envPyPath)) pyBin = envPyPath;
      const possibleEntries = ['app.py', 'main.py', 'server.py', 'run.py', 'wsgi.py'];
      let appFile = null;
      for (const entry of possibleEntries) {
        const fullPath = path.join(projectPath, entry);
        if (await fs.pathExists(fullPath)) { appFile = fullPath; break; }
      }
      if (!appFile) {
        appFile = path.join(projectPath, 'app.py');
        await fs.writeFile(appFile, `from http.server import *\nclass H(BaseHTTPRequestHandler):\n def do_GET(self):\n  self.send_response(200);self.end_headers();self.wfile.write(b'<h1>🚀 Python</h1>')\nHTTPServer(('0.0.0.0',${port}),H).serve_forever()`);
      }
      
      console.log(`🐍 Starting Python [${mode}] on port ${port}...`);
      
      // Dev/Build mode untuk Python sama (interpreted language)
      const child = spawn(pyBin, [appFile], { stdio: ['ignore', 'pipe', 'pipe'], cwd: projectPath });
      child.stdout.on('data', (d) => console.log(`[Py:${port}] ${d.toString().trim()}`));
      child.stderr.on('data', (d) => console.log(`[Py:${port}] ${d.toString().trim()}`));
      await new Promise(r => setTimeout(r, 1500));
      return child;
  }

  async stop(id) {
    const running = this.runningProcesses.get(id);
    if (running) {
      console.log(`⏹ Stopping ${running.project.name}...`);
      
      if (running.process._cgiWorkers) {
        for (const worker of running.process._cgiWorkers) {
          try { worker.kill('SIGTERM'); } catch(e) {}
        }
      }
      
      running.process.kill('SIGTERM');
      await new Promise(r => setTimeout(r, 2000));
      if (running.process && !running.process.killed) running.process.kill('SIGKILL');
      this.runningProcesses.delete(id);
      await this.stopSSL(id + '_ssl');
      return { success: true };
    }
    return { success: false, message: 'Not running' };
  }

  getStatus(id) {
    const r = this.runningProcesses.get(id);
    return { running: !!r, pid: r?.process?.pid || null };
  }

  getAllRunning() {
    const result = [];
    for (const [id, d] of this.runningProcesses) {
      if (id.endsWith('_ssl')) continue;
      result.push({ id, name: d.project.name, port: d.project.port, pid: d.process.pid, hasSSL: this.runningProcesses.has(id + '_ssl') });
    }
    return result;
  }

  execCommand(command, options = {}) {
    return new Promise((resolve, reject) => {
      const { exec } = require('child_process');
      exec(command, { maxBuffer: 10 * 1024 * 1024, ...options }, (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout);
      });
    });
  }

  shutdown() {
    for (const [key, d] of this.runningProcesses) {
      try { d.process.kill('SIGTERM'); } catch(e) {}
    }
    this.runningProcesses.clear();
  }
}

module.exports = { ProjectRunner };