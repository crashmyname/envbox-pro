// modules/VersionManager.js
const fs = require('fs-extra');
const path = require('path');
const https = require('https');
const http = require('http');
const extract = require('extract-zip');
const { exec } = require('child_process');

class VersionManager {
  constructor(resourcesPath) {
    this.resourcesPath = resourcesPath || __dirname;
    this.environmentsPath = path.join(this.resourcesPath, 'environments');
    this.tempPath = path.join(this.resourcesPath, 'temp');
    this.activeDownloads = new Map();
  }

  async initialize() {
    console.log('🚀 Initializing Version Manager...');
    this.resourcesPath = __dirname;
    this.environmentsPath = path.join(this.resourcesPath, '..', 'environments');
    this.tempPath = path.join(this.resourcesPath, '..', 'temp');
    
    await fs.ensureDir(this.tempPath);
    
    const stacks = ['php', 'nodejs', 'go', 'python', 'mysql', 'postgresql', 'ruby', 'java', 'rust'];
    for (const s of stacks) {
      await fs.ensureDir(path.join(this.environmentsPath, s));
    }
    
    console.log('✅ Version Manager initialized');
  }

  // ===== GET INSTALLED VERSIONS (SUPPORT ALL STACKS) =====
  getInstalledVersions(stack) {
    const stackPath = path.join(this.environmentsPath, stack);
    
    if (!fs.existsSync(stackPath)) return [];
    
    try {
      const entries = fs.readdirSync(stackPath);
      const versions = new Set();
      
      for (const v of entries) {
        const full = path.join(stackPath, v);
        if (!fs.statSync(full).isDirectory()) continue;
        
        // 1. Folder versi langsung (8.2.28, 8.0.30)
        const directMatch = v.match(/^(\d+\.\d+\.\d+)/);
        if (directMatch) {
          const hasExe = this.hasExecutable(full, stack);
          if (hasExe) versions.add(directMatch[1]);
        }
        
        // 2. Folder dengan prefix (mysql-8.0.30-winx64, php-8.2.28-nts)
        const prefixMatch = v.match(/(\d+\.\d+\.\d+)/);
        if (prefixMatch) {
          const version = prefixMatch[1];
          const hasExe = this.hasExecutable(full, stack);
          // Cek juga sub-folder bin/
          const binPath = path.join(full, 'bin');
          const hasBinExe = fs.existsSync(binPath) && this.hasExecutable(binPath, stack);
          if (hasExe || hasBinExe) versions.add(version);
        }
      }
      
      const result = [...versions].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
      console.log(`✅ Found ${stack} versions:`, result);
      return result;
    } catch (e) {
      console.log(`❌ Error scanning ${stack}: ${e.message}`);
      return [];
    }
  }

  hasExecutable(folderPath, stack) {
    const exeMap = {
      php: 'php.exe',
      nodejs: 'node.exe',
      go: 'go.exe',
      python: 'python.exe',
      mysql: 'mysqld.exe',
      postgresql: 'postgres.exe',
      ruby: 'ruby.exe',
      java: 'java.exe',
      rust: 'rustc.exe',
    };
    
    const exe = exeMap[stack];
    if (!exe) return fs.readdirSync(folderPath).some(f => f.endsWith('.exe'));
    
    // Cek langsung
    if (fs.existsSync(path.join(folderPath, exe))) return true;
    // Cek di bin/
    if (fs.existsSync(path.join(folderPath, 'bin', exe))) return true;
    
    return false;
  }

  // ===== ONLINE VERSIONS =====
  async getOnlineVersions(stack) {
    if (stack === 'php') {
      return await this.getAvailablePHPVersions();
    }
    return this.getFallbackVersions(stack);
  }

  async getAvailablePHPVersions() {
    return new Promise((resolve) => {
      const url = 'https://windows.php.net/downloads/releases/releases.json';
      https.get(url, { headers: { 'User-Agent': 'EnvBox' } }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const releases = JSON.parse(data);
            const versions = Object.keys(releases)
              .filter(v => v.match(/^\d+\.\d+\.\d+$/))
              .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
              .slice(0, 30);
            resolve(versions);
          } catch (e) {
            resolve(this.getFallbackVersions('php'));
          }
        });
      }).on('error', () => resolve(this.getFallbackVersions('php')));
    });
  }

  getFallbackVersions(stack) {
    const fallbacks = {
      php: ['8.3.0', '8.2.14', '8.1.27', '8.0.30', '7.4.33'],
      nodejs: ['22.0.0', '21.7.0', '20.11.0', '18.19.0'],
      go: ['1.23.0', '1.22.0', '1.21.6', '1.20.5'],
      python: ['3.13.0', '3.12.2', '3.11.8', '3.10.13'],
      mysql: ['8.4.0', '8.0.37', '8.0.36', '5.7.44'],
      postgresql: ['17.0', '16.3', '15.7', '14.12'],
      ruby: ['3.3.0', '3.2.3', '3.1.4'],
      java: ['21', '17', '11'],
      rust: ['stable']
    };
    return fallbacks[stack] || [];
  }

  // ===== DOWNLOAD =====
  getDownloadUrl(stack, version) {
    const urls = {
      php: () => [
        `https://windows.php.net/downloads/releases/php-${version}-nts-Win32-vs16-x64.zip`,
        `https://windows.php.net/downloads/releases/php-${version}-Win32-vs16-x64.zip`,
      ],
      nodejs: () => [`https://nodejs.org/dist/v${version}/node-v${version}-win-x64.zip`],
      go: () => [`https://go.dev/dl/go${version}.windows-amd64.zip`],
      python: () => [`https://www.python.org/ftp/python/${version}/python-${version}-embed-amd64.zip`],
      mysql: () => [
        `https://dev.mysql.com/get/Downloads/MySQL-${version.split('.').slice(0,2).join('.')}/mysql-${version}-winx64.zip`,
        `https://cdn.mysql.com/Downloads/MySQL-${version.split('.').slice(0,2).join('.')}/mysql-${version}-winx64.zip`,
      ],
      postgresql: () => [
        `https://get.enterprisedb.com/postgresql/postgresql-${version}-windows-x64-binaries.zip`,
      ],
    };
    
    const builder = urls[stack];
    return builder ? builder() : [];
  }

  async downloadVersion(stack, version, onProgress) {
    const urls = this.getDownloadUrl(stack, version);
    if (!urls || urls.length === 0) {
      throw new Error(`No download URL for ${stack} ${version}. Please download manually.`);
    }

    const targetPath = path.join(this.environmentsPath, stack, version);
    if (await fs.pathExists(targetPath)) {
      return { alreadyInstalled: true, path: targetPath };
    }

    const tempFile = path.join(this.tempPath, `${stack}-${version}.zip`);
    let downloaded = false;
    let lastError = null;

    for (const url of urls) {
      try {
        console.log(`📥 Downloading: ${url}`);
        await this.downloadFile(url, tempFile, (progress) => {
          if (onProgress) onProgress({ stack, version, ...progress });
        });
        downloaded = true;
        break;
      } catch (err) {
        console.log(`❌ Failed: ${err.message}`);
        lastError = err;
        await fs.remove(tempFile).catch(() => {});
      }
    }

    if (!downloaded) {
      throw new Error(`Failed to download ${stack} ${version}. ${lastError?.message || ''}`);
    }

    console.log(`📦 Extracting...`);
    await fs.ensureDir(targetPath);

    try {
      await extract(tempFile, { dir: targetPath });
      
      // Handle nested folder
      const files = await fs.readdir(targetPath);
      if (files.length === 1) {
        const innerDir = path.join(targetPath, files[0]);
        if ((await fs.stat(innerDir)).isDirectory()) {
          const innerFiles = await fs.readdir(innerDir);
          for (const f of innerFiles) {
            await fs.move(path.join(innerDir, f), path.join(targetPath, f), { overwrite: true });
          }
          await fs.remove(innerDir);
        }
      }
    } catch (e) {
      await fs.remove(targetPath).catch(() => {});
      throw new Error(`Extract failed: ${e.message}`);
    }

    await fs.remove(tempFile).catch(() => {});
    await this.postInstall(stack, version, targetPath);

    console.log(`✅ Installed to ${targetPath}`);
    return { installed: true, path: targetPath };
  }

  async postInstall(stack, version, targetPath) {
    if (stack === 'php') {
      const devIni = path.join(targetPath, 'php.ini-development');
      if (await fs.pathExists(devIni)) {
        let ini = await fs.readFile(devIni, 'utf8');
        ini = ini.replace(/;extension_dir\s*=\s*"ext"/g, 'extension_dir = "ext"');
        ini = ini.replace(/;extension=mbstring/g, 'extension=mbstring');
        ini = ini.replace(/;extension=openssl/g, 'extension=openssl');
        ini = ini.replace(/;extension=curl/g, 'extension=curl');
        ini = ini.replace(/;extension=mysqli/g, 'extension=mysqli');
        ini = ini.replace(/;extension=pdo_mysql/g, 'extension=pdo_mysql');
        ini = ini.replace(/;extension=gd/g, 'extension=gd');
        ini = ini.replace(/;extension=fileinfo/g, 'extension=fileinfo');
        await fs.writeFile(path.join(targetPath, 'php.ini'), ini);
      }
    }
    
    if (stack === 'mysql') {
      // Buat my.ini default
      const myIni = path.join(targetPath, 'my.ini');
      if (!await fs.pathExists(myIni)) {
        await fs.writeFile(myIni, `[mysqld]\nport=3306\nbasedir="${targetPath.replace(/\\/g, '/')}"\ndatadir="${targetPath.replace(/\\/g, '/')}/data"\nmax_connections=100\ncharacter-set-server=utf8mb4\ncollation-server=utf8mb4_unicode_ci\n`);
      }
    }
  }

  downloadFile(url, destPath, onProgress) {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;
      
      const req = protocol.get(url, { 
        headers: { 'User-Agent': 'EnvBox-Pro/3.0' },
        timeout: 60000 
      }, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          return this.downloadFile(response.headers.location, destPath, onProgress).then(resolve).catch(reject);
        }

        if (response.statusCode !== 200) {
          return reject(new Error(`HTTP ${response.statusCode}`));
        }

        const totalSize = parseInt(response.headers['content-length'] || '0', 10);
        let downloaded = 0;
        const file = fs.createWriteStream(destPath);

        response.on('data', (chunk) => {
          downloaded += chunk.length;
          const percent = totalSize > 0 ? Math.round((downloaded / totalSize) * 100) : 50;
          if (onProgress) onProgress({ progress: percent, downloaded, totalSize, status: 'downloading' });
        });

        response.pipe(file);
        file.on('finish', () => { file.close(); if (onProgress) onProgress({ progress: 100, status: 'extracting' }); resolve(); });
        response.on('error', (err) => { file.close(); fs.remove(destPath).catch(()=>{}); reject(err); });
        file.on('error', (err) => { fs.remove(destPath).catch(()=>{}); reject(err); });
      });

      req.on('error', (err) => reject(new Error(`Network error: ${err.message}`)));
      req.on('timeout', () => { req.destroy(); reject(new Error('Download timeout')); });
    });
  }

  async uninstallVersion(stack, version) {
    const versionPath = path.join(this.environmentsPath, stack, version);
    if (await fs.pathExists(versionPath)) {
      await fs.remove(versionPath);
      return { uninstalled: true };
    }
    throw new Error(`Version ${version} not found`);
  }

  shutdown() {
    this.activeDownloads.clear();
  }
}

module.exports = { VersionManager };