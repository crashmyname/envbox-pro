// modules/PluginSystem.js
const fs = require('fs-extra');
const path = require('path');
const { EventEmitter } = require('events');
const { v4: uuidv4 } = require('uuid');

class PluginSystem extends EventEmitter {
  constructor(userDataPath) {
    super();
    this.userDataPath = userDataPath;
    this.pluginsPath = path.join(userDataPath, 'plugins');
    this.plugins = new Map();
    this.hooks = new Map();
    this.store = path.join(userDataPath, 'plugins.json');
  }

  async initialize() {
    await fs.ensureDir(this.pluginsPath);
    
    if (!await fs.pathExists(this.store)) {
      await fs.writeJson(this.store, { plugins: [] });
    }

    await this.loadPlugins();
    console.log('🔌 Plugin System initialized');
  }

  async registerPlugin(pluginConfig) {
    const pluginId = pluginConfig.id || uuidv4();
    
    const plugin = {
      id: pluginId,
      name: pluginConfig.name,
      version: pluginConfig.version || '1.0.0',
      description: pluginConfig.description || '',
      author: pluginConfig.author || '',
      entry: pluginConfig.entry,
      hooks: pluginConfig.hooks || [],
      config: pluginConfig.config || {},
      status: 'registered',
      registeredAt: new Date().toISOString()
    };

    this.plugins.set(pluginId, plugin);

    // Register hooks
    if (plugin.hooks.length > 0) {
      for (const hook of plugin.hooks) {
        this.registerHook(hook.name, pluginId, hook.handler);
      }
    }

    await this.savePlugin(plugin);
    this.emit('plugin:registered', { pluginId, name: plugin.name });

    return { registered: true, pluginId };
  }

  async activatePlugin(pluginId) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) throw new Error('Plugin not found');

    try {
      // Load plugin entry point
      if (plugin.entry) {
        const entryPath = path.join(this.pluginsPath, pluginId, plugin.entry);
        if (await fs.pathExists(entryPath)) {
          const pluginModule = require(entryPath);
          
          if (typeof pluginModule.activate === 'function') {
            await pluginModule.activate({
              config: plugin.config,
              hooks: this.createHookAPI(pluginId),
              logger: this.createPluginLogger(pluginId)
            });
          }
        }
      }

      plugin.status = 'active';
      this.plugins.set(pluginId, plugin);
      await this.savePlugin(plugin);

      this.emit('plugin:activated', { pluginId, name: plugin.name });
      return { activated: true };
    } catch (error) {
      plugin.status = 'error';
      plugin.error = error.message;
      this.plugins.set(pluginId, plugin);
      throw error;
    }
  }

  async deactivatePlugin(pluginId) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) throw new Error('Plugin not found');

    // Call deactivate if available
    try {
      if (plugin.entry) {
        const entryPath = path.join(this.pluginsPath, pluginId, plugin.entry);
        if (await fs.pathExists(entryPath)) {
          const pluginModule = require(entryPath);
          if (typeof pluginModule.deactivate === 'function') {
            await pluginModule.deactivate();
          }
        }
      }
    } catch (e) {
      console.log(`Plugin ${pluginId} deactivation error:`, e.message);
    }

    // Remove hooks
    for (const hook of plugin.hooks) {
      this.unregisterHook(hook.name, pluginId);
    }

    plugin.status = 'inactive';
    this.plugins.set(pluginId, plugin);
    await this.savePlugin(plugin);

    this.emit('plugin:deactivated', { pluginId });
    return { deactivated: true };
  }

  async uninstallPlugin(pluginId) {
    await this.deactivatePlugin(pluginId);
    
    this.plugins.delete(pluginId);
    
    // Remove plugin files
    const pluginPath = path.join(this.pluginsPath, pluginId);
    if (await fs.pathExists(pluginPath)) {
      await fs.remove(pluginPath);
    }

    // Remove from store
    const store = await fs.readJson(this.store);
    store.plugins = store.plugins.filter(p => p.id !== pluginId);
    await fs.writeJson(this.store, store);

    this.emit('plugin:uninstalled', { pluginId });
    return { uninstalled: true };
  }

  registerHook(hookName, pluginId, handler) {
    if (!this.hooks.has(hookName)) {
      this.hooks.set(hookName, []);
    }
    
    this.hooks.get(hookName).push({
      pluginId,
      handler
    });
  }

  unregisterHook(hookName, pluginId) {
    const hooks = this.hooks.get(hookName);
    if (hooks) {
      this.hooks.set(hookName, hooks.filter(h => h.pluginId !== pluginId));
    }
  }

  async executeHook(hookName, ...args) {
    const hooks = this.hooks.get(hookName) || [];
    const results = [];

    for (const hook of hooks) {
      const plugin = this.plugins.get(hook.pluginId);
      if (plugin && plugin.status === 'active') {
        try {
          const result = await hook.handler(...args);
          results.push({ pluginId: hook.pluginId, result });
        } catch (error) {
          console.error(`Hook ${hookName} error in plugin ${hook.pluginId}:`, error);
        }
      }
    }

    return results;
  }

  createHookAPI(pluginId) {
    return {
      on: (hookName, handler) => {
        this.registerHook(hookName, pluginId, handler);
      },
      emit: (hookName, ...args) => {
        return this.executeHook(hookName, ...args);
      },
      remove: (hookName) => {
        this.unregisterHook(hookName, pluginId);
      }
    };
  }

  createPluginLogger(pluginId) {
    return {
      info: (message) => console.log(`[Plugin:${pluginId}] ${message}`),
      warn: (message) => console.warn(`[Plugin:${pluginId}] ${message}`),
      error: (message) => console.error(`[Plugin:${pluginId}] ${message}`),
      debug: (message) => console.debug(`[Plugin:${pluginId}] ${message}`)
    };
  }

  async getInstalledPlugins() {
    const plugins = [];
    for (const [id, plugin] of this.plugins) {
      plugins.push({
        id,
        name: plugin.name,
        version: plugin.version,
        status: plugin.status,
        description: plugin.description
      });
    }
    return plugins;
  }

  async getPluginMarketplace() {
    // Simulated marketplace
    return [
      {
        id: 'php-debug-bar',
        name: 'PHP Debug Bar',
        version: '2.1.0',
        description: 'Adds debug bar to PHP projects',
        downloads: 15420,
        rating: 4.8
      },
      {
        id: 'api-doc-generator',
        name: 'API Documentation Generator',
        version: '1.5.0',
        description: 'Auto-generates API documentation',
        downloads: 8930,
        rating: 4.5
      },
      {
        id: 'performance-monitor',
        name: 'Performance Monitor Pro',
        version: '3.2.0',
        description: 'Advanced performance monitoring',
        downloads: 12450,
        rating: 4.9
      },
      {
        id: 'docker-sync',
        name: 'Docker Sync Tool',
        version: '1.0.0',
        description: 'Sync projects with Docker environments',
        downloads: 3420,
        rating: 3.8
      },
      {
        id: 'git-integration',
        name: 'Git Integration Suite',
        version: '2.0.0',
        description: 'Full Git integration with GUI',
        downloads: 21000,
        rating: 4.7
      }
    ];
  }

  async savePlugin(plugin) {
    const pluginPath = path.join(this.pluginsPath, plugin.id);
    await fs.ensureDir(pluginPath);
    
    const { hooks, ...pluginData } = plugin;
    await fs.writeJson(path.join(pluginPath, 'plugin.json'), pluginData, { spaces: 2 });

    // Update store
    const store = await fs.readJson(this.store);
    const existing = store.plugins.findIndex(p => p.id === plugin.id);
    
    if (existing >= 0) {
      store.plugins[existing] = pluginData;
    } else {
      store.plugins.push(pluginData);
    }
    
    await fs.writeJson(this.store, store);
  }

  async loadPlugins() {
    if (!await fs.pathExists(this.store)) return;

    const store = await fs.readJson(this.store);
    
    for (const pluginData of store.plugins) {
      this.plugins.set(pluginData.id, {
        ...pluginData,
        hooks: pluginData.hooks || []
      });

      // Auto-activate if was active
      if (pluginData.status === 'active') {
        try {
          await this.activatePlugin(pluginData.id);
        } catch (e) {
          console.log(`Failed to activate plugin ${pluginData.id}:`, e.message);
        }
      }
    }
  }

  shutdown() {
    for (const [id, plugin] of this.plugins) {
      if (plugin.status === 'active') {
        this.deactivatePlugin(id).catch(console.error);
      }
    }
  }
}

module.exports = { PluginSystem };