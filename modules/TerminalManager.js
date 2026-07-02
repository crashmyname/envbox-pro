// modules/TerminalManager.js
// VERSION: No native modules required!
const { spawn } = require('child_process');
const os = require('os');
const fs = require('fs-extra');
const path = require('path');
const { EventEmitter } = require('events');

class TerminalManager extends EventEmitter {
  constructor(userDataPath) {
    super();
    this.userDataPath = userDataPath;
    this.terminals = new Map();
    
    // Try to load node-pty, fallback to simple terminal
    this.hasPty = false;
    try {
      this.pty = require('node-pty');
      this.hasPty = true;
      console.log('✅ node-pty loaded (enhanced terminal)');
    } catch (e) {
      this.pty = null;
      console.log('⚠️ node-pty not available, using simple terminal');
    }
  }

  async createTerminal(projectId, cwd, onData) {
    const terminalId = `${projectId}_${Date.now()}`;

    if (this.hasPty) {
      return await this.createPtyTerminal(terminalId, projectId, cwd, onData);
    } else {
      return await this.createSimpleTerminal(terminalId, projectId, cwd, onData);
    }
  }

  async createPtyTerminal(terminalId, projectId, cwd, onData) {
    const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
    const shellArgs = os.platform() === 'win32' ? [] : [];
    
    const terminal = this.pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols: 120,
      rows: 40,
      cwd: cwd || process.cwd(),
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        ENVBOX_TERMINAL: 'true',
        PROJECT_ID: projectId
      }
    });

    terminal.onData((data) => {
      if (onData) {
        onData({
          terminalId,
          projectId,
          data
        });
      }
      
      this.emit('terminal:data', {
        terminalId,
        projectId,
        data
      });
    });

    terminal.onExit(({ exitCode, signal }) => {
      this.emit('terminal:exit', {
        terminalId,
        projectId,
        exitCode,
        signal
      });
      
      setTimeout(() => {
        this.terminals.delete(terminalId);
      }, 1000);
    });

    this.terminals.set(terminalId, {
      terminal,
      isPty: true,
      projectId,
      cwd,
      createdAt: new Date().toISOString()
    });

    return { terminalId, projectId, type: 'pty' };
  }

  async createSimpleTerminal(terminalId, projectId, cwd, onData) {
    const shell = os.platform() === 'win32' ? 'cmd.exe' : '/bin/sh';
    const shellArgs = os.platform() === 'win32' ? [] : [];
    
    const child = spawn(shell, shellArgs, {
      cwd: cwd || process.cwd(),
      env: {
        ...process.env,
        TERM: 'dumb',
        ENVBOX_TERMINAL: 'true',
        PROJECT_ID: projectId,
        PROMPT: `$P [EnvBox] $G `
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });

    // Collect output
    child.stdout.on('data', (data) => {
      const dataStr = data.toString();
      
      if (onData) {
        onData({
          terminalId,
          projectId,
          data: dataStr
        });
      }
      
      this.emit('terminal:data', {
        terminalId,
        projectId,
        data: dataStr
      });
    });

    child.stderr.on('data', (data) => {
      const dataStr = data.toString();
      
      if (onData) {
        onData({
          terminalId,
          projectId,
          data: dataStr
        });
      }
      
      this.emit('terminal:data', {
        terminalId,
        projectId,
        data: dataStr
      });
    });

    child.on('error', (error) => {
      console.error(`Terminal ${terminalId} error:`, error);
      this.emit('terminal:error', {
        terminalId,
        projectId,
        error: error.message
      });
    });

    child.on('exit', (code, signal) => {
      this.emit('terminal:exit', {
        terminalId,
        projectId,
        exitCode: code,
        signal
      });
      
      setTimeout(() => {
        this.terminals.delete(terminalId);
      }, 1000);
    });

    this.terminals.set(terminalId, {
      terminal: child,
      isPty: false,
      projectId,
      cwd,
      createdAt: new Date().toISOString()
    });

    // Send welcome message
    setTimeout(() => {
      if (child.stdin.writable) {
        const welcomeMsg = os.platform() === 'win32' 
          ? `@echo off\r\necho EnvBox Terminal Ready\r\necho Project: ${projectId}\r\necho Directory: ${cwd || process.cwd()}\r\necho.\r\n`
          : `echo "EnvBox Terminal Ready"\necho "Project: ${projectId}"\necho "Directory: ${cwd || process.cwd()}"\necho ""\n`;
        child.stdin.write(welcomeMsg);
      }
    }, 500);

    return { terminalId, projectId, type: 'simple' };
  }

  async writeToTerminal(terminalId, data) {
    const termData = this.terminals.get(terminalId);
    if (!termData) throw new Error('Terminal not found');
    
    if (termData.isPty) {
      termData.terminal.write(data);
    } else {
      // Simple terminal
      const child = termData.terminal;
      if (child.stdin && child.stdin.writable) {
        child.stdin.write(data);
      }
    }
    
    return { written: true };
  }

  async resizeTerminal(terminalId, cols, rows) {
    const termData = this.terminals.get(terminalId);
    if (!termData) throw new Error('Terminal not found');
    
    if (termData.isPty) {
      termData.terminal.resize(cols, rows);
    }
    // Simple terminal doesn't support resize, just return OK
    
    return { resized: true, cols, rows };
  }

  async destroyTerminal(terminalId) {
    const termData = this.terminals.get(terminalId);
    if (!termData) throw new Error('Terminal not found');
    
    if (termData.isPty) {
      termData.terminal.kill();
    } else {
      const child = termData.terminal;
      if (child && !child.killed) {
        // Send exit command first
        if (child.stdin && child.stdin.writable) {
          child.stdin.write(os.platform() === 'win32' ? 'exit\r\n' : 'exit\n');
        }
        // Force kill after 2 seconds if still alive
        setTimeout(() => {
          if (child && !child.killed) {
            child.kill('SIGTERM');
            setTimeout(() => {
              if (child && !child.killed) {
                child.kill('SIGKILL');
              }
            }, 1000);
          }
        }, 2000);
      }
    }
    
    this.terminals.delete(terminalId);
    return { destroyed: true };
  }

  async getActiveTerminals() {
    const terminals = [];
    
    for (const [id, data] of this.terminals) {
      terminals.push({
        id,
        projectId: data.projectId,
        cwd: data.cwd,
        type: data.isPty ? 'pty' : 'simple',
        createdAt: data.createdAt
      });
    }
    
    return terminals;
  }

  async executeCommand(terminalId, command) {
    const termData = this.terminals.get(terminalId);
    if (!termData) throw new Error('Terminal not found');
    
    const fullCommand = command + (os.platform() === 'win32' ? '\r\n' : '\n');
    await this.writeToTerminal(terminalId, fullCommand);
    
    return { executed: true, command };
  }

  // ===== GIT CLONE TERMINAL =====
  async createGitCloneTerminal(projectId, repoUrl, branch = 'main', targetFolder, onData) {
    const terminalId = `${projectId}_git_${Date.now()}`;
    const cwd = targetFolder || path.join(__dirname, '..', 'projects');
    
    // ✅ Pakai fs (sekarang udah di-import)
    await fs.ensureDir(cwd);
    
    const cloneCmd = `git clone -b ${branch} ${repoUrl} && echo CLONE_SUCCESS || echo CLONE_FAILED`;
    
    const child = spawn('cmd.exe', ['/c', cloneCmd], {
      cwd: cwd,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    child.stdout.on('data', (data) => {
      const str = data.toString();
      if (onData) onData({ terminalId, projectId, data: str });
      this.emit('terminal:data', { terminalId, projectId, data: str });
    });

    child.stderr.on('data', (data) => {
      const str = data.toString();
      if (onData) onData({ terminalId, projectId, data: str });
      this.emit('terminal:data', { terminalId, projectId, data: str });
    });

    this.terminals.set(terminalId, { terminal: child, isPty: false, projectId, cwd });

    return new Promise((resolve, reject) => {
      child.on('exit', (code) => {
        this.terminals.delete(terminalId);
        if (code === 0) resolve({ success: true, terminalId, message: 'Clone completed!' });
        else reject(new Error(`Git clone failed with code ${code}`));
      });
      child.on('error', (err) => { this.terminals.delete(terminalId); reject(err); });
    });
  }

  shutdown() {
    for (const [id, data] of this.terminals) {
      try {
        if (data.isPty) {
          data.terminal.kill();
        } else {
          const child = data.terminal;
          if (child && !child.killed) {
            child.kill('SIGTERM');
          }
        }
      } catch (e) {
        // Terminal already closed
      }
    }
    this.terminals.clear();
  }
}

module.exports = { TerminalManager };