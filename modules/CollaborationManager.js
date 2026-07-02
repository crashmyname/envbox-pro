// modules/CollaborationManager.js
const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');
const { v4: uuidv4 } = require('uuid');

class CollaborationManager {
  constructor() {
    this.sharedProjects = new Map();
    this.activeShares = new Map();
  }

  async share(config) {
    const { projectId, method = 'export', includeData = true } = config;
    const shareId = uuidv4();
    
    const share = {
      id: shareId,
      projectId,
      method,
      createdAt: new Date().toISOString(),
      status: 'creating'
    };

    switch (method) {
      case 'export':
        share.filePath = await this.exportProject(projectId, includeData);
        break;
      case 'lan':
        const lanResult = await this.shareOverLAN(projectId);
        share.url = lanResult.url;
        share.port = lanResult.port;
        break;
      case 'tunnel':
        share.url = await this.createTunnel(projectId);
        break;
    }

    share.status = 'ready';
    this.sharedProjects.set(shareId, share);
    
    return share;
  }

  async exportProject(projectId, includeData) {
    const project = await this.getProject(projectId);
    if (!project) throw new Error('Project not found');

    // ✅ Cek apakah folder project beneran ada
    if (!project.path || !await fs.pathExists(project.path)) {
      console.log('⚠️ Project folder not found, creating export from config only');
      
      const exportPath = path.join(process.env.TEMP || '/tmp', `envbox-export-${projectId}`);
      await fs.ensureDir(exportPath);

      // Export config aja
      const snapshot = {
        version: '3.0',
        project: {
          name: project.name || 'unknown',
          techStack: project.techStack || project.stack || 'php',
          version: project.version || '8.2',
          config: project.config || project
        },
        environment: await this.getEnvironmentConfig(projectId),
        databases: [],
        files: []
      };

      await fs.writeJson(path.join(exportPath, 'snapshot.json'), snapshot, { spaces: 2 });

      const zipPath = path.join(process.env.TEMP || '/tmp', `envbox-${projectId}-${Date.now()}.envbox`);
      await this.createZip(exportPath, zipPath);
      await fs.remove(exportPath).catch(() => {});

      return zipPath;
    }

    // Folder ada, export full
    const exportPath = path.join(process.env.TEMP || '/tmp', `envbox-export-${projectId}`);
    await fs.ensureDir(exportPath);

    const snapshot = {
      version: '3.0',
      project: {
        name: project.name,
        techStack: project.techStack || project.stack,
        version: project.version,
        config: project.config || project
      },
      environment: await this.getEnvironmentConfig(projectId),
      databases: includeData ? await this.exportDatabases(projectId, exportPath) : [],
      files: includeData ? await this.copyProjectFiles(project.path, exportPath) : []
    };

    await fs.writeJson(path.join(exportPath, 'snapshot.json'), snapshot, { spaces: 2 });

    const zipPath = path.join(process.env.TEMP || '/tmp', `envbox-${projectId}-${Date.now()}.envbox`);
    await this.createZip(exportPath, zipPath);
    await fs.remove(exportPath).catch(() => {});

    return zipPath;
  }

  async import(snapshotPath) {
    if (!await fs.pathExists(snapshotPath)) {
      throw new Error('Snapshot file not found');
    }

    const extractPath = path.join(process.env.TEMP || '/tmp', `envbox-import-${Date.now()}`);
    await fs.ensureDir(extractPath);

    // Extract zip
    await this.extractZip(snapshotPath, extractPath);

    // Read snapshot
    const snapshotPathJson = path.join(extractPath, 'snapshot.json');
    if (!await fs.pathExists(snapshotPathJson)) {
      throw new Error('Invalid .envbox file: snapshot.json not found');
    }
    
    const snapshot = await fs.readJson(snapshotPathJson);

    // Create project from snapshot
    const projectConfig = {
      ...snapshot.project,
      ...snapshot.environment
    };

    // ✅ Copy files ke folder projects/
    const projectName = projectConfig.name || 'imported-project';
    const targetPath = path.join(__dirname, '..', 'projects', projectName);
    
    if (snapshot.files && snapshot.files.length > 0) {
      const filesSource = path.join(extractPath, 'files');
      if (await fs.pathExists(filesSource)) {
        await fs.copy(filesSource, targetPath);
      }
    }

    // Import databases if included
    if (snapshot.databases && snapshot.databases.length > 0) {
      await this.importDatabases(snapshot.databases, extractPath);
    }

    // Cleanup
    await fs.remove(extractPath).catch(() => {});

    return { 
      imported: true, 
      projectConfig: {
        ...projectConfig,
        path: targetPath,
        folderPath: targetPath
      }
    };
  }

  async getEnvironmentConfig(projectId) {
    const project = await this.getProject(projectId);
    
    return {
      environmentVariables: project?.config?.environmentVariables || {},
      phpConfig: {
        version: project?.version || '8.2',
        memoryLimit: '256M'
      },
      nodeConfig: {
        version: project?.version || '20'
      },
      customConfig: project?.config || {}
    };
  }

  async exportDatabases(projectId, exportPath) {
    const dbPath = path.join(exportPath, 'databases');
    await fs.ensureDir(dbPath);
    
    // Export MySQL, PostgreSQL, etc.
    return [];
  }

  async copyProjectFiles(sourcePath, exportPath) {
    const filesPath = path.join(exportPath, 'files');
    await fs.ensureDir(filesPath);
    
    // Copy project files excluding node_modules, vendor, etc.
    await fs.copy(sourcePath, filesPath, {
      filter: (src) => {
        const basename = path.basename(src);
        return !['node_modules', 'vendor', '.git', 'storage/logs'].includes(basename);
      }
    });
    
    return ['files'];
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
    const extract = require('extract-zip');
    await extract(zipPath, { dir: targetPath });
  }

  async getProject(projectId) {
    // Coba dari environments store
    const store = path.join(process.env.APPDATA || '', 'envbox-pro', 'environments.json');
    if (await fs.pathExists(store)) {
      const data = await fs.readJson(store);
      const project = data.environments?.find(e => e.id === projectId || String(e.id) === String(projectId));
      if (project) return project;
    }

    // ✅ Coba dari localStorage (renderer)
    try {
      const localStore = path.join(process.env.APPDATA || '', 'envbox-pro', 'localStorage.json');
      if (await fs.pathExists(localStore)) {
        const data = await fs.readJson(localStore);
        if (data.envbox_projects) {
          const projects = JSON.parse(data.envbox_projects);
          const project = projects.find(p => p.id === projectId || String(p.id) === String(projectId));
          if (project) {
            return {
              name: project.name,
              techStack: project.stack,
              version: project.version,
              config: project,
              path: project.folderPath || path.join(__dirname, '..', 'projects', project.name)
            };
          }
        }
      }
    } catch(e) {}

    // ✅ Return simulated
    return {
      name: 'project-' + projectId,
      techStack: 'php',
      version: '8.2',
      config: {},
      path: path.join(__dirname, '..', 'projects', 'shared-project')
    };
  }

  async shareOverLAN(projectId) {
    const project = await this.getProject(projectId);
    if (!project) throw new Error('Project not found');
    
    const port = await this.findAvailablePort(9000);
    const localIP = this.getLocalIP();
    
    const http = require('http');
    const server = http.createServer(async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      
      if (req.url === '/download') {
        try {
          // ✅ Export project (config-only kalau folder gak ada)
          const zipPath = await this.exportProject(projectId, true);
          
          if (await fs.pathExists(zipPath)) {
            const fileStream = fs.createReadStream(zipPath);
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', `attachment; filename="${project.name || 'project'}.envbox"`);
            fileStream.pipe(res);
            fileStream.on('end', () => {
              fs.remove(zipPath).catch(() => {});
            });
          } else {
            res.writeHead(404);
            res.end('Export file not found');
          }
        } catch(e) {
          res.writeHead(500);
          res.end('Export failed: ' + e.message);
        }
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html><html><head><title>EnvBox Share - ${project.name || 'Project'}</title>
<style>body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#0a0e27;color:#e0e6ff}
.card{background:#151a35;padding:40px;border-radius:16px;text-align:center}
h1{color:#4fc3f7}.btn{display:inline-block;padding:14px 32px;background:#667eea;color:#fff;text-decoration:none;border-radius:8px;margin-top:16px;font-weight:600}
.btn:hover{background:#764ba2}</style></head><body>
<div class="card"><h1>📦 ${project.name || 'Project'}</h1>
<p>Tech: ${project.techStack || 'N/A'} ${project.version || ''}</p>
<a class="btn" href="/download">⬇ Download Project</a>
<p style="font-size:12px;color:#8892b0;margin-top:16px">Open on another device to download</p></div></body></html>`);
      }
    });
    
    server.listen(port);
    const url = `http://${localIP}:${port}`;
    
    // Auto-stop after 10 minutes
    setTimeout(() => {
      server.close();
      this.activeShares.delete(projectId);
    }, 600000);
    
    this.activeShares.set(projectId, { server, port, url });
    
    return { 
      url: url,  // ✅ String URL
      port: port, 
      localIP: localIP,
      expiresIn: '10 minutes'
    };
  }

  async stopShare(shareId) {
    const share = this.sharedProjects.get(shareId);
    if (share) {
        // Stop server kalau share via LAN
        const active = this.activeShares.get(share.projectId);
        if (active && active.server) {
            active.server.close();
            this.activeShares.delete(share.projectId);
        }
        this.sharedProjects.delete(shareId);
        return { stopped: true };
    }
    return { stopped: false, message: 'Share not found' };
  }

  getLocalIP() {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    
    // ✅ Prioritas: WiFi > Ethernet > Lainnya
    const priorityOrder = ['Wi-Fi', 'Ethernet', 'wlan', 'eth', 'enp', 'ens'];
    
    let bestIP = '127.0.0.1';
    
    // Cari berdasarkan prioritas nama interface
    for (const priority of priorityOrder) {
        for (const name of Object.keys(nets)) {
            if (name.toLowerCase().includes(priority.toLowerCase())) {
                for (const net of nets[name]) {
                    // Cari IPv4, bukan internal, dan bukan virtual
                    if (net.family === 'IPv4' && !net.internal && 
                        !name.toLowerCase().includes('vethernet') &&
                        !name.toLowerCase().includes('virtual') &&
                        !name.toLowerCase().includes('vmware') &&
                        !name.toLowerCase().includes('docker') &&
                        !name.toLowerCase().includes('hyper-v')) {
                        console.log(`🌐 Using interface: ${name} -> ${net.address}`);
                        return net.address;
                    }
                }
            }
        }
    }
    
    // Fallback: cari IPv4 non-internal pertama yang bukan virtual
    for (const name of Object.keys(nets)) {
        if (name.toLowerCase().includes('vethernet') || 
            name.toLowerCase().includes('virtual') ||
            name.toLowerCase().includes('docker') ||
            name.toLowerCase().includes('hyper-v')) {
            continue;
        }
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                console.log(`🌐 Using interface (fallback): ${name} -> ${net.address}`);
                return net.address;
            }
        }
    }
    
    return bestIP;
  }

  async findAvailablePort(startPort) {
    const net = require('net');
    return new Promise((resolve) => {
      const server = net.createServer();
      server.listen(startPort, () => {
        const port = server.address().port;
        server.close(() => resolve(port));
      });
      server.on('error', () => resolve(startPort + 1));
    });
  }

  shutdown() {
    this.sharedProjects.clear();
    this.activeShares.clear();
  }
}

module.exports = { CollaborationManager };