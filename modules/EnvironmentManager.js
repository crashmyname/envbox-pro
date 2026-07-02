// modules/EnvironmentManager.js
const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');

class EnvironmentManager {
  constructor(userDataPath, resourcesPath) {
    this.userDataPath = userDataPath;
    this.resourcesPath = resourcesPath;
    this.environmentsPath = path.join(resourcesPath, 'environments');
    this.projectsPath = path.join(userDataPath, 'projects');
    this.activeProcesses = new Map();
    this.store = path.join(userDataPath, 'environments.json');
  }

  async initialize() {
    await fs.ensureDir(this.projectsPath);
    if (!await fs.pathExists(this.store)) {
      await fs.writeJson(this.store, { environments: [] });
    }
  }

  async create(config) {
    const projectId = uuidv4();
    const {
      name,
      techStack = 'php',
      version,
      port = 8000,
      documentRoot = 'public',
      template,
      enableHTTPS = false,
      enableXDebug = false,
      environmentVariables = {},
      description = ''
    } = config;

    const projectPath = path.join(this.projectsPath, projectId);
    
    // Create project structure
    await this.createProjectStructure(projectPath, techStack, config);
    
    // Generate stack-specific config
    await this.generateStackConfig(projectPath, techStack, version, config);

    // Create envbox.json
    const envConfig = {
      id: projectId,
      name,
      techStack,
      version,
      port,
      documentRoot,
      projectPath,
      template: template || null,
      ssl: enableHTTPS ? { enabled: true } : null,
      xdebug: enableXDebug ? { enabled: true } : null,
      environmentVariables,
      description,
      services: [],
      status: 'stopped',
      createdAt: new Date().toISOString()
    };

    await fs.writeJson(path.join(projectPath, 'envbox.json'), envConfig);

    // Save to store
    await this.addToStore(envConfig);

    return { projectId, config: envConfig };
  }

  async createProjectStructure(projectPath, techStack, config) {
    const commonDirs = ['logs', 'config', 'scripts', 'storage', 'tmp'];
    commonDirs.forEach(dir => fs.ensureDirSync(path.join(projectPath, dir)));

    const stackDirs = {
      php: ['public', 'src', 'tests', 'vendor'],
      nodejs: ['src', 'public', 'tests', 'node_modules'],
      go: ['cmd', 'internal', 'pkg', 'api'],
      python: ['app', 'tests', 'venv'],
      ruby: ['app', 'config', 'lib', 'spec'],
      java: ['src/main/java', 'src/main/resources', 'src/test/java'],
      rust: ['src', 'tests', 'target']
    };

    const dirs = stackDirs[techStack] || ['src', 'public'];
    dirs.forEach(dir => fs.ensureDirSync(path.join(projectPath, dir)));

    // Create document root
    if (config.documentRoot) {
      await fs.ensureDir(path.join(projectPath, config.documentRoot));
    }
  }

  async generateStackConfig(projectPath, techStack, version, config) {
    // Generate default config files based on tech stack
    switch (techStack) {
      case 'php':
        await this.generatePHPConfig(projectPath, version, config);
        break;
      case 'nodejs':
        await this.generateNodeConfig(projectPath, config);
        break;
      case 'go':
        await this.generateGoConfig(projectPath, config);
        break;
      case 'python':
        await this.generatePythonConfig(projectPath, config);
        break;
    }

    // Create .env file
    const envContent = this.generateEnvFile(config);
    await fs.writeFile(path.join(projectPath, '.env'), envContent);
  }

  async generatePHPConfig(projectPath, version, config) {
    const phpIni = `
[PHP]
engine = On
memory_limit = 256M
error_reporting = E_ALL
display_errors = On
log_errors = On
error_log = "${path.join(projectPath, 'logs', 'php_error.log').replace(/\\/g, '\\\\')}"
date.timezone = "Asia/Jakarta"
post_max_size = 64M
upload_max_filesize = 64M
max_execution_time = 300

[opcache]
opcache.enable=1
opcache.memory_consumption=128
opcache.max_accelerated_files=10000
`;
    await fs.writeFile(path.join(projectPath, 'php.ini'), phpIni);
  }

  async generateNodeConfig(projectPath, config) {
    const packageJson = {
      name: config.name.toLowerCase().replace(/\s/g, '-'),
      version: '1.0.0',
      main: 'src/index.js',
      scripts: {
        start: 'node src/index.js',
        dev: 'nodemon src/index.js'
      }
    };
    await fs.writeJson(path.join(projectPath, 'package.json'), packageJson, { spaces: 2 });
  }

  async generateGoConfig(projectPath, config) {
    const goMod = `module ${config.name.toLowerCase().replace(/\\s/g, '-')}\n\ngo 1.21\n`;
    await fs.writeFile(path.join(projectPath, 'go.mod'), goMod);
  }

  async generatePythonConfig(projectPath, config) {
    await fs.writeFile(path.join(projectPath, 'requirements.txt'), '# Add dependencies here\n');
    await fs.writeFile(path.join(projectPath, '.python-version'), config.version || '3.12');
  }

  generateEnvFile(config) {
    return `APP_NAME="${config.name}"
APP_ENV=local
APP_DEBUG=true
APP_URL=http://localhost:${config.port}

${Object.entries(config.environmentVariables || {})
  .map(([key, value]) => `${key}=${value}`)
  .join('\n')}
`;
  }

  async start(projectId) {
    const envConfig = await this.getProjectConfig(projectId);
    if (!envConfig) throw new Error('Project not found');

    const startMethod = `start${envConfig.techStack.charAt(0).toUpperCase() + envConfig.techStack.slice(1)}`;
    
    if (this[startMethod]) {
      return await this[startMethod](projectId, envConfig);
    }
    
    throw new Error(`Unsupported tech stack: ${envConfig.techStack}`);
  }

  async startPhp(projectId, config) {
    const phpBinary = path.join(this.environmentsPath, 'php', config.version, 'php.exe');
    const documentRoot = path.join(config.projectPath, config.documentRoot || 'public');
    const phpIni = path.join(config.projectPath, 'php.ini');

    const process = spawn(phpBinary, [
      '-S', `0.0.0.0:${config.port}`,
      '-t', documentRoot,
      '-c', phpIni
    ], {
      env: { ...process.env, APP_ENV: 'development' },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    this.setupProcessLogging(process, projectId);
    this.activeProcesses.set(projectId, { process, type: 'php', config });
    
    await this.updateProjectStatus(projectId, 'running');

    return {
      status: 'running',
      url: `http://localhost:${config.port}`,
      httpsUrl: config.ssl?.enabled ? `https://localhost:${config.ssl.port || config.port + 443}` : null
    };
  }

  async startNodejs(projectId, config) {
    const nodeBinary = path.join(this.environmentsPath, 'nodejs', config.version, 'node.exe');
    const entryPoint = config.config?.entryPoint || 'src/index.js';

    const process = spawn(nodeBinary, [
      path.join(config.projectPath, entryPoint)
    ], {
      env: { ...process.env, PORT: config.port.toString(), NODE_ENV: 'development' },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    this.setupProcessLogging(process, projectId);
    this.activeProcesses.set(projectId, { process, type: 'nodejs', config });
    
    await this.updateProjectStatus(projectId, 'running');

    return {
      status: 'running',
      url: `http://localhost:${config.port}`
    };
  }

  async startGo(projectId, config) {
    const goBinary = path.join(this.environmentsPath, 'go', config.version, 'bin', 'go.exe');
    
    // Build the Go project
    await this.execCommand(`"${goBinary}" build -o "${path.join(config.projectPath, 'app.exe')}" .`, {
      cwd: config.projectPath
    });

    const process = spawn(path.join(config.projectPath, 'app.exe'), [], {
      env: { ...process.env, PORT: config.port.toString() },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    this.setupProcessLogging(process, projectId);
    this.activeProcesses.set(projectId, { process, type: 'go', config });
    
    await this.updateProjectStatus(projectId, 'running');

    return {
      status: 'running',
      url: `http://localhost:${config.port}`
    };
  }

  async startPython(projectId, config) {
    const pythonBinary = path.join(this.environmentsPath, 'python', config.version, 'python.exe');
    
    const process = spawn(pythonBinary, [
      '-m', 'uvicorn', 'main:app', '--host', '0.0.0.0', '--port', config.port.toString()
    ], {
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
      cwd: config.projectPath,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    this.setupProcessLogging(process, projectId);
    this.activeProcesses.set(projectId, { process, type: 'python', config });
    
    await this.updateProjectStatus(projectId, 'running');

    return {
      status: 'running',
      url: `http://localhost:${config.port}`
    };
  }

  async stop(projectId) {
    const active = this.activeProcesses.get(projectId);
    if (!active) throw new Error('Project not running');

    if (active.process && !active.process.killed) {
      active.process.kill('SIGTERM');
      
      setTimeout(() => {
        if (active.process && !active.process.killed) {
          active.process.kill('SIGKILL');
        }
      }, 5000);
    }

    this.activeProcesses.delete(projectId);
    await this.updateProjectStatus(projectId, 'stopped');

    return { status: 'stopped' };
  }

  async restart(projectId) {
    await this.stop(projectId);
    await new Promise(resolve => setTimeout(resolve, 1000));
    return await this.start(projectId);
  }

  setupProcessLogging(process, projectId) {
    const logDir = path.join(this.projectsPath, projectId, 'logs');
    fs.ensureDirSync(logDir);

    if (process.stdout) {
      const outStream = fs.createWriteStream(path.join(logDir, 'access.log'), { flags: 'a' });
      process.stdout.pipe(outStream);
    }
    
    if (process.stderr) {
      const errStream = fs.createWriteStream(path.join(logDir, 'error.log'), { flags: 'a' });
      process.stderr.pipe(errStream);
    }

    process.on('error', (error) => {
      console.error(`Process ${projectId} error:`, error);
      this.updateProjectStatus(projectId, 'error');
    });

    process.on('exit', (code) => {
      console.log(`Process ${projectId} exited with code ${code}`);
      if (code !== 0) {
        this.updateProjectStatus(projectId, 'error');
      }
    });
  }

  async list() {
    const store = await fs.readJson(this.store);
    return store.environments.map(env => ({
      ...env,
      status: this.activeProcesses.has(env.id) ? 'running' : env.status || 'stopped',
      memoryUsage: Math.floor(Math.random() * 200), // Would be real in production
      cpuUsage: (Math.random() * 10).toFixed(1)
    }));
  }

  async delete(projectId) {
    if (this.activeProcesses.has(projectId)) {
      await this.stop(projectId);
    }

    // Remove from store
    await this.removeFromStore(projectId);

    // Delete project files
    const projectPath = path.join(this.projectsPath, projectId);
    if (await fs.pathExists(projectPath)) {
      await fs.remove(projectPath);
    }

    return { deleted: true };
  }

  async clone(projectId, newName) {
    const config = await this.getProjectConfig(projectId);
    if (!config) throw new Error('Project not found');

    const newId = uuidv4();
    const newPath = path.join(this.projectsPath, newId);

    // Copy project files
    await fs.copy(config.projectPath, newPath);

    // Update config
    const newConfig = {
      ...config,
      id: newId,
      name: newName,
      projectPath: newPath,
      port: config.port + 1,
      createdAt: new Date().toISOString()
    };

    await fs.writeJson(path.join(newPath, 'envbox.json'), newConfig);
    await this.addToStore(newConfig);

    return { projectId: newId, config: newConfig };
  }

  async getProjectConfig(projectId) {
    const configPath = path.join(this.projectsPath, projectId, 'envbox.json');
    if (await fs.pathExists(configPath)) {
      return await fs.readJson(configPath);
    }
    return null;
  }

  async addToStore(config) {
    const store = await fs.readJson(this.store);
    store.environments.push(config);
    await fs.writeJson(this.store, store);
  }

  async removeFromStore(projectId) {
    const store = await fs.readJson(this.store);
    store.environments = store.environments.filter(e => e.id !== projectId);
    await fs.writeJson(this.store, store);
  }

  async updateProjectStatus(projectId, status) {
    const store = await fs.readJson(this.store);
    const project = store.environments.find(e => e.id === projectId);
    if (project) {
      project.status = status;
      await fs.writeJson(this.store, store);
    }
  }

  execCommand(command, options = {}) {
    return new Promise((resolve, reject) => {
      const { exec } = require('child_process');
      exec(command, options, (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout);
      });
    });
  }

  cleanup() {
    for (const [id, active] of this.activeProcesses) {
      if (active.process && !active.process.killed) {
        active.process.kill('SIGTERM');
      }
    }
    this.activeProcesses.clear();
  }
}

module.exports = { EnvironmentManager };