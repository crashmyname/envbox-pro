// modules/TemplateManager.js
const fs = require('fs-extra');
const path = require('path');

class TemplateManager {
  constructor(resourcesPath) {
    this.templatesPath = path.join(resourcesPath, 'templates');
  }

  async initialize() {
    await fs.ensureDir(this.templatesPath);
    
    // Ensure template directories exist
    const templateTypes = ['php', 'nodejs', 'go', 'python', 'ruby', 'java', 'rust'];
    for (const type of templateTypes) {
      await fs.ensureDir(path.join(this.templatesPath, type));
    }
  }

  async listTemplates() {
    const templates = [];
    
    // PHP Templates
    templates.push(
      { name: 'laravel', stack: 'php', description: 'Laravel - The PHP Framework for Web Artisans', icon: '🔴', type: 'fullstack' },
      { name: 'wordpress', stack: 'php', description: 'WordPress - World\'s most popular CMS', icon: '🔵', type: 'cms' },
      { name: 'codeigniter', stack: 'php', description: 'CodeIgniter 4 - Lightweight PHP Framework', icon: '🟠', type: 'framework' },
      { name: 'slim', stack: 'php', description: 'Slim - PHP Micro Framework', icon: '🟢', type: 'microframework' },
      { name: 'symfony', stack: 'php', description: 'Symfony - Professional PHP Framework', icon: '⚫', type: 'fullstack' },
      { name: 'blank-php', stack: 'php', description: 'Empty PHP Project', icon: '⚪', type: 'blank' }
    );

    // Node.js Templates
    templates.push(
      { name: 'express', stack: 'nodejs', description: 'Express.js - Fast, unopinionated web framework', icon: '🟢', type: 'framework' },
      { name: 'nextjs', stack: 'nodejs', description: 'Next.js - The React Framework for Production', icon: '⚫', type: 'fullstack' },
      { name: 'react-vite', stack: 'nodejs', description: 'React + Vite - Modern Frontend Setup', icon: '🔵', type: 'frontend' },
      { name: 'nestjs', stack: 'nodejs', description: 'NestJS - Progressive Node.js Framework', icon: '🔴', type: 'fullstack' },
      { name: 'fastify', stack: 'nodejs', description: 'Fastify - Fast and low overhead web framework', icon: '⚡', type: 'framework' },
      { name: 'blank-node', stack: 'nodejs', description: 'Empty Node.js Project', icon: '⚪', type: 'blank' }
    );

    // Go Templates
    templates.push(
      { name: 'gin', stack: 'go', description: 'Gin - HTTP web framework written in Go', icon: '🔵', type: 'framework' },
      { name: 'echo', stack: 'go', description: 'Echo - High performance Go framework', icon: '🟣', type: 'framework' },
      { name: 'fiber', stack: 'go', description: 'Fiber - Express inspired web framework', icon: '⚡', type: 'framework' },
      { name: 'blank-go', stack: 'go', description: 'Empty Go Project', icon: '⚪', type: 'blank' }
    );

    // Python Templates
    templates.push(
      { name: 'django', stack: 'python', description: 'Django - The web framework for perfectionists', icon: '🟢', type: 'fullstack' },
      { name: 'flask', stack: 'python', description: 'Flask - Lightweight WSGI web application framework', icon: '🔴', type: 'microframework' },
      { name: 'fastapi', stack: 'python', description: 'FastAPI - Modern, fast web framework', icon: '⚡', type: 'framework' },
      { name: 'blank-python', stack: 'python', description: 'Empty Python Project', icon: '⚪', type: 'blank' }
    );

    // Ruby Templates
    templates.push(
      { name: 'rails', stack: 'ruby', description: 'Ruby on Rails - Full-stack web framework', icon: '💎', type: 'fullstack' },
      { name: 'sinatra', stack: 'ruby', description: 'Sinatra - Classy web-development dressed in a DSL', icon: '🔴', type: 'microframework' },
      { name: 'blank-ruby', stack: 'ruby', description: 'Empty Ruby Project', icon: '⚪', type: 'blank' }
    );

    // Java Templates
    templates.push(
      { name: 'spring-boot', stack: 'java', description: 'Spring Boot - Production-ready Spring applications', icon: '🍃', type: 'fullstack' },
      { name: 'blank-java', stack: 'java', description: 'Empty Java Project', icon: '⚪', type: 'blank' }
    );

    // Rust Templates
    templates.push(
      { name: 'actix', stack: 'rust', description: 'Actix Web - Powerful, pragmatic Rust framework', icon: '🦀', type: 'framework' },
      { name: 'rocket', stack: 'rust', description: 'Rocket - Web framework for Rust', icon: '🚀', type: 'framework' },
      { name: 'blank-rust', stack: 'rust', description: 'Empty Rust Project', icon: '⚪', type: 'blank' }
    );

    return templates;
  }

  async createFromTemplate(templateName, projectConfig) {
    const { projectPath, name, techStack } = projectConfig;

    const creators = {
      // PHP
      'laravel': () => this.createLaravelProject(projectPath, name),
      'wordpress': () => this.createWordPressProject(projectPath),
      'codeigniter': () => this.createCodeIgniterProject(projectPath, name),
      'slim': () => this.createSlimProject(projectPath, name),
      'symfony': () => this.createSymfonyProject(projectPath, name),
      'blank-php': () => this.createBlankPHPProject(projectPath, name),

      // Node.js
      'express': () => this.createExpressProject(projectPath, name),
      'nextjs': () => this.createNextJSProject(projectPath, name),
      'react-vite': () => this.createReactViteProject(projectPath, name),
      'nestjs': () => this.createNestJSProject(projectPath, name),
      'fastify': () => this.createFastifyProject(projectPath, name),
      'blank-node': () => this.createBlankNodeProject(projectPath, name),

      // Go
      'gin': () => this.createGinProject(projectPath, name),
      'echo': () => this.createEchoProject(projectPath, name),
      'fiber': () => this.createFiberProject(projectPath, name),
      'blank-go': () => this.createBlankGoProject(projectPath, name),

      // Python
      'django': () => this.createDjangoProject(projectPath, name),
      'flask': () => this.createFlaskProject(projectPath, name),
      'fastapi': () => this.createFastAPIProject(projectPath, name),
      'blank-python': () => this.createBlankPythonProject(projectPath, name),

      // Ruby
      'rails': () => this.createRailsProject(projectPath, name),
      'sinatra': () => this.createSinatraProject(projectPath, name),
      'blank-ruby': () => this.createBlankRubyProject(projectPath, name),

      // Java
      'spring-boot': () => this.createSpringBootProject(projectPath, name),
      'blank-java': () => this.createBlankJavaProject(projectPath, name),

      // Rust
      'actix': () => this.createActixProject(projectPath, name),
      'rocket': () => this.createRocketProject(projectPath, name),
      'blank-rust': () => this.createBlankRustProject(projectPath, name)
    };

    const creator = creators[templateName];
    if (creator) {
      return await creator();
    }

    throw new Error(`Unknown template: ${templateName}`);
  }

  // ===== PHP TEMPLATES =====
  async createLaravelProject(projectPath, name) {
    const indexPhp = `<?php

use Illuminate\\Http\\Request;

define('LARAVEL_START', microtime(true));

require __DIR__.'/../vendor/autoload.php';

$app = require_once __DIR__.'/../bootstrap/app.php';

$kernel = $app->make(Illuminate\\Contracts\\Http\\Kernel::class);

$response = $kernel->handle(
    $request = Request::capture()
);

$response->send();

$kernel->terminate($request, $response);
`;

    await fs.ensureDir(path.join(projectPath, 'public'));
    await fs.ensureDir(path.join(projectPath, 'routes'));
    await fs.ensureDir(path.join(projectPath, 'app/Http/Controllers'));
    await fs.ensureDir(path.join(projectPath, 'resources/views'));
    
    await fs.writeFile(path.join(projectPath, 'public', 'index.php'), indexPhp);
    
    // Create web routes
    const webRoutes = `<?php

use Illuminate\\Support\\Facades\\Route;

Route::get('/', function () {
    return view('welcome', ['name' => '${name}']);
});

Route::get('/health', function () {
    return response()->json(['status' => 'healthy', 'framework' => 'Laravel']);
});
`;
    await fs.writeFile(path.join(projectPath, 'routes', 'web.php'), webRoutes);

    // Create welcome view
    const welcomeView = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{ $name ?? 'Laravel' }}</title>
    <style>
        body { font-family: -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f3f4f6; }
        .container { text-align: center; padding: 40px; background: white; border-radius: 16px; box-shadow: 0 4px 16px rgba(0,0,0,0.1); }
        h1 { color: #ef4444; font-size: 48px; margin-bottom: 8px; }
        p { color: #6b7280; font-size: 18px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 Laravel</h1>
        <p>${name} is running!</p>
        <p style="font-size: 14px; color: #9ca3af;">PHP {{ phpversion() }} | Laravel {{ app()->version() }}</p>
    </div>
</body>
</html>
`;
    await fs.writeFile(path.join(projectPath, 'resources', 'views', 'welcome.blade.php'), welcomeView);

    return { created: true, template: 'laravel' };
  }

  async createWordPressProject(projectPath) {
    await fs.ensureDir(path.join(projectPath, 'wp-content', 'plugins'));
    await fs.ensureDir(path.join(projectPath, 'wp-content', 'themes'));
    await fs.ensureDir(path.join(projectPath, 'wp-content', 'uploads'));
    await fs.ensureDir(path.join(projectPath, 'wp-admin'));
    await fs.ensureDir(path.join(projectPath, 'wp-includes'));

    const wpConfig = `<?php
define('DB_NAME', getenv('DB_DATABASE') ?: 'wordpress');
define('DB_USER', getenv('DB_USERNAME') ?: 'root');
define('DB_PASSWORD', getenv('DB_PASSWORD') ?: '');
define('DB_HOST', getenv('DB_HOST') ?: 'localhost');
define('DB_CHARSET', 'utf8mb4');
define('DB_COLLATE', '');

define('AUTH_KEY', '${this.generateRandomString(64)}');
define('SECURE_AUTH_KEY', '${this.generateRandomString(64)}');
define('LOGGED_IN_KEY', '${this.generateRandomString(64)}');
define('NONCE_KEY', '${this.generateRandomString(64)}');

$table_prefix = 'wp_';

define('WP_DEBUG', true);
define('WP_DEBUG_LOG', true);
define('WP_DEBUG_DISPLAY', false);

if (!defined('ABSPATH')) {
    define('ABSPATH', __DIR__ . '/');
}

require_once ABSPATH . 'wp-settings.php';
`;
    await fs.writeFile(path.join(projectPath, 'wp-config.php'), wpConfig);
    return { created: true, template: 'wordpress' };
  }

  async createCodeIgniterProject(projectPath, name) {
    await fs.ensureDir(path.join(projectPath, 'public'));
    await fs.ensureDir(path.join(projectPath, 'app', 'Controllers'));
    await fs.ensureDir(path.join(projectPath, 'app', 'Views'));

    const indexPhp = `<?php
echo "<!DOCTYPE html>
<html>
<head><title>${name}</title></head>
<body>
    <h1>🚀 CodeIgniter 4</h1>
    <p>${name} is ready!</p>
</body>
</html>";
`;
    await fs.writeFile(path.join(projectPath, 'public', 'index.php'), indexPhp);
    return { created: true, template: 'codeigniter' };
  }

  async createSlimProject(projectPath, name) {
    await fs.ensureDir(path.join(projectPath, 'public'));
    
    const indexPhp = `<?php
require __DIR__ . '/../vendor/autoload.php';

$app = \\Slim\\Factory\\AppFactory::create();

$app->get('/', function ($request, $response) {
    $response->getBody()->write(json_encode([
        'name' => '${name}',
        'framework' => 'Slim 4',
        'php' => phpversion()
    ]));
    return $response->withHeader('Content-Type', 'application/json');
});

$app->run();
`;
    await fs.writeFile(path.join(projectPath, 'public', 'index.php'), indexPhp);
    return { created: true, template: 'slim' };
  }

  async createSymfonyProject(projectPath, name) {
    await fs.ensureDir(path.join(projectPath, 'public'));
    await fs.ensureDir(path.join(projectPath, 'config'));
    await fs.ensureDir(path.join(projectPath, 'src'));

    const indexPhp = `<?php
echo json_encode([
    'name' => '${name}',
    'framework' => 'Symfony',
    'status' => 'running'
]);
`;
    await fs.writeFile(path.join(projectPath, 'public', 'index.php'), indexPhp);
    return { created: true, template: 'symfony' };
  }

  async createBlankPHPProject(projectPath, name) {
    await fs.ensureDir(path.join(projectPath, 'public'));
    
    const indexPhp = `<?php
echo "<!DOCTYPE html>
<html lang='en'>
<head>
    <meta charset='UTF-8'>
    <meta name='viewport' content='width=device-width, initial-scale=1.0'>
    <title>${name}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
        .container { text-align: center; }
        h1 { font-size: 48px; margin-bottom: 16px; }
        p { font-size: 18px; opacity: 0.9; }
        .info { margin-top: 32px; font-size: 14px; opacity: 0.7; }
    </style>
</head>
<body>
    <div class='container'>
        <h1>🐘 PHP Project Ready!</h1>
        <p>${name} is running successfully</p>
        <div class='info'>
            <p>PHP Version: " . phpversion() . "</p>
            <p>Server: " . $_SERVER['SERVER_SOFTWARE'] ?? 'Built-in' . "</p>
        </div>
    </div>
</body>
</html>";
`;
    await fs.writeFile(path.join(projectPath, 'public', 'index.php'), indexPhp);
    return { created: true, template: 'blank-php' };
  }

  // ===== NODE.JS TEMPLATES =====
  async createExpressProject(projectPath, name) {
    await fs.ensureDir(path.join(projectPath, 'src'));
    
    const packageJson = {
      name: name.toLowerCase().replace(/\s/g, '-'),
      version: '1.0.0',
      main: 'src/index.js',
      scripts: { start: 'node src/index.js', dev: 'nodemon src/index.js' },
      dependencies: { express: '^4.18.2' }
    };
    await fs.writeJson(path.join(projectPath, 'package.json'), packageJson, { spaces: 2 });

    const indexJs = `const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    name: '${name}',
    framework: 'Express.js',
    version: '1.0.0',
    node: process.version
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', uptime: process.uptime() });
});

app.listen(port, () => {
  console.log(\`🚀 ${name} running on http://localhost:\${port}\`);
});
`;
    await fs.writeFile(path.join(projectPath, 'src', 'index.js'), indexJs);
    return { created: true, template: 'express' };
  }

  async createNextJSProject(projectPath, name) {
    await fs.ensureDir(path.join(projectPath, 'pages'));
    await fs.ensureDir(path.join(projectPath, 'public'));

    const packageJson = {
      name: name.toLowerCase().replace(/\s/g, '-'),
      version: '1.0.0',
      scripts: { dev: 'next dev', build: 'next build', start: 'next start' },
      dependencies: { next: '^14.0.0', react: '^18.2.0', 'react-dom': '^18.2.0' }
    };
    await fs.writeJson(path.join(projectPath, 'package.json'), packageJson, { spaces: 2 });

    const indexJs = `export default function Home() {
  return (
    <div style={{ textAlign: 'center', padding: '100px 20px' }}>
      <h1>🚀 Next.js Ready!</h1>
      <p>${name} is running</p>
    </div>
  );
}
`;
    await fs.writeFile(path.join(projectPath, 'pages', 'index.js'), indexJs);
    return { created: true, template: 'nextjs' };
  }

  async createReactViteProject(projectPath, name) {
    await fs.ensureDir(path.join(projectPath, 'src'));
    await fs.ensureDir(path.join(projectPath, 'public'));

    const packageJson = {
      name: name.toLowerCase().replace(/\s/g, '-'),
      version: '1.0.0',
      scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
      dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0' },
      devDependencies: { vite: '^5.0.0', '@vitejs/plugin-react': '^4.0.0' }
    };
    await fs.writeJson(path.join(projectPath, 'package.json'), packageJson, { spaces: 2 });
    return { created: true, template: 'react-vite' };
  }

  async createNestJSProject(projectPath, name) {
    await fs.ensureDir(path.join(projectPath, 'src'));
    
    const packageJson = {
      name: name.toLowerCase().replace(/\s/g, '-'),
      version: '1.0.0',
      scripts: { start: 'nest start', dev: 'nest start --watch' },
      dependencies: { '@nestjs/core': '^10.0.0', '@nestjs/common': '^10.0.0', '@nestjs/platform-express': '^10.0.0' }
    };
    await fs.writeJson(path.join(projectPath, 'package.json'), packageJson, { spaces: 2 });
    return { created: true, template: 'nestjs' };
  }

  async createFastifyProject(projectPath, name) {
    await fs.ensureDir(path.join(projectPath, 'src'));
    
    const packageJson = {
      name: name.toLowerCase().replace(/\s/g, '-'),
      version: '1.0.0',
      main: 'src/index.js',
      scripts: { start: 'node src/index.js' },
      dependencies: { fastify: '^4.24.0' }
    };
    await fs.writeJson(path.join(projectPath, 'package.json'), packageJson, { spaces: 2 });

    const indexJs = `const fastify = require('fastify')({ logger: true });

fastify.get('/', async () => {
  return { name: '${name}', framework: 'Fastify', status: 'running' };
});

const start = async () => {
  try {
    await fastify.listen({ port: process.env.PORT || 3000 });
    console.log('🚀 ${name} running');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
start();
`;
    await fs.writeFile(path.join(projectPath, 'src', 'index.js'), indexJs);
    return { created: true, template: 'fastify' };
  }

  async createBlankNodeProject(projectPath, name) {
    await fs.ensureDir(path.join(projectPath, 'src'));

    const packageJson = {
      name: name.toLowerCase().replace(/\s/g, '-'),
      version: '1.0.0',
      main: 'src/index.js',
      scripts: { start: 'node src/index.js' }
    };
    await fs.writeJson(path.join(projectPath, 'package.json'), packageJson, { spaces: 2 });

    const indexJs = `const http = require('http');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    name: '${name}',
    status: 'running',
    node: process.version,
    uptime: process.uptime()
  }));
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(\`🚀 ${name} running on http://localhost:\${port}\`);
});
`;
    await fs.writeFile(path.join(projectPath, 'src', 'index.js'), indexJs);
    return { created: true, template: 'blank-node' };
  }

  // ===== GO TEMPLATES =====
  async createGinProject(projectPath, name) {
    const goMod = `module ${name.toLowerCase().replace(/\\s/g, '-')}

go 1.21

require github.com/gin-gonic/gin v1.9.1
`;
    await fs.writeFile(path.join(projectPath, 'go.mod'), goMod);

    const mainGo = `package main

import (
    "net/http"
    "github.com/gin-gonic/gin"
)

func main() {
    r := gin.Default()
    
    r.GET("/", func(c *gin.Context) {
        c.JSON(http.StatusOK, gin.H{
            "name": "${name}",
            "framework": "Gin",
            "status": "running",
        })
    })
    
    r.GET("/health", func(c *gin.Context) {
        c.JSON(http.StatusOK, gin.H{"status": "healthy"})
    })
    
    r.Run(":8080")
}
`;
    await fs.writeFile(path.join(projectPath, 'main.go'), mainGo);
    return { created: true, template: 'gin' };
  }

  async createEchoProject(projectPath, name) {
    const goMod = `module ${name.toLowerCase().replace(/\\s/g, '-')}

go 1.21

require github.com/labstack/echo/v4 v4.11.0
`;
    await fs.writeFile(path.join(projectPath, 'go.mod'), goMod);

    const mainGo = `package main

import (
    "net/http"
    "github.com/labstack/echo/v4"
)

func main() {
    e := echo.New()
    
    e.GET("/", func(c echo.Context) error {
        return c.JSON(http.StatusOK, map[string]string{
            "name": "${name}",
            "framework": "Echo",
        })
    })
    
    e.Logger.Fatal(e.Start(":8080"))
}
`;
    await fs.writeFile(path.join(projectPath, 'main.go'), mainGo);
    return { created: true, template: 'echo' };
  }

  async createFiberProject(projectPath, name) {
    const goMod = `module ${name.toLowerCase().replace(/\\s/g, '-')}

go 1.21

require github.com/gofiber/fiber/v2 v2.50.0
`;
    await fs.writeFile(path.join(projectPath, 'go.mod'), goMod);

    const mainGo = `package main

import "github.com/gofiber/fiber/v2"

func main() {
    app := fiber.New()
    
    app.Get("/", func(c *fiber.Ctx) error {
        return c.JSON(fiber.Map{
            "name": "${name}",
            "framework": "Fiber",
        })
    })
    
    app.Listen(":8080")
}
`;
    await fs.writeFile(path.join(projectPath, 'main.go'), mainGo);
    return { created: true, template: 'fiber' };
  }

  async createBlankGoProject(projectPath, name) {
    const goMod = `module ${name.toLowerCase().replace(/\\s/g, '-')}

go 1.21
`;
    await fs.writeFile(path.join(projectPath, 'go.mod'), goMod);

    const mainGo = `package main

import (
    "fmt"
    "log"
    "net/http"
    "os"
)

func main() {
    port := os.Getenv("PORT")
    if port == "" {
        port = "8080"
    }

    http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
        fmt.Fprintf(w, \`{"name": "${name}", "status": "running", "go": "%s"}\`, r.Context().Value("version"))
    })

    log.Printf("🚀 ${name} running on :%s", port)
    log.Fatal(http.ListenAndServe(":"+port, nil))
}
`;
    await fs.writeFile(path.join(projectPath, 'main.go'), mainGo);
    return { created: true, template: 'blank-go' };
  }

  // ===== PYTHON TEMPLATES =====
  async createDjangoProject(projectPath, name) {
    await fs.ensureDir(path.join(projectPath, 'project'));
    
    const requirements = `django==5.0.0\ngunicorn==21.2.0\n`;
    await fs.writeFile(path.join(projectPath, 'requirements.txt'), requirements);
    return { created: true, template: 'django' };
  }

  async createFlaskProject(projectPath, name) {
    const appPy = `from flask import Flask, jsonify
import sys

app = Flask(__name__)

@app.route('/')
def index():
    return jsonify({
        'name': '${name}',
        'framework': 'Flask',
        'python': sys.version.split()[0],
        'status': 'running'
    })

@app.route('/health')
def health():
    return jsonify({'status': 'healthy'})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
`;
    await fs.writeFile(path.join(projectPath, 'app.py'), appPy);
    
    const requirements = `flask==3.0.0\nflask-cors==4.0.0\n`;
    await fs.writeFile(path.join(projectPath, 'requirements.txt'), requirements);
    return { created: true, template: 'flask' };
  }

  async createFastAPIProject(projectPath, name) {
    const mainPy = `from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import sys

app = FastAPI(title="${name}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {
        "name": "${name}",
        "framework": "FastAPI",
        "python": sys.version.split()[0],
        "status": "running"
    }

@app.get("/health")
async def health():
    return {"status": "healthy"}
`;
    await fs.writeFile(path.join(projectPath, 'main.py'), mainPy);
    
    const requirements = `fastapi==0.108.0\nuvicorn==0.25.0\n`;
    await fs.writeFile(path.join(projectPath, 'requirements.txt'), requirements);
    return { created: true, template: 'fastapi' };
  }

  async createBlankPythonProject(projectPath, name) {
    const appPy = `import http.server
import json
import os
import sys

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        
        response = {
            'name': '${name}',
            'status': 'running',
            'python': sys.version.split()[0]
        }
        
        self.wfile.write(json.dumps(response).encode())

    def log_message(self, format, *args):
        pass  # Suppress logs

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    server = http.server.HTTPServer(('0.0.0.0', port), Handler)
    print(f'🚀 ${name} running on http://localhost:{port}')
    server.serve_forever()
`;
    await fs.writeFile(path.join(projectPath, 'app.py'), appPy);
    
    await fs.writeFile(path.join(projectPath, 'requirements.txt'), '# Add your dependencies here\n');
    return { created: true, template: 'blank-python' };
  }

  // ===== RUBY TEMPLATES =====
  async createRailsProject(projectPath, name) {
    const dirs = ['app/controllers', 'app/models', 'app/views', 'config', 'db/migrate'];
    for (const dir of dirs) {
      await fs.ensureDir(path.join(projectPath, dir));
    }

    const gemfile = `source 'https://rubygems.org'
gem 'rails', '~> 7.1'
gem 'puma', '~> 6.0'
`;
    await fs.writeFile(path.join(projectPath, 'Gemfile'), gemfile);
    return { created: true, template: 'rails' };
  }

  async createSinatraProject(projectPath, name) {
    const appRb = `require 'sinatra'
require 'json'

set :port, ENV['PORT'] || 4567
set :bind, '0.0.0.0'

get '/' do
  content_type :json
  { name: '${name}', framework: 'Sinatra', ruby: RUBY_VERSION, status: 'running' }.to_json
end

get '/health' do
  content_type :json
  { status: 'healthy' }.to_json
end
`;
    await fs.writeFile(path.join(projectPath, 'app.rb'), appRb);

    const gemfile = `source 'https://rubygems.org'
gem 'sinatra'
gem 'puma'
gem 'json'
`;
    await fs.writeFile(path.join(projectPath, 'Gemfile'), gemfile);
    return { created: true, template: 'sinatra' };
  }

  async createBlankRubyProject(projectPath, name) {
    const appRb = `require 'webrick'
require 'json'

port = ENV['PORT'] || 4567
server = WEBrick::HTTPServer.new(Port: port, BindAddress: '0.0.0.0')

server.mount_proc '/' do |req, res|
  res['Content-Type'] = 'application/json'
  res.body = { name: '${name}', status: 'running', ruby: RUBY_VERSION }.to_json
end

trap('INT') { server.shutdown }
puts "🚀 ${name} running on http://localhost:\#{port}"
server.start
`;
    await fs.writeFile(path.join(projectPath, 'app.rb'), appRb);
    return { created: true, template: 'blank-ruby' };
  }

  // ===== JAVA TEMPLATES =====
  async createSpringBootProject(projectPath, name) {
    const pkgPath = 'com/example/demo';
    await fs.ensureDir(path.join(projectPath, 'src/main/java', pkgPath));
    await fs.ensureDir(path.join(projectPath, 'src/main/resources'));

    const pomXml = `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.2.0</version>
    </parent>
    <groupId>com.example</groupId>
    <artifactId>${name.toLowerCase().replace(/\\s/g, '-')}</artifactId>
    <version>1.0.0</version>
    
    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
    </dependencies>
</project>
`;
    await fs.writeFile(path.join(projectPath, 'pom.xml'), pomXml);

    const appJava = `package com.example.demo;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.web.bind.annotation.*;

@SpringBootApplication
@RestController
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
    
    @GetMapping("/")
    public String home() {
        return "{\\"name\\":\\"${name}\\",\\"framework\\":\\"Spring Boot\\",\\"status\\":\\"running\\"}";
    }
    
    @GetMapping("/health")
    public String health() {
        return "{\\"status\\":\\"healthy\\"}";
    }
}
`;
    await fs.writeFile(path.join(projectPath, 'src/main/java', pkgPath, 'Application.java'), appJava);
    return { created: true, template: 'spring-boot' };
  }

  async createBlankJavaProject(projectPath, name) {
    await fs.ensureDir(path.join(projectPath, 'src'));
    
    const pomXml = `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
    <modelVersion>4.0.0</modelVersion>
    <groupId>com.example</groupId>
    <artifactId>${name.toLowerCase().replace(/\\s/g, '-')}</artifactId>
    <version>1.0.0</version>
</project>
`;
    await fs.writeFile(path.join(projectPath, 'pom.xml'), pomXml);
    return { created: true, template: 'blank-java' };
  }

  // ===== RUST TEMPLATES =====
  async createActixProject(projectPath, name) {
    await fs.ensureDir(path.join(projectPath, 'src'));

    const cargoToml = `[package]
name = "${name.toLowerCase().replace(/\\s/g, '-')}"
version = "1.0.0"
edition = "2021"

[dependencies]
actix-web = "4"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
`;
    await fs.writeFile(path.join(projectPath, 'Cargo.toml'), cargoToml);

    const mainRs = `use actix_web::{get, App, HttpResponse, HttpServer, Responder};
use serde_json::json;

#[get("/")]
async fn index() -> impl Responder {
    HttpResponse::Ok().json(json!({
        "name": "${name}",
        "framework": "Actix Web",
        "status": "running"
    }))
}

#[get("/health")]
async fn health() -> impl Responder {
    HttpResponse::Ok().json(json!({"status": "healthy"}))
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    println!("🚀 ${name} running on http://localhost:8080");
    HttpServer::new(|| {
        App::new()
            .service(index)
            .service(health)
    })
    .bind("0.0.0.0:8080")?
    .run()
    .await
}
`;
    await fs.writeFile(path.join(projectPath, 'src', 'main.rs'), mainRs);
    return { created: true, template: 'actix' };
  }

  async createRocketProject(projectPath, name) {
    await fs.ensureDir(path.join(projectPath, 'src'));

    const cargoToml = `[package]
name = "${name.toLowerCase().replace(/\\s/g, '-')}"
version = "1.0.0"
edition = "2021"

[dependencies]
rocket = "0.5"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
`;
    await fs.writeFile(path.join(projectPath, 'Cargo.toml'), cargoToml);

    const mainRs = `#[macro_use] extern crate rocket;

#[get("/")]
fn index() -> String {
    serde_json::json!({
        "name": "${name}",
        "framework": "Rocket",
        "status": "running"
    }).to_string()
}

#[launch]
fn rocket() -> _ {
    rocket::build().mount("/", routes![index])
}
`;
    await fs.writeFile(path.join(projectPath, 'src', 'main.rs'), mainRs);
    return { created: true, template: 'rocket' };
  }

  async createBlankRustProject(projectPath, name) {
    await fs.ensureDir(path.join(projectPath, 'src'));

    const cargoToml = `[package]
name = "${name.toLowerCase().replace(/\\s/g, '-')}"
version = "1.0.0"
edition = "2021"
`;
    await fs.writeFile(path.join(projectPath, 'Cargo.toml'), cargoToml);

    const mainRs = `fn main() {
    println!("🚀 ${name} is ready!");
}
`;
    await fs.writeFile(path.join(projectPath, 'src', 'main.rs'), mainRs);
    return { created: true, template: 'blank-rust' };
  }

  // ===== UTILITY =====
  generateRandomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}

module.exports = { TemplateManager };