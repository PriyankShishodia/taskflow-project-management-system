const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
require('./config');

const file = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'app.db');
if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });

const db = new Database(file);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8'));

module.exports = db;
