// modules/QueueManager.js
const fs = require('fs-extra');
const path = require('path');
const { EventEmitter } = require('events');
const { v4: uuidv4 } = require('uuid');

class QueueManager extends EventEmitter {
  constructor(userDataPath, resourcesPath) {
    super();
    this.userDataPath = userDataPath;
    this.resourcesPath = resourcesPath;
    this.queuesPath = path.join(userDataPath, 'queues');
    this.activeQueues = new Map();
    this.store = path.join(userDataPath, 'queues.json');
  }

  async initialize() {
    await fs.ensureDir(this.queuesPath);
    await fs.ensureDir(path.join(this.queuesPath, 'data'));
    await fs.ensureDir(path.join(this.queuesPath, 'logs'));
    
    if (!await fs.pathExists(this.store)) {
      await fs.writeJson(this.store, { queues: [] });
    }

    await this.loadQueues();
  }

  async startQueue(config) {
      const queueId = uuidv4();
      const { name, type = 'redis', projectId, options = {} } = config;

      const queue = {
          id: queueId,
          name: name || `queue-${queueId.slice(0, 8)}`,
          type,
          projectId,
          status: 'starting',
          jobs: [],
          processed: 0,
          failed: 0,
          workers: 0,
          config: options,
          createdAt: new Date().toISOString()
      };

      switch (type) {
          case 'redis':
              await this.startRedisQueue(queue, options);
              break;
          case 'sync':
              break;
          default:
              throw new Error(`Unsupported queue type: ${type}`);
      }

      queue.status = 'running';
      this.activeQueues.set(queueId, queue);
      await this.saveToStore(queue);

      this.emit('queue:started', { queueId, name: queue.name });

      // ✅ Return object yang BERSIH (gak ada redis/worker)
      return {
          queueId: queue.id,
          id: queue.id,
          name: queue.name,
          type: queue.type,
          projectId: queue.projectId,
          status: queue.status,
          processed: queue.processed,
          failed: queue.failed,
          workers: queue.workers,
          createdAt: queue.createdAt
      };
  }

  async startRedisQueue(queue, options) {
    const Redis = require('ioredis');
    
    const redis = new Redis({
      host: options.redisHost || '127.0.0.1',
      port: options.redisPort || 6379,
      password: options.redisPassword,
      db: options.redisDb || 0
    });

    queue.redis = redis;
    queue.worker = this.createWorker(queue);
  }

  createWorker(queue) {
    const worker = {
      processing: false,
      concurrency: queue.config.concurrency || 1
    };

    return worker;
  }

  async addJob(queueId, job) {
      const queue = this.activeQueues.get(queueId);
      if (!queue) throw new Error('Queue not found');

      const jobData = {
          id: uuidv4(),
          queueId,
          data: job.data || {},
          type: job.type || 'default',
          priority: job.priority || 0,
          attempts: 0,
          maxAttempts: job.maxAttempts || 3,
          status: 'pending',
          createdAt: new Date().toISOString()
      };

      queue.jobs.push(jobData);
      await this.saveJob(queueId, jobData);
      this.emit('job:added', { queueId, jobId: jobData.id });

      if (!job.delay) {
          this.processJob(queue, jobData);
      } else {
          setTimeout(() => this.processJob(queue, jobData), job.delay);
      }

      // ✅ Return object bersih
      return {
          jobId: jobData.id,
          id: jobData.id,
          type: jobData.type,
          status: jobData.status,
          createdAt: jobData.createdAt
      };
  }

  async processJob(queue, job) {
    job.status = 'processing';
    job.attempts++;
    job.startedAt = new Date().toISOString();

    this.emit('job:processing', { queueId: queue.id, jobId: job.id });

    try {
      // Simulate job processing
      await new Promise((resolve) => {
        const processingTime = Math.random() * 2000 + 500; // 500-2500ms
        setTimeout(resolve, processingTime);
      });

      job.status = 'completed';
      job.completedAt = new Date().toISOString();
      queue.processed++;

      this.emit('job:completed', { queueId: queue.id, jobId: job.id });
    } catch (error) {
      job.status = 'failed';
      job.error = error.message;
      job.failedAt = new Date().toISOString();
      queue.failed++;

      this.emit('job:failed', { queueId: queue.id, jobId: job.id, error: error.message });

      // Retry if attempts remaining
      if (job.attempts < job.maxAttempts) {
        setTimeout(() => {
          this.processJob(queue, job);
        }, 5000 * job.attempts); // Exponential backoff
      }
    }

    // Save updated job
    await this.saveJob(queue.id, job);
  }

  async process(queueId) {
    const queue = this.activeQueues.get(queueId);
    if (!queue) throw new Error('Queue not found');

    const pendingJobs = queue.jobs.filter(j => j.status === 'pending');
    
    for (const job of pendingJobs) {
      this.processJob(queue, job);
    }

    return { processing: pendingJobs.length };
  }

  async getStats(queueId) {
      const queue = this.activeQueues.get(queueId);
      if (!queue) throw new Error('Queue not found');

      // ✅ Return plain object
      return {
          id: queue.id,
          name: queue.name,
          type: queue.type,
          status: queue.status,
          total: (queue.jobs || []).length,
          pending: (queue.jobs || []).filter(j => j.status === 'pending').length,
          processing: (queue.jobs || []).filter(j => j.status === 'processing').length,
          completed: queue.processed || 0,
          failed: queue.failed || 0,
          workers: queue.workers || 0
      };
  }

  async purge(queueId) {
    const queue = this.activeQueues.get(queueId);
    if (!queue) throw new Error('Queue not found');

    const pendingCount = queue.jobs.filter(j => j.status === 'pending').length;
    queue.jobs = queue.jobs.filter(j => j.status !== 'pending');

    this.emit('queue:purged', { queueId, cleared: pendingCount });

    return { purged: pendingCount };
  }

  async stopQueue(queueId) {
    const queue = this.activeQueues.get(queueId);
    if (!queue) throw new Error('Queue not found');

    if (queue.redis) {
      await queue.redis.quit();
    }

    queue.status = 'stopped';
    this.activeQueues.delete(queueId);

    this.emit('queue:stopped', { queueId });

    return { stopped: true };
  }

  async list() {
    const queues = [];
    for (const [id, queue] of this.activeQueues) {
      queues.push({
        id,
        name: queue.name,
        type: queue.type,
        status: queue.status,
        total: queue.jobs.length,
        processed: queue.processed,
        failed: queue.failed
      });
    }
    return queues;
  }

  async delete(queueId) {
    await this.stopQueue(queueId);

    const store = await fs.readJson(this.store);
    store.queues = store.queues.filter(q => q.id !== queueId);
    await fs.writeJson(this.store, store);

    return { deleted: true };
  }

  async saveJob(queueId, job) {
    const jobPath = path.join(this.queuesPath, 'data', `${queueId}_${job.id}.json`);
    await fs.writeJson(jobPath, job);
  }

  async saveToStore(queue) {
    const store = await fs.readJson(this.store);
    const { redis, worker, jobs, ...queueData } = queue;
    store.queues.push(queueData);
    await fs.writeJson(this.store, store);
  }

  async loadQueues() {
    if (!await fs.pathExists(this.store)) return;

    const store = await fs.readJson(this.store);
    for (const queueData of store.queues) {
      if (queueData.status === 'running') {
        queueData.status = 'stopped';
      }
      this.activeQueues.set(queueData.id, { ...queueData, jobs: [], processed: 0, failed: 0 });
    }
  }

  shutdown() {
    for (const [id, queue] of this.activeQueues) {
      if (queue.redis) {
        queue.redis.quit();
      }
    }
    this.activeQueues.clear();
  }
}

module.exports = { QueueManager };