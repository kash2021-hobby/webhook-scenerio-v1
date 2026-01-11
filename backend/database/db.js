import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, 'webhooks.db');
const schemaPath = join(__dirname, 'schema.sql');

let SQL;
let database;
let dbWrapper;
let initialized = false;

// Compatibility wrapper to mimic better-sqlite3 API
class DatabaseWrapper {
  constructor(dbInstance) {
    this.db = dbInstance;
  }

  prepare(sql) {
    return new StatementWrapper(this.db, sql);
  }

  exec(sql) {
    try {
      // Split by semicolon and execute each statement
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));
      
      for (const statement of statements) {
        if (statement) {
          this.db.run(statement);
        }
      }
      this.save();
      return true;
    } catch (error) {
      console.error('SQL exec error:', error);
      throw error;
    }
  }

  pragma(command) {
    // sql.js doesn't support pragma the same way, ignore it
    return;
  }

  close() {
    this.save();
  }

  save() {
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      writeFileSync(dbPath, buffer);
    } catch (error) {
      console.error('Error saving database:', error);
    }
  }
}

class StatementWrapper {
  constructor(dbInstance, sql) {
    this.db = dbInstance;
    this.sql = sql;
  }

  get(...params) {
    try {
      const stmt = this.db.prepare(this.sql);
      if (params.length > 0) {
        stmt.bind(params);
      }
      const result = stmt.step() ? stmt.getAsObject() : null;
      stmt.free();
      return result;
    } catch (error) {
      // Return null for "no such table" during initialization
      if (error.message && error.message.includes('no such table')) {
        return null;
      }
      console.error('SQL get error:', error.message, 'SQL:', this.sql);
      throw error;
    }
  }

  all(...params) {
    try {
      const stmt = this.db.prepare(this.sql);
      if (params.length > 0) {
        stmt.bind(params);
      }
      const results = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();
      return results;
    } catch (error) {
      console.error('SQL all error:', error.message, 'SQL:', this.sql);
      throw error;
    }
  }

  run(...params) {
    try {
      const stmt = this.db.prepare(this.sql);
      if (params.length > 0) {
        stmt.bind(params);
      }
      stmt.step();
      const changes = this.db.getRowsModified();
      
      // Get last insert rowid
      let lastInsertRowid = null;
      try {
        const result = this.db.exec("SELECT last_insert_rowid() as id");
        if (result.length > 0 && result[0].values.length > 0) {
          lastInsertRowid = result[0].values[0][0];
        }
      } catch (e) {
        // Ignore if last_insert_rowid fails
      }
      
      stmt.free();
      
      // Save database after mutations
      if (!this.sql.trim().toUpperCase().startsWith('SELECT')) {
        const data = this.db.export();
        const buffer = Buffer.from(data);
        writeFileSync(dbPath, buffer);
      }
      
      return {
        changes: changes,
        lastInsertRowid: lastInsertRowid
      };
    } catch (error) {
      console.error('SQL run error:', error.message, 'SQL:', this.sql);
      throw error;
    }
  }
}

// Initialize database
async function initializeDatabase() {
  if (initialized) {
    return dbWrapper;
  }

  try {
    console.log('Initializing database...');
    
    // Initialize SQL.js - try simple initialization first
    try {
      SQL = await initSqlJs();
    } catch (error) {
      // If simple init fails, try with WASM file path
      console.log('Trying alternative WASM loading method...');
      const sqlJsWasmPath = join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
      
      if (existsSync(sqlJsWasmPath)) {
        const wasmBinary = readFileSync(sqlJsWasmPath);
        SQL = await initSqlJs({ wasmBinary });
      } else {
        // Last resort: try CDN (might not work in Node.js)
        SQL = await initSqlJs({
          locateFile: (file) => `https://sql.js.org/dist/${file}`
        });
      }
    }

    // Load existing database or create new one
    if (existsSync(dbPath)) {
      try {
        const buffer = readFileSync(dbPath);
        database = new SQL.Database(buffer);
        console.log('Loaded existing database');
      } catch (error) {
        console.log('Error loading database, creating new one:', error.message);
        database = new SQL.Database();
      }
    } else {
      database = new SQL.Database();
      console.log('Created new database');
    }

    // Create tables - always run schema to ensure tables exist
    if (existsSync(schemaPath)) {
      const schema = readFileSync(schemaPath, 'utf-8');
      // Split by semicolon and filter out comments and empty lines
      const statements = schema
        .split(';')
        .map(s => s.trim())
        .filter(s => {
          // Remove empty lines and comments
          return s.length > 0 && 
                 !s.startsWith('--') && 
                 !s.match(/^\s*$/);
        });

      console.log(`Executing ${statements.length} schema statements...`);
      
      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i];
        if (!statement) continue;
        
        try {
          // Use exec for DDL statements (CREATE TABLE, etc.)
          database.exec(statement);
          console.log(`✓ Executed statement ${i + 1}/${statements.length}: ${statement.substring(0, 50)}...`);
        } catch (error) {
          // Ignore "table already exists" errors
          const errorMsg = error.message.toLowerCase();
          if (errorMsg.includes('already exists') || 
              errorMsg.includes('duplicate') ||
              (errorMsg.includes('table') && errorMsg.includes('exists'))) {
            console.log(`  Table already exists (statement ${i + 1})`);
          } else {
            console.error(`✗ Schema execution error (statement ${i + 1}):`, error.message);
            console.error('Full statement:', statement);
            // Don't throw - continue with other statements
          }
        }
      }
      
      // Verify tables were created
      try {
        const tables = database.exec("SELECT name FROM sqlite_master WHERE type='table'");
        if (tables.length > 0 && tables[0].values.length > 0) {
          const tableNames = tables[0].values.map(row => row[0]);
          console.log('Created tables:', tableNames.join(', '));
        } else {
          console.warn('Warning: No tables found after schema execution!');
        }
      } catch (error) {
        console.error('Error verifying tables:', error.message);
      }
      
      console.log('Schema initialization complete');
    } else {
      console.error('ERROR: Schema file not found at:', schemaPath);
      throw new Error(`Schema file not found at ${schemaPath}`);
    }

    // Wrap database with compatibility layer
    dbWrapper = new DatabaseWrapper(database);
    initialized = true;
    
    // Save initial state
    dbWrapper.save();
    
    console.log('Database initialized successfully');
    return dbWrapper;
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
}

// Start initialization immediately
const initPromise = initializeDatabase();

// Export initialization promise for server.js
export { initPromise };

// Export db object - will be populated after initialization
// Routes will use this, and server.js ensures it's initialized first
let db = null;

// Wait for initialization and set db
initPromise.then(wrapper => {
  db = wrapper;
  console.log('Database ready for use');
}).catch(err => {
  console.error('Database initialization failed:', err);
  process.exit(1);
});

// Export db object - use a synchronous getter that waits if needed
// Since server.js waits for initPromise, this should always be ready when routes use it
const dbExport = new Proxy({}, {
  get(target, prop) {
    if (!initialized || !db) {
      // If not initialized, this is a programming error - server should have waited
      console.error('Database accessed before initialization! Property:', prop);
      throw new Error(`Database not initialized. Make sure server.js waits for initPromise. Property: ${prop}`);
    }
    const value = db[prop];
    if (typeof value === 'function') {
      return value.bind(db);
    }
    return value;
  }
});

export default dbExport;