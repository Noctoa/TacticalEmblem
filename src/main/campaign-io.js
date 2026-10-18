'use strict';
const fs = require('fs');
const path = require('path');
const Campaign = require('../shared/campaign');
const fileOf = dir => path.join(dir, 'saves', 'campaign.json');
function load(dir) {
  const file = fileOf(dir);
  if (!fs.existsSync(file)) return null;
  try { return Campaign.validate(JSON.parse(fs.readFileSync(file, 'utf8'))); }
  catch (e) { throw new Error('Impossible de lire la campagne : ' + e.message); }
}
function save(dir, value) {
  Campaign.validate(value);
  const file = fileOf(dir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', JSON.stringify(value, null, 2), 'utf8');
  if (fs.existsSync(file)) fs.copyFileSync(file, file + '.bak');
  fs.renameSync(file + '.tmp', file);
}
module.exports = { load, save };
