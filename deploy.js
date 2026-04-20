const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = __dirname;
const BACKEND_DIR = path.join(ROOT_DIR, 'backend');
const FRONTEND_BUILD_DIR = path.join(ROOT_DIR, 'build');
const BACKEND_PUBLIC_DIR = path.join(BACKEND_DIR, 'public');
const BACKEND_DIST_DIR = path.join(BACKEND_DIR, 'dist');
const RELEASE_DIR = path.join(ROOT_DIR, 'release');
const RELEASE_BACKEND_DIR = path.join(RELEASE_DIR, 'backend');

console.log('🚀 Iniciando empaquetado de producción (frontend + backend)...');

function rmSafe(target) {
  try {
    fs.rmSync(target, { recursive: true, force: true });
    console.log(`🧹 Eliminado ${target}`);
  } catch {
    console.log(`ℹ️ ${target} ya estaba limpio`);
  }
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    const files = fs.readdirSync(src);
    for (const file of files) {
      copyRecursive(path.join(src, file), path.join(dest, file));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

function run(command, cwd) {
  console.log(`▶ Ejecutando: ${command}`);
  execSync(command, { stdio: 'inherit', cwd });
}

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function copyFileSafe(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function assertExists(target, description) {
  if (!fs.existsSync(target)) {
    throw new Error(`No se encontró ${description}: ${target}`);
  }
}

try {
  // 1) Limpiar artefactos previos
  rmSafe(FRONTEND_BUILD_DIR);
  rmSafe(BACKEND_PUBLIC_DIR);
  rmSafe(BACKEND_DIST_DIR);
  rmSafe(RELEASE_DIR);

  // 2) Build frontend con Vite
  console.log('🔨 Construyendo frontend...');
  run('npm run build', ROOT_DIR);
  assertExists(FRONTEND_BUILD_DIR, 'el build del frontend');

  // 3) Copiar frontend compilado al backend que servirá archivos estáticos
  console.log('📦 Copiando frontend compilado a backend/public...');
  ensureDir(BACKEND_PUBLIC_DIR);
  copyRecursive(FRONTEND_BUILD_DIR, BACKEND_PUBLIC_DIR);
  assertExists(path.join(BACKEND_PUBLIC_DIR, 'index.html'), 'backend/public/index.html');

  // 4) Compilar backend TS
  console.log('🔨 Construyendo backend...');
  run('npm run build', BACKEND_DIR);
  assertExists(path.join(BACKEND_DIST_DIR, 'server.js'), 'backend/dist/server.js');

  // 5) Empaquetar runtime listo para producción
  console.log('🧱 Generando paquete release/backend...');
  ensureDir(RELEASE_BACKEND_DIR);
  copyRecursive(BACKEND_DIST_DIR, path.join(RELEASE_BACKEND_DIR, 'dist'));
  copyRecursive(BACKEND_PUBLIC_DIR, path.join(RELEASE_BACKEND_DIR, 'public'));
  copyFileSafe(path.join(BACKEND_DIR, 'package.json'), path.join(RELEASE_BACKEND_DIR, 'package.json'));
  copyFileSafe(path.join(BACKEND_DIR, 'package-lock.json'), path.join(RELEASE_BACKEND_DIR, 'package-lock.json'));
  copyFileSafe(path.join(BACKEND_DIR, '.env.example'), path.join(RELEASE_BACKEND_DIR, '.env.example'));
  copyFileSafe(path.join(BACKEND_DIR, 'README.md'), path.join(RELEASE_BACKEND_DIR, 'README.md'));
  copyFileSafe(path.join(BACKEND_DIR, 'ecosystem.config.cjs'), path.join(RELEASE_BACKEND_DIR, 'ecosystem.config.cjs'));
  ensureDir(path.join(RELEASE_BACKEND_DIR, 'cache'));
  ensureDir(path.join(RELEASE_BACKEND_DIR, 'imports'));
  ensureDir(path.join(RELEASE_BACKEND_DIR, 'logs'));

  console.log('🎉 Paquete de producción generado correctamente.');
  console.log(`📁 Salida: ${RELEASE_BACKEND_DIR}`);
  console.log('');
  console.log('Siguiente paso en el servidor de producción:');
  console.log('  1. Copiar la carpeta release/backend');
  console.log('  2. Crear .env a partir de .env.example');
  console.log('  3. Ejecutar npm ci --omit=dev');
  console.log('  4. Ejecutar pm2 start ecosystem.config.cjs --env production');
} catch (error) {
  console.error('❌ Error durante la construcción/despliegue:', error.message || error);
  process.exit(1);
}
