// modules/MonitoringService.js
const os = require('os');
const fs = require('fs-extra');
const path = require('path');
const { EventEmitter } = require('events');
const { exec } = require('child_process');

class MonitoringService extends EventEmitter {
  constructor(userDataPath) {
    super();
    this.userDataPath = userDataPath;
    this.metricsPath = path.join(userDataPath, 'metrics');
    this.metrics = {
      system: {},
      projects: {},
      services: {},
      timestamp: Date.now()
    };
    this.alerts = [];
    this.maxAlerts = 200;
    this.maxMetricsFiles = 500;
    this.interval = null;
    this.isRunning = false;
    this.previousCPU = null;
    this.previousNetwork = null;
    
    // Thresholds
    this.thresholds = {
      cpu: { warning: 70, critical: 90 },
      memory: { warning: 80, critical: 95 },
      disk: { warning: 85, critical: 95 },
      uptime: { warning: 86400 } // 24 hours
    };
  }

  async start(interval = 3000) {
    if (this.isRunning) return;
    
    await fs.ensureDir(this.metricsPath);
    await this.loadThresholds();
    this.isRunning = true;
    
    // Initial collection
    await this.collectMetrics();
    
    // Periodic collection
    this.interval = setInterval(() => this.collectMetrics(), interval);
    
    console.log('📊 Monitoring started');
  }

  async collectMetrics() {
    try {
      const timestamp = Date.now();

      // ===== SYSTEM METRICS =====
      const [cpu, memory, disk, network, processes] = await Promise.all([
        this.getCPUUsage(),
        this.getMemoryUsage(),
        this.getDiskUsage(),
        this.getNetworkStats(),
        this.getTopProcesses()
      ]);

      this.metrics.system = {
        cpu,
        memory,
        disk,
        network,
        processes,
        uptime: process.uptime(),
        platform: os.platform(),
        hostname: os.hostname(),
        loadAverage: os.loadavg(),
        timestamp
      };

      // ===== PROJECT METRICS =====
      this.metrics.projects = await this.collectProjectMetrics();

      // ===== SERVICE METRICS =====
      this.metrics.services = await this.collectServiceMetrics();

      // ===== SAVE METRICS =====
      await this.saveMetrics(timestamp);

      // ===== CHECK THRESHOLDS =====
      await this.checkThresholds();

      // ===== CLEANUP OLD METRICS =====
      await this.cleanupOldMetrics();

      // ===== EMIT UPDATE =====
      this.emit('metrics:update', {
        system: this.metrics.system,
        projects: this.metrics.projects,
        services: this.metrics.services,
        timestamp
      });

    } catch (error) {
      console.error('Metrics collection error:', error.message);
    }
  }

  // ===== CPU USAGE (Real-time) =====
  async getCPUUsage() {
    const cpus = os.cpus();
    
    // Calculate real CPU usage delta
    if (this.previousCPU) {
      const usagePerCore = cpus.map((cpu, i) => {
        const prev = this.previousCPU[i];
        if (!prev) return 0;
        
        const prevTotal = Object.values(prev.times).reduce((a, b) => a + b, 0);
        const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
        const idle = cpu.times.idle - prev.times.idle;
        
        return 100 - (idle / (total - prevTotal) * 100);
      });
      
      this.previousCPU = cpus;
      
      return {
        usage: usagePerCore.reduce((a, b) => a + b, 0) / cpus.length,
        perCore: usagePerCore.map(u => u.toFixed(1)),
        cores: cpus.length,
        model: cpus[0]?.model || 'Unknown',
        speed: cpus[0]?.speed || 0
      };
    }
    
    this.previousCPU = cpus;
    return {
      usage: 0,
      perCore: [],
      cores: cpus.length,
      model: cpus[0]?.model || 'Unknown',
      speed: cpus[0]?.speed || 0
    };
  }

  // ===== MEMORY USAGE =====
  getMemoryUsage() {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    const percentage = ((used / total) * 100).toFixed(2);

    return {
      total: total,
      totalFormatted: this.formatBytes(total),
      used: used,
      usedFormatted: this.formatBytes(used),
      free: free,
      freeFormatted: this.formatBytes(free),
      percentage: parseFloat(percentage),
      swapTotal: os.totalmem() - os.freemem(), // Simplified
      swapUsed: 0
    };
  }

  // ===== DISK USAGE (REAL) =====
  async getDiskUsage() {
    try {
      // Use system command for disk info
      const drives = [];
      
      if (process.platform === 'win32') {
        // Windows: wmic logicaldisk
        const { stdout } = await this.execPromise('wmic logicaldisk get size,freespace,caption');
        const lines = stdout.split('\n').filter(l => l.trim());
        
        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].trim().split(/\s+/);
          if (parts.length >= 3) {
            const total = parseInt(parts[2]) || 0;
            const free = parseInt(parts[1]) || 0;
            if (total > 0) {
              drives.push({
                drive: parts[0],
                total,
                totalFormatted: this.formatBytes(total),
                free,
                freeFormatted: this.formatBytes(free),
                used: total - free,
                usedFormatted: this.formatBytes(total - free),
                percentage: ((total - free) / total * 100).toFixed(1)
              });
            }
          }
        }
      } else {
        // Unix: df -h
        const { stdout } = await this.execPromise('df -B1 /');
        const lines = stdout.split('\n');
        if (lines[1]) {
          const parts = lines[1].trim().split(/\s+/);
          const total = parseInt(parts[1]) || 0;
          const used = parseInt(parts[2]) || 0;
          const free = parseInt(parts[3]) || 0;
          
          drives.push({
            drive: '/',
            total,
            totalFormatted: this.formatBytes(total),
            free,
            freeFormatted: this.formatBytes(free),
            used,
            usedFormatted: this.formatBytes(used),
            percentage: ((used / total) * 100).toFixed(1)
          });
        }
      }
      
      return drives;
    } catch (e) {
      return [{ drive: 'Unknown', error: e.message }];
    }
  }

  // ===== NETWORK STATS =====
  async getNetworkStats() {
    const interfaces = os.networkInterfaces();
    const stats = [];
    
    for (const [name, addrs] of Object.entries(interfaces)) {
      for (const addr of addrs) {
        if (addr.family === 'IPv4' && !addr.internal) {
          stats.push({
            name,
            address: addr.address,
            netmask: addr.netmask,
            mac: addr.mac,
            type: name.includes('Wi-Fi') || name.includes('wlan') ? 'wifi' : 
                  name.includes('Ethernet') || name.includes('eth') ? 'ethernet' : 'other'
          });
        }
      }
    }
    
    return {
      interfaces: stats,
      totalInterfaces: stats.length,
      activeConnections: await this.getActiveConnections()
    };
  }

  async getActiveConnections() {
    try {
      if (process.platform === 'win32') {
        const { stdout } = await this.execPromise('netstat -n | find /c "ESTABLISHED"');
        return parseInt(stdout.trim()) || 0;
      } else {
        const { stdout } = await this.execPromise('netstat -an | grep ESTABLISHED | wc -l');
        return parseInt(stdout.trim()) || 0;
      }
    } catch {
      return 0;
    }
  }

  // ===== TOP PROCESSES =====
  async getTopProcesses() {
    try {
      if (process.platform === 'win32') {
        const { stdout } = await this.execPromise(
          'tasklist /FO CSV /NH | sort /R /+58 | head -10'
        );
        // Parse CSV output
        return stdout.split('\n')
          .filter(l => l.trim())
          .map(line => {
            const parts = line.replace(/"/g, '').split(',');
            return {
              name: parts[0]?.trim() || 'Unknown',
              pid: parseInt(parts[1]) || 0,
              memory: parts[4]?.trim() || '0 K'
            };
          });
      } else {
        const { stdout } = await this.execPromise('ps aux --sort=-%mem | head -11');
        return stdout.split('\n')
          .slice(1)
          .filter(l => l.trim())
          .map(line => {
            const parts = line.trim().split(/\s+/);
            return {
              name: parts[10] || 'Unknown',
              pid: parseInt(parts[1]) || 0,
              cpu: parts[2] || '0',
              memory: parts[3] || '0'
            };
          });
      }
    } catch {
      return [];
    }
  }

  // ===== PROJECT METRICS =====
  async collectProjectMetrics() {
    const projects = {};
    
    try {
      // Get running projects from ProjectRunner
      const { ProjectRunner } = require('./ProjectRunner');
      const runner = new ProjectRunner();
      const running = runner.getAllRunning();
      
      for (const project of running) {
        try {
          const pid = project.pid;
          let cpuPercent = 0;
          let memUsage = 0;
          
          if (pid) {
            if (process.platform === 'win32') {
              // Windows: Get process CPU & memory
              const { stdout } = await this.execPromise(
                `wmic process where ProcessId=${pid} get WorkingSetSize /value`
              ).catch(() => ({ stdout: '' }));
              
              const match = stdout.match(/WorkingSetSize=(\d+)/);
              if (match) {
                memUsage = parseInt(match[1]) || 0;
              }
            } else {
              // Unix: ps
              const { stdout } = await this.execPromise(
                `ps -p ${pid} -o %cpu,%mem,rss | tail -1`
              ).catch(() => ({ stdout: '' }));
              
              const parts = stdout.trim().split(/\s+/);
              if (parts.length >= 3) {
                cpuPercent = parseFloat(parts[0]) || 0;
                memUsage = parseInt(parts[2]) * 1024 || 0; // KB to bytes
              }
            }
          }
          
          projects[project.id] = {
            id: project.id,
            name: project.name,
            port: project.port,
            pid,
            cpu: cpuPercent,
            memory: memUsage,
            memoryFormatted: this.formatBytes(memUsage),
            uptime: project.startedAt ? 
              Math.floor((Date.now() - project.startedAt.getTime()) / 1000) : 0,
            status: 'running',
            hasSSL: project.hasSSL || false
          };
        } catch (e) {
          projects[project.id] = {
            ...project,
            cpu: 0,
            memory: 0,
            error: e.message
          };
        }
      }
    } catch (e) {
      console.log('Project metrics error:', e.message);
    }
    
    return projects;
  }

  // ===== SERVICE METRICS =====
  async collectServiceMetrics() {
    const services = {
      redis: await this.checkRedisStatus(),
      databases: await this.checkDatabaseStatus(),
      queue: await this.checkQueueStatus(),
      scheduler: await this.checkSchedulerStatus()
    };
    
    return services;
  }

  async checkRedisStatus() {
    try {
      // Check Redis connection
      const net = require('net');
      return new Promise((resolve) => {
        const client = new net.Socket();
        const timeout = setTimeout(() => {
          client.destroy();
          resolve({ status: 'disconnected', port: 6379 });
        }, 2000);
        
        client.connect(6379, '127.0.0.1', () => {
          clearTimeout(timeout);
          client.write('PING\r\n');
          client.on('data', (data) => {
            client.destroy();
            resolve({
              status: data.toString().includes('PONG') ? 'connected' : 'error',
              port: 6379,
              response: data.toString().trim()
            });
          });
        });
        
        client.on('error', () => {
          clearTimeout(timeout);
          resolve({ status: 'disconnected', port: 6379 });
        });
      });
    } catch {
      return { status: 'unknown' };
    }
  }

  async checkDatabaseStatus() {
    const databases = {};
    
    try {
      // Check MySQL (3306)
      const mysqlStatus = await this.checkPort(3306);
      databases.mysql = { status: mysqlStatus ? 'connected' : 'disconnected', port: 3306 };
      
      // Check PostgreSQL (5432)
      const pgStatus = await this.checkPort(5432);
      databases.postgresql = { status: pgStatus ? 'connected' : 'disconnected', port: 5432 };
    } catch (e) {
      databases.error = e.message;
    }
    
    return databases;
  }

  async checkPort(port) {
    return new Promise((resolve) => {
      const net = require('net');
      const socket = new net.Socket();
      const timeout = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, 1000);
      
      socket.connect(port, '127.0.0.1', () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve(true);
      });
      
      socket.on('error', () => {
        clearTimeout(timeout);
        resolve(false);
      });
    });
  }

  async checkQueueStatus() {
    return { status: 'active', workers: 0 };
  }

  async checkSchedulerStatus() {
    return { status: 'active', jobs: 0 };
  }

  // ===== ALERTS =====
  async checkThresholds() {
    const { system } = this.metrics;
    
    // CPU Alerts
    if (system.cpu.usage > this.thresholds.cpu.critical) {
      this.createAlert('critical', 'CPU Usage Critical',
        `CPU at ${system.cpu.usage.toFixed(1)}% (Threshold: ${this.thresholds.cpu.critical}%)`);
    } else if (system.cpu.usage > this.thresholds.cpu.warning) {
      this.createAlert('warning', 'High CPU Usage',
        `CPU at ${system.cpu.usage.toFixed(1)}%`);
    }
    
    // Memory Alerts
    if (system.memory.percentage > this.thresholds.memory.critical) {
      this.createAlert('critical', 'Memory Usage Critical',
        `Memory at ${system.memory.percentage}%`);
    } else if (system.memory.percentage > this.thresholds.memory.warning) {
      this.createAlert('warning', 'High Memory Usage',
        `Memory at ${system.memory.percentage}%`);
    }
    
    // Disk Alerts
    for (const drive of (system.disk || [])) {
      if (parseFloat(drive.percentage) > this.thresholds.disk.critical) {
        this.createAlert('critical', `Disk ${drive.drive} Critical`,
          `Disk usage at ${drive.percentage}%`);
      } else if (parseFloat(drive.percentage) > this.thresholds.disk.warning) {
        this.createAlert('warning', `Disk ${drive.drive} Almost Full`,
          `Disk usage at ${drive.percentage}%`);
      }
    }
  }

  createAlert(level, title, message) {
    const alert = {
      id: Date.now() + Math.random(),
      level, // 'info', 'warning', 'critical'
      title,
      message,
      timestamp: new Date().toISOString(),
      acknowledged: false
    };
    
    this.alerts.unshift(alert);
    
    // Keep only last N alerts
    if (this.alerts.length > this.maxAlerts) {
      this.alerts = this.alerts.slice(0, this.maxAlerts);
    }

    // Emit alert
    this.emit('alert', alert);
    
    // Console log
    const emoji = level === 'critical' ? '🔴' : level === 'warning' ? '🟡' : '🔵';
    console.log(`${emoji} [${level.toUpperCase()}] ${title}: ${message}`);
  }

  // ===== DATA MANAGEMENT =====
  async getMetrics() {
    return this.metrics;
  }

  async getAlerts(limit = 50) {
    return this.alerts.slice(0, limit);
  }

  async acknowledgeAlert(alertId) {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
    }
  }

  async clearAlerts() {
    this.alerts = [];
  }

  async getHealthStatus() {
    const health = {
      status: 'healthy',
      score: 100,
      issues: [],
      services: {
        redis: (await this.checkRedisStatus()).status === 'connected',
        mysql: await this.checkPort(3306),
        postgresql: await this.checkPort(5432)
      },
      lastCheck: new Date().toISOString()
    };
    
    // Calculate health score
    if (this.metrics.system.cpu.usage > 80) {
      health.score -= 20;
      health.issues.push('High CPU usage');
    }
    if (this.metrics.system.memory.percentage > 85) {
      health.score -= 20;
      health.issues.push('High memory usage');
    }
    if (health.score < 60) {
      health.status = 'degraded';
    }
    if (health.score < 30) {
      health.status = 'critical';
    }
    
    return health;
  }

  async saveMetrics(timestamp) {
    const file = path.join(this.metricsPath, `metrics_${timestamp}.json`);
    await fs.writeJson(file, this.metrics).catch(() => {});
  }

  async loadMetricsHistory(hours = 24) {
    try {
      const files = await fs.readdir(this.metricsPath);
      const now = Date.now();
      const cutoff = now - (hours * 3600000);
      
      const history = [];
      for (const file of files) {
        const timestamp = parseInt(file.replace('metrics_', '').replace('.json', ''));
        if (timestamp > cutoff) {
          const data = await fs.readJson(path.join(this.metricsPath, file));
          history.push(data);
        }
      }
      
      return history.sort((a, b) => a.system.timestamp - b.system.timestamp);
    } catch {
      return [];
    }
  }

  async cleanupOldMetrics() {
    try {
      const files = await fs.readdir(this.metricsPath);
      if (files.length > this.maxMetricsFiles) {
        const sorted = files
          .map(f => ({
            name: f,
            time: parseInt(f.replace('metrics_', '').replace('.json', ''))
          }))
          .sort((a, b) => a.time - b.time);
        
        // Delete oldest files
        const toDelete = sorted.slice(0, sorted.length - this.maxMetricsFiles);
        for (const file of toDelete) {
          await fs.remove(path.join(this.metricsPath, file.name));
        }
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  }

  async loadThresholds() {
    const configPath = path.join(this.userDataPath, 'monitoring.json');
    if (await fs.pathExists(configPath)) {
      try {
        const config = await fs.readJson(configPath);
        this.thresholds = { ...this.thresholds, ...config };
      } catch {}
    }
  }

  async updateThresholds(newThresholds) {
    this.thresholds = { ...this.thresholds, ...newThresholds };
    const configPath = path.join(this.userDataPath, 'monitoring.json');
    await fs.writeJson(configPath, this.thresholds);
  }

  // ===== HELPERS =====
  execPromise(command) {
    return new Promise((resolve, reject) => {
      exec(command, { timeout: 5000 }, (error, stdout, stderr) => {
        if (error) reject(error);
        else resolve({ stdout, stderr });
      });
    });
  }

  formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  pause() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      this.isRunning = false;
      console.log('⏸️ Monitoring paused');
    }
  }

  resume() {
    if (!this.isRunning) {
      this.start();
      console.log('▶️ Monitoring resumed');
    }
  }

  stop() {
    this.pause();
    this.removeAllListeners();
  }

  shutdown() {
    this.stop();
    console.log('📊 Monitoring service shut down');
  }
}

module.exports = { MonitoringService };