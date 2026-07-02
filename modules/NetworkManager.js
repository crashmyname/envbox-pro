// modules/NetworkManager.js
const http = require('http');
const httpProxy = require('http-proxy');
const fs = require('fs-extra');
const path = require('path');
const net = require('net');
const os = require('os');

class NetworkManager {
  constructor() {
    this.proxyServer = null;
    this.proxyPort = 80;
    this.routes = new Map();
    this.portMap = new Map();
    this.rateLimits = new Map();
    this.isRunning = false;
  }

  async createProxy(config) {
      // Validasi config
      if (!config || !config.domain) {
          console.log('⚠️ createProxy called without domain, starting proxy only');
          if (!this.proxyServer || !this.isRunning) {
              return await this.startProxyServer(config?.port || 80);
          }
          return { running: true, port: this.proxyPort };
      }

      if (!this.proxyServer || !this.isRunning) {
          await this.startProxyServer(config.port || 0);
      }

      const route = {
          domain: config.domain,
          targetPort: config.targetPort,
          ssl: config.ssl || false,
          projectId: config.projectId || 'unknown',
          headers: config.headers || {},
          rateLimit: config.rateLimit || null,
          createdAt: new Date()
      };

      this.routes.set(config.domain.toLowerCase(), route);
      if (config.projectId) {
          this.portMap.set(config.projectId, route);
      }

      console.log(`🔗 Route added: ${config.domain} → :${config.targetPort}`);
      return { proxied: true, domain: config.domain, port: this.proxyPort };
  }

  async startProxyServer(port = 0) {
    if (port === 0 || port === 80 || port === 8080) {
        port = await this.findAvailablePort(8888);
        console.log(`🔍 Auto-selected available port: ${port}`);
    } else {
        const portCheck = await this.checkPort(port);
        if (!portCheck.available) {
            port = await this.findAvailablePort(port + 1);
            console.log(`⚠️ Port ${portCheck.port} in use, using port ${port}`);
        }
    }

    const proxy = httpProxy.createProxyServer({
      ws: true,
      changeOrigin: true,
      xfwd: true,
      timeout: 30000,
      proxyTimeout: 30000
    });

    // Error handling
    proxy.on('error', (err, req, res) => {
      console.error(`❌ Proxy error: ${err.message}`);
      if (res && !res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('Bad Gateway - Target server may be down');
      }
    });

    this.proxyServer = http.createServer((req, res) => {
      const hostname = (req.headers.host || 'localhost').split(':')[0].toLowerCase();
      
      // 🔥 Cari route dengan wildcard support
      let route = this.matchRoute(hostname);

      if (!route) {
        // Tampilkan halaman bantuan kalau gak ada route
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end(this.getHelpPage(hostname));
        return;
      }

      // Rate limiting
      if (route.rateLimit) {
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        if (!this.checkRateLimit(clientIp, route)) {
          res.writeHead(429, { 'Content-Type': 'text/plain' });
          res.end('Too Many Requests');
          return;
        }
      }

      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      // Handle OPTIONS preflight
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // Custom headers
      if (route.headers) {
        Object.entries(route.headers).forEach(([key, value]) => {
          res.setHeader(key, value);
        });
      }

      // Proxy!
      proxy.web(req, res, {
        target: `http://127.0.0.1:${route.targetPort}`,
        headers: {
          'X-Forwarded-Host': hostname,
          'X-Forwarded-Proto': 'http',
          'X-Real-IP': req.socket.remoteAddress
        }
      });
    });

    // WebSocket support
    this.proxyServer.on('upgrade', (req, socket, head) => {
      const hostname = (req.headers.host || 'localhost').split(':')[0].toLowerCase();
      const route = this.matchRoute(hostname);

      if (route) {
        proxy.ws(req, socket, head, {
          target: `ws://127.0.0.1:${route.targetPort}`
        });
      } else {
        socket.destroy();
      }
    });

    return new Promise((resolve, reject) => {
      this.proxyServer.listen(port, '0.0.0.0', () => {
        this.isRunning = true;
        this.proxyPort = port;
        console.log(`🌐 Proxy server running on port ${port}`);
        console.log(`   Access via: http://project-name.localhost:${port}/`);
        console.log(`   Or: http://project-name.127.0.0.1.nip.io:${port}/`);
        resolve({ running: true, port });
      });

      this.proxyServer.on('error', (err) => {
        this.isRunning = false;
        reject(err);
      });
    });
  }

  // 🔥 Wildcard route matching
  matchRoute(hostname) {
    // 1. Exact match
    if (this.routes.has(hostname)) {
      return this.routes.get(hostname);
    }

    // 2. .localhost wildcard: myapp.localhost → cari "myapp"
    if (hostname.endsWith('.localhost')) {
      const name = hostname.replace('.localhost', '');
      if (this.routes.has(name)) return this.routes.get(name);
    }

    // 3. nip.io wildcard: myapp.127.0.0.1.nip.io → cari "myapp"
    const nipMatch = hostname.match(/^(.+)\.127\.0\.0\.1\.nip\.io$/);
    if (nipMatch && this.routes.has(nipMatch[1])) {
      return this.routes.get(nipMatch[1]);
    }

    // 4. Port-based: project-8002.localhost → auto-route ke port 8002
    const portMatch = hostname.match(/^project-(\d+)/);
    if (portMatch) {
      const targetPort = parseInt(portMatch[1]);
      return { targetPort, domain: hostname, headers: {}, projectId: 'auto' };
    }

    // 5. Port-based nip.io: project-8002.127.0.0.1.nip.io
    const nipPortMatch = hostname.match(/^project-(\d+)\.127\.0\.0\.1\.nip\.io$/);
    if (nipPortMatch) {
      const targetPort = parseInt(nipPortMatch[1]);
      return { targetPort, domain: hostname, headers: {}, projectId: 'auto' };
    }

    return null;
  }

  // Rate limiting
  checkRateLimit(clientIp, route) {
    const key = `${clientIp}:${route.projectId}`;
    const now = Date.now();
    const limit = route.rateLimit || 100; // requests per minute
    const windowMs = 60000;

    if (!this.rateLimits.has(key)) {
      this.rateLimits.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }

    const limitData = this.rateLimits.get(key);
    if (now > limitData.resetAt) {
      this.rateLimits.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }

    if (limitData.count >= limit) {
      return false;
    }

    limitData.count++;
    return true;
  }

  // Help page untuk 404
  getHelpPage(hostname) {
    const routes = this.listRoutes();
    const routeList = routes.length > 0 
      ? routes.map(r => `<li><a href="http://${r.domain}.localhost:${this.proxyPort}/">${r.domain}.localhost:${this.proxyPort}</a> → :${r.targetPort}</li>`).join('')
      : '<li>No routes configured</li>';

    const localIP = this.getLocalIP();
    
    return `<!DOCTYPE html>
<html><head><title>EnvBox Proxy</title>
<style>body{font-family:sans-serif;max-width:600px;margin:50px auto;padding:20px;background:#0a0e1a;color:#e0e6ff}
h1{color:#6366f1}a{color:#4fc3f7}li{margin:8px 0}code{background:#1e2448;padding:2px 8px;border-radius:4px;font-size:12px}
.card{background:#151a35;border:1px solid #252b4a;border-radius:10px;padding:20px;margin:16px 0}</style></head>
<body>
<h1>EnvBox Proxy Server</h1>
<div class="card"><h3>Active Routes</h3><ul>${routeList}</ul></div>
<div class="card"><h3>Quick Access</h3>
<p>Use <code>.localhost</code> or <code>.nip.io</code> (no hosts file edit needed!)</p>
<p>Example: <code>http://myapp.localhost:${this.proxyPort}/</code></p>
<p>Auto port: <code>http://project-8002.localhost:${this.proxyPort}/</code></p>
<p>Network: <code>http://myapp.${localIP}.nip.io:${this.proxyPort}/</code></p></div>
</body></html>`;
  }

  getLocalIP() {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) return net.address;
      }
    }
    return '127.0.0.1';
  }

  // Port checking
  async checkPort(port) {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE') resolve({ available: false, port });
        else resolve({ available: false, port, error: err.message });
      });
      server.once('listening', () => {
        server.close();
        resolve({ available: true, port });
      });
      server.listen(port, '127.0.0.1');
    });
  }

  async findAvailablePort(startPort = 8000) {
    let port = startPort;
    while (port < 65535) {
      const result = await this.checkPort(port);
      if (result.available) return port;
      port++;
    }
    throw new Error('No available ports found');
  }

  // Route management
  listRoutes() {
    const routes = [];
    for (const [domain, route] of this.routes) {
      routes.push({
        domain,
        targetPort: route.targetPort,
        ssl: route.ssl,
        projectId: route.projectId
      });
    }
    return routes;
  }

  removeRoute(projectId) {
    for (const [domain, route] of this.routes) {
      if (route.projectId === projectId) {
        this.routes.delete(domain);
        console.log(`🗑 Route removed: ${domain}`);
      }
    }
    this.portMap.delete(projectId);
  }

  removeRouteByDomain(domain) {
    this.routes.delete(domain.toLowerCase());
    console.log(`🗑 Route removed: ${domain}`);
  }

  // Get network info
  getNetworkInfo() {
    const nets = os.networkInterfaces();
    const interfaces = [];
    
    for (const [name, addrs] of Object.entries(nets)) {
      for (const addr of addrs) {
        if (addr.family === 'IPv4') {
          interfaces.push({
            name,
            address: addr.address,
            internal: addr.internal
          });
        }
      }
    }

    return {
      hostname: os.hostname(),
      localIP: this.getLocalIP(),
      proxyPort: this.proxyPort,
      proxyRunning: this.isRunning,
      routesCount: this.routes.size,
      interfaces
    };
  }

  stopProxy() {
    if (this.proxyServer) {
      this.proxyServer.close();
      this.isRunning = false;
      console.log('⏹ Proxy server stopped');
    }
  }

  shutdown() {
    this.stopProxy();
    this.routes.clear();
    this.portMap.clear();
    this.rateLimits.clear();
  }
}

module.exports = { NetworkManager };