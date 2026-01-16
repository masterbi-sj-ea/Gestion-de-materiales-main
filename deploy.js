const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Iniciando proceso de construcción y copia del frontend al backend...');

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

try {
  // 1) Limpiar builds anteriores
  rmSafe('build');
  rmSafe(path.join('backend', 'public'));

  // 2) Build frontend con Vite
  console.log('🔨 Construyendo frontend (npm run build)...');
  execSync('npm run build', { stdio: 'inherit' });

  // 3) Crear backend/public
  const publicDir = path.join('backend', 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // 4) Copiar build -> backend/public
  const buildDir = 'build';
  if (!fs.existsSync(buildDir)) {
    throw new Error(`La carpeta ${buildDir} no existe. ¿Cambió la salida de Vite o falló el build?`);
  }

  console.log('📦 Copiando build -> backend/public...');
  copyRecursive(buildDir, publicDir);

  console.log('🎉 ¡Construcción y copia completadas!');
  console.log('   Ahora puedes levantar el backend con:');
  console.log('   cd backend && npm run dev   (desarrollo)');
  console.log('   o npm start                  (si ya está compilado)');
} catch (error) {
  console.error('❌ Error durante la construcción/despliegue:', error.message || error);
  process.exit(1);
}
