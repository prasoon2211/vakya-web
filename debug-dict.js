
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'lib/dictionary/dictionary-de.db');
try {
  const db = new Database(dbPath, { readonly: true });
  const row = db.prepare('SELECT * FROM words WHERE word_original = ?').get('Hund');
  console.log(JSON.stringify(row, null, 2));
} catch (e) {
  console.error(e);
}
