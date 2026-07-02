// modules/HotReloadManager.js
const chokidar = require('chokidar');
const fs = require('fs-extra');
const path = require('path');
const { EventEmitter } = require('events');

class HotReloadManager extends EventEmitter {
  constructor() {
    super();
    this.watchers = new Map();
    this.reloadStrategies = new Map();
    this.debounceTimers = new Map();
    this.defaultDebounce = 300; // ms
  }

  async enable(projectId, config) {
    const { projectPath, techStack, entryPoint } = config;

    if (this.watchers.has(projectId)) {
      return { alreadyEnabled: true };
    }

    const watchPaths = this.getWatchPaths(techStack, projectPath);
    const ignored = this.getIgnoredPatterns(techStack);

    const watcher = chokidar.watch(watchPaths, {
      ignored,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100
      }
    });

    // Setup event handlers
    watcher.on('change', (filePath) => {
      this.handleFileChange(projectId, filePath, config);
    });

    watcher.on('add', (filePath) => {
      this.handleFileAdd(projectId, filePath, config);
    });

    watcher.on('unlink', (filePath) => {
      this.handleFileDelete(projectId, filePath, config);
    });

    this.watchers.set(projectId, {
      watcher,
      config,
      changeCount: 0,
      lastReload: Date.now()
    });

    this.emit('hotreload:enabled', { projectId, watchPaths });

    return { enabled: true, watching: watchPaths.length };
  }

  async disable(projectId) {
    const watcherData = this.watchers.get(projectId);
    if (watcherData) {
      await watcherData.watcher.close();
      this.watchers.delete(projectId);
      this.emit('hotreload:disabled', { projectId });
    }

    return { disabled: true };
  }

  async handleFileChange(projectId, filePath, config) {
    // Debounce to avoid multiple rapid reloads
    this.debounce(projectId, async () => {
      const watcherData = this.watchers.get(projectId);
      if (!watcherData) return;

      watcherData.changeCount++;
      
      console.log(`🔄 File changed: ${path.basename(filePath)}`);
      this.emit('hotreload:change', { projectId, filePath, changeCount: watcherData.changeCount });

      // Reload based on tech stack
      await this.reloadProject(projectId, config);
    });
  }

  handleFileAdd(projectId, filePath, config) {
    console.log(`📄 File added: ${path.basename(filePath)}`);
    this.emit('hotreload:add', { projectId, filePath });
  }

  handleFileDelete(projectId, filePath, config) {
    console.log(`🗑 File deleted: ${path.basename(filePath)}`);
    this.emit('hotreload:delete', { projectId, filePath });
  }

  async reloadProject(projectId, config) {
    const startTime = Date.now();
    
    switch (config.techStack) {
      case 'php':
        await this.reloadPHP(projectId, config);
        break;
      case 'nodejs':
        await this.reloadNodeJS(projectId, config);
        break;
      case 'go':
        await this.reloadGo(projectId, config);
        break;
      case 'python':
        await this.reloadPython(projectId, config);
        break;
      default:
        await this.genericReload(projectId, config);
    }

    const duration = Date.now() - startTime;
    this.emit('hotreload:complete', { projectId, duration });
    
    console.log(`✅ Reloaded ${config.name} in ${duration}ms`);
  }

  async reloadPHP(projectId, config) {
    // PHP doesn't need explicit reload - it reloads on each request
    // But we can clear OPcache
    try {
      const { exec } = require('child_process');
      await new Promise((resolve) => {
        exec(`php -r "if(function_exists('opcache_reset')) opcache_reset();"`, resolve);
      });
      console.log('🔄 OPcache cleared');
    } catch (e) {
      // OPcache might not be available
    }
  }

  async reloadNodeJS(projectId, config) {
    // Send SIGHUP or custom signal to Node.js process
    // This requires the Node.js app to handle the signal
    try {
      // If using cluster, send reload signal
      if (config.useCluster) {
        process.kill(config.masterPid, 'SIGHUP');
      }
    } catch (e) {
      console.log('Node.js reload signal sent');
    }
  }

  async reloadGo(projectId, config) {
    // For Go, we need to rebuild and restart
    // This is handled by the EnvironmentManager
    this.emit('hotreload:rebuild', { projectId, techStack: 'go' });
  }

  async reloadPython(projectId, config) {
    // For Python with watchdog/uvicorn reload
    // Touch a file to trigger uvicorn's auto-reload
    try {
      const touchFile = path.join(config.projectPath, '.reload-trigger');
      await fs.writeFile(touchFile, Date.now().toString());
      await fs.remove(touchFile);
    } catch (e) {
      console.log('Python reload triggered');
    }
  }

  async genericReload(projectId, config) {
    // Generic reload - restart the process
    this.emit('hotreload:restart', { projectId });
  }

  debounce(projectId, callback) {
    const existing = this.debounceTimers.get(projectId);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(projectId);
      callback();
    }, this.defaultDebounce);

    this.debounceTimers.set(projectId, timer);
  }

  getWatchPaths(techStack, projectPath) {
    const basePaths = {
      php: [
        path.join(projectPath, '**/*.php'),
        path.join(projectPath, '**/*.blade.php'),
        path.join(projectPath, '**/*.twig'),
        path.join(projectPath, 'composer.json'),
        path.join(projectPath, '.env')
      ],
      nodejs: [
        path.join(projectPath, '**/*.js'),
        path.join(projectPath, '**/*.ts'),
        path.join(projectPath, '**/*.jsx'),
        path.join(projectPath, '**/*.tsx'),
        path.join(projectPath, '**/*.json'),
        path.join(projectPath, '.env')
      ],
      go: [
        path.join(projectPath, '**/*.go'),
        path.join(projectPath, 'go.mod'),
        path.join(projectPath, 'go.sum')
      ],
      python: [
        path.join(projectPath, '**/*.py'),
        path.join(projectPath, 'requirements.txt'),
        path.join(projectPath, '.env')
      ],
      ruby: [
        path.join(projectPath, '**/*.rb'),
        path.join(projectPath, '**/*.erb'),
        path.join(projectPath, 'Gemfile')
      ],
      java: [
        path.join(projectPath, '**/*.java'),
        path.join(projectPath, '**/*.xml'),
        path.join(projectPath, '**/*.properties')
      ],
      rust: [
        path.join(projectPath, '**/*.rs'),
        path.join(projectPath, 'Cargo.toml')
      ]
    };

    return basePaths[techStack] || [
      path.join(projectPath, '**/*')
    ];
  }

  getIgnoredPatterns(techStack) {
    const baseIgnore = [
      '**/node_modules/**',
      '**/vendor/**',
      '**/.git/**',
      '**/storage/logs/**',
      '**/storage/framework/cache/**',
      '**/__pycache__/**',
      '**/*.pyc',
      '**/target/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/coverage/**'
    ];

    const stackIgnore = {
      php: ['**/storage/**'],
      nodejs: ['**/.next/**', '**/dist/**'],
      go: ['**/vendor/**'],
      python: ['**/venv/**', '**/.venv/**'],
      java: ['**/target/**', '**/.gradle/**'],
      rust: ['**/target/**']
    };

    return [...baseIgnore, ...(stackIgnore[techStack] || [])];
  }

  getStats() {
    const stats = [];
    
    for (const [projectId, data] of this.watchers) {
      stats.push({
        projectId,
        changeCount: data.changeCount,
        lastReload: data.lastReload,
        active: true
      });
    }

    return stats;
  }

  shutdown() {
    for (const [projectId, data] of this.watchers) {
      data.watcher.close();
    }
    this.watchers.clear();
    this.debounceTimers.clear();
  }
}

module.exports = { HotReloadManager };