// modules/LogViewer.js
const fs = require('fs-extra');
const path = require('path');
const chokidar = require('chokidar');
const { EventEmitter } = require('events');

class LogViewer extends EventEmitter {
  constructor(userDataPath) {
    super();
    this.userDataPath = userDataPath;
    this.watchers = new Map();
    this.logBuffers = new Map();
    this.maxBufferSize = 10000; // lines
  }

  async startWatching(projectId, logType, callback) {
    const logFile = this.getLogFilePath(projectId, logType);

    await fs.ensureDir(path.dirname(logFile));
    
    if (!await fs.pathExists(logFile)) {
      await fs.ensureDir(path.dirname(logFile));
      await fs.writeFile(logFile, '');
    }

    const watcherId = `${projectId}_${logType}`;

    // Stop existing watcher if any
    if (this.watchers.has(watcherId)) {
      await this.stopWatching(watcherId);
    }

    // Read existing content
    const existingContent = await this.readLastLines(logFile, 100);
    this.logBuffers.set(watcherId, existingContent);

    // Send initial content
    if (callback) {
      callback({
        projectId,
        logType,
        content: existingContent.join('\n'),
        lines: existingContent.length,
        timestamp: new Date().toISOString()
      });
    }

    // Watch for changes
    const watcher = chokidar.watch(logFile, {
      persistent: true,
      usePolling: true,
      interval: 500,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100
      }
    });

    watcher.on('change', async (filePath) => {
      const newContent = await this.readLastLines(logFile, 50);
      const buffer = this.logBuffers.get(watcherId) || [];
      
      // Find new lines
      const newLines = this.findNewLines(buffer, newContent);
      
      if (newLines.length > 0) {
        // Update buffer
        const updatedBuffer = [...buffer, ...newLines].slice(-this.maxBufferSize);
        this.logBuffers.set(watcherId, updatedBuffer);

        // Send update
        if (callback) {
          callback({
            projectId,
            logType,
            content: newLines.join('\n'),
            newLines: newLines.length,
            totalLines: updatedBuffer.length,
            timestamp: new Date().toISOString()
          });
        }

        this.emit('log:update', {
          projectId,
          logType,
          newLines
        });
      }
    });

    this.watchers.set(watcherId, { watcher, logFile, callback });

    return { watching: true, watcherId, logFile };
  }

  async stopWatching(watcherId) {
    const watcherData = this.watchers.get(watcherId);
    if (watcherData) {
      await watcherData.watcher.close();
      this.watchers.delete(watcherId);
      this.logBuffers.delete(watcherId);
    }

    return { stopped: true };
  }

  async getLogHistory(projectId, logType, lines = 100) {
    const logFile = this.getLogFilePath(projectId, logType);
    
    console.log(`📋 getLogHistory: ${logFile}`);
    console.log(`   Exists: ${await fs.pathExists(logFile)}`);
    
    if (!await fs.pathExists(logFile)) {
      console.log('   ❌ File not found');
      return [];
    }

    const content = await this.readLastLines(logFile, lines);
    console.log(`   Lines: ${content.length}`);
    return content;
  }

  async searchLogs(projectId, logType, query, options = {}) {
    const logFile = this.getLogFilePath(projectId, logType);
    
    if (!await fs.pathExists(logFile)) {
      return { results: [], total: 0 };
    }

    const content = await fs.readFile(logFile, 'utf8');
    const lines = content.split('\n');
    
    const results = [];
    let lineNumber = 0;

    for (const line of lines) {
      lineNumber++;
      
      if (options.caseSensitive === false) {
        if (line.toLowerCase().includes(query.toLowerCase())) {
          results.push({ line: lineNumber, content: line });
        }
      } else {
        if (line.includes(query)) {
          results.push({ line: lineNumber, content: line });
        }
      }
    }

    const total = results.length;
    
    // Apply pagination
    if (options.limit) {
      const start = options.offset || 0;
      return {
        results: results.slice(start, start + options.limit),
        total,
        offset: start,
        limit: options.limit
      };
    }

    return { results, total };
  }

  async getLogStats(projectId, logType) {
    const logFile = this.getLogFilePath(projectId, logType);
    
    if (!await fs.pathExists(logFile)) {
      return {
        exists: false,
        size: 0,
        lines: 0,
        lastModified: null
      };
    }

    const stat = await fs.stat(logFile);
    const content = await fs.readFile(logFile, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());

    // Count log levels
    const levels = {
      error: 0,
      warning: 0,
      info: 0,
      debug: 0
    };

    lines.forEach(line => {
      const lower = line.toLowerCase();
      if (lower.includes('error') || lower.includes('fatal')) levels.error++;
      else if (lower.includes('warn')) levels.warning++;
      else if (lower.includes('debug')) levels.debug++;
      else levels.info++;
    });

    return {
      exists: true,
      size: stat.size,
      sizeFormatted: this.formatBytes(stat.size),
      lines: lines.length,
      levels,
      lastModified: stat.mtime.toISOString(),
      firstLine: lines[0] || null,
      lastLine: lines[lines.length - 1] || null
    };
  }

  async clearLogs(projectId, logType) {
    const logFile = this.getLogFilePath(projectId, logType);
    await fs.writeFile(logFile, '');
    
    const watcherId = `${projectId}_${logType}`;
    this.logBuffers.set(watcherId, []);

    return { cleared: true };
  }

  async exportLogs(projectId, logType, outputPath) {
    const logFile = this.getLogFilePath(projectId, logType);
    
    if (!await fs.pathExists(logFile)) {
      throw new Error('Log file not found');
    }

    await fs.copy(logFile, outputPath);
    
    return { exported: true, path: outputPath };
  }

  getLogFilePath(projectId, logType) {
      const projectsPath = path.join(__dirname, '..', 'projects');
      
      const logFileMap = {
          'php': 'php_error.log', 'access': 'access.log',
          'error': 'error.log', 'xdebug': 'xdebug.log',
          'app': 'app.log', 'php_error': 'php_error.log',
      };
      
      const fileName = logFileMap[logType] || `${logType}.log`;
      
      console.log(`🔍 Looking for projectId: "${projectId}"`);
      
      try {
          // ✅ BARU: Baca environment.json / projects.json untuk mapping ID ke nama
          const configPath = path.join(process.env.APPDATA || '', 'envbox-pro', 'environments.json');
          if (fs.existsSync(configPath)) {
              const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
              const projects = config.environments || config.projects || [];
              
              // Cari project dengan ID yang cocok
              const project = projects.find(p => 
                  String(p.id) === String(projectId) || 
                  String(p._id) === String(projectId)
              );
              
              if (project && project.name) {
                  // Coba folder dengan nama project
                  const projectFolder = path.join(projectsPath, project.name);
                  if (fs.existsSync(projectFolder)) {
                      const logPath = path.join(projectFolder, 'logs', fileName);
                      console.log(`   ✅ Found by name: ${logPath}`);
                      
                      // Pastikan folder logs ada
                      if (!fs.existsSync(path.dirname(logPath))) {
                          fs.ensureDirSync(path.dirname(logPath));
                      }
                      
                      // Pastikan file log ada (buat kalau belum)
                      if (!fs.existsSync(logPath)) {
                          fs.writeFileSync(logPath, '');
                          console.log(`   📝 Created log file: ${logPath}`);
                      }
                      
                      return logPath;
                  }
              }
          }
          
          // ✅ Coba dari localStorage.json (AppData)
          const localStore = path.join(process.env.APPDATA || '', 'envbox-pro', 'localStorage.json');
          if (fs.existsSync(localStore)) {
              try {
                  const data = JSON.parse(fs.readFileSync(localStore, 'utf8'));
                  if (data.envbox_projects) {
                      const projects = JSON.parse(data.envbox_projects);
                      const project = projects.find(p => 
                          String(p.id) === String(projectId)
                      );
                      
                      if (project && project.name) {
                          const projectFolder = path.join(projectsPath, project.name);
                          if (fs.existsSync(projectFolder)) {
                              const logPath = path.join(projectFolder, 'logs', fileName);
                              console.log(`   ✅ Found by localStorage name: ${logPath}`);
                              
                              if (!fs.existsSync(path.dirname(logPath))) {
                                  fs.ensureDirSync(path.dirname(logPath));
                              }
                              if (!fs.existsSync(logPath)) {
                                  fs.writeFileSync(logPath, '');
                              }
                              
                              return logPath;
                          }
                      }
                  }
              } catch(e) {
                  console.log('   ⚠️ Error parsing localStorage:', e.message);
              }
          }
          
          // ✅ Cek semua folder project untuk .envbox/project-id
          const dirs = fs.readdirSync(projectsPath);
          for (const dir of dirs) {
              if (dir === 'default' || dir.startsWith('.')) continue;
              
              const idFile = path.join(projectsPath, dir, '.envbox', 'project-id');
              if (fs.existsSync(idFile)) {
                  const storedId = fs.readFileSync(idFile, 'utf8').trim();
                  if (storedId === String(projectId)) {
                      const logPath = path.join(projectsPath, dir, 'logs', fileName);
                      console.log(`   ✅ Found by .envbox/project-id: ${logPath}`);
                      
                      if (!fs.existsSync(path.dirname(logPath))) {
                          fs.ensureDirSync(path.dirname(logPath));
                      }
                      if (!fs.existsSync(logPath)) {
                          fs.writeFileSync(logPath, '');
                      }
                      
                      return logPath;
                  }
              }
          }
          
          // ✅ Cek folder project-{id}
          const projectIdFolder = `project-${projectId}`;
          const projectIdPath = path.join(projectsPath, projectIdFolder);
          if (fs.existsSync(projectIdPath)) {
              const logPath = path.join(projectIdPath, 'logs', fileName);
              console.log(`   ✅ Found by project-{id} folder: ${logPath}`);
              
              if (!fs.existsSync(path.dirname(logPath))) {
                  fs.ensureDirSync(path.dirname(logPath));
              }
              if (!fs.existsSync(logPath)) {
                  fs.writeFileSync(logPath, '');
              }
              
              return logPath;
          }
          
          // ✅ Cek folder dengan nama mirip
          for (const dir of dirs) {
              if (dir.includes(projectId) || projectId.includes(dir.replace('project-', ''))) {
                  const logPath = path.join(projectsPath, dir, 'logs', fileName);
                  console.log(`   ✅ Found by partial match: ${logPath}`);
                  
                  if (!fs.existsSync(path.dirname(logPath))) {
                      fs.ensureDirSync(path.dirname(logPath));
                  }
                  if (!fs.existsSync(logPath)) {
                      fs.writeFileSync(logPath, '');
                  }
                  
                  return logPath;
              }
          }
          
      } catch(e) {
          console.log('   ❌ Error:', e.message);
      }
      
      // ✅ ULTIMATE FALLBACK: Bikin folder project sendiri kalau gak ketemu
      const fallbackFolder = path.join(projectsPath, `project-${projectId}`);
      console.log(`   ⚠️ Creating fallback: ${fallbackFolder}`);
      
      fs.ensureDirSync(path.join(fallbackFolder, 'logs'));
      fs.ensureDirSync(path.join(fallbackFolder, '.envbox'));
      fs.writeFileSync(path.join(fallbackFolder, '.envbox', 'project-id'), String(projectId));
      
      const logPath = path.join(fallbackFolder, 'logs', fileName);
      if (!fs.existsSync(logPath)) {
          fs.writeFileSync(logPath, '');
      }
      
      return logPath;
  }

  // ✅ Helper: Cari nama project dari ID (baca dari localStorage)
  getProjectNameById(projectId) {
    try {
      // Baca dari localStorage.json di AppData
      const localStore = path.join(process.env.APPDATA || '', 'envbox-pro', 'localStorage.json');
      if (fs.existsSync(localStore)) {
        const data = JSON.parse(fs.readFileSync(localStore, 'utf8'));
        if (data.envbox_projects) {
          const projects = JSON.parse(data.envbox_projects);
          const project = projects.find(p => 
            String(p.id) === String(projectId)
          );
          if (project) {
            console.log(`   📋 Found project name: "${project.name}" for ID: ${projectId}`);
            return project.name;
          }
        }
      }
    } catch(e) {
      console.log('   ❌ Error reading localStorage:', e.message);
    }
    return null;
  }

  async readLastLines(filePath, lineCount) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n').filter(l => l.trim());
      return lines.slice(-lineCount);
    } catch (e) {
      return [];
    }
  }

  findNewLines(oldBuffer, newBuffer) {
    if (oldBuffer.length === 0) return newBuffer;
    if (newBuffer.length === 0) return [];

    // Find the last line of old buffer in new buffer
    const lastOldLine = oldBuffer[oldBuffer.length - 1];
    const lastOldIndex = newBuffer.lastIndexOf(lastOldLine);

    if (lastOldIndex === -1) {
      // Completely new content
      return newBuffer;
    }

    // Return lines after the last matched line
    return newBuffer.slice(lastOldIndex + 1);
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async getAvailableLogs(projectId) {
    const logsPath = path.join(this.userDataPath, 'projects', projectId, 'logs');
    
    if (!await fs.pathExists(logsPath)) {
      return [];
    }

    const files = await fs.readdir(logsPath);
    return files
      .filter(f => f.endsWith('.log'))
      .map(f => ({
        name: f.replace('.log', ''),
        path: path.join(logsPath, f),
        size: 0 // Will be filled when needed
      }));
  }

  shutdown() {
    for (const [id, data] of this.watchers) {
      data.watcher.close();
    }
    this.watchers.clear();
    this.logBuffers.clear();
  }
}

module.exports = { LogViewer };