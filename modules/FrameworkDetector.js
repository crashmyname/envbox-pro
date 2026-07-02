// modules/FrameworkDetector.js
const fs = require('fs-extra');
const path = require('path');

class FrameworkDetector {
  constructor() {
    this.signatures = {
      php: {
        'Laravel': {
          files: ['artisan', 'config/app.php'],
          patterns: [
            'Illuminate\\Foundation\\Application',
            'laravel/framework',
            'Illuminate\\'
          ],
          versionFile: 'composer.json',
          versionKey: 'laravel/framework'
        },
        'Symfony': {
          files: ['bin/console', 'config/bundles.php'],
          patterns: ['Symfony\\\\Bundle\\\\FrameworkBundle', 'symfony/framework-bundle'],
          versionFile: 'composer.json',
          versionKey: 'symfony/framework-bundle'
        },
        'CodeIgniter': {
          files: ['spark', 'app/Config/App.php'],
          patterns: ['CodeIgniter\\\\', 'codeigniter4/framework'],
          versionFile: 'composer.json',
          versionKey: 'codeigniter4/framework'
        },
        'WordPress': {
          files: ['wp-config.php', 'wp-admin/', 'wp-includes/'],
          patterns: ['wp-settings.php', 'WordPress'],
          versionFile: 'wp-includes/version.php',
          versionKey: 'wp_version'
        },
        'Slim': {
          files: ['public/index.php'],
          patterns: ['Slim\\\\App', 'slim/slim'],
          versionFile: 'composer.json',
          versionKey: 'slim/slim'
        },
        'Yii2': {
          files: ['yii', 'config/web.php'],
          patterns: ['yii\\\\base\\\\Application'],
          versionFile: 'composer.json',
          versionKey: 'yiisoft/yii2'
        },
        'CakePHP': {
          files: ['bin/cake', 'config/app.php'],
          patterns: ['CakePHP'],
          versionFile: 'composer.json',
          versionKey: 'cakephp/cakephp'
        },
        'Lumen': {
          files: ['artisan', 'bootstrap/app.php'],
          patterns: ['Laravel\\\\Lumen', 'laravel/lumen-framework'],
          versionFile: 'composer.json',
          versionKey: 'laravel/lumen-framework'
        },
        'Phalcon': {
          files: ['public/index.php'],
          patterns: ['Phalcon\\\\'],
          versionFile: 'composer.json',
          versionKey: 'phalcon'
        },
        'FuelPHP': {
          files: ['oil', 'fuel/app/bootstrap.php'],
          patterns: ['Fuel\\\\Core'],
          versionFile: 'composer.json',
          versionKey: 'fuelphp'
        }
      },
      nodejs: {
        'Express': {
          files: ['package.json'],
          patterns: ['express'],
          versionFile: 'package.json',
          versionKey: 'express'
        },
        'Next.js': {
          files: ['next.config.js', 'pages/'],
          patterns: ['next'],
          versionFile: 'package.json',
          versionKey: 'next'
        },
        'Nuxt.js': {
          files: ['nuxt.config.js', 'pages/'],
          patterns: ['nuxt'],
          versionFile: 'package.json',
          versionKey: 'nuxt'
        },
        'NestJS': {
          files: ['nest-cli.json', 'src/main.ts'],
          patterns: ['@nestjs/core'],
          versionFile: 'package.json',
          versionKey: '@nestjs/core'
        },
        'React (CRA)': {
          files: ['src/App.js', 'public/index.html'],
          patterns: ['react-scripts'],
          versionFile: 'package.json',
          versionKey: 'react-scripts'
        },
        'Vue.js': {
          files: ['vue.config.js', 'src/App.vue'],
          patterns: ['vue'],
          versionFile: 'package.json',
          versionKey: 'vue'
        },
        'Angular': {
          files: ['angular.json', 'src/main.ts'],
          patterns: ['@angular/core'],
          versionFile: 'package.json',
          versionKey: '@angular/core'
        },
        'Fastify': {
          files: ['package.json'],
          patterns: ['fastify'],
          versionFile: 'package.json',
          versionKey: 'fastify'
        },
        'Koa': {
          files: ['package.json'],
          patterns: ['koa'],
          versionFile: 'package.json',
          versionKey: 'koa'
        },
        'SvelteKit': {
          files: ['svelte.config.js', 'src/routes/'],
          patterns: ['@sveltejs/kit'],
          versionFile: 'package.json',
          versionKey: '@sveltejs/kit'
        }
      },
      go: {
        'Gin': {
          files: ['go.mod', 'main.go'],
          patterns: ['github.com/gin-gonic/gin'],
          versionFile: 'go.mod',
          versionKey: 'github.com/gin-gonic/gin'
        },
        'Echo': {
          files: ['go.mod', 'main.go'],
          patterns: ['github.com/labstack/echo'],
          versionFile: 'go.mod',
          versionKey: 'github.com/labstack/echo'
        },
        'Fiber': {
          files: ['go.mod', 'main.go'],
          patterns: ['github.com/gofiber/fiber'],
          versionFile: 'go.mod',
          versionKey: 'github.com/gofiber/fiber'
        },
        'Beego': {
          files: ['go.mod', 'main.go'],
          patterns: ['github.com/beego/beego'],
          versionFile: 'go.mod',
          versionKey: 'github.com/beego/beego'
        },
        'Revel': {
          files: ['app/', 'conf/'],
          patterns: ['github.com/revel/revel'],
          versionFile: 'go.mod',
          versionKey: 'github.com/revel/revel'
        },
        'Buffalo': {
          files: ['go.mod', 'actions/'],
          patterns: ['github.com/gobuffalo/buffalo'],
          versionFile: 'go.mod',
          versionKey: 'github.com/gobuffalo/buffalo'
        }
      },
      python: {
        'Django': {
          files: ['manage.py', 'settings.py'],
          patterns: ['django'],
          versionFile: 'requirements.txt',
          versionKey: 'django'
        },
        'Flask': {
          files: ['app.py', 'requirements.txt'],
          patterns: ['flask', 'Flask'],
          versionFile: 'requirements.txt',
          versionKey: 'flask'
        },
        'FastAPI': {
          files: ['main.py'],
          patterns: ['fastapi', 'FastAPI'],
          versionFile: 'requirements.txt',
          versionKey: 'fastapi'
        },
        'Pyramid': {
          files: ['development.ini', 'setup.py'],
          patterns: ['pyramid'],
          versionFile: 'setup.py',
          versionKey: 'pyramid'
        },
        'Tornado': {
          files: ['server.py'],
          patterns: ['tornado'],
          versionFile: 'requirements.txt',
          versionKey: 'tornado'
        },
        'Sanic': {
          files: ['server.py'],
          patterns: ['sanic'],
          versionFile: 'requirements.txt',
          versionKey: 'sanic'
        }
      },
      ruby: {
        'Rails': {
          files: ['Gemfile', 'config/routes.rb'],
          patterns: ['rails'],
          versionFile: 'Gemfile',
          versionKey: 'rails'
        },
        'Sinatra': {
          files: ['Gemfile', 'app.rb'],
          patterns: ['sinatra'],
          versionFile: 'Gemfile',
          versionKey: 'sinatra'
        },
        'Hanami': {
          files: ['Gemfile', 'config.ru'],
          patterns: ['hanami'],
          versionFile: 'Gemfile',
          versionKey: 'hanami'
        }
      },
      java: {
        'Spring Boot': {
          files: ['pom.xml', 'src/main/java/'],
          patterns: ['spring-boot-starter'],
          versionFile: 'pom.xml',
          versionKey: 'spring-boot'
        },
        'Jakarta EE': {
          files: ['pom.xml', 'src/main/webapp/'],
          patterns: ['jakarta'],
          versionFile: 'pom.xml',
          versionKey: 'jakarta'
        },
        'Micronaut': {
          files: ['pom.xml', 'src/main/java/'],
          patterns: ['micronaut'],
          versionFile: 'pom.xml',
          versionKey: 'micronaut'
        },
        'Quarkus': {
          files: ['pom.xml', 'src/main/java/'],
          patterns: ['quarkus'],
          versionFile: 'pom.xml',
          versionKey: 'quarkus'
        }
      },
      rust: {
        'Actix Web': {
          files: ['Cargo.toml', 'src/main.rs'],
          patterns: ['actix-web'],
          versionFile: 'Cargo.toml',
          versionKey: 'actix-web'
        },
        'Rocket': {
          files: ['Cargo.toml', 'src/main.rs'],
          patterns: ['rocket'],
          versionFile: 'Cargo.toml',
          versionKey: 'rocket'
        },
        'Warp': {
          files: ['Cargo.toml', 'src/main.rs'],
          patterns: ['warp'],
          versionFile: 'Cargo.toml',
          versionKey: 'warp'
        },
        'Axum': {
          files: ['Cargo.toml', 'src/main.rs'],
          patterns: ['axum'],
          versionFile: 'Cargo.toml',
          versionKey: 'axum'
        }
      }
    };
  }

  async detectFramework(projectPath, techStack) {
    console.log('🔍 Detecting framework in:', projectPath);
    console.log('   Tech stack:', techStack);
    
    if (!projectPath || !techStack) {
      return { name: 'Unknown', type: 'unknown', version: 'N/A', isNative: true };
    }

    // ✅ Cek folder exist
    if (!await fs.pathExists(projectPath)) {
      console.log('❌ Project path not found:', projectPath);
      return { name: 'Unknown', type: 'unknown', version: 'N/A', isNative: true, error: 'Path not found' };
    }

    const signatures = this.signatures[techStack];
    if (!signatures) {
      console.log('⚠️ No signatures for tech stack:', techStack);
      // Fallback: cek file untuk native detection
      const files = await this.getProjectFiles(projectPath);
      return {
        name: files.length > 0 ? 'Native/Custom' : 'Unknown',
        type: files.length > 0 ? 'native' : 'unknown',
        version: 'N/A',
        isNative: files.length > 0
      };
    }

    // Coba deteksi framework berdasarkan signature
    for (const [framework, signature] of Object.entries(signatures)) {
      console.log(`   Checking: ${framework}...`);
      const detected = await this.checkSignature(projectPath, signature);
      if (detected) {
        const version = await this.detectVersion(projectPath, signature);
        console.log(`   ✅ Detected: ${framework} ${version || ''}`);
        return {
          name: framework,
          type: this.getFrameworkType(framework, techStack),
          version: version || 'Unknown',
          isNative: false
        };
      }
    }

    // Check if it's a native/custom project
    const isNative = await this.isNativeProject(projectPath, techStack);
    console.log(`   Result: ${isNative ? 'Native/Custom' : 'Unknown'}`);
    
    return {
      name: isNative ? 'Native/Custom' : 'Unknown',
      type: isNative ? 'native' : 'unknown',
      version: 'N/A',
      isNative
    };
  }

  async checkSignature(projectPath, signature) {
    // Check required files
    if (signature.files) {
      let filesFound = 0;
      for (const file of signature.files) {
        const fullPath = path.join(projectPath, file);
        const exists = await fs.pathExists(fullPath);
        console.log(`      File: ${file} -> ${exists ? '✅' : '❌'}`);
        if (exists) filesFound++;
      }
      
      // Minimal 1 file harus ada (bukan 50%)
      if (filesFound === 0) {
        console.log(`      No files found for this framework`);
        return false;
      }
    }

    // Check patterns in files
    if (signature.patterns && signature.patterns.length > 0) {
      try {
        const files = await this.getProjectFiles(projectPath);
        console.log(`      Scanning ${files.length} files for patterns...`);
        
        for (const pattern of signature.patterns) {
          for (const file of files.slice(0, 30)) {
            try {
              const content = await fs.readFile(file, 'utf8');
              if (content.includes(pattern)) {
                console.log(`      ✅ Pattern found in: ${path.basename(file)}`);
                return true;
              }
            } catch (e) {}
          }
        }
      } catch (e) {
        console.log(`Pattern check error: ${e.message}`);
      }
      return false;
    }

    // If no patterns but files found → detected!
    return true;
  }

  async detectVersion(projectPath, signature) {
    if (!signature.versionFile) return null;

    const versionFilePath = path.join(projectPath, signature.versionFile);
    console.log(`      Version file: ${versionFilePath}`);
    
    if (!await fs.pathExists(versionFilePath)) {
      console.log('      Version file not found');
      return null;
    }

    try {
      const content = await fs.readFile(versionFilePath, 'utf8');
      
      // Untuk composer.json dan package.json
      if (versionFilePath.endsWith('.json')) {
        const json = JSON.parse(content);
        console.log(`      Looking for key: ${signature.versionKey}`);
        
        if (signature.versionKey) {
          const deps = json.dependencies || {};
          const devDeps = json.devDependencies || {};
          const allDeps = { ...deps, ...devDeps };
          
          // ✅ Cek require juga (Laravel kadang di sini)
          const require = json.require || {};
          const requireDev = json['require-dev'] || {};
          const allRequire = { ...require, ...requireDev, ...allDeps };
          
          console.log(`      Available keys: ${Object.keys(allRequire).filter(k => k.includes('laravel')).join(', ')}`);
          
          if (allRequire[signature.versionKey]) {
            const version = allRequire[signature.versionKey].replace(/[\^~>=<]/g, '');
            console.log(`      ✅ Version found: ${version}`);
            return version;
          }
          
          // ✅ Fallback: cari key yang mengandung nama framework
          for (const [key, val] of Object.entries(allRequire)) {
            if (key.includes(signature.versionKey)) {
              const version = val.replace(/[\^~>=<]/g, '');
              console.log(`      ✅ Version found (partial match): ${version}`);
              return version;
            }
          }
        }
      }
    } catch (e) {
      console.log(`Version detection error: ${e.message}`);
    }

    return null;
  }

  async isNativeProject(projectPath, techStack) {
    // Cek apakah ini project native tanpa framework
    const files = await this.getProjectFiles(projectPath);
    
    if (files.length === 0) return true;

    // Check for any framework signatures
    const signatures = this.signatures[techStack];
    if (!signatures) return true;

    for (const [framework, signature] of Object.entries(signatures)) {
      for (const pattern of signature.patterns || []) {
        for (const file of files.slice(0, 10)) {
          try {
            const content = await fs.readFile(file, 'utf8');
            if (content.includes(pattern)) {
              return false;
            }
          } catch (e) {
            // Skip
          }
        }
      }
    }

    return true;
  }

  async getProjectFiles(projectPath, maxDepth = 3) {
    const files = [];
    
    const scan = async (dir, depth) => {
      if (depth > maxDepth) return;
      
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.isDirectory() && 
              !entry.name.startsWith('.') && 
              !['node_modules', 'vendor', '.git', 'storage', '__pycache__'].includes(entry.name)) {
            await scan(fullPath, depth + 1);
          } else if (entry.isFile() && 
                     ['.php', '.js', '.ts', '.py', '.go', '.rb', '.java', '.rs'].some(ext => entry.name.endsWith(ext))) {
            files.push(fullPath);
          }
        }
      } catch (e) {
        // Skip unreadable directories
      }
    };

    await scan(projectPath, 0);
    return files;
  }

  getFrameworkType(framework, techStack) {
    const cms = ['WordPress', 'Drupal', 'Joomla'];
    const micro = ['Express', 'Slim', 'Flask', 'Sinatra', 'Gin', 'Echo', 'Fiber', 'Fastify', 'Koa'];
    const fullstack = ['Laravel', 'Symfony', 'Rails', 'Django', 'Next.js', 'Nuxt.js', 'Spring Boot'];
    
    if (cms.includes(framework)) return 'cms';
    if (micro.includes(framework)) return 'microframework';
    if (fullstack.includes(framework)) return 'fullstack';
    return 'framework';
  }

  async suggestTemplate(projectPath, techStack) {
    const result = await this.detectFramework(projectPath, techStack);
    
    if (!result.isNative && result.name !== 'Unknown') {
      return {
        suggested: result.name.toLowerCase().replace(/\s/g, '-'),
        confidence: 'high',
        framework: result.name
      };
    }
    
    return null;
  }
}

module.exports = { FrameworkDetector };