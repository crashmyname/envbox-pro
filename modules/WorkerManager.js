// modules/WorkerManager.js
const fs = require('fs-extra');
const path = require('path');
const { spawn, fork } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const { EventEmitter } = require('events');

class WorkerManager extends EventEmitter {
  constructor(userDataPath) {
    super();
    this.userDataPath = userDataPath;
    this.workersPath = path.join(userDataPath, 'workers');
    this.workers = new Map();
    this.store = path.join(userDataPath, 'workers.json');
  }

  async initialize() {
    await fs.ensureDir(this.workersPath);
    await fs.ensureDir(path.join(this.workersPath, 'logs'));
    
    if (!await fs.pathExists(this.store)) {
      await fs.writeJson(this.store, { workers: [] });
    }

    await this.loadWorkers();
  }

  async create(config) {
    const workerId = uuidv4();
    const {
      name,
      script,
      type = 'process', // process, fork, cluster
      instances = 1,
      projectId,
      autoRestart = true,
      maxRestarts = 10,
      restartDelay = 1000,
      env = {},
      args = [],
      watch = false
    } = config;

    const workerConfig = {
      id: workerId,
      name,
      script,
      type,
      instances,
      projectId,
      autoRestart,
      maxRestarts,
      restartDelay,
      env,
      args,
      watch,
      status: 'created',
      processes: [],
      restarts: 0,
      createdAt: new Date().toISOString()
    };

    // Save config
    await fs.writeJson(
      path.join(this.workersPath, `${workerId}.json`),
      workerConfig,
      { spaces: 2 }
    );

    this.workers.set(workerId, workerConfig);

    return workerConfig;
  }

  async start(workerId) {
    const config = this.workers.get(workerId);
    if (!config) {
      config = await this.loadWorker(workerId);
      if (!config) throw new Error(`Worker ${workerId} not found`);
    }

    const processes = [];

    // Start multiple instances
    for (let i = 0; i < config.instances; i++) {
      const process = await this.startInstance(config, i);
      processes.push(process);
    }

    config.processes = processes;
    config.status = 'running';
    this.workers.set(workerId, config);

    await this.saveWorker(workerId);

    this.emit('worker:started', { workerId, instances: processes.length });

    return { started: true, workerId, instances: processes.length };
  }

  async startInstance(config, instanceIndex = 0) {
    const workerProcess = {
      id: uuidv4(),
      instanceIndex,
      pid: null,
      startTime: new Date(),
      status: 'starting'
    };

    let childProcess;

    switch (config.type) {
      case 'fork':
        childProcess = fork(config.script, config.args, {
          env: { ...process.env, ...config.env, WORKER_INSTANCE: instanceIndex.toString() },
          silent: true
        });
        break;

      case 'process':
      default:
        childProcess = spawn('node', [config.script, ...config.args], {
          env: { ...process.env, ...config.env, WORKER_INSTANCE: instanceIndex.toString() },
          stdio: ['pipe', 'pipe', 'pipe']
        });
        break;
    }

    workerProcess.process = childProcess;
    workerProcess.pid = childProcess.pid;

    // Handle output
    const logFile = path.join(
      this.workersPath, 'logs',
      `${config.id}_${instanceIndex}.log`
    );
    const logStream = fs.createWriteStream(logFile, { flags: 'a' });

    if (childProcess.stdout) {
      childProcess.stdout.pipe(logStream);
      childProcess.stdout.on('data', (data) => {
        this.emit('worker:output', {
          workerId: config.id,
          instance: instanceIndex,
          data: data.toString()
        });
      });
    }

    if (childProcess.stderr) {
      childProcess.stderr.pipe(logStream);
      childProcess.stderr.on('data', (data) => {
        this.emit('worker:error', {
          workerId: config.id,
          instance: instanceIndex,
          data: data.toString()
        });
      });
    }

    // Handle process events
    childProcess.on('error', (error) => {
      workerProcess.status = 'error';
      this.emit('worker:error', {
        workerId: config.id,
        instance: instanceIndex,
        error: error.message
      });
    });

    childProcess.on('exit', (code, signal) => {
      workerProcess.status = 'exited';
      workerProcess.exitCode = code;
      workerProcess.exitSignal = signal;

      this.emit('worker:exit', {
        workerId: config.id,
        instance: instanceIndex,
        code,
        signal
      });

      // Auto-restart logic
      if (config.autoRestart && config.restarts < config.maxRestarts) {
        config.restarts++;
        
        setTimeout(async () => {
          console.log(`Auto-restarting worker ${config.id} instance ${instanceIndex}`);
          const newProcess = await this.startInstance(config, instanceIndex);
          
          // Replace the old process in the config
          const idx = config.processes.findIndex(p => p.id === workerProcess.id);
          if (idx !== -1) {
            config.processes[idx] = newProcess;
          }
          
          this.workers.set(config.id, config);
          this.saveWorker(config.id);
        }, config.restartDelay);
      }
    });

    // Wait for process to be ready
    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        workerProcess.status = 'running';
        resolve();
      }, 1000);

      childProcess.on('message', (msg) => {
        if (msg === 'ready' || msg.type === 'ready') {
          workerProcess.status = 'running';
          clearTimeout(timeout);
          resolve();
        }
      });
    });

    return workerProcess;
  }

  async stop(workerId) {
    const config = this.workers.get(workerId);
    if (!config) throw new Error(`Worker ${workerId} not found`);

    config.autoRestart = false; // Prevent auto-restart during shutdown

    for (const process of config.processes) {
      if (process.process && !process.process.killed) {
        // Graceful shutdown
        if (process.process.send) {
          process.process.send({ type: 'shutdown' });
        }

        // Wait a bit then force kill
        setTimeout(() => {
          if (!process.process.killed) {
            process.process.kill('SIGTERM');
          }
        }, 3000);

        // Force kill after timeout
        setTimeout(() => {
          if (!process.process.killed) {
            process.process.kill('SIGKILL');
          }
        }, 5000);
      }
    }

    config.status = 'stopped';
    config.processes = [];
    await this.saveWorker(workerId);

    this.emit('worker:stopped', { workerId });

    return { stopped: true, workerId };
  }

  async scale(workerId, instances) {
    const config = this.workers.get(workerId);
    if (!config) throw new Error(`Worker ${workerId} not found`);

    const current = config.processes.length;
    
    if (instances > current) {
      // Scale up
      for (let i = current; i < instances; i++) {
        const process = await this.startInstance(config, i);
        config.processes.push(process);
      }
    } else if (instances < current) {
      // Scale down
      const toRemove = config.processes.splice(instances);
      for (const process of toRemove) {
        if (process.process && !process.process.killed) {
          process.process.kill('SIGTERM');
        }
      }
    }

    config.instances = instances;
    await this.saveWorker(workerId);

    this.emit('worker:scaled', {
      workerId,
      previous: current,
      current: instances
    });

    return { scaled: true, workerId, instances };
  }

  async getLogs(workerId, instanceIndex = 0, lines = 100) {
    const logFile = path.join(
      this.workersPath, 'logs',
      `${workerId}_${instanceIndex}.log`
    );

    if (!await fs.pathExists(logFile)) return [];

    const content = await fs.readFile(logFile, 'utf8');
    return content.split('\n').slice(-lines);
  }

  async list() {
    const workers = [];
    for (const [id, config] of this.workers) {
      workers.push({
        id,
        name: config.name,
        status: config.status,
        instances: config.processes.length,
        restarts: config.restarts,
        script: config.script
      });
    }
    return workers;
  }

  async delete(workerId) {
    await this.stop(workerId);
    this.workers.delete(workerId);

    const filePath = path.join(this.workersPath, `${workerId}.json`);
    if (await fs.pathExists(filePath)) {
      await fs.remove(filePath);
    }

    return { deleted: true };
  }

  async saveWorker(workerId) {
    const config = this.workers.get(workerId);
    if (config) {
      // Don't save process objects
      const toSave = {
        ...config,
        processes: config.processes.map(p => ({
          id: p.id,
          instanceIndex: p.instanceIndex,
          pid: p.pid,
          status: p.status,
          startTime: p.startTime
        }))
      };
      
      await fs.writeJson(
        path.join(this.workersPath, `${workerId}.json`),
        toSave,
        { spaces: 2 }
      );
    }
  }

  async loadWorker(workerId) {
    const filePath = path.join(this.workersPath, `${workerId}.json`);
    if (await fs.pathExists(filePath)) {
      const config = await fs.readJson(filePath);
      config.processes = [];
      this.workers.set(workerId, config);
      return config;
    }
    return null;
  }

  async loadWorkers() {
    if (!await fs.pathExists(this.workersPath)) return;

    const files = await fs.readdir(this.workersPath);
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        const workerId = file.replace('.json', '');
        await this.loadWorker(workerId);
      }
    }
  }

  shutdown() {
    for (const [id, config] of this.workers) {
      for (const process of config.processes) {
        if (process.process && !process.process.killed) {
          process.process.kill('SIGTERM');
        }
      }
    }
    this.workers.clear();
  }
}

module.exports = { WorkerManager };