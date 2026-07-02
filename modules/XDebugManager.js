// modules/XDebugManager.js
const fs = require('fs-extra');
const path = require('path');

class XDebugManager {
  constructor(userDataPath) {
    this.userDataPath = userDataPath;
    this.xdebugConfigs = new Map();
  }

  async configure(projectId, config = {}) {
    const project = await this.getProject(projectId);
    if (!project) throw new Error('Project not found');

    const phpIniPath = path.join(project.projectPath, 'php.ini');
    
    if (!await fs.pathExists(phpIniPath)) {
      throw new Error('php.ini not found. Create environment first.');
    }

    const xdebugConfig = {
      enabled: config.enabled !== false,
      mode: config.mode || 'debug,develop',
      startWithRequest: config.startWithRequest || 'yes',
      clientHost: config.clientHost || 'localhost',
      clientPort: config.clientPort || 9003,
      ideKey: config.ideKey || 'VSCODE',
      discoverClientHost: config.discoverClientHost !== false,
      logLevel: config.logLevel || 7,
      outputDir: config.outputDir || path.join(project.projectPath, 'logs', 'profiling'),
      maxNestingLevel: config.maxNestingLevel || 256,
      maxStackFrames: config.maxStackFrames || 1024
    };

    // Generate XDebug configuration
    const xdebugIni = this.generateXDebugIni(xdebugConfig, project);

    // Update php.ini
    let phpIni = await fs.readFile(phpIniPath, 'utf8');
    
    // Remove existing XDebug config
    phpIni = phpIni.replace(/\[XDebug\][\s\S]*?(?=\[|$)/g, '');
    phpIni = phpIni.replace(/\[xdebug\][\s\S]*?(?=\[|$)/gi, '');
    
    // Add new XDebug config
    phpIni += '\n' + xdebugIni;

    await fs.writeFile(phpIniPath, phpIni);

    // Ensure output directories exist
    if (xdebugConfig.outputDir) {
      await fs.ensureDir(xdebugConfig.outputDir);
      await fs.ensureDir(path.join(xdebugConfig.outputDir, 'traces'));
    }

    this.xdebugConfigs.set(projectId, xdebugConfig);

    return {
      configured: true,
      config: xdebugConfig
    };
  }

  generateXDebugIni(config, project) {
    let ini = '\n[XDebug]\n';
    
    ini += `zend_extension = php_xdebug.dll\n`;
    
    // Only add if enabled
    if (!config.enabled) {
      ini += `xdebug.mode = off\n`;
      return ini;
    }
    
    ini += `xdebug.mode = ${config.mode}\n`;
    ini += `xdebug.start_with_request = ${config.startWithRequest}\n`;
    ini += `xdebug.client_host = ${config.clientHost}\n`;
    ini += `xdebug.client_port = ${config.clientPort}\n`;
    ini += `xdebug.idekey = ${config.ideKey}\n`;
    ini += `xdebug.discover_client_host = ${config.discoverClientHost ? '1' : '0'}\n`;
    ini += `xdebug.log = "${path.join(project.projectPath, 'logs', 'xdebug.log').replace(/\\/g, '\\\\')}"\n`;
    ini += `xdebug.log_level = ${config.logLevel}\n`;
    
    // Output settings
    if (config.mode.includes('profile')) {
      ini += `xdebug.output_dir = "${(config.outputDir || '').replace(/\\/g, '\\\\')}"\n`;
      ini += `xdebug.profiler_output_name = cachegrind.out.%p.%u\n`;
    }
    
    if (config.mode.includes('trace')) {
      ini += `xdebug.trace_output_dir = "${path.join(config.outputDir || '', 'traces').replace(/\\/g, '\\\\')}"\n`;
      ini += `xdebug.trace_output_name = trace.%p.%u\n`;
      ini += `xdebug.trace_format = 1\n`;
    }
    
    // Advanced settings
    ini += `xdebug.max_nesting_level = ${config.maxNestingLevel}\n`;
    ini += `xdebug.max_stack_frames = ${config.maxStackFrames}\n`;
    ini += `xdebug.collect_params = 4\n`;
    ini += `xdebug.collect_return = 1\n`;
    ini += `xdebug.collect_assignments = 1\n`;
    ini += `xdebug.var_display_max_depth = 5\n`;
    ini += `xdebug.var_display_max_children = 256\n`;
    ini += `xdebug.var_display_max_data = 1024\n`;
    ini += `xdebug.cli_color = 2\n`;
    ini += `xdebug.force_display_errors = 1\n`;
    ini += `xdebug.force_error_reporting = 1\n`;
    ini += `xdebug.show_error_trace = 1\n`;
    ini += `xdebug.show_exception_trace = 1\n`;
    ini += `xdebug.show_local_vars = 1\n`;
    
    return ini;
  }

  async toggle(projectId, enabled) {
    const config = this.xdebugConfigs.get(projectId) || {
      enabled,
      mode: 'debug,develop',
      startWithRequest: 'yes',
      clientHost: 'localhost',
      clientPort: 9003,
      ideKey: 'VSCODE',
      discoverClientHost: true,
      logLevel: 7
    };

    config.enabled = enabled;

    return await this.configure(projectId, config);
  }

  async getStatus(projectId) {
    const config = this.xdebugConfigs.get(projectId);
    
    if (!config) {
      // Try to read from php.ini
      const project = await this.getProject(projectId);
      if (project) {
        const phpIniPath = path.join(project.projectPath, 'php.ini');
        if (await fs.pathExists(phpIniPath)) {
          const content = await fs.readFile(phpIniPath, 'utf8');
          const enabled = content.includes('[XDebug]') && 
                         !content.includes('xdebug.mode = off') &&
                         content.includes('zend_extension');
          
          return {
            enabled,
            configured: true,
            mode: this.extractIniValue(content, 'xdebug.mode'),
            clientPort: this.extractIniValue(content, 'xdebug.client_port')
          };
        }
      }
      
      return { enabled: false, configured: false };
    }

    return {
      enabled: config.enabled,
      configured: true,
      mode: config.mode,
      clientPort: config.clientPort,
      clientHost: config.clientHost,
      ideKey: config.ideKey
    };
  }

  async getIDEConfigurations() {
    return {
      vscode: {
        name: 'Visual Studio Code',
        port: 9003,
        path: '.vscode/launch.json',
        config: {
          version: '0.2.0',
          configurations: [{
            name: 'Listen for XDebug',
            type: 'php',
            request: 'launch',
            port: 9003,
            pathMappings: {
              '/var/www/html': '${workspaceFolder}'
            }
          }]
        }
      },
      phpstorm: {
        name: 'PhpStorm',
        port: 9003,
        settings: {
          'php.debug.ideKey': 'PHPSTORM',
          'php.debug.serverPort': 9003
        }
      },
      netbeans: {
        name: 'NetBeans',
        port: 9003,
        settings: {
          'php.debug.port': 9003,
          'php.debug.sessionId': 'netbeans-xdebug'
        }
      }
    };
  }

  extractIniValue(content, key) {
    const match = content.match(new RegExp(`${key}\\s*=\\s*(.+)`));
    return match ? match[1].trim() : null;
  }

  async getProject(projectId) {
    const store = path.join(process.env.APPDATA || '', 'envbox-pro', 'environments.json');
    if (await fs.pathExists(store)) {
      const data = await fs.readJson(store);
      return data.environments?.find(e => e.id === projectId);
    }
    return null;
  }
}

module.exports = { XDebugManager };