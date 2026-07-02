// modules/SSLManager.js
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const { v4: uuidv4 } = require('uuid');

class SSLManager {
  constructor(userDataPath) {
    this.userDataPath = userDataPath;
    this.certsPath = path.join(userDataPath, 'ssl');
    this.certificates = new Map();
    this.store = path.join(userDataPath, 'ssl-certificates.json');
  }

  async initialize() {
    await fs.ensureDir(this.certsPath);
    await fs.ensureDir(path.join(this.certsPath, 'certs'));
    await fs.ensureDir(path.join(this.certsPath, 'keys'));
    
    if (!await fs.pathExists(this.store)) {
      await fs.writeJson(this.store, { certificates: [] });
    }

    await this.ensureMkcert();
    await this.loadCertificates();
  }

  async ensureMkcert() {
    const mkcertPath = path.join(this.certsPath, 'mkcert.exe');
    
    if (!await fs.pathExists(mkcertPath)) {
      console.log('⚠️ mkcert not found. Please install from https://github.com/FiloSottile/mkcert');
      console.log('   Download mkcert.exe and place it in:', mkcertPath);
      
      // Try to download automatically
      try {
        const https = require('https');
        const mkcertUrl = 'https://github.com/FiloSottile/mkcert/releases/download/v1.4.4/mkcert-v1.4.4-windows-amd64.exe';
        
        await new Promise((resolve, reject) => {
          const file = fs.createWriteStream(mkcertPath);
          https.get(mkcertUrl, (response) => {
            response.pipe(file);
            file.on('finish', () => {
              file.close();
              resolve();
            });
          }).on('error', reject);
        });

        console.log('✅ mkcert downloaded successfully');
      } catch (e) {
        console.log('Could not auto-download mkcert:', e.message);
        console.log('Please install manually.');
      }
    }

    // Install local CA if mkcert exists
    if (await fs.pathExists(mkcertPath)) {
      try {
        await this.execCommand(`"${mkcertPath}" -install`);
        console.log('✅ mkcert CA installed');
      } catch (e) {
        console.log('mkcert CA installation failed:', e.message);
      }
    }
  }

  async generateCertificate(domain, projectId) {
    const certId = uuidv4();
    const mkcertPath = path.join(this.certsPath, 'mkcert.exe');

    if (!await fs.pathExists(mkcertPath)) {
      throw new Error('mkcert not installed. Cannot generate certificates.');
    }

    const certDir = path.join(this.certsPath, 'certs', certId);
    await fs.ensureDir(certDir);

    const certFile = path.join(certDir, `${domain}.pem`);
    const keyFile = path.join(certDir, `${domain}-key.pem`);

    try {
      await this.execCommand(
        `"${mkcertPath}" -cert-file "${certFile}" -key-file "${keyFile}" ${domain} localhost 127.0.0.1 ::1`
      );

      const cert = {
        id: certId,
        projectId,
        domain,
        certPath: certFile,
        keyPath: keyFile,
        createdAt: new Date().toISOString(),
        expiresAt: this.getCertificateExpiry(certFile)
      };

      this.certificates.set(certId, cert);
      await this.saveCertificate(cert);

      return cert;
    } catch (error) {
      throw new Error(`Certificate generation failed: ${error.message}`);
    }
  }

  async installCertificate(projectId, certPath, keyPath) {
    const certId = uuidv4();

    const certDir = path.join(this.certsPath, 'certs', certId);
    await fs.ensureDir(certDir);

    const targetCert = path.join(certDir, 'certificate.pem');
    const targetKey = path.join(certDir, 'private.key');

    await fs.copy(certPath, targetCert);
    await fs.copy(keyPath, targetKey);

    const cert = {
      id: certId,
      projectId,
      domain: 'custom',
      certPath: targetCert,
      keyPath: targetKey,
      createdAt: new Date().toISOString(),
      expiresAt: this.getCertificateExpiry(targetCert)
    };

    this.certificates.set(certId, cert);
    await this.saveCertificate(cert);

    return cert;
  }

  async listCertificates(projectId) {
    if (projectId) {
      const certs = [];
      for (const [id, cert] of this.certificates) {
        if (cert.projectId === projectId) {
          certs.push(cert);
        }
      }
      return certs;
    }

    return [...this.certificates.values()];
  }

  async revokeCertificate(certId) {
    const cert = this.certificates.get(certId);
    if (!cert) throw new Error('Certificate not found');

    // Delete cert files
    const certDir = path.dirname(cert.certPath);
    if (await fs.pathExists(certDir)) {
      await fs.remove(certDir);
    }

    this.certificates.delete(certId);
    await this.removeCertificate(certId);

    return { revoked: true };
  }

  async renewCertificate(certId) {
    const cert = this.certificates.get(certId);
    if (!cert) throw new Error('Certificate not found');

    // Generate new certificate
    const newCert = await this.generateCertificate(cert.domain, cert.projectId);
    
    // Revoke old certificate
    await this.revokeCertificate(certId);

    return newCert;
  }

  getCertificateExpiry(certPath) {
    try {
      // In production, parse the certificate to get actual expiry
      // For now, return 1 year from now
      const expiry = new Date();
      expiry.setFullYear(expiry.getFullYear() + 1);
      return expiry.toISOString();
    } catch (e) {
      return null;
    }
  }

  async checkExpiringCertificates() {
    const expiring = [];
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;

    for (const [id, cert] of this.certificates) {
      if (cert.expiresAt) {
        const remaining = new Date(cert.expiresAt) - new Date();
        if (remaining < thirtyDays) {
          expiring.push({
            ...cert,
            daysRemaining: Math.floor(remaining / (24 * 60 * 60 * 1000))
          });
        }
      }
    }

    return expiring;
  }

  async saveCertificate(cert) {
    await fs.writeJson(
      path.join(this.certsPath, 'certs', cert.id, 'metadata.json'),
      cert,
      { spaces: 2 }
    );

    // Update store
    const store = await fs.readJson(this.store);
    store.certificates.push(cert);
    await fs.writeJson(this.store, store);
  }

  async removeCertificate(certId) {
    const store = await fs.readJson(this.store);
    store.certificates = store.certificates.filter(c => c.id !== certId);
    await fs.writeJson(this.store, store);
  }

  async loadCertificates() {
    if (!await fs.pathExists(this.store)) return;

    const store = await fs.readJson(this.store);
    for (const cert of store.certificates) {
      this.certificates.set(cert.id, cert);
    }
  }

  execCommand(command) {
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout);
      });
    });
  }

  shutdown() {
    this.certificates.clear();
  }
}

module.exports = { SSLManager };