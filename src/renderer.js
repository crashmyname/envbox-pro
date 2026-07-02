// src/renderer.js - Complete Frontend Logic
// EnvBox Pro v3.0 - Enterprise Edition

// ===== GLOBAL STATE =====
let state = {
  projects: [],
  databases: [],
  redisInstances: [],
  schedules: [],
  workers: [],
  currentTab: 'dashboard',
  selectedProject: null,
  versions: {},
  metrics: {
    cpu: 0,
    memory: { used: 0, total: 0, percentage: 0 },
    disk: { used: 0, total: 0, percentage: 0 }
  },
  alerts: [],
  activeDownloads: new Map(),
  terminalSessions: new Map(),
  logWatchers: new Map()
};

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 EnvBox Pro Initializing...');
  
  await loadVersions();
  await loadProjects();
  await loadDatabases();
  await loadRedisInstances();
  await loadSchedules();
  await loadWorkers();
  await loadTemplates();
  
  setupNavigation();
  setupWindowControls();
  setupEventListeners();
  startMetricsPolling();
  startClockUpdate();
  
  console.log('✅ EnvBox Pro Ready!');
});

// ===== NAVIGATION =====
function setupNavigation() {
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = item.getAttribute('href').replace('#', '');
      switchTab(tab);
    });
  });

  // Tab buttons
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
    });
  });
}

function switchTab(tab) {
  state.currentTab = tab;
  
  // Hide all panels
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(p => p.style.display = 'none');
  
  // Show selected panel
  const panel = document.getElementById(`${tab}-panel`) || document.getElementById(tab);
  if (panel) {
    panel.classList.add('active');
    panel.style.display = 'block';
  }
  
  // Update nav active state
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(n => n.classList.remove('active'));
  const navItem = document.querySelector(`.sidebar-nav .nav-item[href="#${tab}"]`);
  if (navItem) navItem.classList.add('active');
  
  // Refresh content
  refreshTabContent(tab);
}

function refreshTabContent(tab) {
  switch(tab) {
    case 'dashboard': refreshDashboard(); break;
    case 'projects': renderProjectList(); break;
    case 'redis': renderRedisPanel(); break;
    case 'databases': renderDatabasePanel(); break;
    case 'scheduler': renderSchedulerPanel(); break;
    case 'workers': renderWorkerPanel(); break;
    case 'versions': renderVersionPanel(); break;
    case 'monitoring': renderMonitoringPanel(); break;
    case 'backups': renderBackupPanel(); break;
    case 'logs': renderLogPanel(); break;
    case 'security': renderSecurityPanel(); break;
    case 'settings': renderSettingsPanel(); break;
  }
}

// ===== WINDOW CONTROLS =====
function setupWindowControls() {
  document.getElementById('minimizeBtn')?.addEventListener('click', () => {
    window.envbox.window.minimize();
  });
  
  document.getElementById('maximizeBtn')?.addEventListener('click', () => {
    window.envbox.window.maximize();
  });
  
  document.getElementById('closeBtn')?.addEventListener('click', () => {
    window.envbox.window.close();
  });
}

// ===== EVENT LISTENERS =====
function setupEventListeners() {
  // Listen for download progress
  window.envbox.on('download:progress', (data) => {
    updateDownloadProgress(data);
  });
  
  // Listen for metrics updates
  window.envbox.on('metrics:update', (metrics) => {
    updateMetricsDisplay(metrics);
  });
  
  // Listen for alerts
  window.envbox.on('alert', (alert) => {
    showAlert(alert);
  });
  
  // Listen for scheduler logs
  window.envbox.on('scheduler:log', (log) => {
    appendSchedulerLog(log);
  });
}

// ===== METRICS POLLING =====
function startMetricsPolling() {
  setInterval(async () => {
    try {
      const metrics = await window.envbox.monitoring.metrics();
      state.metrics = metrics.system;
      updateMetricsDisplay(metrics);
    } catch (e) {
      console.error('Metrics error:', e);
    }
  }, 5000);
}

function updateMetricsDisplay(metrics) {
  if (!metrics?.system) return;
  
  const cpu = metrics.system.cpu?.usage || 0;
  const mem = metrics.system.memory || {};
  const disk = metrics.system.disk || {};
  
  document.getElementById('cpuStat').textContent = `${cpu}%`;
  document.getElementById('ramStat').textContent = `${mem.used || '0'} / ${mem.total || '0'}`;
  document.getElementById('projectStat').textContent = state.projects.filter(p => p.status === 'running').length;
  
  // Update progress bars
  updateProgressBar('cpuBar', cpu);
  updateProgressBar('ramBar', mem.percentage || 0);
  updateProgressBar('diskBar', disk.percentage || 0);
}

function updateProgressBar(id, value) {
  const bar = document.getElementById(id);
  if (bar) {
    bar.style.width = `${Math.min(value, 100)}%`;
    bar.textContent = `${value}%`;
  }
}

// ===== CLOCK =====
function startClockUpdate() {
  setInterval(() => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = now.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    
    const timeEl = document.getElementById('currentTime');
    if (timeEl) timeEl.textContent = `${dateStr} | ${timeStr}`;
  }, 1000);
}

// ===== PROJECT MANAGEMENT =====
async function loadProjects() {
  try {
    state.projects = await window.envbox.env.list();
    updateDashboard();
    renderProjectList();
    updateProjectCount();
  } catch (error) {
    console.error('Load projects error:', error);
  }
}

function renderProjectList() {
  const container = document.getElementById('projectList');
  if (!container) return;
  
  if (state.projects.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-folder-open"></i>
        <h3>No Projects Yet</h3>
        <p>Create your first project to get started</p>
        <button class="btn btn-primary" onclick="showCreateProject()">
          <i class="fas fa-plus"></i> Create Project
        </button>
      </div>
    `;
    return;
  }
  
  container.innerHTML = state.projects.map(project => `
    <div class="project-card" id="project-${project.id}">
      <div class="project-header">
        <div class="project-status">
          <span class="status-dot ${project.status === 'running' ? 'running' : 'stopped'}"></span>
          <span class="status-text">${project.status || 'stopped'}</span>
        </div>
        <div class="project-actions">
          <button class="btn-icon" onclick="startProject('${project.id}')" title="Start">
            <i class="fas fa-play"></i>
          </button>
          <button class="btn-icon" onclick="stopProject('${project.id}')" title="Stop">
            <i class="fas fa-stop"></i>
          </button>
          <button class="btn-icon" onclick="restartProject('${project.id}')" title="Restart">
            <i class="fas fa-redo"></i>
          </button>
          <button class="btn-icon" onclick="openProjectBrowser('${project.id}')" title="Open in Browser">
            <i class="fas fa-globe"></i>
          </button>
          <button class="btn-icon" onclick="deleteProject('${project.id}')" title="Delete">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
      <div class="project-body">
        <div class="project-info">
          <h3 class="project-name">${project.name || 'Unnamed Project'}</h3>
          <div class="project-meta">
            <span class="badge ${getStackBadgeClass(project.techStack)}">
              ${getStackIcon(project.techStack)} ${project.techStack} ${project.version || ''}
            </span>
            ${project.framework ? `<span class="badge badge-framework">${project.framework}</span>` : ''}
            ${project.template ? `<span class="badge badge-template">${project.template}</span>` : ''}
          </div>
        </div>
        <div class="project-details">
          <div class="detail-item">
            <i class="fas fa-link"></i>
            <a href="#" onclick="openProjectBrowser('${project.id}')">localhost:${project.port}</a>
            ${project.ssl ? `<span class="ssl-badge">🔒 HTTPS:${project.sslPort || project.port + 443}</span>` : ''}
          </div>
          <div class="detail-item">
            <i class="fas fa-microchip"></i>
            <span>CPU: ${project.cpuUsage || '0'}%</span>
          </div>
          <div class="detail-item">
            <i class="fas fa-memory"></i>
            <span>RAM: ${project.memoryUsage || '0'} MB</span>
          </div>
        </div>
        ${project.services?.length ? `
          <div class="project-services">
            ${project.services.map(s => `
              <span class="service-tag ${s.status}">
                <span class="service-dot"></span>
                ${s.name}:${s.port}
              </span>
            `).join('')}
          </div>
        ` : ''}
      </div>
    </div>
  `).join('');
}

function updateProjectCount() {
  const count = state.projects.length;
  document.getElementById('projectCount').textContent = count;
  document.getElementById('totalProjects').textContent = count;
  document.getElementById('runningCount').textContent = 
    state.projects.filter(p => p.status === 'running').length;
}

// ===== CREATE PROJECT MODAL =====
function showCreateProject() {
  const modal = document.getElementById('projectModal');
  if (modal) {
    modal.style.display = 'block';
    loadTemplatesForStack();
  }
}

function hideCreateProject() {
  const modal = document.getElementById('projectModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

async function createProject() {
  const config = {
    name: document.getElementById('projectName')?.value || 'New Project',
    techStack: document.getElementById('techStack')?.value || 'php',
    version: document.getElementById('stackVersion')?.value,
    port: parseInt(document.getElementById('projectPort')?.value || '8000'),
    documentRoot: document.getElementById('documentRoot')?.value || 'public',
    template: document.getElementById('projectTemplate')?.value || null,
    enableHTTPS: document.getElementById('enableHTTPS')?.checked || false,
    enableXDebug: document.getElementById('enableXDebug')?.checked || false,
    environmentVariables: getEnvVariablesFromForm(),
    description: document.getElementById('projectDescription')?.value || ''
  };

  try {
    showLoading('Creating project...');
    const result = await window.envbox.env.create(config);
    
    if (config.template) {
      await window.envbox.template.create(config.template, result.config);
    }
    
    await window.envbox.env.start(result.projectId);
    
    hideCreateProject();
    await loadProjects();
    showNotification('Project created successfully!', 'success');
  } catch (error) {
    showNotification(`Error: ${error.message}`, 'error');
  } finally {
    hideLoading();
  }
}

// ===== PROJECT ACTIONS =====
async function startProject(projectId) {
  try {
    showLoading('Starting project...');
    const result = await window.envbox.env.start(projectId);
    showNotification(`Project started on ${result.url}`, 'success');
    await loadProjects();
  } catch (error) {
    showNotification(`Error: ${error.message}`, 'error');
  } finally {
    hideLoading();
  }
}

async function stopProject(projectId) {
  try {
    await window.envbox.env.stop(projectId);
    showNotification('Project stopped', 'info');
    await loadProjects();
  } catch (error) {
    showNotification(`Error: ${error.message}`, 'error');
  }
}

async function restartProject(projectId) {
  try {
    await window.envbox.env.stop(projectId);
    await window.envbox.env.start(projectId);
    showNotification('Project restarted', 'success');
    await loadProjects();
  } catch (error) {
    showNotification(`Error: ${error.message}`, 'error');
  }
}

async function deleteProject(projectId) {
  if (confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
    try {
      await window.envbox.env.delete(projectId);
      showNotification('Project deleted', 'info');
      await loadProjects();
    } catch (error) {
      showNotification(`Error: ${error.message}`, 'error');
    }
  }
}

async function openProjectBrowser(projectId) {
  const project = state.projects.find(p => p.id === projectId);
  if (project) {
    const url = project.ssl ? 
      `https://localhost:${project.sslPort || project.port + 443}` : 
      `http://localhost:${project.port}`;
    await window.envbox.app.openExternal(url);
  }
}

// ===== VERSION MANAGEMENT =====
async function loadVersions() {
  const stacks = ['php', 'nodejs', 'go', 'python', 'ruby', 'java', 'rust'];
  
  for (const stack of stacks) {
    try {
      const installed = await window.envbox.versions.getInstalled(stack);
      state.versions[stack] = installed;
    } catch (e) {
      state.versions[stack] = [];
    }
  }
}

async function loadTemplates() {
  try {
    const templates = await window.envbox.template.list();
    state.templates = templates;
  } catch (e) {
    state.templates = [];
  }
}

function loadTemplatesForStack() {
  const stack = document.getElementById('techStack')?.value;
  const templateSelect = document.getElementById('projectTemplate');
  if (!templateSelect) return;
  
  templateSelect.innerHTML = '<option value="">Empty Project</option>';
  
  const stackTemplates = {
    php: ['laravel', 'wordpress', 'codeigniter', 'slim', 'symfony'],
    nodejs: ['express', 'nextjs', 'react-vite', 'nestjs', 'fastify'],
    go: ['gin', 'echo', 'fiber', 'beego'],
    python: ['django', 'flask', 'fastapi'],
    ruby: ['rails', 'sinatra'],
    java: ['spring-boot'],
    rust: ['actix', 'rocket']
  };
  
  const available = stackTemplates[stack] || [];
  available.forEach(template => {
    const opt = document.createElement('option');
    opt.value = template;
    opt.textContent = template;
    templateSelect.appendChild(opt);
  });
}

async function downloadVersion(stack, version) {
  try {
    showNotification(`Downloading ${stack} ${version}...`, 'info');
    
    window.envbox.versions.onProgress((data) => {
      if (data.stack === stack && data.version === version) {
        updateDownloadProgress(data);
      }
    });
    
    await window.envbox.versions.download(stack, version);
    showNotification(`${stack} ${version} installed successfully!`, 'success');
    await loadVersions();
  } catch (error) {
    showNotification(`Download failed: ${error.message}`, 'error');
  }
}

function updateDownloadProgress(data) {
  const { stack, version, progress, speed } = data;
  const key = `${stack}-${version}`;
  state.activeDownloads.set(key, { progress, speed });
  
  // Update UI if download panel is visible
  const progressBar = document.getElementById(`download-${key}`);
  if (progressBar) {
    progressBar.style.width = `${progress}%`;
    progressBar.textContent = `${progress}%`;
  }
}

// ===== DATABASE MANAGEMENT =====
async function loadDatabases() {
  try {
    state.databases = await window.envbox.db.list();
    document.getElementById('dbCount').textContent = state.databases.length;
  } catch (e) {
    state.databases = [];
  }
}

async function startDatabase(type, version, port) {
  try {
    const result = await window.envbox.db.start({ type, version, port });
    showNotification(`${type} started on port ${port}`, 'success');
    await loadDatabases();
  } catch (error) {
    showNotification(`Database error: ${error.message}`, 'error');
  }
}

// ===== REDIS MANAGEMENT =====
async function loadRedisInstances() {
  try {
    state.redisInstances = await window.envbox.redis.list();
    updateRedisStatus();
  } catch (e) {
    state.redisInstances = [];
  }
}

function updateRedisStatus() {
  const statusEl = document.getElementById('redisStatus');
  if (statusEl) {
    const isRunning = state.redisInstances.some(r => r.status === 'running');
    statusEl.className = `status-dot ${isRunning ? 'running' : 'stopped'}`;
    statusEl.title = isRunning ? 'Redis Running' : 'Redis Stopped';
  }
}

async function startRedis(port = 6379) {
  try {
    await window.envbox.redis.start({ port });
    showNotification('Redis started', 'success');
    await loadRedisInstances();
  } catch (error) {
    showNotification(`Redis error: ${error.message}`, 'error');
  }
}

async function stopRedis(instanceId) {
  try {
    await window.envbox.redis.stop(instanceId);
    showNotification('Redis stopped', 'info');
    await loadRedisInstances();
  } catch (error) {
    showNotification(`Redis error: ${error.message}`, 'error');
  }
}

// ===== SCHEDULER MANAGEMENT =====
async function loadSchedules() {
  try {
    state.schedules = await window.envbox.scheduler.list();
  } catch (e) {
    state.schedules = [];
  }
}

async function createSchedule() {
  const config = {
    name: document.getElementById('scheduleName')?.value,
    expression: document.getElementById('cronExpression')?.value || '* * * * *',
    command: document.getElementById('scheduleCommand')?.value,
    projectId: document.getElementById('scheduleProject')?.value,
    type: document.getElementById('scheduleType')?.value || 'cron'
  };

  try {
    await window.envbox.scheduler.create(config);
    showNotification('Schedule created', 'success');
    await loadSchedules();
  } catch (error) {
    showNotification(`Schedule error: ${error.message}`, 'error');
  }
}

// ===== WORKER MANAGEMENT =====
async function loadWorkers() {
  try {
    state.workers = await window.envbox.worker.list();
  } catch (e) {
    state.workers = [];
  }
}

async function startWorker(workerId) {
  try {
    await window.envbox.worker.start(workerId);
    showNotification('Worker started', 'success');
    await loadWorkers();
  } catch (error) {
    showNotification(`Worker error: ${error.message}`, 'error');
  }
}

// ===== CACHE MANAGEMENT =====
async function clearCache(projectId) {
  try {
    const result = await window.envbox.cache.clear(projectId);
    showNotification('Cache cleared: ' + JSON.stringify(result), 'success');
  } catch (error) {
    showNotification(`Cache error: ${error.message}`, 'error');
  }
}

async function warmupCache(projectId) {
  try {
    await window.envbox.cache.warmup(projectId);
    showNotification('Cache warmed up', 'success');
  } catch (error) {
    showNotification(`Cache error: ${error.message}`, 'error');
  }
}

async function resetOPcache(projectId) {
  try {
    const result = await window.envbox.opcache.reset(projectId);
    showNotification('OPcache reset', 'success');
  } catch (error) {
    showNotification(`OPcache error: ${error.message}`, 'error');
  }
}

// ===== SECURITY =====
async function scanProjectSecurity(projectId) {
  try {
    showLoading('Scanning security...');
    const result = await window.envbox.security.scan(projectId);
    showSecurityResults(result);
  } catch (error) {
    showNotification(`Security scan error: ${error.message}`, 'error');
  } finally {
    hideLoading();
  }
}

function showSecurityResults(result) {
  const modal = document.getElementById('securityModal');
  const content = document.getElementById('securityResults');
  if (!modal || !content) return;
  
  modal.style.display = 'block';
  content.innerHTML = `
    <h3>Security Score: ${result.score}/100</h3>
    <div class="security-details">
      <h4>Vulnerabilities: ${result.vulnerabilities?.length || 0}</h4>
      <h4>Config Issues: ${result.configIssues?.length || 0}</h4>
      <h4>SSL Issues: ${result.sslIssues?.length || 0}</h4>
    </div>
    <div class="recommendations">
      <h4>Recommendations:</h4>
      <ul>
        ${(result.recommendations || []).map(r => `<li>${r}</li>`).join('')}
      </ul>
    </div>
  `;
}

// ===== PERFORMANCE =====
async function optimizePerformance(projectId) {
  const level = document.getElementById('perfLevel')?.value || 'production';
  const cacheStrategy = document.getElementById('cacheStrategy')?.value || 'aggressive';
  const memoryLimit = document.getElementById('memoryLimit')?.value || '256';
  
  try {
    showLoading('Optimizing...');
    const result = await window.envbox.performance.optimize({
      projectId,
      level,
      cacheStrategy,
      memoryLimit
    });
    showNotification(`Optimized! ${result.optimizations?.length || 0} improvements applied`, 'success');
  } catch (error) {
    showNotification(`Optimization error: ${error.message}`, 'error');
  } finally {
    hideLoading();
  }
}

// ===== BACKUP =====
async function loadBackups() {
  try {
    const backups = await window.envbox.backup.list();
    renderBackupList(backups);
  } catch (e) {
    console.error('Backup load error:', e);
  }
}

function renderBackupList(backups) {
  const container = document.getElementById('backupList');
  if (!container) return;
  
  container.innerHTML = backups.map(backup => `
    <div class="backup-item">
      <div class="backup-info">
        <span class="backup-date">${new Date(backup.timestamp).toLocaleString()}</span>
        <span class="backup-type">${backup.type}</span>
        <span class="backup-size">${formatBytes(backup.size || 0)}</span>
      </div>
      <div class="backup-actions">
        <button class="btn btn-sm btn-success" onclick="restoreBackup('${backup.id}')">
          <i class="fas fa-undo"></i> Restore
        </button>
        <button class="btn btn-sm btn-danger" onclick="deleteBackup('${backup.id}')">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>
  `).join('');
}

async function createBackup(projectId) {
  try {
    showLoading('Creating backup...');
    const result = await window.envbox.backup.create({
      projectId,
      type: 'full',
      includeDatabase: true
    });
    showNotification('Backup created!', 'success');
    await loadBackups();
  } catch (error) {
    showNotification(`Backup error: ${error.message}`, 'error');
  } finally {
    hideLoading();
  }
}

// ===== TERMINAL =====
async function openProjectTerminal(projectId) {
  switchTab('terminal');
  
  const project = state.projects.find(p => p.id === projectId);
  if (!project) return;
  
  try {
    const terminal = await window.envbox.terminal.create(projectId, project.projectPath, (data) => {
      const terminalEl = document.getElementById(`terminal-${projectId}`);
      if (terminalEl) {
        terminalEl.innerHTML += data.data.replace(/\n/g, '<br>');
        terminalEl.scrollTop = terminalEl.scrollHeight;
      }
    });
    
    state.terminalSessions.set(projectId, terminal);
    
    // Render terminal container
    const container = document.getElementById('terminalContainer');
    if (container) {
      container.innerHTML = `
        <div class="terminal-header">
          <span>Terminal - ${project.name}</span>
          <button onclick="closeTerminal('${projectId}')">✕</button>
        </div>
        <div class="terminal-body" id="terminal-${projectId}"></div>
        <div class="terminal-input">
          <input type="text" id="terminalInput-${projectId}" 
                 onkeypress="handleTerminalInput(event, '${projectId}')" 
                 placeholder="Type command...">
        </div>
      `;
    }
  } catch (error) {
    showNotification(`Terminal error: ${error.message}`, 'error');
  }
}

function handleTerminalInput(event, projectId) {
  if (event.key === 'Enter') {
    const input = event.target;
    const command = input.value;
    input.value = '';
    
    const terminal = state.terminalSessions.get(projectId);
    if (terminal) {
      terminal.write(terminal.terminalId, command + '\n');
    }
  }
}

function closeTerminal(projectId) {
  const terminal = state.terminalSessions.get(projectId);
  if (terminal) {
    terminal.cleanup();
    state.terminalSessions.delete(projectId);
  }
}

// ===== LOG VIEWER =====
async function viewProjectLogs(projectId) {
  switchTab('logs');
  
  const project = state.projects.find(p => p.id === projectId);
  if (!project) return;
  
  const logType = document.getElementById('logType')?.value || 'php';
  
  try {
    const cleanup = await window.envbox.logs.watch(projectId, logType, (data) => {
      const logContent = document.getElementById('logContent');
      if (logContent) {
        logContent.textContent = data.content;
        logContent.scrollTop = logContent.scrollHeight;
      }
    });
    
    state.logWatchers.set(projectId, cleanup);
    
    // Update log panel header
    const logHeader = document.getElementById('logHeader');
    if (logHeader) {
      logHeader.textContent = `Logs - ${project.name} (${logType})`;
    }
  } catch (error) {
    showNotification(`Log error: ${error.message}`, 'error');
  }
}

// ===== SSL MANAGEMENT =====
async function generateSSL(projectId, domain = 'localhost') {
  try {
    const result = await window.envbox.ssl.generate(domain, projectId);
    showNotification(`SSL certificate generated for ${domain}`, 'success');
  } catch (error) {
    showNotification(`SSL error: ${error.message}`, 'error');
  }
}

// ===== XDEBUG =====
async function toggleXDebug(projectId, enabled) {
  try {
    await window.envbox.xdebug.toggle(projectId, enabled);
    showNotification(`XDebug ${enabled ? 'enabled' : 'disabled'}`, 'success');
  } catch (error) {
    showNotification(`XDebug error: ${error.message}`, 'error');
  }
}

// ===== NETWORK =====
async function checkPort(port) {
  try {
    const result = await window.envbox.network.portCheck(port);
    showNotification(`Port ${port} is ${result.available ? 'available' : 'in use'}`, 
      result.available ? 'success' : 'warning');
    return result.available;
  } catch (error) {
    showNotification(`Port check error: ${error.message}`, 'error');
  }
}

// ===== COLLABORATION =====
async function shareProject(projectId) {
  try {
    showLoading('Creating share snapshot...');
    const result = await window.envbox.collab.share({
      projectId,
      method: 'export',
      includeData: true
    });
    showNotification('Project exported for sharing!', 'success');
  } catch (error) {
    showNotification(`Share error: ${error.message}`, 'error');
  } finally {
    hideLoading();
  }
}

async function importSharedProject() {
  try {
    const result = await window.envbox.dialog.openFile({
      filters: [{ name: 'EnvBox Snapshots', extensions: ['envbox'] }]
    });
    
    if (!result.canceled && result.filePaths?.length) {
      showLoading('Importing project...');
      await window.envbox.collab.import(result.filePaths[0]);
      showNotification('Project imported!', 'success');
      await loadProjects();
    }
  } catch (error) {
    showNotification(`Import error: ${error.message}`, 'error');
  } finally {
    hideLoading();
  }
}

// ===== UTILITY FUNCTIONS =====
function getStackIcon(stack) {
  const icons = {
    php: '🐘', nodejs: '🟢', go: '🔵', python: '🐍',
    ruby: '💎', java: '☕', rust: '🦀'
  };
  return icons[stack] || '📦';
}

function getStackBadgeClass(stack) {
  const classes = {
    php: 'badge-php', nodejs: 'badge-node', go: 'badge-go',
    python: 'badge-python', ruby: 'badge-ruby', java: 'badge-java',
    rust: 'badge-rust'
  };
  return classes[stack] || 'badge-default';
}

function getEnvVariablesFromForm() {
  const vars = {};
  document.querySelectorAll('.env-var-row').forEach(row => {
    const key = row.querySelector('.env-key')?.value;
    const value = row.querySelector('.env-value')?.value;
    if (key) vars[key] = value || '';
  });
  return vars;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function showNotification(message, type = 'info') {
  // Create toast notification
  const container = document.getElementById('notificationContainer') || createNotificationContainer();
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <div class="toast-content">
      <i class="fas ${getToastIcon(type)}"></i>
      <span>${message}</span>
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()">×</button>
  `;
  
  container.appendChild(toast);
  
  // Auto remove after 5 seconds
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

function createNotificationContainer() {
  const container = document.createElement('div');
  container.id = 'notificationContainer';
  container.style.cssText = 'position:fixed;top:50px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:10px;';
  document.body.appendChild(container);
  return container;
}

function getToastIcon(type) {
  const icons = {
    success: 'fa-check-circle', error: 'fa-exclamation-circle',
    warning: 'fa-exclamation-triangle', info: 'fa-info-circle'
  };
  return icons[type] || 'fa-info-circle';
}

function showLoading(message = 'Loading...') {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    overlay.querySelector('.loading-text').textContent = message;
    overlay.style.display = 'flex';
  }
}

function hideLoading() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
}

function showAlert(alert) {
  state.alerts.unshift(alert);
  if (state.alerts.length > 100) state.alerts.pop();
  
  // Show in UI
  const alertContainer = document.getElementById('alertContainer');
  if (alertContainer && alert.level === 'warning' || alert.level === 'error') {
    showNotification(`${alert.title}: ${alert.message}`, alert.level);
  }
}

function updateDashboard() {
  document.getElementById('runningCount').textContent = 
    state.projects.filter(p => p.status === 'running').length;
  document.getElementById('totalProjects').textContent = state.projects.length;
  document.getElementById('dbCount').textContent = state.databases.length;
}

// ===== PANEL RENDERERS =====
function renderRedisPanel() {
  const container = document.getElementById('redisContent');
  if (!container) return;
  
  container.innerHTML = `
    <div class="redis-controls">
      <button class="btn btn-success" onclick="startRedis()">
        <i class="fas fa-play"></i> Start Redis
      </button>
      <button class="btn btn-danger" onclick="stopRedis('default')">
        <i class="fas fa-stop"></i> Stop Redis
      </button>
      <button class="btn btn-warning" onclick="flushRedis('default')">
        <i class="fas fa-eraser"></i> Flush All
      </button>
    </div>
    <div class="redis-instances">
      ${state.redisInstances.map(r => `
        <div class="redis-instance">
          <span class="status-dot ${r.status}"></span>
          <span>Port: ${r.port}</span>
          <span>Memory: ${r.memory || '0'} MB</span>
          <span>Keys: ${r.keys || '0'}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function renderDatabasePanel() {
  const container = document.getElementById('databaseContent');
  if (!container) return;
  
  container.innerHTML = state.databases.map(db => `
    <div class="db-card">
      <h4>${db.type} ${db.version}</h4>
      <p>Port: ${db.port}</p>
      <p>Status: ${db.status}</p>
      <p>Databases: ${db.databases?.length || 0}</p>
    </div>
  `).join('');
}

function renderSchedulerPanel() {
  const container = document.getElementById('schedulerContent');
  if (!container) return;
  
  container.innerHTML = state.schedules.map(s => `
    <div class="schedule-card">
      <h4>${s.name}</h4>
      <p>Cron: ${s.expression}</p>
      <p>Status: ${s.status}</p>
      <p>Last Run: ${s.lastRun || 'Never'}</p>
      <p>Next Run: ${s.nextRun || 'N/A'}</p>
    </div>
  `).join('');
}

function renderWorkerPanel() {
  const container = document.getElementById('workerContent');
  if (!container) return;
  
  container.innerHTML = state.workers.map(w => `
    <div class="worker-card">
      <h4>${w.name}</h4>
      <p>Instances: ${w.instances}</p>
      <p>Status: ${w.status}</p>
      <p>Restarts: ${w.restarts || 0}</p>
    </div>
  `).join('');
}

function renderVersionPanel() {
  // Will be rendered when versions tab is opened
}

function renderMonitoringPanel() {
  // Will be rendered when monitoring tab is opened
}

function renderBackupPanel() {
  loadBackups();
}

function renderLogPanel() {
  // Will be rendered when log tab is opened
}

function renderSecurityPanel() {
  // Will be rendered when security tab is opened
}

function renderSettingsPanel() {
  const container = document.getElementById('settingsContent');
  if (!container) return;
  
  container.innerHTML = `
    <div class="settings-section">
      <h3>General Settings</h3>
      <div class="setting-item">
        <label>Auto-start on boot</label>
        <input type="checkbox" id="autoStart">
      </div>
      <div class="setting-item">
        <label>Minimize to tray</label>
        <input type="checkbox" id="minimizeToTray" checked>
      </div>
    </div>
    <div class="settings-section">
      <h3>Performance</h3>
      <div class="setting-item">
        <label>Default Performance Mode</label>
        <select id="defaultPerfMode">
          <option>Development</option>
          <option>Staging</option>
          <option selected>Production</option>
        </select>
      </div>
      <div class="setting-item">
        <label>Auto-optimize new projects</label>
        <input type="checkbox" id="autoOptimize" checked>
      </div>
    </div>
    <div class="settings-section">
      <h3>Backup</h3>
      <div class="setting-item">
        <label>Auto-backup interval</label>
        <select id="backupInterval">
          <option>Never</option>
          <option>Daily</option>
          <option selected>Weekly</option>
          <option>Monthly</option>
        </select>
      </div>
      <div class="setting-item">
        <label>Backup retention (days)</label>
        <input type="number" id="backupRetention" value="30">
      </div>
    </div>
    <button class="btn btn-primary" onclick="saveSettings()">Save Settings</button>
  `;
}

function saveSettings() {
  const settings = {
    autoStart: document.getElementById('autoStart')?.checked,
    minimizeToTray: document.getElementById('minimizeToTray')?.checked,
    defaultPerfMode: document.getElementById('defaultPerfMode')?.value,
    autoOptimize: document.getElementById('autoOptimize')?.checked,
    backupInterval: document.getElementById('backupInterval')?.value,
    backupRetention: document.getElementById('backupRetention')?.value
  };
  
  // Save via IPC
  ipcRenderer.invoke('settings:save', settings);
  showNotification('Settings saved!', 'success');
}

// ===== EXPORT FUNCTIONS TO WINDOW =====
window.startProject = startProject;
window.stopProject = stopProject;
window.restartProject = restartProject;
window.deleteProject = deleteProject;
window.openProjectBrowser = openProjectBrowser;
window.showCreateProject = showCreateProject;
window.hideCreateProject = hideCreateProject;
window.createProject = createProject;
window.downloadVersion = downloadVersion;
window.startDatabase = startDatabase;
window.startRedis = startRedis;
window.stopRedis = stopRedis;
window.createSchedule = createSchedule;
window.startWorker = startWorker;
window.clearCache = clearCache;
window.warmupCache = warmupCache;
window.resetOPcache = resetOPcache;
window.scanProjectSecurity = scanProjectSecurity;
window.optimizePerformance = optimizePerformance;
window.createBackup = createBackup;
window.openProjectTerminal = openProjectTerminal;
window.viewProjectLogs = viewProjectLogs;
window.generateSSL = generateSSL;
window.toggleXDebug = toggleXDebug;
window.checkPort = checkPort;
window.shareProject = shareProject;
window.importSharedProject = importSharedProject;
window.saveSettings = saveSettings;
window.switchTab = switchTab;
window.handleTerminalInput = handleTerminalInput;
window.closeTerminal = closeTerminal;

console.log('✅ EnvBox Pro Renderer Loaded!');