// modules/SimpleTerminal.js - Pengganti node-pty tanpa native module
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const os = require('os');

class SimpleTerminal extends EventEmitter {
  constructor() {
    super();
    this.processes = new Map();
  }

  async createTerminal(projectId, cwd) {
    const terminalId = `${projectId}_${Date.now()}`;
    const shell = os.platform() === 'win32' ? 'cmd.exe' : 'bash';
    
    const child = spawn(shell, [], {
      cwd: cwd || process.cwd(),
      env: { ...process.env, TERM: 'dumb', ENVBOX_TERMINAL: 'true' },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    child.stdout.on('data', (data) => {
      this.emit('data', {
        terminalId,
        projectId,
        data: data.toString()
      });
    });

    child.stderr.on('data', (data) => {
      this.emit('data', {
        terminalId,
        projectId,
        data: data.toString()
      });
    });

    child.on('exit', (code) => {
      this.emit('exit', { terminalId, projectId, code });
      this.processes.delete(terminalId);
    });

    this.processes.set(terminalId, { child, projectId, cwd });

    return { terminalId, projectId };
  }

  write(terminalId, data) {
    const proc = this.processes.get(terminalId);
    if (proc && proc.child.stdin.writable) {
      proc.child.stdin.write(data);
    }
  }

  resize(terminalId, cols, rows) {
    // Simple terminal doesn't support resize
    return { resized: true, cols, rows };
  }

  destroy(terminalId) {
    const proc = this.processes.get(terminalId);
    if (proc) {
      proc.child.kill();
      this.processes.delete(terminalId);
    }
  }

  getActiveTerminals() {
    const terminals = [];
    for (const [id, data] of this.processes) {
      terminals.push({ id, projectId: data.projectId, cwd: data.cwd });
    }
    return terminals;
  }

  shutdown() {
    for (const [id, proc] of this.processes) {
      proc.child.kill();
    }
    this.processes.clear();
  }
}

module.exports = { SimpleTerminal };