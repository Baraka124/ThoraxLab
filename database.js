const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

class ThoraxLabDatabase {
    constructor() {
        this.db = null;
        
        // Create data directory
        const dataDir = path.join(__dirname, 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
            console.log('📁 Created data directory:', dataDir);
        }
        
        this.DB_PATH = path.join(dataDir, 'thoraxlab.db');
        console.log('📁 Database path:', this.DB_PATH);
        this.connected = false;
    }

    async connect() {
        if (this.connected) return this.db;
        
        console.log('🔌 Connecting to database...');
        
        try {
            this.db = await open({
                filename: this.DB_PATH,
                driver: sqlite3.Database
            });
            
            await this.initialize();
            this.connected = true;
            console.log('✅ Database connected successfully');
            
            return this.db;
        } catch (error) {
            console.error('❌ Database connection failed:', error);
            throw error;
        }
    }

    async getDB() {
        if (!this.db) {
            await this.connect();
        }
        return this.db;
    }

    async initialize() {
        const db = await this.getDB();
        
        // Enable WAL mode for better concurrency
        await db.exec('PRAGMA journal_mode = WAL');
        await db.exec('PRAGMA foreign_keys = ON');
        await db.exec('PRAGMA busy_timeout = 5000');
        
        // Users table
        await db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'clinician',
                avatar_color TEXT DEFAULT '#0A4D68',
                status TEXT DEFAULT 'offline',
                last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Projects table
        await db.exec(`
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                type TEXT NOT NULL DEFAULT 'clinical',
                status TEXT NOT NULL DEFAULT 'active',
                created_by TEXT NOT NULL,
                pulse_score INTEGER DEFAULT 75,
                total_interactions INTEGER DEFAULT 0,
                total_comments INTEGER DEFAULT 0,
                total_members INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (created_by) REFERENCES users(id)
            )
        `);

        // Project members
        await db.exec(`
            CREATE TABLE IF NOT EXISTS project_members (
                project_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                role TEXT DEFAULT 'contributor',
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (project_id, user_id),
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // Comments
        await db.exec(`
            CREATE TABLE IF NOT EXISTS comments (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        // Timeline events
        await db.exec(`
            CREATE TABLE IF NOT EXISTS timeline_events (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                description TEXT NOT NULL,
                user_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        // Create indexes
        await db.exec(`
            CREATE INDEX IF NOT EXISTS idx_projects_created ON projects(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_comments_project ON comments(project_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_timeline_project ON timeline_events(project_id, created_at DESC);
        `);

        console.log('✅ Database schema initialized');
    }

    // ===== CORE METHODS =====
    
    async checkConnection() {
        try {
            const db = await this.getDB();
            await db.get('SELECT 1');
            return true;
        } catch (error) {
            return false;
        }
    }

    async getPlatformStats() {
        try {
            const db = await this.getDB();
            
            const projectStats = await db.get(`
                SELECT 
                    COUNT(*) as total_projects,
                    COALESCE(SUM(total_comments), 0) as total_comments,
                    COALESCE(AVG(pulse_score), 75) as avg_pulse
                FROM projects 
                WHERE status = 'active'
            `);

            const userStats = await db.get(`
                SELECT COUNT(*) as total_users FROM users
            `);

            return {
                health_score: 100,
                active_projects: projectStats?.total_projects || 0,
                online_users: 1,
                total_interactions: 0,
                total_comments: projectStats?.total_comments || 0,
                avg_pulse_score: Math.round(projectStats?.avg_pulse || 75),
                total_users: userStats?.total_users || 1,
                updated_at: new Date().toISOString(),
                status: 'excellent'
            };
        } catch (error) {
            console.error('Platform stats error:', error);
            return {
                health_score: 100,
                active_projects: 0,
                online_users: 1,
                total_interactions: 0,
                total_comments: 0,
                avg_pulse_score: 75,
                total_users: 1,
                updated_at: new Date().toISOString(),
                status: 'excellent'
            };
        }
    }

    // ===== USER METHODS =====
    
    async ensureUserExists(userId, name, role, email) {
        const db = await this.getDB();
        
        try {
            const existing = await db.get('SELECT id FROM users WHERE id = ?', [userId]);
            
            if (!existing) {
                const avatarColors = ['#0A4D68', '#088F8F', '#05BFDB', '#8E44AD'];
                const randomColor = avatarColors[Math.floor(Math.random() * avatarColors.length)];
                
                await db.run(
                    `INSERT INTO users (id, email, name, role, avatar_color, status) 
                     VALUES (?, ?, ?, ?, ?, 'online')`,
                    [userId, email, name, role, randomColor]
                );
                console.log(`✅ Created user: ${name} (${userId})`);
            }
            
            return userId;
        } catch (error) {
            console.error('Ensure user exists error:', error);
            throw error;
        }
    }

    async getUser(userId) {
        const db = await this.getDB();
        
        try {
            const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
            return user || null;
        } catch (error) {
            console.error('Get user error:', error);
            return null;
        }
    }

    // ===== PROJECT METHODS =====
    
    async getAllProjects() {
        const db = await this.getDB();
        
        try {
            const projects = await db.all(`
                SELECT 
                    p.*,
                    u.name as creator_name,
                    u.avatar_color as creator_color
                FROM projects p
                LEFT JOIN users u ON p.created_by = u.id
                WHERE p.status = 'active'
                ORDER BY p.last_activity_at DESC
                LIMIT 100
            `);
            
            return projects || [];
        } catch (error) {
            console.error('Get all projects error:', error);
            return [];
        }
    }

    async getProject(projectId) {
        const db = await this.getDB();
        
        try {
            const project = await db.get(`
                SELECT 
                    p.*,
                    u.name as creator_name,
                    u.avatar_color as creator_color,
                    (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = p.id) as total_members,
                    (SELECT COUNT(*) FROM comments c WHERE c.project_id = p.id) as total_comments
                FROM projects p
                LEFT JOIN users u ON p.created_by = u.id
                WHERE p.id = ?
            `, [projectId]);
            
            return project || null;
        } catch (error) {
            console.error('Get project error:', error);
            return null;
        }
    }

    async createProject(data) {
        const db = await this.getDB();
        const projectId = `proj_${uuidv4()}`;
        const now = new Date().toISOString();
        
        console.log('Creating project in database:', { projectId, data });
        
        try {
            // Start transaction
            await db.run('BEGIN TRANSACTION');
            
            // Insert project
            await db.run(
                `INSERT INTO projects (
                    id, title, description, type, created_by, 
                    created_at, updated_at, last_activity_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [projectId, data.title, data.description, data.type, data.createdBy, now, now, now]
            );
            
            // Add creator as project member
            await db.run(
                `INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)`,
                [projectId, data.createdBy, 'owner']
            );
            
            // Commit transaction
            await db.run('COMMIT');
            
            console.log('✅ Project created successfully:', projectId);
            
            // Return the created project
            const project = await this.getProject(projectId);
            return project;
            
        } catch (error) {
            await db.run('ROLLBACK');
            console.error('❌ Create project error:', error);
            console.error('Error stack:', error.stack);
            throw error;
        }
    }

    async incrementProjectCounter(projectId, field) {
        const db = await this.getDB();
        
        try {
            await db.run(
                `UPDATE projects SET ${field} = ${field} + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [projectId]
            );
            return true;
        } catch (error) {
            console.error('Increment project counter error:', error);
            return false;
        }
    }

    // ===== COMMENT METHODS =====
    
    async getProjectComments(projectId) {
        const db = await this.getDB();
        
        try {
            const comments = await db.all(`
                SELECT 
                    c.*,
                    u.name as user_name,
                    u.role as user_role,
                    u.avatar_color
                FROM comments c
                LEFT JOIN users u ON c.user_id = u.id
                WHERE c.project_id = ?
                ORDER BY c.created_at DESC
                LIMIT 100
            `, [projectId]);
            
            return comments || [];
        } catch (error) {
            console.error('Get project comments error:', error);
            return [];
        }
    }

    async createComment(data) {
        const db = await this.getDB();
        const commentId = `comment_${uuidv4()}`;
        const now = new Date().toISOString();
        
        try {
            await db.run(
                `INSERT INTO comments (id, project_id, user_id, content, created_at) 
                 VALUES (?, ?, ?, ?, ?)`,
                [commentId, data.projectId, data.userId, data.content, now]
            );
            
            // Get user info for response
            const user = await db.get(
                'SELECT name, role, avatar_color FROM users WHERE id = ?', 
                [data.userId]
            );
            
            return {
                id: commentId,
                project_id: data.projectId,
                user_id: data.userId,
                user_name: user?.name || 'User',
                user_role: user?.role || 'clinician',
                avatar_color: user?.avatar_color || '#0A4D68',
                content: data.content,
                created_at: now
            };
            
        } catch (error) {
            console.error('Create comment error:', error);
            throw error;
        }
    }

    // ===== TEAM METHODS =====
    
    async getProjectTeam(projectId) {
        const db = await this.getDB();
        
        try {
            const team = await db.all(`
                SELECT 
                    u.id,
                    u.name,
                    u.role,
                    u.avatar_color,
                    pm.role as project_role,
                    pm.joined_at
                FROM project_members pm
                LEFT JOIN users u ON pm.user_id = u.id
                WHERE pm.project_id = ?
                ORDER BY pm.joined_at
            `, [projectId]);
            
            return team || [];
        } catch (error) {
            console.error('Get project team error:', error);
            return [];
        }
    }

    // ===== TIMELINE METHODS =====
    
    async getProjectTimeline(projectId) {
        const db = await this.getDB();
        
        try {
            const timeline = await db.all(`
                SELECT 
                    te.*,
                    u.name as user_name,
                    u.avatar_color
                FROM timeline_events te
                LEFT JOIN users u ON te.user_id = u.id
                WHERE te.project_id = ?
                ORDER BY te.created_at DESC
                LIMIT 50
            `, [projectId]);
            
            return timeline || [];
        } catch (error) {
            console.error('Get project timeline error:', error);
            return [];
        }
    }

    async addTimelineEvent(projectId, eventType, description, userId = null) {
        const db = await this.getDB();
        const eventId = uuidv4();
        
        try {
            await db.run(
                `INSERT INTO timeline_events (id, project_id, event_type, description, user_id) 
                 VALUES (?, ?, ?, ?, ?)`,
                [eventId, projectId, eventType, description, userId]
            );
            
            return eventId;
        } catch (error) {
            console.error('Add timeline event error:', error);
            throw error;
        }
    }

    // ===== CLEANUP =====
    
    async close() {
        if (this.db) {
            await this.db.close();
            this.db = null;
            this.connected = false;
            console.log('🔌 Database connection closed');
        }
    }
}

// Create singleton instance
const database = new ThoraxLabDatabase();
module.exports = { ThoraxLabDatabase, database };
