// modules/StabilityManager.js
const { EventEmitter } = require('events');
const fs = require('fs-extra');
const path = require('path');

class StabilityManager extends EventEmitter {
  constructor() {
    super();
    this.healthChecks = new Map();
    this.recoveryAttempts = new Map();
    this.maxRecoveryAttempts = 3;
    this.checkInterval = 5000; // 5 seconds
    this.intervalId = null;
    this.isRunning = false;
  }

  async start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.intervalId = setInterval(() => this.runHealthChecks(), this.checkInterval);
    
    console.log('🛡️ Stability Manager started');
  }

  async stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
  }

  async registerHealthCheck(projectId, checkFunction) {
    this.healthChecks.set(projectId, {
      check: checkFunction,
      status: 'healthy',
      lastCheck: null,
      failures: 0,
      lastFailure: null
    });
  }

  async unregisterHealthCheck(projectId) {
    this.healthChecks.delete(projectId);
  }

  async runHealthChecks() {
    for (const [projectId, healthData] of this.healthChecks) {
      try {
        const result = await healthData.check();
        
        healthData.status = result.healthy ? 'healthy' : 'unhealthy';
        healthData.lastCheck = new Date().toISOString();

        if (!result.healthy) {
          healthData.failures++;
          healthData.lastFailure = new Date().toISOString();
          
          this.emit('health:degraded', {
            projectId,
            failures: healthData.failures,
            details: result
          });

          // Auto-recovery
          if (healthData.failures <= this.maxRecoveryAttempts) {
            await this.attemptRecovery(projectId, result);
          } else {
            this.emit('health:failed', {
              projectId,
              message: 'Max recovery attempts reached'
            });
          }
        } else {
          // Reset failures on success
          if (healthData.failures > 0) {
            healthData.failures = 0;
            this.emit('health:recovered', { projectId });
          }
        }

        this.emit('health:check', {
          projectId,
          status: healthData.status,
          timestamp: healthData.lastCheck
        });
      } catch (error) {
        console.error(`Health check error for ${projectId}:`, error);
      }
    }
  }

  async attemptRecovery(projectId, healthResult) {
    const attempts = this.recoveryAttempts.get(projectId) || 0;
    
    if (attempts >= this.maxRecoveryAttempts) {
      console.log(`❌ Max recovery attempts reached for ${projectId}`);
      return;
    }

    this.recoveryAttempts.set(projectId, attempts + 1);

    console.log(`🔄 Recovery attempt ${attempts + 1} for ${projectId}`);

    this.emit('recovery:started', {
      projectId,
      attempt: attempts + 1
    });

    try {
      // Recovery strategies based on health result
      if (healthResult.type === 'process_crash') {
        // Restart the process
        this.emit('recovery:restart', { projectId });
      } else if (healthResult.type === 'memory_leak') {
        // Request garbage collection or restart
        this.emit('recovery:memory', { projectId });
      } else if (healthResult.type === 'port_conflict') {
        // Change port
        this.emit('recovery:port_change', { projectId });
      } else if (healthResult.type === 'database_connection') {
        // Restart database
        this.emit('recovery:database', { projectId });
      }

      // Wait for recovery to take effect
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Re-check health
      const healthData = this.healthChecks.get(projectId);
      if (healthData) {
        const recheck = await healthData.check();
        
        if (recheck.healthy) {
          healthData.failures = 0;
          this.recoveryAttempts.set(projectId, 0);
          
          this.emit('recovery:success', {
            projectId,
            attempt: attempts + 1
          });
        }
      }
    } catch (error) {
      console.error(`Recovery failed for ${projectId}:`, error);
      
      this.emit('recovery:failed', {
        projectId,
        error: error.message
      });
    }
  }

  async getHealthStatus(projectId) {
    if (projectId) {
      const healthData = this.healthChecks.get(projectId);
      if (!healthData) return { healthy: false, reason: 'Not registered' };

      return {
        projectId,
        status: healthData.status,
        lastCheck: healthData.lastCheck,
        failures: healthData.failures,
        recoveryAttempts: this.recoveryAttempts.get(projectId) || 0
      };
    }

    // Return status for all projects
    const allStatus = [];
    for (const [id, data] of this.healthChecks) {
      allStatus.push({
        projectId: id,
        status: data.status,
        failures: data.failures
      });
    }

    return {
      totalProjects: allStatus.length,
      healthy: allStatus.filter(s => s.status === 'healthy').length,
      unhealthy: allStatus.filter(s => s.status === 'unhealthy').length,
      projects: allStatus
    };
  }

  async getStabilityReport() {
    const report = {
      uptime: process.uptime(),
      healthChecks: this.healthChecks.size,
      totalRecoveries: 0,
      totalFailures: 0,
      projects: []
    };

    for (const [id, data] of this.healthChecks) {
      report.projects.push({
        projectId: id,
        status: data.status,
        failures: data.failures,
        lastCheck: data.lastCheck
      });
      report.totalFailures += data.failures;
    }

    report.totalRecoveries = [...this.recoveryAttempts.values()]
      .reduce((sum, val) => sum + val, 0);

    return report;
  }

  shutdown() {
    this.stop();
    this.healthChecks.clear();
    this.recoveryAttempts.clear();
  }
}

module.exports = { StabilityManager };