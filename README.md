# 🚀 EnvBox Pro - Local Development Environment Manager

![EnvBox Pro](resources/icon.jpeg)

**EnvBox Pro** adalah aplikasi desktop untuk mengelola environment development lokal dengan mudah. Dibangun dengan Electron, mendukung PHP, Node.js, Go, Python, MySQL, PostgreSQL, Redis, dan banyak lagi.

> ⚡ **Powerful. Fast. All-in-One.**  
> Pengganti Laragon/XAMPP yang lebih modern dan powerful.

---

## ✨ Fitur Utama

### 🌐 Web Server & Bahasa Pemrograman
- **PHP** - Support PHP 7.x & 8.x dengan Apache/Nginx/CGI
- **Node.js** - Auto-detect framework (Next.js, Vite, NestJS, Nuxt, dll)
- **Go** - Development & production mode
- **Python** - WSGI & built-in server

### 🗄️ Database Management
- **MySQL** - MySQL 8.0 dengan phpMyAdmin integration
- **PostgreSQL** - PostgreSQL dengan Adminer
- **SQLite** - Zero-config database
- **MongoDB** - NoSQL database (coming soon)
- **Redis** - In-memory data store

### 🛠️ Developer Tools
- **phpMyAdmin** - MySQL management via web
- **HeidiSQL** - Direct launch ke HeidiSQL
- **Adminer** - Lightweight database manager
- **Terminal** - Built-in terminal & external terminal launcher
- **SSL/HTTPS** - Auto-generate SSL certificates

### ⚡ Performance & Optimization
- **OPcache** - PHP caching auto-configured
- **Apache** - Production-ready web server
- **Queue System** - Background job processing
- **Scheduler** - Cron job management
- **Worker Manager** - Process scaling

### 🔒 Security & Monitoring
- **Security Scanner** - Auto-detect vulnerabilities
- **Performance Monitor** - Real-time resource usage
- **Log Viewer** - Live log monitoring
- **Backup System** - Automated database backup
- **Network Manager** - Port management & proxy

### 🤖 AI & Smart Features
- **AI Power Optimizer** - Intelligent resource allocation
- **Framework Detection** - Auto-detect project type
- **Smart Port Management** - Auto-find available ports

---

# EnvBox Environments

## Setup
```powershell
# Download all environments
.\download.ps1 -Env all

# Or download specific
.\download.ps1 -Env mysql
.\download.ps1 -Env go
```

## 📥 Installation

### System Requirements
- **OS**: Windows 10/11 (64-bit) - macOS & Linux coming soon
- **RAM**: 4GB minimum (8GB recommended)
- **Storage**: 2GB free space
- **Node.js**: 18.x or later (bundled with Electron)

### Quick Start

1. **Download** EnvBox Pro from [Releases Page](https://github.com/yourusername/envbox-pro/releases)

2. **Extract** to your desired location:


3. **Setup Environments** (download PHP, MySQL, etc.):
```bash
# Run the setup script
setup.bat
```

4. **EnvBox Pro.exe

## FOLDER STRUCTURE
envbox-pro/
├── environments/
│   ├── php/              # PHP versions
│   │   ├── 8.2.28/
│   │   └── 8.3.0/
│   ├── mysql/            # MySQL
│   │   └── mysql-8.0.46-winx64/
│   ├── apache/           # Apache HTTP Server
│   │   └── Apache24/
│   ├── postgresql/       # PostgreSQL
│   ├── nodejs/           # Node.js
│   ├── go/               # Go
│   ├── python/           # Python
│   └── tools/
│       └── phpmyadmin/   # phpMyAdmin
├── projects/             # Your projects
├── modules/              # Backend modules
├── src/                  # Frontend UI
└── resources/            # Assets

