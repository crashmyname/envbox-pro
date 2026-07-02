// modules/DatabaseManager.js
// VERSION: No native modules required! Uses sql.js for SQLite
const fs = require('fs-extra');
const path = require('path');
const { spawn, exec } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const net = require('net');

// Lazy load database drivers (only load when needed)
let mysql = null;
let pgClient = null;
let sqlJs = null;

class DatabaseManager {
  constructor(userDataPath) {
    this.userDataPath = userDataPath;
    this.databasesPath = path.join(userDataPath, 'databases');
    this.activeDatabases = new Map();
    this.store = path.join(userDataPath, 'databases.json');
    this.usedPorts = new Set();
    
    this.supportedTypes = ['mysql', 'postgresql', 'sqlite', 'mongodb'];
  }

  async initialize() {
    await fs.ensureDir(this.databasesPath);
    
    for (const type of this.supportedTypes) {
      await fs.ensureDir(path.join(this.databasesPath, type));
    }
    await fs.ensureDir(path.join(this.databasesPath, 'backups'));

    await this.killOrphansFromPreviousSession();
    
    await fs.writeJson(this.store, { databases: [] });
    
    this.loadDrivers().catch(() => {});
  }

  async killOrphansFromPreviousSession() {
      if (!await fs.pathExists(this.store)) return;
      try {
        const store = await fs.readJson(this.store);
        for (const db of (store.databases || [])) {
          if (db.pid && db.status === 'running') {
            console.log(`🧹 Cleaning up orphan process PID ${db.pid} (port ${db.port}) from previous session...`);
            try {
              if (process.platform === 'win32') {
                await this.execCommand(`taskkill /F /T /PID ${db.pid}`);
              } else {
                process.kill(db.pid, 'SIGKILL');
              }
              console.log(`✅ Orphan PID ${db.pid} killed`);
            } catch(e) {
              // Wajar kalau PID sudah tidak ada / sudah mati sendiri
              console.log(`   (PID ${db.pid} sudah tidak aktif)`);
            }
          }
        }
      } catch(e) {
        console.log('Orphan cleanup error:', e.message);
      }
  }

  async loadDrivers() {
    try {
      mysql = require('mysql2/promise');
      console.log('✅ mysql2 driver loaded');
    } catch (e) {
      console.log('⚠️ mysql2 not available');
    }

    try {
      const pg = require('pg');
      pgClient = pg.Client;
      console.log('✅ pg driver loaded');
    } catch (e) {
      console.log('⚠️ pg not available');
    }

    try {
      sqlJs = await require('sql.js')();
      console.log('✅ sql.js loaded');
    } catch (e) {
      console.log('⚠️ sql.js not available');
    }
  }

  // ===== METHOD BARU: CEK PORT PAKAI NETSTAT =====
  async isPortActuallyInUse(port) {
    console.log(`🔍 Checking port ${port}...`);
    
    return new Promise((resolve) => {
      // Gunakan netstat untuk cek apakah port benar-benar listen
      const cmd = process.platform === 'win32' 
        ? `netstat -ano | findstr :${port} | findstr LISTENING`
        : `lsof -i :${port} | grep LISTEN`;
      
      exec(cmd, (error, stdout) => {
        if (error || !stdout || stdout.trim() === '') {
          // Double check dengan coba bind
          const tester = net.createServer();
          tester.once('error', () => {
            console.log(`❌ Port ${port} IS IN USE (bind failed)`);
            resolve(true);
          });
          tester.once('listening', () => {
            tester.close(() => {
              console.log(`✅ Port ${port} is FREE`);
              resolve(false);
            });
          });
          setTimeout(() => {
            tester.close();
            console.log(`⚠️ Port ${port} check timeout, assuming FREE`);
            resolve(false);
          }, 2000);
          tester.listen(port, '127.0.0.1');
        } else {
          console.log(`❌ Port ${port} IS LISTENING:\n${stdout.trim()}`);
          resolve(true);
        }
      });
    });
  }

  async start(config) {
    const { type, version, port = 3306, projectId } = config;
    
    console.log(`\n📌 Request to start ${type} on port ${port}`);
    
    // 1. Cek EnvBox internal
    if (this.usedPorts.has(port)) {
      const altPort = await this.findAvailablePort(3307);
      throw new Error(
        `❌ PORT ${port} SUDAH DIGUNAKAN ENVBOX!\n\n` +
        `📌 Silakan gunakan port lain: ${altPort || 'tidak tersedia'}`
      );
    }

    // 2. Cek sistem (netstat + bind test)
    const portInUse = await this.isPortActuallyInUse(port);
    if (portInUse) {
      const altPort = await this.findAvailablePort(3307);
      throw new Error(
        `❌ PORT ${port} SUDAH DIPAKAI!\n\n` +
        `Port ${port} sedang digunakan oleh service lain.\n` +
        `Silakan stop service tersebut atau gunakan port lain.\n\n` +
        `📌 Port tersedia: ${altPort || 'tidak ada'}\n` +
        `💡 Masukkan port di kolom PORT (contoh: ${altPort || 3307})`
      );
    }

    // Port aman
    this.usedPorts.add(port);
    console.log(`Port ${port} reserved for EnvBox`);
    
    const dbId = uuidv4();
    const dataDir = path.join(this.databasesPath, type, dbId);
    await fs.ensureDir(dataDir);

    let database;
    try {
      switch (type) {
        case 'mysql':
          database = await this.startMySQL(dbId, version, port, dataDir);
          break;
        case 'postgresql':
          database = await this.startPostgreSQL(dbId, version, port, dataDir);
          break;
        case 'sqlite':
          database = await this.startSQLite(dbId, dataDir);
          break;
        case 'mongodb':
          database = await this.startMongoDB(dbId, version, port, dataDir);
          break;
        default:
          throw new Error(`Unknown type: ${type}`);
      }
    } catch (error) {
      this.usedPorts.delete(port);
      throw error;
    }

    database.projectId = projectId;
    this.activeDatabases.set(dbId, database);

    await this.saveToStore(dbId, { 
      type, version, port, projectId, 
      status: database.simulated ? 'simulated' : 'running',
      pid: database.process ? database.process.pid : null
    });

    return { dbId, ...database };
  }

  async findAvailablePort(startPort = 3306) {
    let port = startPort;
    const maxPort = 3360;
    
    while (port <= maxPort) {
      if (this.usedPorts.has(port)) {
        port++;
        continue;
      }
      
      const inUse = await this.isPortActuallyInUse(port);
      if (!inUse) {
        return port;
      }
      port++;
    }
    
    return null;
  }

  async startMySQL(dbId, version, port, dataDir) {
    const mysqlBin = await this.findMySQLBinary();
    
    if (!mysqlBin) {
        this.usedPorts.delete(port);
        return {
            id: dbId, type: 'mysql', version: version || '8.0', port,
            dataDir, process: null, simulated: true,
            connectionString: `mysql://root@localhost:${port}`,
            message: 'MySQL binary not found.'
        };
    }

    const mysqlBaseDir = path.dirname(path.dirname(mysqlBin));
    const pluginDir = path.join(mysqlBaseDir, 'lib', 'plugin');
    
    if (!await fs.pathExists(pluginDir)) {
        this.usedPorts.delete(port);
        return {
            id: dbId, type: 'mysql', version: version || '8.0', port,
            dataDir, process: null, simulated: true,
            connectionString: `mysql://root@localhost:${port}`,
            message: 'MySQL incomplete.'
        };
    }

    try {
      await this.execCommand(`"${mysqlBin}" --version`);
    } catch (e) {
      this.usedPorts.delete(port);
      return {
        id: dbId, type: 'mysql', version: version || '8.0', port,
        dataDir, process: null, simulated: true,
        connectionString: `mysql://root@localhost:${port}`,
        message: 'MySQL binary error.'
      };
    }

    // Init data dir
    if (!await fs.pathExists(path.join(dataDir, 'mysql'))) {
        console.log('🔧 Initializing MySQL data directory...');
        try {
          await this.execCommand(
            `"${mysqlBin}" --initialize-insecure --basedir="${mysqlBaseDir}" --datadir="${dataDir}"`
          );
          console.log('✅ MySQL initialized');
        } catch (e) {
          this.usedPorts.delete(port);
          return {
            id: dbId, type: 'mysql', version: version || '8.0', port,
            dataDir, process: null, simulated: true,
            connectionString: `mysql://root@localhost:${port}`,
            message: 'MySQL init failed.'
          };
        }
    }

    const myIniPath = path.join(dataDir, 'my.ini');
    const myIniContent = `[mysqld]
port=${port}
datadir=${dataDir.replace(/\\/g, '/')}
basedir=${mysqlBaseDir.replace(/\\/g, '/')}
plugin-dir=${pluginDir.replace(/\\/g, '/')}
log-error=${path.join(dataDir, 'error.log').replace(/\\/g, '/')}
max_connections=100
bind-address=127.0.0.1
secure-file-priv=NULL
skip-mysqlx
`;

    await fs.writeFile(myIniPath, myIniContent);
    console.log('✅ my.ini created:', myIniPath);

    console.log(`🚀 Starting MySQL on port ${port}...`);

    // ✅ HANYA pakai --defaults-file, HARUS jadi argumen PERTAMA.
    // Jangan campur dengan opsi lain di command line.
    const mysqlProcess = spawn(mysqlBin, [
        `--defaults-file=${myIniPath}`,
        '--console',
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
      env: {
        ...process.env,
        MYSQL_HOME: mysqlBaseDir,
        PATH: `${path.join(mysqlBaseDir, 'bin')};${process.env.PATH}`
      }
    });

    let errorLog = '';

    mysqlProcess.stdout.on('data', (data) => {
      const msg = data.toString().trim();
      console.log(`[MySQL:${port}] ${msg}`);
    });
    
    mysqlProcess.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) {
        errorLog += msg + '\n';
        console.log(`[MySQL:${port}] ${msg}`);
      }
    });

    mysqlProcess.on('error', (err) => {
      errorLog += err.message;
      console.error(`[MySQL:${port}] Error:`, err.message);
    });

    // Tunggu startup
    await new Promise(resolve => setTimeout(resolve, 10000));

    const exited = mysqlProcess.killed || mysqlProcess.exitCode !== null;
    
    if (exited) {
      console.log(`❌ MySQL exited with code ${mysqlProcess.exitCode}`);
      try { mysqlProcess.kill('SIGKILL'); } catch(e) {}
      this.usedPorts.delete(port);
      
      return {
        id: dbId, type: 'mysql', version: version || '8.0', port,
        dataDir, process: null, simulated: true,
        connectionString: `mysql://root@localhost:${port}`,
        message: errorLog ? `Error: ${errorLog.split('\n').find(l => l.includes('ERROR')) || 'MySQL failed'}` : 'MySQL failed to start.'
      };
    }

    // Test koneksi TCP
    const canConnect = await this.waitForMySQL(port, 5000);
    
    if (canConnect) {
      console.log(`✅ MySQL READY on TCP port ${port}`);
      return {
        id: dbId, type: 'mysql', version: version || '8.0', port,
        dataDir, process: mysqlProcess, simulated: false,
        connectionString: `mysql://root@localhost:${port}`
      };
    }

    console.log('⚠️ MySQL timeout');
    try { mysqlProcess.kill('SIGTERM'); } catch(e) {}
    await new Promise(resolve => setTimeout(resolve, 2000));
    try { mysqlProcess.kill('SIGKILL'); } catch(e) {}
    this.usedPorts.delete(port);
    
    return {
      id: dbId, type: 'mysql', version: version || '8.0', port,
      dataDir, process: null, simulated: true,
      connectionString: `mysql://root@localhost:${port}`,
      message: 'MySQL startup timeout.'
    };
}

  async stop(dbId) {
      const db = this.activeDatabases.get(dbId);
      if (!db) return { stopped: false, dbId };

      if (db.process && !db.simulated) {
        const pid = db.process.pid;
        try {
          if (process.platform === 'win32') {
            await this.execCommand(`taskkill /F /T /PID ${pid}`);
          } else {
            db.process.kill('SIGTERM');
            await new Promise(r => setTimeout(r, 2000));
            try { db.process.kill('SIGKILL'); } catch(e) {}
          }
        } catch(e) {
          console.log(`stop() kill error for PID ${pid}:`, e.message);
        }
      }

      if (db.port) this.usedPorts.delete(db.port);
      this.activeDatabases.delete(dbId);
      await this.updateStoreStatus(dbId, 'stopped');

      return { stopped: true, dbId };
  }

  async createDatabase(dbId, dbName) {
    const db = this.activeDatabases.get(dbId);
    if (!db || db.simulated) {
      return { created: true, database: dbName, note: 'Simulated' };
    }
    if (db.type === 'mysql' && mysql) {
      const conn = await mysql.createConnection({
        host: 'localhost', port: db.port, user: 'root'
      });
      await conn.execute(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
      await conn.end();
    }
    return { created: true, database: dbName };
  }

  async executeQuery(dbId, query) {
    const db = this.activeDatabases.get(dbId);
    if (!db || db.simulated) return this.getSimulatedQueryResult(query);

    if (db.type === 'mysql' && mysql) {
      try {
        const conn = await mysql.createConnection({
          host: '127.0.0.1', port: db.port, user: 'root'
        });
        const [results] = await conn.execute(query);
        await conn.end();
        return results;
      } catch(e) {
        return [{ error: e.message }];
      }
    }
    return this.getSimulatedQueryResult(query);
  }

  getSimulatedQueryResult(query) {
    const q = query.toUpperCase().trim();
    if (q.startsWith('SELECT 1')) return [{ '1': 1 }];
    if (q.startsWith('SHOW DATABASES')) {
      return [{ Database: 'envbox_db' }, { Database: 'test' }];
    }
    if (q.startsWith('SELECT VERSION')) {
      return [{ 'VERSION()': '8.0.46-EnvBox' }];
    }
    return [{ message: 'Simulated result', query: q.substring(0, 50) }];
  }

  async list() {
    await fs.ensureDir(path.dirname(this.store));
    if (!await fs.pathExists(this.store)) return [];
    try {
      const store = await fs.readJson(this.store);
      const activeIds = [...this.activeDatabases.keys()];
      return (store.databases || []).filter(d => activeIds.includes(d.id));
    } catch(e) { return []; }
  }

  async delete(dbId) {
    await this.stop(dbId).catch(() => {});
    await fs.ensureDir(path.dirname(this.store));
    if (!await fs.pathExists(this.store)) return { deleted: true };
    const store = await fs.readJson(this.store);
    store.databases = store.databases.filter(d => d.id !== dbId);
    await fs.writeJson(this.store, store);
    return { deleted: true };
  }

  async findMySQLBinary() {
    const envMysqlDir = path.join(__dirname, '..', 'environments', 'mysql');
    if (await fs.pathExists(envMysqlDir)) {
      const items = await fs.readdir(envMysqlDir);
      for (const item of items) {
        const itemPath = path.join(envMysqlDir, item);
        if ((await fs.stat(itemPath)).isDirectory()) {
          const mysqld = path.join(itemPath, 'bin', 'mysqld.exe');
          const plugin = path.join(itemPath, 'lib', 'plugin');
          if (await fs.pathExists(mysqld) && await fs.pathExists(plugin)) {
            console.log(`✅ Complete MySQL: ${mysqld}`);
            return mysqld;
          }
        }
      }
    }
    return null;
  }

  async waitForMySQL(port, timeout) {
    if (!mysql) return false;
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const conn = await mysql.createConnection({
          host: '127.0.0.1', port, user: 'root', connectTimeout: 2000
        });
        await conn.ping();
        await conn.end();
        return true;
      } catch (e) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
    return false;
  }

  async saveToStore(dbId, data) {
      await fs.ensureDir(path.dirname(this.store));
      let store = { databases: [] };
      if (await fs.pathExists(this.store)) {
        try { store = await fs.readJson(this.store); } catch(e) {}
      }
      store.databases.push({ id: dbId, ...data, createdAt: new Date().toISOString() });
      await fs.writeJson(this.store, store);
  }

  async updateStoreStatus(dbId, status) {
    await fs.ensureDir(path.dirname(this.store));
    if (!await fs.pathExists(this.store)) {
      await fs.writeJson(this.store, { databases: [] });
      return;
    }
    const store = await fs.readJson(this.store);
    const db = store.databases.find(d => d.id === dbId);
    if (db) { db.status = status; await fs.writeJson(this.store, store); }
  }

  execCommand(command) {
    return new Promise((resolve, reject) => {
      exec(command, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout) => {
        if (error) reject(error); else resolve(stdout);
      });
    });
  }

  shutdown() {
    for (const [id, db] of this.activeDatabases) {
      if (db.process && !db.simulated) {
        try { db.process.kill('SIGTERM'); } catch(e) {}
      }
      if (db.port) this.usedPorts.delete(db.port);
    }
    this.activeDatabases.clear();
  }
}

module.exports = { DatabaseManager };