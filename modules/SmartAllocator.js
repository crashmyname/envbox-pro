// modules/SmartAllocator.js
const os = require('os');
const { EventEmitter } = require('events');

class SmartAllocator extends EventEmitter {
  constructor() {
    super();
    this.resourceLimits = new Map();
    this.allocations = new Map();
    this.metrics = new Map();
    this.totalMemory = os.totalmem();
    this.totalCPU = os.cpus().length;
  }

  async allocateResources(projectId, requirements) {
    const {
      requestedMemory = 128, // MB
      requestedCPU = 1,      // cores
      priority = 'normal'    // low, normal, high, critical
    } = requirements;

    // Check available resources
    const available = this.getAvailableResources();
    
    if (requestedMemory > available.memory) {
      if (priority === 'critical') {
        // Try to free up memory from low-priority projects
        await this.reclaimResources('memory', requestedMemory - available.memory);
      } else {
        throw new Error(`Insufficient memory: ${requestedMemory}MB requested, ${available.memory}MB available`);
      }
    }

    // Allocate resources
    const allocation = {
      projectId,
      memory: Math.min(requestedMemory, available.memory),
      cpu: Math.min(requestedCPU, available.cpu),
      priority,
      allocatedAt: new Date().toISOString()
    };

    this.allocations.set(projectId, allocation);
    this.resourceLimits.set(projectId, {
      maxMemory: allocation.memory * 1024 * 1024, // Convert to bytes
      maxCPU: allocation.cpu * 100 // Percentage
    });

    this.emit('resources:allocated', { projectId, allocation });

    return allocation;
  }

  async deallocateResources(projectId) {
    const allocation = this.allocations.get(projectId);
    if (allocation) {
      this.allocations.delete(projectId);
      this.resourceLimits.delete(projectId);
      
      this.emit('resources:deallocated', { projectId, freed: allocation });
      return allocation;
    }

    return null;
  }

  getAvailableResources() {
    const usedMemory = this.getUsedMemory();
    const usedCPU = this.getUsedCPU();

    return {
      memory: Math.floor((this.totalMemory - usedMemory) / (1024 * 1024)),
      cpu: this.totalCPU - usedCPU
    };
  }

  getUsedMemory() {
    let used = 0;
    for (const [id, allocation] of this.allocations) {
      used += allocation.memory * 1024 * 1024;
    }
    return used;
  }

  getUsedCPU() {
    let used = 0;
    for (const [id, allocation] of this.allocations) {
      used += allocation.cpu;
    }
    return Math.min(used, this.totalCPU);
  }

  async reclaimResources(type, amount) {
    // Sort by priority (low first)
    const sorted = [...this.allocations.entries()]
      .sort((a, b) => {
        const priorityOrder = { critical: 4, high: 3, normal: 2, low: 1 };
        return priorityOrder[a[1].priority] - priorityOrder[b[1].priority];
      });

    let reclaimed = 0;
    const freedProjects = [];

    for (const [projectId, allocation] of sorted) {
      if (reclaimed >= amount) break;
      
      if (allocation.priority !== 'critical') {
        reclaimed += type === 'memory' ? allocation.memory : allocation.cpu;
        freedProjects.push(projectId);
        
        this.emit('resources:reclaim', {
          projectId,
          type,
          amount: type === 'memory' ? allocation.memory : allocation.cpu
        });
      }
    }

    // Deallocate freed projects
    for (const projectId of freedProjects) {
      await this.deallocateResources(projectId);
    }

    return { reclaimed, freedProjects };
  }

  async optimizeAllocations() {
    const current = this.getAvailableResources();
    const optimizations = [];

    // Check for overallocation
    for (const [projectId, allocation] of this.allocations) {
      const metrics = this.metrics.get(projectId) || {};
      
      // If using less than 30% of allocated memory, reduce
      if (metrics.memoryUsage && metrics.memoryUsage < allocation.memory * 0.3) {
        const newMemory = Math.max(64, allocation.memory * 0.5);
        allocation.memory = Math.floor(newMemory);
        optimizations.push({
          projectId,
          type: 'memory_reduction',
          from: allocation.memory * 2,
          to: newMemory
        });
      }

      // If CPU usage is very low, reduce allocation
      if (metrics.cpuUsage && metrics.cpuUsage < 5) {
        allocation.cpu = Math.max(0.5, allocation.cpu * 0.5);
        optimizations.push({
          projectId,
          type: 'cpu_reduction',
          from: allocation.cpu * 2,
          to: allocation.cpu
        });
      }
    }

    this.emit('resources:optimized', { optimizations, current });
    return { optimizations, available: current };
  }

  async getProjectMetrics(projectId) {
    const allocation = this.allocations.get(projectId);
    const metrics = this.metrics.get(projectId) || {};

    return {
      projectId,
      allocated: allocation,
      actual: metrics,
      efficiency: allocation ? {
        memory: metrics.memoryUsage ? 
          ((metrics.memoryUsage / (allocation.memory * 1024 * 1024)) * 100).toFixed(1) + '%' : 'N/A',
        cpu: metrics.cpuUsage ? 
          ((metrics.cpuUsage / (allocation.cpu * 100)) * 100).toFixed(1) + '%' : 'N/A'
      } : 'Not allocated'
    };
  }

  async updateMetrics(projectId, metrics) {
    this.metrics.set(projectId, {
      ...this.metrics.get(projectId),
      ...metrics,
      updatedAt: new Date().toISOString()
    });
  }

  async getStats() {
    const available = this.getAvailableResources();
    
    return {
      total: {
        memory: Math.floor(this.totalMemory / (1024 * 1024)),
        cpu: this.totalCPU
      },
      available,
      allocated: {
        memory: Math.floor(this.getUsedMemory() / (1024 * 1024)),
        cpu: this.getUsedCPU()
      },
      projects: this.allocations.size,
      utilization: {
        memory: ((this.getUsedMemory() / this.totalMemory) * 100).toFixed(1) + '%',
        cpu: ((this.getUsedCPU() / this.totalCPU) * 100).toFixed(1) + '%'
      }
    };
  }

  shutdown() {
    this.allocations.clear();
    this.resourceLimits.clear();
    this.metrics.clear();
  }
}

module.exports = { SmartAllocator };