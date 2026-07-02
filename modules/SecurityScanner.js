// modules/SecurityScanner.js
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');

class SecurityScanner {
  constructor() {
    this.scanResults = new Map();
  }

  async scanProject(projectId) {
    const project = await this.getProject(projectId);
    if (!project) throw new Error('Project not found');

    const results = {
      projectId,
      projectName: project.name,
      techStack: project.techStack,
      scannedAt: new Date().toISOString(),
      score: 100,
      vulnerabilities: [],
      configIssues: [],
      sslIssues: [],
      permissionIssues: [],
      recommendations: []
    };

    // Scan dependencies
    const depIssues = await this.scanDependencies(project);
    results.vulnerabilities.push(...depIssues);

    // Scan configurations
    const configIssues = await this.scanConfigurations(project);
    results.configIssues.push(...configIssues);

    // Scan SSL
    if (project.ssl?.enabled) {
      const sslIssues = await this.scanSSL(project);
      results.sslIssues.push(...sslIssues);
    }

    // Scan permissions
    const permIssues = await this.scanPermissions(project);
    results.permissionIssues.push(...permIssues);

    // Calculate score
    results.score = this.calculateScore(results);
    
    // Generate recommendations
    results.recommendations = this.generateRecommendations(results);

    this.scanResults.set(projectId, results);
    return results;
  }

  async scanDependencies(project) {
    const issues = [];

    try {
      switch (project.techStack) {
        case 'php': {
          const composerPath = path.join(project.projectPath, 'composer.lock');
          if (await fs.pathExists(composerPath)) {
            // Check for known vulnerable packages
            try {
              const result = await this.execCommand('composer audit --format=json', {
                cwd: project.projectPath
              });
              const audit = JSON.parse(result);
              if (audit.advisories) {
                Object.values(audit.advisories).forEach(adv => {
                  issues.push({
                    type: 'dependency',
                    severity: adv.severity || 'medium',
                    package: adv.packageName,
                    title: adv.title,
                    cve: adv.cve,
                    fix: adv.patchedVersions
                  });
                });
              }
            } catch (e) {
              // Composer audit not available
              issues.push({
                type: 'warning',
                severity: 'low',
                message: 'Composer audit not available. Run composer update.'
              });
            }
          }
          break;
        }
        case 'nodejs': {
          const packagePath = path.join(project.projectPath, 'package.json');
          if (await fs.pathExists(packagePath)) {
            try {
              const result = await this.execCommand('npm audit --json', {
                cwd: project.projectPath
              });
              const audit = JSON.parse(result);
              
              if (audit.vulnerabilities) {
                Object.entries(audit.vulnerabilities).forEach(([pkg, data]) => {
                  issues.push({
                    type: 'dependency',
                    severity: data.severity,
                    package: pkg,
                    title: data.title || data.name,
                    fix: data.fixAvailable ? 'Update available' : 'No fix available'
                  });
                });
              }
            } catch (e) {
              issues.push({
                type: 'warning',
                severity: 'low',
                message: 'npm audit failed. Check dependencies manually.'
              });
            }
          }
          break;
        }
      }
    } catch (e) {
      console.log(`Dependency scan error: ${e.message}`);
    }

    return issues;
  }

  async scanConfigurations(project) {
    const issues = [];

    if (!project.projectPath) {
        console.log('⚠️ No projectPath for', project.name);
        return issues;
    }

    // Check .env file exposure
    if (project.techStack === 'php') {
      const publicEnv = path.join(project.projectPath, 'public', '.env');
      if (await fs.pathExists(publicEnv)) {
        issues.push({
          type: 'configuration',
          severity: 'critical',
          message: '.env file is publicly accessible!',
          fix: 'Move .env outside public directory'
        });
      }

      // Check debug mode
      const envFile = path.join(project.projectPath, '.env');
      if (await fs.pathExists(envFile)) {
        const content = await fs.readFile(envFile, 'utf8');
        if (content.includes('APP_DEBUG=true')) {
          issues.push({
            type: 'configuration',
            severity: 'high',
            message: 'Debug mode is enabled',
            fix: 'Set APP_DEBUG=false in production'
          });
        }
      }

      // Check PHP version
      if (project.version && project.version.startsWith('5.')) {
        issues.push({
          type: 'configuration',
          severity: 'critical',
          message: `PHP ${project.version} is End of Life`,
          fix: 'Upgrade to PHP 8.1 or later'
        });
      }
    }

    // Check file permissions
    const sensitiveFiles = ['.env', 'composer.json', 'package.json', 'wp-config.php'];
    for (const file of sensitiveFiles) {
      const filePath = path.join(project.projectPath, file);
      if (await fs.pathExists(filePath)) {
        try {
          const stat = await fs.stat(filePath);
          // Check if world-readable
          if (stat.mode & 0o004) {
            issues.push({
              type: 'permission',
              severity: 'medium',
              message: `${file} is world-readable`,
              fix: `chmod 600 ${file}`
            });
          }
        } catch (e) {
          // Skip
        }
      }
    }

    return issues;
  }

  async scanSSL(project) {
    const issues = [];

    if (project.ssl?.enabled) {
      // Check certificate expiration
      if (project.ssl.certPath) {
        try {
          const certContent = await fs.readFile(project.ssl.certPath, 'utf8');
          // Basic check - in production would use proper cert parsing
          if (certContent.includes('BEGIN CERTIFICATE')) {
            // Certificate exists - check if self-signed
            if (certContent.includes('mkcert') || certContent.includes('self-signed')) {
              issues.push({
                type: 'ssl',
                severity: 'low',
                message: 'Using self-signed certificate',
                fix: 'Use Let\'s Encrypt or trusted CA for production'
              });
            }
          }
        } catch (e) {
          issues.push({
            type: 'ssl',
            severity: 'high',
            message: 'SSL certificate not found or invalid',
            fix: 'Regenerate SSL certificate'
          });
        }
      }
    }

    return issues;
  }

  async scanPermissions(project) {
    const issues = [];

    const criticalPaths = [
      'storage',
      'bootstrap/cache',
      'wp-content/uploads'
    ];

    for (const checkPath of criticalPaths) {
      const fullPath = path.join(project.projectPath, checkPath);
      if (await fs.pathExists(fullPath)) {
        try {
          const stat = await fs.stat(fullPath);
          if (stat.mode & 0o002) {
            issues.push({
              type: 'permission',
              severity: 'high',
              message: `${checkPath} is world-writable`,
              fix: `chmod 755 ${checkPath}`
            });
          }
        } catch (e) {
          // Skip
        }
      }
    }

    return issues;
  }

  async autoFix(projectId) {
    const results = this.scanResults.get(projectId);
    if (!results) throw new Error('Scan project first');

    const fixes = [];

    // Fix debug mode
    const project = await this.getProject(projectId);
    if (project) {
      const envFile = path.join(project.projectPath, '.env');
      if (await fs.pathExists(envFile)) {
        let content = await fs.readFile(envFile, 'utf8');
        content = content.replace('APP_DEBUG=true', 'APP_DEBUG=false');
        await fs.writeFile(envFile, content);
        fixes.push('Debug mode disabled');
      }

      // Fix .env location
      const publicEnv = path.join(project.projectPath, 'public', '.env');
      if (await fs.pathExists(publicEnv)) {
        await fs.remove(publicEnv);
        fixes.push('Exposed .env file removed from public');
      }
    }

    return { fixed: fixes, newScore: await this.calculateScore(results) };
  }

  async fullAudit() {
    const allProjects = await this.getAllProjects();
    const results = [];

    for (const project of allProjects) {
      const scanResult = await this.scanProject(project.id);
      results.push(scanResult);
    }

    return {
      totalProjects: allProjects.length,
      averageScore: results.reduce((sum, r) => sum + r.score, 0) / results.length,
      criticalIssues: results.reduce((sum, r) => 
        sum + r.vulnerabilities.filter(v => v.severity === 'critical').length, 0),
      highIssues: results.reduce((sum, r) => 
        sum + r.vulnerabilities.filter(v => v.severity === 'high').length, 0),
      projects: results
    };
  }

  calculateScore(results) {
    let score = 100;

    // Deduct for vulnerabilities
    const severityWeights = { critical: 25, high: 15, medium: 8, low: 3 };
    
    for (const vuln of results.vulnerabilities) {
      score -= severityWeights[vuln.severity] || 5;
    }

    // Deduct for config issues
    score -= results.configIssues.length * 5;
    
    // Deduct for SSL issues
    score -= results.sslIssues.length * 8;
    
    // Deduct for permission issues
    score -= results.permissionIssues.length * 10;

    return Math.max(0, Math.min(100, score));
  }

  generateRecommendations(results) {
    const recommendations = [];

    if (results.score < 50) {
      recommendations.push('URGENT: Schedule immediate security review');
    }

    if (results.vulnerabilities.some(v => v.severity === 'critical')) {
      recommendations.push('Fix critical vulnerabilities immediately');
    }

    if (results.configIssues.some(i => i.message.includes('Debug mode'))) {
      recommendations.push('Disable debug mode in production');
    }

    if (results.sslIssues.length > 0) {
      recommendations.push('Review SSL certificate configuration');
    }

    if (results.permissionIssues.length > 0) {
      recommendations.push('Fix file permissions to prevent unauthorized access');
    }

    if (recommendations.length === 0) {
      recommendations.push('No critical issues found. Maintain current security posture.');
    }

    return recommendations;
  }

  async getProject(projectId) {
      const store = path.join(process.env.APPDATA || '', 'envbox-pro', 'environments.json');
      if (await fs.pathExists(store)) {
          const data = await fs.readJson(store);
          const project = data.environments?.find(e => e.id === projectId || String(e.id) === String(projectId));
          if (project) {
              if (!project.projectPath) {
                  project.projectPath = path.join(__dirname, '..', 'projects', project.name);
              }
              if (!project.techStack && project.stack) {
                  project.techStack = project.stack;
              }
              return project;
          }
      }
      
      // Fallback: cari dari folder projects
      const projectsDir = path.join(__dirname, '..', 'projects');
      if (await fs.pathExists(projectsDir)) {
          const dirs = await fs.readdir(projectsDir);
          for (const dir of dirs) {
              const idFile = path.join(projectsDir, dir, '.envbox', 'project-id');
              if (await fs.pathExists(idFile)) {
                  const id = (await fs.readFile(idFile, 'utf8')).trim();
                  if (String(id) === String(projectId)) {
                      return {
                          id: projectId,
                          name: dir,
                          techStack: 'php',
                          projectPath: path.join(projectsDir, dir),
                          version: '8.2'
                      };
                  }
              }
          }
      }
      
      return null;
  }

  async getAllProjects() {
      const projects = [];
      
      // Coba dari environments.json
      const store = path.join(process.env.APPDATA || '', 'envbox-pro', 'environments.json');
      if (await fs.pathExists(store)) {
          const data = await fs.readJson(store);
          for (const p of (data.environments || [])) {
              if (!p.projectPath) {
                  p.projectPath = path.join(__dirname, '..', 'projects', p.name);
              }
              if (!p.techStack && p.stack) p.techStack = p.stack;
              projects.push(p);
          }
      }
      
      // Fallback: scan folder projects
      if (projects.length === 0) {
          const projectsDir = path.join(__dirname, '..', 'projects');
          if (await fs.pathExists(projectsDir)) {
              const dirs = await fs.readdir(projectsDir);
              for (const dir of dirs) {
                  if (dir === 'default' || dir.startsWith('.')) continue;
                  const idFile = path.join(projectsDir, dir, '.envbox', 'project-id');
                  const id = await fs.pathExists(idFile) ? (await fs.readFile(idFile, 'utf8')).trim() : dir;
                  projects.push({
                      id, name: dir, techStack: 'php',
                      projectPath: path.join(projectsDir, dir), version: '8.2'
                  });
              }
          }
      }
      
      return projects;
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

module.exports = { SecurityScanner };