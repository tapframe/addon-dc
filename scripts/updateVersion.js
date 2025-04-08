const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Função para incrementar a versão (ex.: 1.0.0 -> 1.0.1)
function incrementVersion(currentVersion) {
  const [major, minor, patch] = currentVersion.split('.').map(Number);
  return `${major}.${minor}.${patch + 1}`; // Incrementa o patch
}

// Função para verificar se o mcuData.js foi alterado
function hasMcuDataChanged() {
  try {
    const diff = execSync('git diff HEAD^ HEAD -- src/mcuData.js').toString();
    return diff.trim().length > 0; // Retorna true se houver mudanças
  } catch (err) {
    console.error('Erro ao verificar mudanças no mcuData.js:', err.message);
    return false;
  }
}

// Função para atualizar os arquivos
function updateVersionFiles() {
  // Ler a versão atual do package.json
  const packageJsonPath = path.join(__dirname, '../package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const currentVersion = packageJson.version;

  // Verificar se o mcuData.js foi alterado
  if (!hasMcuDataChanged()) {
    console.log('Nenhuma mudança no mcuData.js. Versão não será atualizada.');
    process.exit(0); // Sai sem fazer mudanças
  }

  // Incrementar a versão
  const newVersion = incrementVersion(currentVersion);
  console.log(`Atualizando versão de ${currentVersion} para ${newVersion}...`);

  // Atualizar package.json
  packageJson.version = newVersion;
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf8');

  // Atualizar manifest.json
  const manifestPath = path.join(__dirname, '../src/manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.version = newVersion;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  // Atualizar addon.js
  const addonPath = path.join(__dirname, '../src/addon.js');
  let addonContent = fs.readFileSync(addonPath, 'utf8');
  addonContent = addonContent.replace(
    /Starting Marvel Addon v\d+\.\d+\.\d+\.\.\./,
    `Starting Marvel Addon v${newVersion}...`
  );
  fs.writeFileSync(addonPath, addonContent, 'utf8');

  // Fazer commit das mudanças
  try {
    execSync('git config --global user.email "github-actions[bot]@users.noreply.github.com"');
    execSync('git config --global user.name "github-actions[bot]"');
    execSync('git add package.json src/manifest.json src/addon.js');
    execSync(`git commit -m "Bump version to v${newVersion} after mcuData update"`);
    execSync('git push');
    console.log(`Versão atualizada para v${newVersion} e commit realizado com sucesso.`);
  } catch (err) {
    console.error('Erro ao fazer commit das mudanças:', err.message);
    process.exit(1);
  }
}

// Executar a função
updateVersionFiles();
