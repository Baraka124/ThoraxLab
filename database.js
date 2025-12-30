const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');

let db = null;

// Use Railway's persistent volume or local file
const DB_PATH = process.env.RAILWAY_VOLUME_MOUNT_PATH 
    ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'thoraxlab.db')
    : path.join(__dirname, 'thoraxlab.db');

async function getDB() {
    if (!db) {
        console.log(`📦 Opening database at: ${DB_PATH}`);
        
        // Ensure directory exists
        const dir = path.dirname(DB_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        db = await open({
            filename: DB_PATH,
            driver: sqlite3.Database
        });
        
        // Initialize tables
        await initTables(db);
    }
    return db;
}

async function initTables(dbInstance) {
    // Enable WAL mode for better concurrency
    await dbInstance.exec('PRAGMA journal_mode = WAL');
    await dbInstance.exec('PRAGMA foreign_keys = ON');
    
    // Users table (simplified - no passwords for MVP)
    await dbInstance.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE,
            name TEXT NOT NULL,
            role TEXT DEFAULT 'clinician',
            department TEXT DEFAULT 'Pneumology',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);
    
    // Projects table
    await dbInstance.exec(`
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            stage TEXT CHECK(stage IN ('ideation', 'planning', 'active', 'review', 'completed')) DEFAULT 'ideation',
            department TEXT DEFAULT 'Pneumology',
            status TEXT DEFAULT 'active',
            created_by TEXT,
            pulse_score INTEGER DEFAULT 50,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (created_by) REFERENCES users(id)
        );
    `);
    
    // Project members
    await dbInstance.exec(`
        CREATE TABLE IF NOT EXISTS project_members (
            project_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            role TEXT DEFAULT 'contributor',
            joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (project_id, user_id),
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    `);
    
    // Discussions
    await dbInstance.exec(`
        CREATE TABLE IF NOT EXISTS discussions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            content TEXT NOT NULL,
            type TEXT DEFAULT 'comment',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
    `);
    
    // Interactions (likes, views, etc.)
    await dbInstance.exec(`
        CREATE TABLE IF NOT EXISTS interactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id TEXT NOT NULL,
            discussion_id INTEGER,
            user_id TEXT NOT NULL,
            type TEXT CHECK(type IN ('like', 'comment', 'view', 'vote')),
            content TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (discussion_id) REFERENCES discussions(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
    `);
    
    // Create indexes for performance
    await dbInstance.exec(`
        CREATE INDEX IF NOT EXISTS idx_projects_stage ON projects(stage);
        CREATE INDEX IF NOT EXISTS idx_discussions_project ON discussions(project_id);
        CREATE INDEX IF NOT EXISTS idx_interactions_project ON interactions(project_id);
        CREATE INDEX IF NOT EXISTS idx_interactions_created ON interactions(created_at);
    `);
    
    // Check if admin user exists
    const adminExists = await dbInstance.get(
        "SELECT id FROM users WHERE email = 'admin@thoraxlab.local'"
    );
    
    if (!adminExists) {
        console.log('👑 Creating admin user...');
        const { v4: uuidv4 } = require('uuid');
        
        await dbInstance.run(
            `INSERT INTO users (id, email, name, role, department) 
             VALUES (?, ?, ?, ?, ?)`,
            [
                uuidv4(),
                'admin@thoraxlab.local',
                'Digital Innovation Lead',
                'admin',
                'Pneumology'
            ]
        );
        console.log('✅ Admin user created');
    }
    
    console.log('✅ Database tables initialized');
}

module.exports = { getDB };
