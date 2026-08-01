/**
 * 一叶轻舟工作室 — 启动器
 *
 * 启动 Express 服务器，然后以 NW.js 原生窗口打开应用。
 * 支持开发模式（项目根目录）和生产模式（NSIS 安装目录）。
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const SERVER_PORT = 3001;

// ===== 路径解析 =====

// 生产模式：所有文件在安装目录下
//   结构: $INSTDIR/
//     node.exe
//     launcher.js
//     dist-server/server/index.js
//     nwjs/nw.exe
//     nw-app/splash.html
//
// 开发模式：项目根目录
//   结构: 项目根/
//     launcher.js
//     dist-server/server/index.js
//     node_modules/nw/nwjs-v0.114.0-win-x64/nw.exe
//     nw-app/splash.html

const isDev = !fs.existsSync(path.join(__dirname, 'nwjs', 'nw.exe'));

const nwExe = isDev
  ? path.join(__dirname, 'node_modules', 'nw', 'nwjs-v0.114.0-win-x64', 'nw.exe')
  : path.join(__dirname, 'nwjs', 'nw.exe');

const nwAppDir = path.join(__dirname, 'nw-app');
const serverScript = path.join(__dirname, 'dist-server', 'server', 'index.js');

// ===== 验证 =====

if (!fs.existsSync(serverScript)) {
  console.error('❌ 找不到服务器文件:', serverScript);
  console.error('   请确保已编译: npm run build && npm run build:server');
  process.exit(1);
}

if (!fs.existsSync(nwExe)) {
  console.error('❌ 找不到 NW.js 运行时:', nwExe);
  console.error('   开发模式请运行: npm install');
  console.error('   生产模式请重新安装应用');
  process.exit(1);
}

console.log('🚀 一叶轻舟工作室 启动中...');
console.log('   NW.js:', nwExe);
console.log('   服务器:', serverScript);

// ===== 启动流程 =====

let serverStarted = false;
let nwStarted = false;

// 1. 启动 Express 服务器
const serverProcess = spawn(process.execPath, [serverScript], {
  cwd: __dirname,
  env: { ...process.env, NODE_ENV: 'production' },
  stdio: 'pipe',
  windowsHide: true,
});

serverProcess.stdout.on('data', (data) => {
  const msg = data.toString();
  process.stdout.write(msg);

  if (!serverStarted && (msg.includes('已启动') || msg.includes('listening') || msg.includes('3001'))) {
    serverStarted = true;
    console.log('   ✅ 服务器已就绪');

    // 服务器就绪后启动 NW.js
    startNW();
  }
});

serverProcess.stderr.on('data', (data) => {
  process.stderr.write(data);
});

serverProcess.on('error', (err) => {
  console.error('❌ 服务器启动失败:', err.message);
  process.exit(1);
});

serverProcess.on('exit', (code) => {
  if (!serverStarted) {
    console.error('❌ 服务器意外退出，退出码:', code);
    process.exit(code || 1);
  }
  console.log('   服务器已关闭');
  process.exit(0);
});

// 2. 启动 NW.js 窗口
function startNW() {
  if (nwStarted) return;
  nwStarted = true;

  const nwProcess = spawn(nwExe, [nwAppDir], {
    cwd: __dirname,
    stdio: 'pipe',
    windowsHide: true,
  });

  nwProcess.stdout.on('data', (data) => {
    process.stdout.write('[NW] ' + data.toString());
  });

  nwProcess.stderr.on('data', (data) => {
    process.stderr.write('[NW] ' + data.toString());
  });

  nwProcess.on('error', (err) => {
    console.error('❌ NW.js 启动失败:', err.message);
  });

  nwProcess.on('exit', (code) => {
    console.log('   NW.js 窗口已关闭');
    // 关闭 NW.js 时也关闭服务器
    serverProcess.kill();
    process.exit(code || 0);
  });
}

// 额外兜底：3 秒后如果服务器还没就绪也启动 NW.js
setTimeout(() => {
  if (!nwStarted && !serverStarted) {
    console.log('   ⚠️ 服务器启动超时，尝试直接启动窗口...');
    startNW();
  }
}, 3000);

// ===== 退出处理 =====

process.on('SIGINT', () => {
  serverProcess.kill();
  process.exit(0);
});

process.on('SIGTERM', () => {
  serverProcess.kill();
  process.exit(0);
});
