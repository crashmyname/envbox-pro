// modules/BackupManager.js
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const archiver = require('archiver');

class BackupManager {
  constructor(userDataPath) {
    this.userDataPath = userDataPath;
    this.backupsPath = path.join(userDataPath, 'backups');
    this.schedules = new Map();
  }

  async initialize() {
    await fs.ensureDir(this.backupsPath);
    await fs.ensureDir(path.join(this.backupsPath, 'projects'));
    await fs.ensureDir(path.join(this.backupsPath, 'databases'));
    await fs.ensureDir(path.join(this.backupsPath, 'configs'));
  }

  async create(config) {
    const backupId = uuidv4();
    const {
      type = 'full', // full, database, files, config
      projectId,
      includeDatabase = true,
      compress = true,
      encrypt = false,
      encryptionKey
    } = config;

    const backup = {
      id: backupId,
      type,
      projectId,
      timestamp: new Date().toISOString(),
      status: 'in_progress',
      files: []
    };

    const backupDir = path.join(this.backupsPath, 'projects', backupId);
    await fs.ensureDir(backupDir);

    if (type === 'full' || type === 'files') {
      // Backup project files
      const project = await this.getProject(projectId);
      if (project) {
        await this.backupFiles(project.path, backupDir, compress);
        backup.files.push({ type: 'files', path: backupDir });
      }
    }

    if ((type === 'full' || type === 'database') && includeDatabase) {
      // Backup databases
      const dbBackup = await this.backupDatabases(projectId, backupDir);
      if (dbBackup) {
        backup.files.push({ type: 'database', path: dbBackup });
      }
    }

    if (type === 'full' || type === 'config') {
      // Backup configurations
      const configBackup = await this.backupConfigs(projectId, backupDir);
      if (configBackup) {
        backup.files.push({ type: 'config', path: configBackup });
      }
    }

    // Compress entire backup
    if (compress) {
      const zipPath = path.join(this.backupsPath, 'projects', `${backupId}.zip`);
      await this.createZip(backupDir, zipPath);
      await fs.remove(backupDir);
      backup.compressedPath = zipPath;
    }

    // Encrypt if requested
    if (encrypt && encryptionKey) {
      await this.encryptBackup(backup.compressedPath || backupDir, encryptionKey);
    }

    backup.status = 'completed';
    backup.size = await this.getBackupSize(backup);

    // Save backup metadata
    await fs.writeJson(
      path.join(this.backupsPath, 'projects', `${backupId}.json`),
      backup,
      { spaces: 2 }
    );

    return backup;
  }

  async backupFiles(sourcePath, targetDir, compress) {
    const exclude = ['node_modules', 'vendor', '.git', 'storage/logs', 'storage/framework/cache'];
    
    const copy = async (src, dest) => {
      const entries = await fs.readdir(src, { withFileTypes: true });
      
      for (const entry of entries) {
        if (exclude.includes(entry.name)) continue;
        
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        
        if (entry.isDirectory()) {
          await fs.ensureDir(destPath);
          await copy(srcPath, destPath);
        } else {
          await fs.copy(srcPath, destPath);
        }
      }
    };

    await copy(sourcePath, path.join(targetDir, 'files'));
  }

  async backupDatabases(projectId, targetDir) {
    const dbDir = path.join(targetDir, 'databases');
    await fs.ensureDir(dbDir);
    let backedUp = false;

    // MySQL backup
    try {
      // Cek apakah MySQL running dulu
      const mysql = require('mysql2/promise');
      const conn = await mysql.createConnection({
        host: '127.0.0.1',
        port: 3306,
        user: 'root',
        connectTimeout: 2000
      });
      await conn.ping();
      await conn.end();
      
      // MySQL available, do backup
      await this.execCommand(
        `mysqldump -h 127.0.0.1 -P 3306 -u root --all-databases > "${path.join(dbDir, 'mysql_backup.sql')}"`,
        { timeout: 30000 }
      );
      console.log('✅ MySQL backup created');
      backedUp = true;
    } catch (e) {
      console.log('⚠️ MySQL not available, backup skipped');
    }

    // PostgreSQL backup
    try {
      await this.execCommand(
        `pg_dumpall -h 127.0.0.1 -p 5432 -U postgres > "${path.join(dbDir, 'postgresql_backup.sql')}"`,
        { timeout: 30000 }
      );
      console.log('✅ PostgreSQL backup created');
      backedUp = true;
    } catch (e) {
      console.log('⚠️ PostgreSQL not available, backup skipped');
    }

    // SQLite backup (kalau ada)
    try {
      const project = await this.getProject(projectId);
      if (project) {
        const sqliteFiles = await this.findFiles(project.path || '', '.sqlite');
        for (const file of sqliteFiles) {
          const destFile = path.join(dbDir, path.basename(file));
          await fs.copy(file, destFile);
          console.log('✅ SQLite backup created:', path.basename(file));
          backedUp = true;
        }
      }
    } catch (e) {
      console.log('⚠️ SQLite backup skipped');
    }

    return backedUp ? dbDir : null;
  }

  async findFiles(dir, ext) {
    const files = [];
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          files.push(...await this.findFiles(fullPath, ext));
        } else if (entry.isFile() && entry.name.endsWith(ext)) {
          files.push(fullPath);
        }
      }
    } catch(e) {}
    return files;
  }

  async backupConfigs(projectId, targetDir) {
    const configDir = path.join(targetDir, 'configs');
    await fs.ensureDir(configDir);

    // Backup envbox.json and other configs
    const project = await this.getProject(projectId);
    if (project) {
      const configFiles = ['envbox.json', '.env', 'php.ini', 'package.json', 'composer.json'];
      
      for (const file of configFiles) {
        const srcPath = path.join(project.path, file);
        if (await fs.pathExists(srcPath)) {
          await fs.copy(srcPath, path.join(configDir, file));
        }
      }
    }

    return configDir;
  }

  async restore(backupId) {
    const metadataPath = path.join(this.backupsPath, 'projects', `${backupId}.json`);
    if (!await fs.pathExists(metadataPath)) {
      throw new Error('Backup not found');
    }

    const backup = await fs.readJson(metadataPath);

    if (backup.compressedPath) {
      // Extract zip
      const extractDir = path.join(this.backupsPath, 'projects', backupId);
      await this.extractZip(backup.compressedPath, extractDir);
    }

    // Restore files, databases, configs
    // ... restoration logic

    return { restored: true, backupId };
  }

  async schedule(config) {
    const { projectId, frequency = 'daily', time = '00:00', retentionDays = 30 } = config;
    
    const schedule = {
      projectId,
      frequency,
      time,
      retentionDays,
      lastBackup: null,
      nextBackup: null
    };

    // Store schedule
    this.schedules.set(projectId, schedule);
    
    // Create cron job for automatic backups
    const scheduler = require('./SchedulerManager');
    // ... implementation

    return { scheduled: true, projectId };
  }

  async list() {
    const backupsDir = path.join(this.backupsPath, 'projects');
    if (!await fs.pathExists(backupsDir)) return [];

    const files = await fs.readdir(backupsDir);
    const backups = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        const backup = await fs.readJson(path.join(backupsDir, file));
        backups.push(backup);
      }
    }

    return backups.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  async delete(backupId) {
    const metadataPath = path.join(this.backupsPath, 'projects', `${backupId}.json`);
    const zipPath = path.join(this.backupsPath, 'projects', `${backupId}.zip`);
    const dirPath = path.join(this.backupsPath, 'projects', backupId);

    if (await fs.pathExists(metadataPath)) await fs.remove(metadataPath);
    if (await fs.pathExists(zipPath)) await fs.remove(zipPath);
    if (await fs.pathExists(dirPath)) await fs.remove(dirPath);

    return { deleted: true };
  }

  async createZip(source, output) {
    return new Promise((resolve, reject) => {
      const archive = archiver('zip', { zlib: { level: 9 } });
      const stream = fs.createWriteStream(output);

      stream.on('close', resolve);
      archive.on('error', reject);

      archive.pipe(stream);
      archive.directory(source, false);
      archive.finalize();
    });
  }

  async extractZip(zipPath, targetPath) {
    await fs.ensureDir(targetPath);
    // Use extract-zip or similar
    const extract = require('extract-zip');
    await extract(zipPath, { dir: targetPath });
  }

  async encryptBackup(path, key) {
    // Implement encryption using crypto
    const crypto = require('crypto');
    // ... encryption logic
  }

  async getBackupSize(backup) {
    if (backup.compressedPath && await fs.pathExists(backup.compressedPath)) {
      const stat = await fs.stat(backup.compressedPath);
      return stat.size;
    }
    return 0;
  }

  async getProject(projectId) {
    const store = path.join(this.userDataPath, 'environments.json');
    if (await fs.pathExists(store)) {
      const data = await fs.readJson(store);
      return data.environments?.find(e => e.id === projectId);
    }
    return null;
  }

  execCommand(command, options = {}) {
    return new Promise((resolve, reject) => {
      exec(command, options, (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout);
      });
    });
  }
}

module.exports = { BackupManager };