'use strict';
const fs = require('node:fs');
const path = require('node:path');

function publishPortable(projectDir) {
  const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'));
  const name = `${pkg.productName} ${pkg.version}.exe`;
  if (path.basename(name) !== name || /[\\/:*?"<>|]/.test(name)) throw new Error('Nom de l’exécutable invalide.');
  const source = path.join(projectDir, 'dist', name);
  const destination = path.join(projectDir, name);
  // Copier complètement avant de remplacer : une erreur de copie préserve l'ancien exécutable.
  const temporary = destination + '.tmp';
  if (!fs.existsSync(source)) throw new Error(`Exécutable portable introuvable : ${source}. Lance npm run dist pour le construire.`);
  try {
    fs.copyFileSync(source, temporary);
    fs.renameSync(temporary, destination);
  } catch (error) {
    if (error.code === 'EBUSY' || error.code === 'EPERM' || error.code === 'EACCES') {
      throw new Error('Impossible de remplacer l’exécutable. Ferme Tactical Emblem, puis lance npm run postdist pour réessayer sans recompiler. Le nouveau fichier reste disponible dans dist.');
    }
    throw error;
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  return destination;
}

if (require.main === module) {
  try { console.log('Exécutable mis à jour : ' + publishPortable(path.resolve(__dirname, '..'))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { publishPortable };
