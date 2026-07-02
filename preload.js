// preload.js
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to renderer process
contextBridge.exposeInMainWorld('envbox', {
  // ===== ENVIRONMENT MANAGEMENT =====
  env: {
    create: (config) => ipcRenderer.invoke('env:create', config),
    start: (projectId) => ipcRenderer.invoke('env:start', projectId),
    stop: (projectId) => ipcRenderer.invoke('env:stop', projectId),
    restart: (projectId) => ipcRenderer.invoke('env:restart', projectId),
    list: () => ipcRenderer.invoke('env:list'),
    delete: (projectId) => ipcRenderer.invoke('env:delete', projectId),
    clone: (projectId, newName) => ipcRenderer.invoke('env:clone', { projectId, newName }),
    export: (projectId) => ipcRenderer.invoke('env:export', projectId),
    import: (filePath) => ipcRenderer.invoke('env:import', filePath),
    getVariables: (projectId) => ipcRenderer.invoke('env:get-variables', projectId),
    setVariable: (projectId, key, value) => ipcRenderer.invoke('env:set-variable', { projectId, key, value }),
    deleteVariable: (projectId, key) => ipcRenderer.invoke('env:delete-variable', { projectId, key }),
  },

  // ===== VERSION MANAGEMENT =====
  versions: {
    getOnline: (stack) => ipcRenderer.invoke('versions:get-online', stack),
    getInstalled: (stack) => ipcRenderer.invoke('versions:get-installed', stack),
    download: (stack, version) => ipcRenderer.invoke('versions:download', { stack, version }),
    uninstall: (stack, version) => ipcRenderer.invoke('versions:uninstall', { stack, version }),
    checkUpdates: () => ipcRenderer.invoke('versions:check-updates'),
    readConfig: (stack, version, file) => ipcRenderer.invoke('versions:readConfig', stack, version, file),
    saveConfig: (stack, version, file, content) => ipcRenderer.invoke('versions:saveConfig', stack, version, file, content),
    onProgress: (callback) => {
      ipcRenderer.on('download:progress', (event, data) => callback(data));
      return () => ipcRenderer.removeAllListeners('download:progress');
    }
  },

  pma: {
      start: (port) => ipcRenderer.invoke('pma:start', port),
      stop: () => ipcRenderer.invoke('pma:stop'),
  },

  // ===== DATABASE MANAGEMENT =====
  db: {
    start: (config) => ipcRenderer.invoke('db:start', config),
    stop: (dbId) => ipcRenderer.invoke('db:stop', dbId),
    list: () => ipcRenderer.invoke('db:list'),
    createDatabase: (dbId, dbName) => ipcRenderer.invoke('db:create', { dbId, dbName }),
    backup: (dbId, dbName) => ipcRenderer.invoke('db:backup', { dbId, dbName }),
    restore: (dbId, backupPath) => ipcRenderer.invoke('db:restore', { dbId, backupPath }),
    optimize: (dbId) => ipcRenderer.invoke('db:optimize', dbId),
    query: (dbId, query) => ipcRenderer.invoke('db:query', { dbId, query }),
    openHeidiSQL: (port) => ipcRenderer.invoke('db:openHeidiSQL', port),
  },

  // ===== REDIS MANAGEMENT =====
  redis: {
    start: (config) => ipcRenderer.invoke('redis:start', config),
    stop: (redisId) => ipcRenderer.invoke('redis:stop', redisId),
    list: () => ipcRenderer.invoke('redis:list'),
    flush: (redisId) => ipcRenderer.invoke('redis:flush', redisId),
    info: (redisId) => ipcRenderer.invoke('redis:info', redisId),
    monitor: (redisId, callback) => {
      ipcRenderer.invoke('redis:monitor', redisId);
      ipcRenderer.on('redis:monitor-data', (event, data) => callback(data));
      return () => ipcRenderer.removeAllListeners('redis:monitor-data');
    }
  },

  // ===== CACHE MANAGEMENT =====
  cache: {
    configure: (projectId, config) => ipcRenderer.invoke('cache:configure', { projectId, config }),
    clear: (projectId) => ipcRenderer.invoke('cache:clear', projectId),
    warmup: (projectId) => ipcRenderer.invoke('cache:warmup', projectId),
    stats: (projectId) => ipcRenderer.invoke('cache:stats', projectId),
  },

  // ===== OPcache MANAGEMENT =====
  opcache: {
    configure: (config) => ipcRenderer.invoke('opcache:configure', config),
    reset: (projectId) => ipcRenderer.invoke('opcache:reset', projectId),
    status: (projectId) => ipcRenderer.invoke('opcache:status', projectId),
  },

  // ===== QUEUE MANAGEMENT =====
  queue: {
    start: (config) => ipcRenderer.invoke('queue:start', config),
    stop: (queueId) => ipcRenderer.invoke('queue:stop', queueId),
    addJob: (queueId, job) => ipcRenderer.invoke('queue:add-job', { queueId, job }),
    process: (queueId) => ipcRenderer.invoke('queue:process', queueId),
    stats: (queueId) => ipcRenderer.invoke('queue:stats', queueId),
    purge: (queueId) => ipcRenderer.invoke('queue:purge', queueId),
  },

  // ===== SCHEDULER MANAGEMENT =====
  scheduler: {
    create: (config) => ipcRenderer.invoke('scheduler:create', config),
    start: (scheduleId) => ipcRenderer.invoke('scheduler:start', scheduleId),
    stop: (scheduleId) => ipcRenderer.invoke('scheduler:stop', scheduleId),
    list: () => ipcRenderer.invoke('scheduler:list'),
    delete: (scheduleId) => ipcRenderer.invoke('scheduler:delete', scheduleId),
    logs: (scheduleId, limit) => ipcRenderer.invoke('scheduler:logs', scheduleId, limit),
  },

  // ===== CRON MANAGEMENT =====
  cron: {
    add: (projectId, expression, command) => ipcRenderer.invoke('cron:add', { projectId, expression, command }),
    remove: (jobId) => ipcRenderer.invoke('cron:remove', jobId),
    validate: (expression) => ipcRenderer.invoke('cron:validate', expression),
  },

  // ===== WORKER MANAGEMENT =====
  worker: {
    create: (config) => ipcRenderer.invoke('worker:create', config),
    start: (workerId) => ipcRenderer.invoke('worker:start', workerId),
    stop: (workerId) => ipcRenderer.invoke('worker:stop', workerId),
    scale: (workerId, instances) => ipcRenderer.invoke('worker:scale', { workerId, instances }),
    list: () => ipcRenderer.invoke('worker:list'),
    logs: (workerId) => ipcRenderer.invoke('worker:logs', workerId),
  },

  // ===== SSL MANAGEMENT =====
  ssl: {
    generate: (domain, projectId) => ipcRenderer.invoke('ssl:generate', { domain, projectId }),
    install: (projectId, certPath, keyPath) => ipcRenderer.invoke('ssl:install', { projectId, certPath, keyPath }),
    list: (projectId) => ipcRenderer.invoke('ssl:list', projectId),
  },

  // ===== XDEBUG MANAGEMENT =====
  xdebug: {
    configure: (projectId, config) => ipcRenderer.invoke('xdebug:configure', { projectId, config }),
    status: (projectId) => ipcRenderer.invoke('xdebug:status', projectId),
    toggle: (projectId, enabled) => ipcRenderer.invoke('xdebug:toggle', { projectId, enabled }),
  },

  logs: {
      // ✅ Start watching dengan callback via event listener
      startWatching: (projectId, logType, callback) => {
          // Generate unique channel untuk project ini
          const channel = `log-update-${projectId}-${logType}`;
          
          // Register listener untuk callback
          const handler = (event, data) => {
              callback(data);
          };
          ipcRenderer.on(channel, handler);
          
          // Start watching dan return object dengan method stop
          return ipcRenderer.invoke('logs:startWatching', projectId, logType).then(result => {
              return {
                  ...result,
                  // Cleanup function
                  stop: () => {
                      ipcRenderer.removeListener(channel, handler);
                      return ipcRenderer.invoke('logs:stopWatching', result.watcherId);
                  }
              };
          });
      },
      
      stopWatching: (watcherId) => {
          return ipcRenderer.invoke('logs:stopWatching', watcherId);
      },
      
      getHistory: (projectId, logType, lines) => {
          return ipcRenderer.invoke('logs:getHistory', projectId, logType, lines);
      },
      
      clear: (projectId, logType) => {
          return ipcRenderer.invoke('logs:clear', projectId, logType);
      },
      
      getStats: (projectId, logType) => {
          return ipcRenderer.invoke('logs:getStats', projectId, logType);
      },
      
      search: (projectId, logType, query, options) => {
          return ipcRenderer.invoke('logs:search', projectId, logType, query, options);
      },
      
      exportLogs: (projectId, logType, outputPath) => {
          return ipcRenderer.invoke('logs:export', projectId, logType, outputPath);
      }
  },

  // ===== TEMPLATE MANAGEMENT =====
  template: {
    list: () => ipcRenderer.invoke('template:list'),
    create: (templateName, projectConfig) => ipcRenderer.invoke('template:create', { templateName, projectConfig }),
  },

  // ===== TERMINAL MANAGEMENT =====
  terminal: {
      create: (projectId, cwd, callback) => {
        ipcRenderer.invoke('terminal:create', { projectId, cwd });
        ipcRenderer.on('terminal:data', (event, data) => callback(data));
        return {
          write: (terminalId, data) => ipcRenderer.invoke('terminal:write', { terminalId, data }),
          resize: (terminalId, cols, rows) => ipcRenderer.invoke('terminal:resize', { terminalId, cols, rows }),
          destroy: (terminalId) => ipcRenderer.invoke('terminal:destroy', terminalId),
          cleanup: () => ipcRenderer.removeAllListeners('terminal:data')
        };
      },
      openExternal: (type, cwd) => ipcRenderer.invoke('terminal:open-external', { type, cwd }),
      gitClone: (projectId, repoUrl, branch, targetFolder) => 
        ipcRenderer.invoke('terminal:git-clone', { projectId, repoUrl, branch, targetFolder }),
      onCloneProgress: (callback) => {
        ipcRenderer.on('terminal:data', (event, data) => callback(data));
        return () => ipcRenderer.removeAllListeners('terminal:data');
      }
  },

  adminer: {
      download: () => ipcRenderer.invoke('adminer:download'),
  },

  // ===== NETWORK MANAGEMENT =====
  network: {
      proxy: (config) => ipcRenderer.invoke('network:proxy', config),
      listRoutes: () => ipcRenderer.invoke('network:list-routes'),
      portCheck: (port) => ipcRenderer.invoke('network:port-check', port),
      removeRoute: (domain) => ipcRenderer.invoke('network:remove-route', domain),
      getInfo: () => ipcRenderer.invoke('network:info'),
  },

  // ===== SECURITY =====
  security: {
    scan: (projectId) => ipcRenderer.invoke('security:scan', projectId),
    fix: (projectId) => ipcRenderer.invoke('security:fix', projectId),
    audit: () => ipcRenderer.invoke('security:audit'),
  },

  // ===== PERFORMANCE =====
  performance: {
    optimize: (config) => ipcRenderer.invoke('performance:optimize', config),
    profile: (projectId) => ipcRenderer.invoke('performance:profile', projectId),
    benchmark: () => ipcRenderer.invoke('performance:benchmark'),
    suggestions: (projectId) => ipcRenderer.invoke('performance:suggestions', projectId),
  },

  monitoring: {
      metrics: () => ipcRenderer.invoke('monitoring:metrics'),
      alerts: (limit) => ipcRenderer.invoke('monitoring:alerts', limit),
      health: () => ipcRenderer.invoke('monitoring:health'),
      history: (hours) => ipcRenderer.invoke('monitoring:history', hours),
      acknowledgeAlert: (alertId) => ipcRenderer.invoke('monitoring:acknowledge-alert', alertId),
      clearAlerts: () => ipcRenderer.invoke('monitoring:clear-alerts'),
      updateThresholds: (thresholds) => ipcRenderer.invoke('monitoring:update-thresholds', thresholds),
      onUpdate: (callback) => {
          ipcRenderer.on('metrics:update', (event, data) => callback(data));
          return () => ipcRenderer.removeAllListeners('metrics:update');
      },
      onAlert: (callback) => {
          ipcRenderer.on('alert', (event, data) => callback(data));
          return () => ipcRenderer.removeAllListeners('alert');
      }
  },

  // ===== BACKUP =====
  backup: {
    create: (config) => ipcRenderer.invoke('backup:create', config),
    restore: (backupId) => ipcRenderer.invoke('backup:restore', backupId),
    list: () => ipcRenderer.invoke('backup:list'),
    schedule: (config) => ipcRenderer.invoke('backup:schedule', config),
  },

  // ===== COLLABORATION =====
  collab: {
    share: (config) => ipcRenderer.invoke('collab:share', config),
    import: (snapshotPath) => ipcRenderer.invoke('collab:import', snapshotPath),
    stopShare: (shareId) => ipcRenderer.invoke('collab:stopShare', shareId),
  },

  // ===== FRAMEWORK DETECTION =====
  framework: {
    detect: (projectPath, techStack) => ipcRenderer.invoke('framework:detect', { projectPath, techStack }),
  },

  // ===== DIALOG =====
  dialog: {
    openFile: (options) => ipcRenderer.invoke('dialog:openFile', options),
    saveFile: (options) => ipcRenderer.invoke('dialog:saveFile', options),
    openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  },

  // ===== PROJECT RUNNER =====
    project: {
    start: (project) => ipcRenderer.invoke('project:start', project),
    stop: (projectId) => ipcRenderer.invoke('project:stop', projectId),
    status: (projectId) => ipcRenderer.invoke('project:status', projectId),
    listRunning: () => ipcRenderer.invoke('project:list-running'),
    },

  // ===== APP =====
  app: {
    getPath: () => ipcRenderer.invoke('app:get-path'),
    getInfo: () => ipcRenderer.invoke('app:get-info'),
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  },

  // ===== WINDOW CONTROLS =====
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
  },

  // ===== EVENT LISTENERS =====
  on: (channel, callback) => {
    const validChannels = [
      'download:progress',
      'redis:monitor-data',
      'logs:update',
      'terminal:data',
      'metrics:update',
      'alert',
      'worker:output',
      'worker:error',
      'worker:exit',
      'scheduler:log'
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    }
  },
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});