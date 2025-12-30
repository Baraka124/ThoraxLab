const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');

let db = null;

const DB_PATH = process.env.RAILWAY_VOLUME_MOUNT_PATH 
    ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'thoraxlab.db')
    : path.join(__dirname, 'thoraxlab.db');

async function getDB() {
    if (!db) {
        console.log(`📊 Opening database: ${DB_PATH}`);
        
        const dir = path.dirname(DB_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        
        db = await open({
            filename: DB_PATH,
            driver: sqlite3.Database
        });
        
        await initTables(db);
    }
    return db;
}

async function initTables(dbInstance) {
    await dbInstance.exec('PRAGMA journal_mode = WAL');
    await dbInstance.exec('PRAGMA foreign_keys = ON');
    
    // Users (minimal auth for MVP)
    await dbInstance.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE,
            name TEXT NOT NULL,
            role TEXT DEFAULT 'clinician',
            department TEXT DEFAULT 'Pneumology',
            avatar_color TEXT DEFAULT '#2D9CDB',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);
    
    // Projects
    await dbInstance.exec(`
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            stage TEXT CHECK(stage IN ('idea', 'planning', 'active', 'review', 'completed')) DEFAULT 'idea',
            department TEXT DEFAULT 'Pneumology',
            status TEXT DEFAULT 'active',
            created_by TEXT,
            pulse_score INTEGER DEFAULT 50,
            last_calculated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            target_date DATE,
            FOREIGN KEY (created_by) REFERENCES users(id)
        );
    `);
    
    // Project Members
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
    
    // Interactions (Real-time tracking)
    await dbInstance.exec(`
        CREATE TABLE IF NOT EXISTS interactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id TEXT NOT NULL,
            discussion_id INTEGER,
            user_id TEXT NOT NULL,
            type TEXT CHECK(type IN ('view', 'like', 'comment', 'vote', 'stage_change')),
            metadata TEXT DEFAULT '{}',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (discussion_id) REFERENCES discussions(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
    `);
    
    // Activity Log (for analytics)
    await dbInstance.exec(`
        CREATE TABLE IF NOT EXISTS activity_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            action TEXT NOT NULL,
            entity_type TEXT,
            entity_id TEXT,
            metadata TEXT DEFAULT '{}',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
    `);
    
    // Indexes
    await dbInstance.exec(`
        CREATE INDEX IF NOT EXISTS idx_projects_stage ON projects(stage);
        CREATE INDEX IF NOT EXISTS idx_projects_pulse ON projects(pulse_score);
        CREATE INDEX IF NOT EXISTS idx_discussions_project ON discussions(project_id);
        CREATE INDEX IF NOT EXISTS idx_interactions_project ON interactions(project_id);
        CREATE INDEX IF NOT EXISTS idx_interactions_time ON interactions(created_at);
        CREATE INDEX IF NOT EXISTS idx_activity_log_time ON activity_log(created_at);
    `);
    
    // Create admin user
    const adminExists = await dbInstance.get(
        "SELECT id FROM users WHERE email = 'admin@thoraxlab.local'"
    );
    
    if (!adminExists) {
        const { v4: uuidv4 } = require('uuid');
        await dbInstance.run(
            `INSERT INTO users (id, email, name, role, department, avatar_color) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [uuidv4(), 'admin@thoraxlab.local', 'Digital Innovation Lead', 'admin', 'Pneumology', '#1A365D']
        );
        console.log('✅ Admin user created');
    }
    
    console.log('✅ Database initialized with enterprise schema');
}

// Pulse calculation algorithm
async function calculatePulseScore(db, projectId) {
    try {
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        
        const stats = await db.get(`
            SELECT 
                COUNT(DISTINCT i.id) as total_interactions_7d,
                COUNT(DISTINCT CASE WHEN i.type = 'like' THEN i.id END) as likes_7d,
                COUNT(DISTINCT CASE WHEN i.type = 'comment' THEN i.id END) as comments_7d,
                COUNT(DISTINCT d.id) as new_discussions_7d,
                COUNT(DISTINCT CASE WHEN i.user_id NOT IN (SELECT created_by FROM projects WHERE id = ?) THEN i.user_id END) as new_users_7d,
                MAX(i.created_at) as last_interaction_at
            FROM projects p
            LEFT JOIN interactions i ON p.id = i.project_id 
                AND i.created_at > datetime(?)
            LEFT JOIN discussions d ON p.id = d.project_id 
                AND d.created_at > datetime(?)
            WHERE p.id = ?
            GROUP BY p.id
        `, [projectId, sevenDaysAgo.toISOString(), sevenDaysAgo.toISOString(), projectId]);
        
        if (!stats) return 50;
        
        let score = 50; // Base score
        
        // Engagement weight: 40% of score
        score += Math.min((stats.total_interactions_7d || 0) * 1.5, 20);
        score += Math.min((stats.likes_7d || 0) * 2, 10);
        score += Math.min((stats.comments_7d || 0) * 3, 10);
        
        // Diversity weight: 20% of score
        score += Math.min((stats.new_users_7d || 0) * 5, 10);
        score += Math.min((stats.new_discussions_7d || 0) * 2, 10);
        
        // Recency weight: 40% of score
        if (stats.last_interaction_at) {
            const lastInteraction = new Date(stats.last_interaction_at);
            const hoursSince = (now - lastInteraction) / (1000 * 60 * 60);
            
            if (hoursSince < 1) score += 20;
            else if (hoursSince < 24) score += 15;
            else if (hoursSince < 72) score += 10;
            else if (hoursSince < 168) score += 5;
        }
        
        // Cap between 0-100
        return Math.max(0, Math.min(100, Math.round(score)));
    } catch (error) {
        console.error('Pulse calculation error:', error);
        return 50;
    }
}

module.exports = { getDB, calculatePulseScore };
