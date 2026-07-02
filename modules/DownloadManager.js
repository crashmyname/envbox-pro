// modules/DownloadManager.js
const fs = require('fs-extra');
const path = require('path');
const https = require('https');
const http = require('http');
const extract = require('extract-zip');

class DownloadManager {
  constructor(resourcesPath) {
    this.environmentsPath = path.join(resourcesPath, 'environments');
    this.tempPath = path.join(resourcesPath, 'temp');
  }

  async initialize() {
    await fs.ensureDir(this.tempPath);
    const stacks = ['php', 'nodejs', 'go', 'python'];
    for (const s of stacks) {
      await fs.ensureDir(path.join(this.environmentsPath, s));
    }
  }

  getDownloadUrl(stack, version) {
    const urls = {
      php: `https://windows.php.net/downloads/releases/php-${version}-nts-Win32-vs16-x64.zip`,
      nodejs: `https://nodejs.org/dist/v${version}/node-v${version}-win-x64.zip`,
      go: `https://go.dev/dl/go${version}.windows-amd64.zip`,
      python: `https://www.python.org/ftp/python/${version}/python-${version}-embed-amd64.zip`
    };
    return urls[stack] || null;
  }

  getInstalledVersions(stack) {
    const stackPath = path.join(this.environmentsPath, stack);
    if (!fs.existsSync(stackPath)) return [];
    try {
      return fs.readdirSync(stackPath).filter(v => {
        const full = path.join(stackPath, v);
        return fs.statSync(full).isDirectory();
      });
    } catch(e) {
      return [];
    }
  }

  async downloadAndInstall(stack, version, onProgress) {
    const url = this.getDownloadUrl(stack, version);
    if (!url) throw new Error(`No download URL for ${stack} ${version}`);

    const targetPath = path.join(this.environmentsPath, stack, version);
    
    if (await fs.pathExists(targetPath)) {
      return { alreadyInstalled: true, path: targetPath };
    }

    const tempFile = path.join(this.tempPath, `${stack}-${version}.zip`);
    console.log(`📥 Downloading ${stack} ${version} from ${url}`);

    await this.downloadFile(url, tempFile, (progress) => {
      if (onProgress) onProgress(progress);
    });

    console.log(`📦 Extracting ${stack} ${version}...`);
    await fs.ensureDir(targetPath);

    try {
      await extract(tempFile, { dir: targetPath });
      
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
    
    if (stack === 'php') {
      const devIni = path.join(targetPath, 'php.ini-development');
      const prodIni = path.join(targetPath, 'php.ini');
      if (await fs.pathExists(devIni) && !await fs.pathExists(prodIni)) {
        let ini = await fs.readFile(devIni, 'utf8');
        ini = ini.replace(';extension_dir = "ext"', 'extension_dir = "ext"');
        ini = ini.replace(';extension=mbstring', 'extension=mbstring');
        ini = ini.replace(';extension=openssl', 'extension=openssl');
        ini = ini.replace(';extension=curl', 'extension=curl');
        ini = ini.replace(';extension=mysqli', 'extension=mysqli');
        ini = ini.replace(';extension=pdo_mysql', 'extension=pdo_mysql');
        await fs.writeFile(prodIni, ini);
      }
    }

    console.log(`✅ ${stack} ${version} installed to ${targetPath}`);
    return { installed: true, path: targetPath };
  }

  downloadFile(url, destPath, onProgress) {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;
      
      protocol.get(url, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          return this.downloadFile(response.headers.location, destPath, onProgress)
            .then(resolve).catch(reject);
        }

        if (response.statusCode !== 200) {
          return reject(new Error(`Download failed: HTTP ${response.statusCode}`));
        }

        const totalSize = parseInt(response.headers['content-length'] || '0', 10);
        let downloaded = 0;
        const startTime = Date.now();

        const file = fs.createWriteStream(destPath);

        response.on('data', (chunk) => {
          downloaded += chunk.length;
          const progress = totalSize > 0 ? Math.round((downloaded / totalSize) * 100) : 50;
          const elapsed = (Date.now() - startTime) / 1000;
          const speed = elapsed > 0 ? (downloaded / elapsed / 1024 / 1024).toFixed(1) : '0';
          
          if (onProgress) {
            onProgress({ progress, downloaded, totalSize, speed: speed + ' MB/s', status: 'downloading' });
          }
        });

        response.pipe(file);

        file.on('finish', () => { file.close(); if (onProgress) onProgress({ progress: 100, status: 'extracting' }); resolve(); });
        response.on('error', (err) => { file.close(); fs.remove(destPath).catch(()=>{}); reject(err); });
        file.on('error', (err) => { fs.remove(destPath).catch(()=>{}); reject(err); });
      }).on('error', reject);
    });
  }

  shutdown() {}
}

module.exports = { DownloadManager };