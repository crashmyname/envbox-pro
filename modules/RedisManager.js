// modules/RedisManager.js
const fs = require('fs-extra');
const path = require('path');
const { spawn, exec } = require('child_process');
const { v4: uuidv4 } = require('uuid');

let Redis;
try {
  Redis = require('ioredis');
  console.log('✅ ioredis loaded');
} catch(e) {
  Redis = null;
  console.log('⚠️ ioredis not available');
}

class RedisManager {
  constructor(userDataPath, resourcesPath) {
    this.userDataPath = userDataPath;
    this.resourcesPath = resourcesPath;
    this.redisPath = path.join(userDataPath, 'redis');
    this.instances = new Map();
    this.activeClients = new Map();
    this.store = path.join(userDataPath, 'redis-instances.json');
    
    if (Redis) {
        process.on('unhandledRejection', (reason, promise) => {
            if (reason?.message?.includes('ECONNREFUSED') || reason?.message?.includes('connect')) {
                return;
            }
            console.error('Unhandled rejection:', reason);
        });
    }

    this.defaultConfig = {
      port: 6379,
      maxmemory: '256mb',
      maxmemoryPolicy: 'allkeys-lru',
    };
  }

  async initialize() {
    await fs.ensureDir(this.redisPath);
    await fs.ensureDir(path.join(this.redisPath, 'data'));
    await fs.ensureDir(path.join(this.redisPath, 'logs'));
    
    if (!await fs.pathExists(this.store)) {
      await fs.writeJson(this.store, { instances: [] });
    }
  }

  // 🔥 Kill existing Redis before start
  async killExistingRedis(port) {
    try {
      // Windows: kill process on port
      await new Promise((resolve) => {
        exec(`for /f "tokens=5" %a in ('netstat -ano ^| findstr :${port} ^| findstr LISTENING') do taskkill /F /PID %a 2>nul`, 
          { shell: 'cmd.exe' }, () => resolve());
      });
      // Also try kill by name
      await new Promise((resolve) => {
        exec('taskkill /F /IM redis-server.exe 2>nul', () => resolve());
      });
      await new Promise(r => setTimeout(r, 500));
      console.log(`🔪 Killed existing Redis on port ${port}`);
    } catch(e) {
      // Ignore errors
    }
  }

  async start(config = {}) {
      const instanceId = config.id || 'default';
      const port = config.port || 6379;

      await this.killExistingRedis(port);

      const dataDir = path.join(this.redisPath, 'data', instanceId);
      const logsDir = path.join(this.redisPath, 'logs');
      await fs.ensureDir(dataDir);
      await fs.ensureDir(logsDir);

      const possiblePaths = [
          path.join(__dirname, '..', 'environments', 'redis', 'redis-server.exe'),
      ];
      
      let redisServerPath = null;
      for (const p of possiblePaths) {
          if (await fs.pathExists(p)) { redisServerPath = p; break; }
      }

      if (!redisServerPath) {
          return { id: instanceId, port, status: 'running', simulated: true };
      }

      const logFile = path.join(logsDir, `${instanceId}.log`).replace(/\\/g, '/');

      // ⚡ SPAWN DENGAN ARGS LANGSUNG
      const redisProcess = spawn(redisServerPath, [
          '--port', String(port),
          '--bind', '127.0.0.1',
          '--protected-mode', 'no',
          '--dir', dataDir,
          '--logfile', logFile,
          '--save', '',
          '--appendonly', 'no',
      ], {
          stdio: ['ignore', 'pipe', 'pipe'],
      });

      const instance = {
          id: instanceId, port, process: redisProcess,
          dataDir, startedAt: new Date(),
          status: 'running', simulated: false
      };

      redisProcess.stderr.on('data', (d) => {
          console.log(`[Redis:${port}] ${d.toString().trim()}`);
      });

      redisProcess.on('error', (e) => {
          console.error(`[Redis:${port}] Error:`, e.message);
          instance.status = 'error';
      });

      redisProcess.on('close', (code) => {
          console.log(`[Redis:${port}] Exited: ${code}`);
          instance.status = 'stopped';
      });

      // Tunggu 2 detik
      await new Promise(r => setTimeout(r, 2000));

      // Cek alive
      if (redisProcess.killed || redisProcess.exitCode !== null) {
          console.log('⚠️ Redis died immediately');
          instance.simulated = true;
          instance.status = 'stopped';
      } else {
          console.log(`✅ Redis running on port ${port}`);
      }

      this.instances.set(instanceId, instance);
      await this.saveInstances();

      return { id: instanceId, port, status: instance.status, simulated: instance.simulated };
  }

  async startDefault() {
    return await this.start({ id: 'default', port: 6379 });
  }

  async stop(instanceId) {
    const instance = this.instances.get(instanceId);
    if (!instance) return { stopped: true, instanceId };

    if (instance.process && !instance.process.killed) {
      instance.process.kill('SIGTERM');
      setTimeout(() => {
        if (instance.process && !instance.process.killed) {
          instance.process.kill('SIGKILL');
        }
      }, 3000);
    }

    const client = this.activeClients.get(instanceId);
    if (client) {
      try { await client.quit(); } catch(e) {}
      this.activeClients.delete(instanceId);
    }

    this.instances.delete(instanceId);
    await this.saveInstances();
    return { stopped: true, instanceId };
  }

  async flush(instanceId, db = 'all') {
    try {
      const client = await this.getClient(instanceId);
      if (db === 'all') await client.flushall();
      else await client.flushdb();
      return { flushed: true, db };
    } catch(e) {
      return { flushed: true, db, simulated: true };
    }
  }

  async getInfo(instanceId) {
    try {
      const client = await this.getClient(instanceId);
      const info = await client.info();
      return this.parseRedisInfo(info);
    } catch(e) {
      return this.getSimulatedInfo();
    }
  }

  getSimulatedInfo() {
    return {
      server: { redis_version: 'simulated', uptime_in_seconds: 0 },
      memory: { used_memory_human: '0M', maxmemory_human: '256M' },
      stats: { instantaneous_ops_per_sec: 0 },
      clients: { connected_clients: 0 },
      keyspace: { total_keys: 0 }
    };
  }

  async getClient(instanceId) {
    const instance = this.instances.get(instanceId);
    if (!instance) throw new Error('Instance not found');
    
    let client = this.activeClients.get(instanceId);
    if (!client && Redis) {
      client = new Redis({ 
        port: instance.port, 
        host: '127.0.0.1', 
        lazyConnect: true,
        retryStrategy: () => null,
        maxRetriesPerRequest: 0,
      });
      await client.connect();
      this.activeClients.set(instanceId, client);
    }
    
    if (!client) {
      return {
        info: async () => '# Server\r\nredis_version:simulated',
        ping: async () => 'PONG',
        flushall: async () => 'OK',
        flushdb: async () => 'OK',
        quit: async () => 'OK'
      };
    }
    return client;
  }

  async waitForRedis(port, timeout = 5000) {
      if (!Redis) return false;
      const start = Date.now();
      
      while (Date.now() - start < timeout) {
          let c = null;
          try {
              c = new Redis({ 
                  port, 
                  host: '127.0.0.1',
                  retryStrategy: () => null,
                  maxRetriesPerRequest: 0,
                  enableOfflineQueue: false,
                  connectTimeout: 1000,
              });
              const pong = await c.ping();
              await c.quit();
              if (pong === 'PONG') return true;
          } catch(e) {
              if (c) {
                  try { c.disconnect(); } catch(e) {}
              }
              await new Promise(r => setTimeout(r, 500));
          }
      }
      return false;
  }

  async list() {
    const instances = [];
    for (const [id, i] of this.instances) {
      instances.push({
        id, port: i.port, status: i.status,
        simulated: i.simulated, startedAt: i.startedAt
      });
    }
    return instances;
  }

  isRunning(instanceId = 'default') {
    const instance = this.instances.get(instanceId);
    return instance && instance.status === 'running';
  }

  generateConfig(config) {
      return `
  port ${config.port}
  bind 127.0.0.1
  protected-mode no
  maxmemory ${config.maxmemory}
  maxmemory-policy ${config.maxmemoryPolicy}
  dir "${config.dir}"
  dbfilename dump.rdb
  logfile "${config.logfile}"
  `;
  }

  parseRedisInfo(info) {
    const result = {};
    let section = 'general';
    info.split('\n').forEach(line => {
      if (line.startsWith('#')) {
        section = line.replace('# ', '').toLowerCase().trim();
        result[section] = {};
      } else if (line.includes(':')) {
        const [key, value] = line.split(':');
        if (result[section]) result[section][key.trim()] = value.trim();
      }
    });
    return result;
  }

  async saveInstances() {
    const instances = [];
    for (const [id, i] of this.instances) {
      instances.push({ id, port: i.port, status: i.status, simulated: i.simulated, startedAt: i.startedAt });
    }
    await fs.writeJson(this.store, { instances });
  }

  async shutdown() {
    for (const [id, i] of this.instances) {
      if (i.process) try { i.process.kill('SIGTERM'); } catch(e) {}
    }
    for (const [id, c] of this.activeClients) {
      try { await c.quit(); } catch(e) {}
    }
    this.activeClients.clear();
    this.instances.clear();
  }
}

module.exports = { RedisManager };