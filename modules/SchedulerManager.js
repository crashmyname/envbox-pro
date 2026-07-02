// modules/SchedulerManager.js
const fs = require('fs-extra');
const path = require('path');
const cron = require('node-cron');
const { CronJob } = require('cron');
const schedule = require('node-schedule');
const { v4: uuidv4 } = require('uuid');

class SchedulerManager {
  constructor(userDataPath) {
    this.userDataPath = userDataPath;
    this.schedulesPath = path.join(userDataPath, 'schedules');
    this.jobs = new Map();
    this.scheduledJobs = new Map();
    this.logs = [];
  }

  async initialize() {
    await fs.ensureDir(this.schedulesPath);
    await this.loadSchedules();
  }

  async create(config) {
      const scheduleId = uuidv4();
      const {
          name, expression, command, projectId,
          type = 'cron',
          timezone = 'Asia/Jakarta',
          enabled = true,
          retryOnFailure = true,
          maxRetries = 3,
          timeout = 300000,
      } = config;

      // Konversi interval ke cron
      let finalExpression = expression;
      if (type === 'interval') {
          finalExpression = this.intervalToCron(expression);
      } else if (type === 'schedule') {
          finalExpression = this.timeToCron(expression);
      }

      // Validate only for cron type
      if (type === 'cron' || type === 'interval' || type === 'schedule') {
          const validation = this.validateCronExpression(finalExpression);
          if (!validation.valid) {
              throw new Error(`Invalid expression: ${validation.error}`);
          }
      }

      const scheduleConfig = {
          id: scheduleId, name,
          expression: finalExpression,
          originalExpression: expression,
          command, projectId, type,
          timezone, enabled, retryOnFailure, maxRetries, timeout,
          retries: 0, lastRun: null, nextRun: null,
          status: 'created',
          createdAt: new Date().toISOString()
      };

      await fs.writeJson(
          path.join(this.schedulesPath, `${scheduleId}.json`),
          scheduleConfig, { spaces: 2 }
      );

      this.jobs.set(scheduleId, scheduleConfig);

      if (enabled) {
          await this.start(scheduleId);
      }

      return scheduleConfig;
  }

  intervalToCron(expression) {
      const match = expression.match(/^(\d+)\s*(s|m|h|d)$/i);
      if (match) {
          const value = parseInt(match[1]);
          const unit = match[2].toLowerCase();
          
          switch(unit) {
              case 's': return `*/${Math.max(1, Math.floor(value / 60))} * * * *`;
              case 'm': return `*/${value} * * * *`;
              case 'h': return `0 */${value} * * *`;
              case 'd': return `0 0 */${value} * *`;
          }
      }
      return expression; // Fallback
  }

  // Konversi time ke cron
  timeToCron(expression) {
      const match = expression.match(/^(\d{1,2}):(\d{2})$/);
      if (match) {
          const hour = parseInt(match[1]);
          const minute = parseInt(match[2]);
          if (hour >= 0 && hour < 24 && minute >= 0 && minute < 60) {
              return `${minute} ${hour} * * *`;
          }
      }
      return expression; // Fallback
  }

  async start(scheduleId) {
    const config = this.jobs.get(scheduleId);
    if (!config) throw new Error(`Schedule ${scheduleId} not found`);

    let job;

    switch (config.type) {
      case 'cron':
        job = new CronJob(
          config.expression,
          () => this.executeJob(scheduleId),
          null,
          true,
          config.timezone
        );
        break;

      case 'interval':
        const interval = this.parseInterval(config.expression);
        job = setInterval(() => this.executeJob(scheduleId), interval);
        break;

      case 'schedule':
        job = schedule.scheduleJob(config.expression, () => {
          this.executeJob(scheduleId);
        });
        break;

      default:
        throw new Error(`Unknown schedule type: ${config.type}`);
    }

    this.scheduledJobs.set(scheduleId, job);
    config.status = 'running';
    config.nextRun = this.calculateNextRun(config);

    await this.saveSchedule(scheduleId);
    
    this.log(scheduleId, 'started', `Schedule started: ${config.expression}`);

    return { started: true, scheduleId };
  }

  async stop(scheduleId) {
    const job = this.scheduledJobs.get(scheduleId);
    const config = this.jobs.get(scheduleId);

    if (job) {
      if (typeof job.stop === 'function') {
        job.stop();
      } else if (typeof job === 'object' && job._repeat) {
        clearInterval(job._repeat);
      }
      
      this.scheduledJobs.delete(scheduleId);
    }

    if (config) {
      config.status = 'stopped';
      await this.saveSchedule(scheduleId);
    }

    this.log(scheduleId, 'stopped', 'Schedule stopped');

    return { stopped: true, scheduleId };
  }

  async executeJob(scheduleId) {
    const config = this.jobs.get(scheduleId);
    if (!config) return;

    const startTime = Date.now();
    config.lastRun = new Date().toISOString();
    // config.status = 'running';

    this.log(scheduleId, 'execution_start', `Executing: ${config.command}`);

    try {
      // Execute command with timeout
      const result = await this.executeCommand(config.command, {
        timeout: config.timeout,
        projectId: config.projectId
      });

      const duration = Date.now() - startTime;
      // config.status = 'completed';
      config.retries = 0;

      this.log(scheduleId, 'execution_success', 
        `Completed in ${duration}ms. Output: ${result.substring(0, 200)}`);

      // Call success callback if defined
      if (config.onSuccess) {
        await this.executeCallback(config.onSuccess, { scheduleId, result });
      }

    } catch (error) {
      config.status = 'failed';
      
      this.log(scheduleId, 'execution_failed', 
        `Failed: ${error.message}`);

      // Retry logic
      if (config.retryOnFailure && config.retries < config.maxRetries) {
        config.retries++;
        this.log(scheduleId, 'retry', 
          `Retry ${config.retries}/${config.maxRetries}`);
        
        setTimeout(() => this.executeJob(scheduleId), 5000);
      } else {
        // Call failure callback
        if (config.onFailure) {
          await this.executeCallback(config.onFailure, { scheduleId, error: error.message });
        }
      }
    }

    config.nextRun = this.calculateNextRun(config);
    await this.saveSchedule(scheduleId);
  }

  async executeCommand(command, options = {}) {
    return new Promise((resolve, reject) => {
      const { exec } = require('child_process');

      let cwd = process.cwd();
      if (options.projectId) {
          const projectsDir = path.join(__dirname, '..', 'projects');
          cwd = projectsDir;
      }
      const child = exec(command, {
        timeout: options.timeout || 300000,
        maxBuffer: 10 * 1024 * 1024,
        cwd: cwd,
        env: {
          ...process.env,
          ENVBOX_SCHEDULER: 'true',
          PROJECT_ID: options.projectId || ''
        }
      }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
        } else {
          resolve(stdout);
        }
      });
    });
  }

  async executeCallback(callback, data) {
    if (typeof callback === 'string') {
      // Execute as command
      return await this.executeCommand(callback);
    } else if (typeof callback === 'function') {
      return await callback(data);
    }
  }

  validateCronExpression(expression) {
      try {
          // Validasi manual aja, gak usah pakai cron-parser
          const parts = expression.trim().split(/\s+/);
          
          if (parts.length !== 5) {
              return { valid: false, error: 'Must have 5 parts: minute hour day month weekday' };
          }
          
          // Validasi basic: cek gak ada karakter aneh
          const validChars = /^[0-9*,/\-\?LW#]+$/;
          for (const part of parts) {
              if (part === '*') continue;
              if (!validChars.test(part)) {
                  return { valid: false, error: `Invalid characters: ${part}` };
              }
          }
          
          return { valid: true };
      } catch (error) {
          return { valid: false, error: error.message };
      }
  }

  calculateNextRun(config) {
      try {
          if (config.type === 'cron') {
              // Coba pakai cron-parser kalau available
              try {
                  const parser = require('cron-parser');
                  const interval = parser.parseExpression(config.expression, {
                      tz: config.timezone || 'Asia/Jakarta'
                  });
                  return interval.next().toISOString();
              } catch(e) {
                  // Fallback: kalkulasi manual (next minute)
                  const next = new Date();
                  next.setMinutes(next.getMinutes() + 1);
                  next.setSeconds(0);
                  return next.toISOString();
              }
          }
      } catch (e) {
          return null;
      }
      return null;
  }

  parseInterval(expression) {
    // Parse interval expressions like "5m", "1h", "30s"
    const match = expression.match(/^(\d+)\s*(s|m|h|d)$/);
    if (match) {
      const value = parseInt(match[1]);
      const unit = match[2];
      const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
      return value * (multipliers[unit] || 1000);
    }
    return parseInt(expression) || 3600000; // Default 1 hour
  }

  async list() {
    const schedules = [];
    for (const [id, config] of this.jobs) {
      schedules.push({
        id,
        name: config.name,
        expression: config.expression,
        status: config.status,
        lastRun: config.lastRun,
        nextRun: config.nextRun,
        retries: config.retries
      });
    }
    return schedules;
  }

  async delete(scheduleId) {
    await this.stop(scheduleId);
    this.jobs.delete(scheduleId);
    
    const filePath = path.join(this.schedulesPath, `${scheduleId}.json`);
    if (await fs.pathExists(filePath)) {
      await fs.remove(filePath);
    }

    return { deleted: true };
  }

  async getLogs(scheduleId, limit = 50) {
      // Kalau 'all', null, atau undefined → return semua logs
      if (!scheduleId || scheduleId === 'all') {
          return this.logs.slice(-limit);
      }
      
      // Filter by scheduleId
      return this.logs
          .filter(log => log.scheduleId === scheduleId)
          .slice(-limit);
  }

  log(scheduleId, type, message) {
      const logEntry = {
          scheduleId,
          type,
          message,
          timestamp: new Date().toISOString()
      };
      
      this.logs.push(logEntry);
      
      // Keep only last 1000 logs
      if (this.logs.length > 1000) {
          this.logs = this.logs.slice(-1000);
      }

      console.log(`[Scheduler] ${type}: ${message}`); // ✅ Debug log
      
      // Emit ke renderer
      try {
          const { BrowserWindow } = require('electron');
          const win = BrowserWindow.getAllWindows()[0];
          if (win && !win.isDestroyed()) {
              win.webContents.send('scheduler:log', logEntry);
          }
      } catch(e) {}
  }

  async saveSchedule(scheduleId) {
    const config = this.jobs.get(scheduleId);
    if (config) {
      await fs.writeJson(
        path.join(this.schedulesPath, `${scheduleId}.json`),
        config,
        { spaces: 2 }
      );
    }
  }

  async loadSchedules() {
    if (!await fs.pathExists(this.schedulesPath)) return;

    const files = await fs.readdir(this.schedulesPath);
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        const config = await fs.readJson(
          path.join(this.schedulesPath, file)
        );
        this.jobs.set(config.id, config);
        
        // Restart if was running
        if (config.status === 'running') {
          await this.start(config.id).catch(console.error);
        }
      }
    }
  }

  // Convenience methods for common schedules
  async everyMinute(command, options = {}) {
    return await this.create({
      name: options.name || 'Every Minute',
      expression: '* * * * *',
      command,
      ...options
    });
  }

  async everyHour(command, options = {}) {
    return await this.create({
      name: options.name || 'Every Hour',
      expression: '0 * * * *',
      command,
      ...options
    });
  }

  async everyDay(command, time = '00:00', options = {}) {
    const [hour, minute] = time.split(':');
    return await this.create({
      name: options.name || 'Every Day',
      expression: `${minute} ${hour} * * *`,
      command,
      ...options
    });
  }

  async laravelScheduler(projectId) {
    return await this.create({
      name: 'Laravel Scheduler',
      expression: '* * * * *',
      command: `cd "${await this.getProjectPath(projectId)}" && php artisan schedule:run`,
      projectId,
      type: 'cron',
      retryOnFailure: false
    });
  }

  async getProjectPath(projectId) {
    // Get project path from environment manager
    const store = path.join(this.userDataPath, 'environments.json');
    if (await fs.pathExists(store)) {
      const data = await fs.readJson(store);
      const project = data.environments?.find(e => e.id === projectId);
      return project?.projectPath;
    }
    return null;
  }

  shutdown() {
    for (const [id, job] of this.scheduledJobs) {
      try {
        if (typeof job.stop === 'function') job.stop();
        else if (typeof job === 'object') clearInterval(job._repeat);
      } catch (e) {
        console.error(`Error stopping job ${id}:`, e);
      }
    }
    this.scheduledJobs.clear();
  }
}

module.exports = { SchedulerManager };