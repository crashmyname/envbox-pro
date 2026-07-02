const { app, BrowserWindow, ipcMain, dialog, shell, Menu, Tray, nativeImage, powerMonitor } = require('electron');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs-extra');
const { spawn, exec } = require('child_process');
const https = require('https');

// Import all managers
const { EnvironmentManager } = require('./modules/EnvironmentManager');
const { VersionManager } = require('./modules/VersionManager');
const { DatabaseManager } = require('./modules/DatabaseManager');
const { RedisManager } = require('./modules/RedisManager');
const { CacheManager } = require('./modules/CacheManager');
const { QueueManager } = require('./modules/QueueManager');
const { SchedulerManager } = require('./modules/SchedulerManager');
const { WorkerManager } = require('./modules/WorkerManager');
const { SSLManager } = require('./modules/SSLManager');
const { XDebugManager } = require('./modules/XDebugManager');
const { TemplateManager } = require('./modules/TemplateManager');
const { LogViewer } = require('./modules/LogViewer');
const { TerminalManager } = require('./modules/TerminalManager');
const { PerformanceEngine } = require('./modules/PerformanceEngine');
const { SecurityScanner } = require('./modules/SecurityScanner');
const { CollaborationManager } = require('./modules/CollaborationManager');
const { StabilityManager } = require('./modules/StabilityManager');
const { NetworkManager } = require('./modules/NetworkManager');
const { BackupManager } = require('./modules/BackupManager');
const { MonitoringService } = require('./modules/MonitoringService');
const { PluginSystem } = require('./modules/PluginSystem');
const { AIPowerOptimizer } = require('./modules/AIPowerOptimizer');
const { ProjectRunner } = require('./modules/ProjectRunner');
const { DownloadManager } = require('./modules/DownloadManager');
const { FrameworkDetector } = require('./modules/FrameworkDetector');

// Global managers instance
let managers = {};
let mainWindow = null;
let tray = null;

class EnvBoxPro {
  constructor() {
    this.userDataPath = app.getPath('userData');
    this.resourcesPath = __dirname;
    this.isQuitting = false;
    this.startupTime = Date.now();
  }

  async initialize() {
    console.log('Initializing EnvBox Pro Final Edition...');

    await this.ensureVCRedist();
    
    // Initialize all managers
    managers = {
      environment: new EnvironmentManager(this.userDataPath, this.resourcesPath),
      version: new VersionManager(this.resourcesPath),
      database: new DatabaseManager(this.userDataPath),
      redis: new RedisManager(this.userDataPath, this.resourcesPath),
      cache: new CacheManager(this.userDataPath),
      queue: new QueueManager(this.userDataPath, this.resourcesPath),
      scheduler: new SchedulerManager(this.userDataPath),
      worker: new WorkerManager(this.userDataPath),
      ssl: new SSLManager(this.userDataPath),
      xdebug: new XDebugManager(this.userDataPath),
      template: new TemplateManager(this.resourcesPath),
      logViewer: new LogViewer(this.userDataPath),
      terminal: new TerminalManager(this.userDataPath),
      performance: new PerformanceEngine(),
      security: new SecurityScanner(),
      collaboration: new CollaborationManager(),
      stability: new StabilityManager(),
      network: new NetworkManager(),
      backup: new BackupManager(this.userDataPath),
      monitoring: new MonitoringService(this.userDataPath),
      plugin: new PluginSystem(this.userDataPath),
      aiOptimizer: new AIPowerOptimizer(),
      projectRunner: new ProjectRunner(),
      framework: new FrameworkDetector(),
    };

    // Register all IPC handlers
    this.registerIPCHandlers();
    
    // Initialize plugin system
    await managers.plugin.initialize();

    // QUEUE
    await managers.queue.initialize();

    //Scheduler
    await managers.scheduler.initialize();

    await managers.database.initialize();

    // Start monitoring service
    await managers.monitoring.start();
    
    // Initialize auto-backup
    await managers.backup.initialize();
    
    await managers.worker.initialize();

    console.log('✅ All systems initialized');
    console.log(`⏱️ Startup time: ${Date.now() - this.startupTime}ms`);
  }

  // ===== AUTO INSTALL VC++ REDISTRIBUTABLE =====
  async ensureVCRedist() {
    try {
      // Cek dari registry
      const isInstalled = await this.checkVCRedistInstalled();
      
      if (isInstalled) {
        console.log('✅ VC++ Redistributable already installed');
        return;
      }
      
      console.log('⚠️ VC++ Redistributable not found');
      
      // Cari installer di resources
      const resourcePath = process.resourcesPath || path.join(__dirname, 'resources');
      let installerPath = path.join(resourcePath, 'vc_redist.x64.exe');
      
      if (!await fs.pathExists(installerPath)) {
        installerPath = path.join(__dirname, 'resources', 'vc_redist.x64.exe');
      }
      
      if (!await fs.pathExists(installerPath)) {
        console.log('📥 Installer not bundled, downloading...');
        installerPath = await this.downloadVCRedist();
      }
      
      if (installerPath && await fs.pathExists(installerPath)) {
        console.log('📥 Installing VC++ Redistributable (silent)...');
        await this.installVCRedist(installerPath);
      } else {
        console.log('⚠️ Could not find or download installer. Continuing anyway...');
      }
    } catch(e) {
      console.log('⚠️ VC++ Redist setup error:', e.message);
    }
  }

  async checkVCRedistInstalled() {
    return new Promise((resolve) => {
      exec('reg query "HKLM\\SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64" /v Version 2>nul', (error) => {
        if (!error) {
          resolve(true);
        } else {
          // Coba alternate key
          exec('reg query "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64" /v Version 2>nul', (error2) => {
            resolve(!error2);
          });
        }
      });
    });
  }

  async downloadVCRedist() {
    return new Promise((resolve) => {
      const destPath = path.join(app.getPath('temp'), 'vc_redist_x64_envbox.exe');
      const url = 'https://aka.ms/vs/17/release/vc_redist.x64.exe';
      
      console.log('📥 Downloading VC++ Redist from Microsoft...');
      
      const file = fs.createWriteStream(destPath);
      
      https.get(url, (response) => {
        // Handle redirect
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          https.get(response.headers.location, (res) => {
            res.pipe(file);
            file.on('finish', () => {
              file.close();
              console.log('✅ Downloaded');
              resolve(destPath);
            });
          }).on('error', (e) => {
            file.close();
            console.log('❌ Download failed:', e.message);
            resolve(null);
          });
          return;
        }
        
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log('✅ Downloaded');
          resolve(destPath);
        });
      }).on('error', (e) => {
        file.close();
        console.log('❌ Download failed:', e.message);
        resolve(null);
      });
    });
  }

  async installVCRedist(installerPath) {
    return new Promise((resolve) => {
      const child = spawn(installerPath, ['/quiet', '/norestart'], {
        stdio: 'ignore',
        detached: true
      });
      
      const timeout = setTimeout(() => {
        console.log('⚠️ Installer timeout (30s), continuing...');
        resolve();
      }, 30000);
      
      child.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0 || code === 3010) {
          console.log('✅ VC++ Redistributable installed successfully');
        } else {
          console.log(`⚠️ Installer exited with code ${code}`);
        }
        resolve();
      });
      
      child.on('error', (e) => {
        clearTimeout(timeout);
        console.log('⚠️ Installer error:', e.message);
        resolve();
      });
    });
  }

  registerIPCHandlers() {
    // ===== ENVIRONMENT MANAGEMENT =====
    ipcMain.handle('env:create', async (event, config) => {
      return await managers.environment.create(config);
    });

    ipcMain.handle('env:start', async (event, projectId) => {
      return await managers.environment.start(projectId);
    });

    ipcMain.handle('env:stop', async (event, projectId) => {
      return await managers.environment.stop(projectId);
    });

    ipcMain.handle('env:restart', async (event, projectId) => {
      return await managers.environment.restart(projectId);
    });

    ipcMain.handle('env:list', async () => {
      return await managers.environment.list();
    });

    ipcMain.handle('env:delete', async (event, projectId) => {
      return await managers.environment.delete(projectId);
    });

    ipcMain.handle('env:clone', async (event, { projectId, newName }) => {
      return await managers.environment.clone(projectId, newName);
    });

    ipcMain.handle('env:export', async (event, projectId) => {
      return await managers.environment.export(projectId);
    });

    ipcMain.handle('env:import', async (event, filePath) => {
      return await managers.environment.import(filePath);
    });

    // ===== VERSION MANAGEMENT =====
    ipcMain.handle('versions:get-online', async (event, stack) => {
      return await managers.version.getOnlineVersions(stack);
    });

    ipcMain.handle('versions:get-installed', async (event, stack) => {
      return await managers.version.getInstalledVersions(stack);
    });

    ipcMain.handle('versions:download', async (event, { stack, version }) => {
      const onProgress = (progress) => {
        event.sender.send('download:progress', { stack, version, ...progress });
      };
      return await managers.version.downloadVersion(stack, version, onProgress);
    });

    ipcMain.handle('versions:uninstall', async (event, { stack, version }) => {
      return await managers.version.uninstallVersion(stack, version);
    });

    ipcMain.handle('versions:check-updates', async () => {
      return await managers.version.checkAllUpdates();
    });

    // ===== DOWNLOAD ADMINER =====
    ipcMain.handle('adminer:download', async () => {
      const adminerPath = path.join(__dirname, 'projects', 'adminer', 'index.php');
      await fs.ensureDir(path.dirname(adminerPath));
      
      if (await fs.pathExists(adminerPath)) {
        return { exists: true, path: adminerPath };
      }
      
      // Download Adminer
      const https = require('https');
      const url = 'https://github.com/vrana/adminer/releases/download/v4.8.1/adminer-4.8.1.php';
      
      return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(adminerPath);
        https.get(url, (response) => {
          response.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve({ downloaded: true, path: adminerPath });
          });
        }).on('error', reject);
      });
    });

    // ===== DATABASE MANAGEMENT =====
    ipcMain.handle('db:start', async (event, config) => {
      const result = await managers.database.start(config);
      // Bersihin object - hapus process & data yg gak bisa di-clone
      const safe = {
        dbId: result.dbId,
        id: result.id,
        type: result.type,
        version: result.version,
        port: result.port,
        status: 'running',
        simulated: result.simulated || false,
        connectionString: result.connectionString || `${result.type}://localhost:${result.port}`,
        message: result.message || null
      };
      return safe;
    });

    ipcMain.handle('db:stop', async (event, dbId) => {
      try {
        await managers.database.stop(dbId);
        return { stopped: true, dbId };
      } catch(e) {
        console.log('db:stop error:', e.message);
        return { stopped: true, dbId }; // Anggap sukses
      }
    });

    ipcMain.handle('db:list', async () => {
      try {
        const list = await managers.database.list();
        // Bersihin - cuma kirim data yg aman
        return list.map(db => ({
          id: db.id,
          type: db.type,
          version: db.version,
          port: db.port,
          status: db.status || 'stopped',
          connectionString: `${db.type}://localhost:${db.port}`,
          createdAt: db.createdAt
        }));
      } catch(e) {
        console.log('db:list error:', e.message);
        return [];
      }
    });

    ipcMain.handle('db:create', async (event, { dbId, dbName }) => {
      return await managers.database.createDatabase(dbId, dbName);
    });

    ipcMain.handle('db:backup', async (event, { dbId, dbName }) => {
      return await managers.database.backup(dbId, dbName);
    });

    ipcMain.handle('db:restore', async (event, { dbId, backupPath }) => {
      return await managers.database.restore(dbId, backupPath);
    });

    ipcMain.handle('db:optimize', async (event, dbId) => {
      return await managers.database.optimize(dbId);
    });

    ipcMain.handle('db:query', async (event, { dbId, query }) => {
      return await managers.database.executeQuery(dbId, query);
    });

    // ===== REDIS MANAGEMENT =====
    ipcMain.handle('redis:start', async (event, config) => {
      return await managers.redis.start(config);
    });

    ipcMain.handle('redis:stop', async (event, redisId) => {
      return await managers.redis.stop(redisId);
    });

    ipcMain.handle('redis:list', async () => {
      return await managers.redis.list();
    });

    ipcMain.handle('redis:flush', async (event, redisId) => {
      return await managers.redis.flush(redisId);
    });

    ipcMain.handle('redis:info', async (event, redisId) => {
      return await managers.redis.getInfo(redisId);
    });

    ipcMain.handle('redis:monitor', async (event, redisId) => {
      return await managers.redis.monitor(redisId, (data) => {
        event.sender.send('redis:monitor-data', data);
      });
    });

    // ===== CACHE MANAGEMENT =====
    ipcMain.handle('cache:configure', async (event, { projectId, config }) => {
      return await managers.cache.configure(projectId, config);
    });

    ipcMain.handle('cache:clear', async (event, projectId) => {
      return await managers.cache.clear(projectId);
    });

    ipcMain.handle('cache:warmup', async (event, projectId) => {
      return await managers.cache.warmup(projectId);
    });

    ipcMain.handle('cache:stats', async (event, projectId) => {
      return await managers.cache.getStats(projectId);
    });

    // OPcache specific
    ipcMain.handle('opcache:configure', async (event, config) => {
      return await managers.cache.configureOPcache(config);
    });

    ipcMain.handle('opcache:reset', async (event, projectId) => {
      return await managers.cache.resetOPcache(projectId);
    });

    ipcMain.handle('opcache:status', async (event, projectId) => {
      return await managers.cache.getOPcacheStatus(projectId);
    });

    // ===== QUEUE MANAGEMENT =====
    ipcMain.handle('queue:start', async (event, config) => {
        return await managers.queue.startQueue(config);
    });

    ipcMain.handle('queue:stop', async (event, queueId) => {
        return await managers.queue.stopQueue(queueId);
    });

    ipcMain.handle('queue:add-job', async (event, { queueId, job }) => {
        return await managers.queue.addJob(queueId, job);
    });

    ipcMain.handle('queue:process', async (event, queueId) => {
        return await managers.queue.process(queueId);
    });

    ipcMain.handle('queue:stats', async (event, queueId) => {
        return await managers.queue.getStats(queueId);
    });

    ipcMain.handle('queue:purge', async (event, queueId) => {
        return await managers.queue.purge(queueId);
    });

    ipcMain.handle('queue:list', async () => {
        return await managers.queue.list();
    });

    // ===== SCHEDULER =====
    ipcMain.handle('scheduler:create', async (event, config) => {
        return await managers.scheduler.create(config);
    });

    ipcMain.handle('scheduler:start', async (event, scheduleId) => {
        return await managers.scheduler.start(scheduleId);
    });

    ipcMain.handle('scheduler:stop', async (event, scheduleId) => {
        return await managers.scheduler.stop(scheduleId);
    });

    ipcMain.handle('scheduler:list', async () => {
        return await managers.scheduler.list();
    });

    ipcMain.handle('scheduler:delete', async (event, scheduleId) => {
        return await managers.scheduler.delete(scheduleId);
    });

    ipcMain.handle('scheduler:logs', async (event, scheduleId, limit) => {
        return await managers.scheduler.getLogs(scheduleId === 'all' ? null : scheduleId, limit || 50);
    });

    // Cron specific
    ipcMain.handle('cron:add', async (event, { projectId, expression, command }) => {
      return await managers.scheduler.addCronJob(projectId, expression, command);
    });

    ipcMain.handle('cron:remove', async (event, jobId) => {
      return await managers.scheduler.removeCronJob(jobId);
    });

    ipcMain.handle('cron:validate', async (event, expression) => {
      return await managers.scheduler.validateCronExpression(expression);
    });

    // ===== WORKER MANAGEMENT =====
    ipcMain.handle('worker:create', async (event, config) => {
        return await managers.worker.create(config);
    });
    ipcMain.handle('worker:start', async (event, workerId) => {
        return await managers.worker.start(workerId);
    });
    ipcMain.handle('worker:stop', async (event, workerId) => {
        return await managers.worker.stop(workerId);
    });
    ipcMain.handle('worker:scale', async (event, { workerId, instances }) => {
        return await managers.worker.scale(workerId, instances);
    });
    ipcMain.handle('worker:list', async () => {
        return await managers.worker.list();
    });
    ipcMain.handle('worker:delete', async (event, workerId) => {
        return await managers.worker.delete(workerId);
    });
    ipcMain.handle('worker:logs', async (event, workerId) => {
        return await managers.worker.getLogs(workerId);
    });

    // ===== NETWORK MANAGEMENT =====
    ipcMain.handle('network:proxy', async (event, config) => {
        return await managers.network.createProxy(config);
    });

    ipcMain.handle('network:list-routes', async () => {
        return await managers.network.listRoutes();
    });

    ipcMain.handle('network:port-check', async (event, port) => {
        return await managers.network.checkPort(port);
    });

    ipcMain.handle('network:remove-route', async (event, domain) => {
        return await managers.network.removeRouteByDomain(domain);
    });

    ipcMain.handle('network:info', async () => {
        return await managers.network.getNetworkInfo();
    });

    // ===== SECURITY =====
    ipcMain.handle('security:scan', async (event, projectId) => {
        return await managers.security.scanProject(projectId);
    });

    ipcMain.handle('security:fix', async (event, projectId) => {
        return await managers.security.autoFix(projectId);
    });

    ipcMain.handle('security:audit', async () => {
        return await managers.security.fullAudit();
    });

    // ===== PERFORMANCE =====
    ipcMain.handle('performance:optimize', async (event, config) => {
      return await managers.performance.optimize(config);
    });

    ipcMain.handle('performance:profile', async (event, projectId) => {
      return await managers.performance.profile(projectId);
    });

    ipcMain.handle('performance:benchmark', async () => {
      return await managers.performance.benchmark();
    });

    ipcMain.handle('performance:suggestions', async (event, projectId) => {
      return await managers.aiOptimizer.getSuggestions(projectId);
    });

    // ===== MONITORING =====
    ipcMain.handle('monitoring:metrics', async () => {
        return await managers.monitoring.getMetrics();
    });

    ipcMain.handle('monitoring:alerts', async (event, limit) => {
        return await managers.monitoring.getAlerts(limit || 50);
    });

    ipcMain.handle('monitoring:health', async () => {
        return await managers.monitoring.getHealthStatus();
    });

    ipcMain.handle('monitoring:history', async (event, hours) => {
        return await managers.monitoring.loadMetricsHistory(hours || 24);
    });

    ipcMain.handle('monitoring:acknowledge-alert', async (event, alertId) => {
        return await managers.monitoring.acknowledgeAlert(alertId);
    });

    ipcMain.handle('monitoring:clear-alerts', async () => {
        return await managers.monitoring.clearAlerts();
    });

    ipcMain.handle('monitoring:update-thresholds', async (event, thresholds) => {
        return await managers.monitoring.updateThresholds(thresholds);
    });

    // Real-time push (pakai event emitter dari MonitoringService)
    managers.monitoring.on('metrics:update', (metrics) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('metrics:update', metrics);
        }
    });

    managers.monitoring.on('alert', (alert) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('alert', alert);
        }
    });

    // ===== BACKUP =====
    ipcMain.handle('backup:create', async (event, config) => {
      return await managers.backup.create(config);
    });

    ipcMain.handle('backup:restore', async (event, backupId) => {
      return await managers.backup.restore(backupId);
    });

    ipcMain.handle('backup:list', async () => {
      return await managers.backup.list();
    });

    ipcMain.handle('backup:schedule', async (event, config) => {
      return await managers.backup.schedule(config);
    });

    // ===== LOG VIEWER =====
    ipcMain.handle('logs:startWatching', async (event, projectId, logType) => {
        console.log('📋 Starting log watcher:', { projectId, logType });
        
        const senderWindow = BrowserWindow.fromWebContents(event.sender);
        const channel = `log-update-${projectId}-${logType}`;
        
        try {
            const callback = (data) => {
                // Kirim ke renderer via webContents
                if (senderWindow && !senderWindow.isDestroyed()) {
                    senderWindow.webContents.send(channel, data);
                }
            };
            
            const result = await managers.logViewer.startWatching(projectId, logType, callback);
            return result;
        } catch (error) {
            console.error('Error starting log watcher:', error);
            throw error;
        }
    });

    ipcMain.handle('logs:stopWatching', async (event, watcherId) => {
        console.log('📋 Stopping log watcher:', watcherId);
        return await managers.logViewer.stopWatching(watcherId);
    });

    ipcMain.handle('logs:getHistory', async (event, projectId, logType, lines) => {
        console.log('Getting log history:', { projectId, logType, lines });
        return await managers.logViewer.getLogHistory(projectId, logType, lines || 200);
    });

    ipcMain.handle('logs:clear', async (event, projectId, logType) => {
        console.log('Clearing logs:', { projectId, logType });
        return await managers.logViewer.clearLogs(projectId, logType);
    });

    ipcMain.handle('logs:getStats', async (event, projectId, logType) => {
        return await managers.logViewer.getLogStats(projectId, logType);
    });

    ipcMain.handle('logs:search', async (event, projectId, logType, query, options) => {
        return await managers.logViewer.searchLogs(projectId, logType, query, options);
    });

    ipcMain.handle('logs:export', async (event, projectId, logType, outputPath) => {
        return await managers.logViewer.exportLogs(projectId, logType, outputPath);
    });

    // ===== COLLABORATION =====
    ipcMain.handle('collab:share', async (event, config) => {
      return await managers.collaboration.share(config);
    });

    ipcMain.handle('collab:import', async (event, snapshotPath) => {
      return await managers.collaboration.import(snapshotPath);
    });

    ipcMain.handle('collab:stopShare', async (event, shareId) => {
        return await managers.collaboration.stopShare(shareId);
    });

    // ===== UTILITIES =====
    ipcMain.handle('app:get-path', () => {
      return app.getPath('userData');
    });

    ipcMain.handle('dialog:openFile', async (event, options) => {
      return await dialog.showOpenDialog(mainWindow, options);
    });

    ipcMain.handle('dialog:saveFile', async (event, options) => {
      return await dialog.showSaveDialog(mainWindow, options);
    });

    ipcMain.handle('shell:openExternal', async (event, url) => {
      return await shell.openExternal(url);
    });

    // ===== TERMINAL GIT CLONE =====
    ipcMain.handle('terminal:git-clone', async (event, { projectId, repoUrl, branch, targetFolder }) => {
      return await managers.terminal.createGitCloneTerminal(
          projectId, repoUrl, branch, targetFolder,
          (data) => { event.sender.send('terminal:data', data); }
      );
    });
    
    // HEIDI SQL
    ipcMain.handle('db:openHeidiSQL', async (event, port) => {
        const { exec } = require('child_process');
        const possiblePaths = [
            'C:\\Program Files\\HeidiSQL\\heidisql.exe',
            'C:\\Program Files (x86)\\HeidiSQL\\heidisql.exe',
        ];
        
        for (const p of possiblePaths) {
            if (await fs.pathExists(p)) {
                exec(`start "" "${p}" -h=127.0.0.1 -P=${port} -u=root`);
                return { success: true };
            }
        }
        throw new Error('HeidiSQL not found');
    });

    ipcMain.handle('versions:readConfig', async (event, stack, version, file) => {
        const configPath = path.join(__dirname, 'environments', stack, version, file);
        if (await fs.pathExists(configPath)) {
            return await fs.readFile(configPath, 'utf8');
        }
        return `; ${file} not found for ${stack} ${version}`;
    });

    ipcMain.handle('versions:saveConfig', async (event, stack, version, file, content) => {
        const configPath = path.join(__dirname, 'environments', stack, version, file);
        await fs.writeFile(configPath, content);
        return { saved: true };
    });

    ipcMain.handle('pma:start', async (event, port) => {
        const child = await managers.projectRunner.startPhpMyAdminApache(port || 8084);
        if (!managers._pmaProcesses) managers._pmaProcesses = [];
        managers._pmaProcesses.push(child);
        return { success: true, port: port || 8084, pid: child.pid };
    });

    ipcMain.handle('pma:stop', async () => {
        if (managers._pmaProcesses) {
            for (const p of managers._pmaProcesses) {
                try {
                    if (process.platform === 'win32') {
                        await managers.database.execCommand(`taskkill /F /T /PID ${p.pid}`);
                    } else {
                        p.kill('SIGTERM');
                    }
                } catch(e) {}
            }
            managers._pmaProcesses = [];
        }
        return { success: true };
    });

    // ===== TERMINAL - OPEN EXTERNAL (MULTI-OS) =====
    ipcMain.handle('terminal:open-external', async (event, { type, cwd }) => {
        const { exec } = require('child_process');
        const os = require('os');
        const platform = os.platform();
        
        return new Promise((resolve) => {
            let command = '';
            
            if (platform === 'win32') {
                // Windows
                switch(type) {
                    case 'cmd': command = `start "EnvBox" cmd.exe /k "cd /d "${cwd}""`; break;
                    case 'powershell': command = `start "EnvBox" powershell.exe -NoExit -Command "Set-Location '${cwd}'"`; break;
                    case 'wt': command = `start wt.exe -d "${cwd}"`; break;
                    case 'bash': command = `start "EnvBox" "C:\\Program Files\\Git\\bin\\bash.exe" --cd="${cwd}"`; break;
                    default: command = `start cmd.exe /k "cd /d "${cwd}""`;
                }
            } else if (platform === 'darwin') {
                // macOS
                const escapedCwd = cwd.replace(/"/g, '\\"');
                switch(type) {
                    case 'terminal': command = `open -a Terminal "${cwd}"`; break;
                    case 'iterm': command = `open -a iTerm "${cwd}"`; break;
                    default: command = `open -a Terminal "${cwd}"`;
                }
            } else {
                // Linux
                const escapedCwd = cwd.replace(/"/g, '\\"');
                switch(type) {
                    case 'gnome': command = `gnome-terminal --working-directory="${escapedCwd}"`; break;
                    case 'konsole': command = `konsole --workdir "${escapedCwd}"`; break;
                    case 'xfce': command = `xfce4-terminal --working-directory="${escapedCwd}"`; break;
                    default: command = `x-terminal-emulator --working-directory="${escapedCwd}" 2>/dev/null || gnome-terminal --working-directory="${escapedCwd}" 2>/dev/null || xterm -e "cd '${escapedCwd}' && bash"`;
                }
            }
            
            exec(command, (error) => {
                if (error) {
                    // Fallback: buka folder
                    if (platform === 'win32') exec(`explorer "${cwd}"`);
                    else if (platform === 'darwin') exec(`open "${cwd}"`);
                    else exec(`xdg-open "${cwd}"`);
                    resolve({ success: true, fallback: 'folder' });
                } else {
                    resolve({ success: true, type, platform });
                }
            });
        });
    });

    // ===== PROJECT RUNNER =====
    ipcMain.handle('project:start', async (event, project) => {
    return await managers.projectRunner.start(project);
    });

    ipcMain.handle('project:stop', async (event, projectId) => {
    return await managers.projectRunner.stop(projectId);
    });

    ipcMain.handle('project:status', async (event, projectId) => {
    return await managers.projectRunner.getStatus(projectId);
    });

    ipcMain.handle('project:list-running', async () => {
    return await managers.projectRunner.getAllRunning();
    });

    // ===== FRAMEWORK DETECTION =====
    ipcMain.handle('framework:detect', async (event, { projectPath, techStack }) => {
      return await managers.framework.detectFramework(projectPath, techStack || 'php');
    });

    ipcMain.handle('app:get-info', () => {
      return {
        version: app.getVersion(),
        electron: process.versions.electron,
        node: process.versions.node,
        platform: process.platform,
        arch: process.arch
      };
    });
  }

  createWindow() {
    mainWindow = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 1200,
      minHeight: 700,
      frame: false,
      titleBarStyle: 'hidden',
      icon: path.join(__dirname, 'resources/icon.jpeg'),
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      },
      backgroundColor: '#0a0e27',
      show: false
    });

    mainWindow.loadFile('src/index.html');
    
    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
      if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
      }
    });

    mainWindow.on('close', (event) => {
      if (!this.isQuitting) {
        event.preventDefault();
        mainWindow.hide();
        return false;
      }
    });

    // Context menu
    require('electron-context-menu')({
      showSaveImageAs: true,
      showSearchWithGoogle: false,
      prepend: (defaultActions, params, browserWindow) => [
        {
          label: 'EnvBox Pro Tools',
          menu: [
            {
              label: 'Open Terminal Here',
              click: () => {
                managers.terminal.create('global', params.directoryPath || process.cwd());
              }
            },
            {
              label: 'Quick PHP Server',
              click: () => {
                managers.environment.quickStart('php', params.directoryPath);
              }
            }
          ]
        }
      ]
    });
  }

  createTray() {
      const iconPath = path.join(__dirname, 'resources/icon.jpeg');
      let icon;
      if (fs.existsSync(iconPath)) {
          icon = nativeImage.createFromPath(iconPath);
      } else {
          icon = nativeImage.createEmpty();
      }
      
      tray = new Tray(icon.resize({ width: 16, height: 16 }));
      
      const contextMenu = Menu.buildFromTemplate([
          { 
              label: 'Show EnvBox Pro', 
              click: () => mainWindow.show() 
          },
          { type: 'separator' },
          { 
              label: 'Quick Actions',
              submenu: [
                  {
                      label: 'Start All Projects',
                      click: async () => {
                          if (managers.projectRunner) {
                              try {
                                  const store = path.join(app.getPath('userData'), 'environments.json');
                                  if (await fs.pathExists(store)) {
                                      const data = await fs.readJson(store);
                                      const projects = data.environments || [];
                                      for (const p of projects) {
                                          try {
                                              await managers.projectRunner.start(p);
                                              console.log(`✅ Started: ${p.name}`);
                                          } catch(e) {
                                              console.log(`❌ ${p.name}: ${e.message}`);
                                          }
                                      }
                                  }
                              } catch(e) {
                                  console.log('Start all error:', e.message);
                              }
                          }
                      }
                  },
                  {
                      label: 'Stop All Projects',
                      click: async () => {
                          if (managers.projectRunner) {
                              const running = managers.projectRunner.getAllRunning();
                              for (const p of running) {
                                  try {
                                      await managers.projectRunner.stop(p.id);
                                      console.log(`✅ Stopped: ${p.name}`);
                                  } catch(e) {
                                      console.log(`❌ ${p.name}: ${e.message}`);
                                  }
                              }
                          }
                      }
                  },
                  { type: 'separator' },
                  {
                      label: 'Redis Server',
                      type: 'checkbox',
                      checked: managers.redis?.isRunning?.() || false,
                      click: (item) => {
                          if (item.checked) {
                              managers.redis?.start?.({ port: 6379 });
                          } else {
                              managers.redis?.stop?.('default');
                          }
                      }
                  }
              ]
          },
          { type: 'separator' },
          {
              label: 'Performance Mode',
              submenu: [
                  { label: 'Power Saver', type: 'radio', click: () => managers.aiOptimizer?.setMode?.('powersaver') },
                  { label: 'Balanced', type: 'radio', checked: true, click: () => managers.aiOptimizer?.setMode?.('balanced') },
                  { label: 'Turbo', type: 'radio', click: () => managers.aiOptimizer?.setMode?.('turbo') }
              ]
          },
          { type: 'separator' },
          { 
              label: 'Quit', 
              click: () => {
                  this.isQuitting = true;
                  app.quit();
              }
          }
      ]);

      tray.setToolTip('EnvBox Pro - Running');
      tray.setContextMenu(contextMenu);

      tray.on('double-click', () => {
          mainWindow.show();
          mainWindow.focus();
      });
  }
}

// App lifecycle
const envBox = new EnvBoxPro();

// ===== WINDOW CONTROLS IPC =====
ipcMain.on('window:minimize', () => {
  console.log('🔽 Minimize');
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window:maximize', () => {
  console.log('🔄 Maximize');
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window:close', () => {
  console.log('✕ Close');
  if (mainWindow) mainWindow.close();
});

app.whenReady().then(async () => {
  await envBox.initialize();
  envBox.createWindow();
  envBox.createTray();

  // ✅ Reset status aja, gak usah auto-start dari sini
  setTimeout(async () => {
    try {
      const store = path.join(app.getPath('userData'), 'environments.json');
      if (await fs.pathExists(store)) {
        const data = await fs.readJson(store);
        const projects = data.environments || [];
        
        for (const p of projects) {
          p.status = 'stopped';
          p.pid = null;
          p.services = [];
        }
        
        await fs.writeJson(store, data);
        console.log('✅ All project status reset to stopped');
      }
    } catch(e) {
      console.log('Startup error:', e.message);
    }
  }, 2000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      envBox.createWindow();
    } else {
      mainWindow.show();
    }
  });
});

app.on('before-quit', () => {
  envBox.isQuitting = true;
  console.log('🛑 Shutting down all services...');
  
  // Stop all running projects (pakai Promise biar synchronous)
  if (managers.projectRunner) {
    const running = managers.projectRunner.getAllRunning();
    console.log(`⏹ Stopping ${running.length} running projects...`);
    for (const project of running) {
      try {
        managers.projectRunner.stop(project.id);
        console.log(`  ✅ Stopped: ${project.name}`);
      } catch(e) {
        console.log(`  ❌ Failed to stop: ${project.name}`);
      }
    }
  }

  // ✅ RESET SEMUA STATUS PROJECT KE STOPPED (pakai userData path)
  try {
    const store = path.join(app.getPath('userData'), 'environments.json');
    if (fs.existsSync(store)) {
      const data = fs.readJsonSync(store);
      const projects = data.environments || [];
      let changed = false;
      
      for (const p of projects) {
        if (p.status === 'running') {
          p.status = 'stopped';
          p.pid = null;
          p.services = [];
          changed = true;
        }
      }
      
      if (changed) {
        fs.writeJsonSync(store, data);
        console.log('✅ All project status reset to stopped');
      }
    } else {
      console.log('⚠️ environments.json not found at:', store);
    }
  } catch(e) {
    console.log('Reset status error:', e.message);
  }

  // Graceful shutdown semua managers
  Object.values(managers).forEach(manager => {
    if (manager && manager.shutdown) {
      try {
        manager.shutdown();
      } catch(e) {
        console.log('Shutdown error:', e.message);
      }
    }
  });
  
  console.log('✅ All services stopped');
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Don't quit, keep running in tray
  }
});

// Power monitoring
powerMonitor.on('suspend', () => {
  console.log('System sleeping - pausing non-critical services');
  managers.monitoring.pause();
});

powerMonitor.on('resume', () => {
  console.log('System resumed - restoring services');
  if (managers.monitoring && managers.monitoring.resume) {
    managers.monitoring.resume();
  }
  // Stability manager gak punya healthCheckAll, jadi skip atau ganti:
  if (managers.stability && managers.stability.getHealthStatus) {
    managers.stability.getHealthStatus().then(status => {
      console.log('Health check:', status);
    }).catch(() => {});
  }
});