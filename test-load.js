// test-load.js
console.log('🔍 Testing module loading...\n');

// Test 1: Core modules
try {
  require('./modules/EnvironmentManager');
  console.log('✅ EnvironmentManager');
} catch(e) { console.log('❌ EnvironmentManager:', e.message); }

try {
  require('./modules/TemplateManager');
  console.log('✅ TemplateManager');
} catch(e) { console.log('❌ TemplateManager:', e.message); }

try {
  require('./modules/TerminalManager');
  console.log('✅ TerminalManager');
} catch(e) { console.log('❌ TerminalManager:', e.message); }

try {
  require('./modules/DatabaseManager');
  console.log('✅ DatabaseManager');
} catch(e) { console.log('❌ DatabaseManager:', e.message); }

console.log('\n📦 Testing optional modules...');

try {
  require('./modules/VersionManager');
  console.log('✅ VersionManager');
} catch(e) { console.log('❌ VersionManager:', e.message); }

try {
  require('./modules/SSLManager');
  console.log('✅ SSLManager');
} catch(e) { console.log('❌ SSLManager:', e.message); }

try {
  require('./modules/CacheManager');
  console.log('✅ CacheManager');
} catch(e) { console.log('❌ CacheManager:', e.message); }

try {
  require('./modules/QueueManager');
  console.log('✅ QueueManager');
} catch(e) { console.log('❌ QueueManager:', e.message); }

try {
  require('./modules/SchedulerManager');
  console.log('✅ SchedulerManager');
} catch(e) { console.log('❌ SchedulerManager:', e.message); }

try {
  require('./modules/WorkerManager');
  console.log('✅ WorkerManager');
} catch(e) { console.log('❌ WorkerManager:', e.message); }

try {
  require('./modules/LogViewer');
  console.log('✅ LogViewer');
} catch(e) { console.log('❌ LogViewer:', e.message); }

try {
  require('./modules/PerformanceEngine');
  console.log('✅ PerformanceEngine');
} catch(e) { console.log('❌ PerformanceEngine:', e.message); }

try {
  require('./modules/SecurityScanner');
  console.log('✅ SecurityScanner');
} catch(e) { console.log('❌ SecurityScanner:', e.message); }

try {
  require('./modules/StabilityManager');
  console.log('✅ StabilityManager');
} catch(e) { console.log('❌ StabilityManager:', e.message); }

try {
  require('./modules/BenchmarkEngine');
  console.log('✅ BenchmarkEngine');
} catch(e) { console.log('❌ BenchmarkEngine:', e.message); }

try {
  require('./modules/AIPowerOptimizer');
  console.log('✅ AIPowerOptimizer');
} catch(e) { console.log('❌ AIPowerOptimizer:', e.message); }

try {
  require('./modules/FrameworkDetector');
  console.log('✅ FrameworkDetector');
} catch(e) { console.log('❌ FrameworkDetector:', e.message); }

try {
  require('./modules/HotReloadManager');
  console.log('✅ HotReloadManager');
} catch(e) { console.log('❌ HotReloadManager:', e.message); }

try {
  require('./modules/PluginSystem');
  console.log('✅ PluginSystem');
} catch(e) { console.log('❌ PluginSystem:', e.message); }

try {
  require('./modules/SmartAllocator');
  console.log('✅ SmartAllocator');
} catch(e) { console.log('❌ SmartAllocator:', e.message); }

try {
  require('./modules/CollaborationManager');
  console.log('✅ CollaborationManager');
} catch(e) { console.log('❌ CollaborationManager:', e.message); }

try {
  require('./modules/NetworkManager');
  console.log('✅ NetworkManager');
} catch(e) { console.log('❌ NetworkManager:', e.message); }

try {
  require('./modules/BackupManager');
  console.log('✅ BackupManager');
} catch(e) { console.log('❌ BackupManager:', e.message); }

try {
  require('./modules/MonitoringService');
  console.log('✅ MonitoringService');
} catch(e) { console.log('❌ MonitoringService:', e.message); }

try {
  require('./modules/RedisManager');
  console.log('✅ RedisManager');
} catch(e) { console.log('❌ RedisManager:', e.message); }

try {
  require('./modules/XDebugManager');
  console.log('✅ XDebugManager');
} catch(e) { console.log('❌ XDebugManager:', e.message); }

console.log('\n✅ Test complete!');
console.log('If all modules show ✅, run: npx electron .');