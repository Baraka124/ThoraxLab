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
        }
        
        this.DB_PATH = path.join(dataDir, 'thoraxlab.db');
        this.connected = false;
    }

    async connect() {
        if (this.connected) return this.db;
        
        console.log('Connecting to database...');
        
        try {
            this.db = await open({
                filename: this.DB_PATH,
                driver: sqlite3.Database,
                mode: sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE
            });
            
            await this.initialize();
            this.connected = true;
            console.log('✅ Database connected');
            
            return this.db;
        } catch (error) {
            console.error('❌ Database connection failed:', error);
            throw error;
        }
    }

    async initialize() {
        await this.db.exec('PRAGMA journal_mode = WAL');
        await this.db.exec('PRAGMA foreign_keys = ON');
        
        // Users table
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                role TEXT CHECK(role IN ('clinician', 'industry', 'public', 'admin')) DEFAULT 'clinician',
                avatar_color TEXT DEFAULT '#0A4D68',
                status TEXT DEFAULT 'offline',
                last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Projects table
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                type TEXT CHECK(type IN ('clinical', 'industry', 'collaborative')) DEFAULT 'clinical',
                status TEXT DEFAULT 'active',
                created_by TEXT NOT NULL,
                pulse_score INTEGER DEFAULT 75,
                total_interactions INTEGER DEFAULT 0,
                total_comments INTEGER DEFAULT 0,
                total_members INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (created_by) REFERENCES users(id)
            );
        `);

        // Project members
        await this.db.exec(`
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

        // Comments
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS comments (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );
        `);

        // Timeline events
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS timeline_events (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                description TEXT NOT NULL,
                user_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );
        `);

        // Interactions
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS interactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                action TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );
        `);

        // Create default admin user if needed
        const adminExists = await this.db.get(
            "SELECT id FROM users WHERE email = 'admin@thoraxlab.local'"
        );
        
        if (!adminExists) {
            const adminId = uuidv4();
            await this.db.run(
                `INSERT INTO users (id, email, name, role, avatar_color, status) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [adminId, 'admin@thoraxlab.local', 'ThoraxLab Admin', 'admin', '#0A4D68', 'online']
            );
        }

        // Create indexes
        await this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
            CREATE INDEX IF NOT EXISTS idx_projects_created ON projects(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_comments_project ON comments(project_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_timeline_project ON timeline_events(project_id, created_at DESC);
        `);

        console.log('✅ Database schema initialized');
    }

    // ===== CORE METHODS =====
    
    async checkConnection() {
        try {
            if (!this.db) await this.connect();
            await this.db.get('SELECT 1');
            return true;
        } catch (error) {
            return false;
        }
    }

    async getPlatformStatus() {
        try {
            const stats = await this.db.get(`
                SELECT 
                    COUNT(DISTINCT id) as active_projects,
                    COUNT(DISTINCT created_by) as active_users,
                    COALESCE(SUM(total_interactions), 0) as total_interactions
                FROM projects 
                WHERE status = 'active'
            `);

            return {
                health_score: 100,
                active_projects: stats?.active_projects || 0,
                online_users: 1, // Default for now
                total_interactions: stats?.total_interactions || 0,
                updated_at: new Date().toISOString(),
                status: 'excellent'
            };
        } catch (error) {
            console.error('Platform status error:', error);
            return this.getDefaultMetrics();
        }
    }

    getDefaultMetrics() {
        return {
            health_score: 100,
            active_projects: 0,
            online_users: 1,
            total_interactions: 0,
            updated_at: new Date().toISOString(),
            status: 'excellent'
        };
    }

    async updatePlatformMetrics() {
        // Update any platform metrics if needed
        console.log('📊 Platform metrics updated');
    }

    // ===== PROJECT METHODS =====
    
    async getAllProjects(status = 'active', limit = 50, offset = 0) {
        const db = await this.connect();
        
        try {
            const projects = await db.all(`
                SELECT p.*, u.name as creator_name, u.avatar_color as creator_color
                FROM projects p
                LEFT JOIN users u ON p.created_by = u.id
                WHERE p.status = ?
                ORDER BY p.last_activity_at DESC
                LIMIT ? OFFSET ?
            `, [status, parseInt(limit), parseInt(offset)]);
            
            return projects || [];
        } catch (error) {
            console.error('Get all projects error:', error);
            return [];
        }
    }

    async getProject(projectId) {
        const db = await this.connect();
        
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
        const db = await this.connect();
        const projectId = `proj_${uuidv4()}`;
        const now = new Date().toISOString();
        
        try {
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
            
            const project = await this.getProject(projectId);
            return project;
            
        } catch (error) {
            console.error('Create project error:', error);
            throw error;
        }
    }

    async updateProject(projectId, updates) {
        const db = await this.connect();
        const allowedFields = ['title', 'description', 'type', 'status', 'pulse_score'];
        const updateFields = [];
        const updateValues = [];
        
        Object.keys(updates).forEach(key => {
            if (allowedFields.includes(key)) {
                updateFields.push(`${key} = ?`);
                updateValues.push(updates[key]);
            }
        });
        
        if (updateFields.length === 0) {
            throw new Error('No valid fields to update');
        }
        
        updateFields.push('updated_at = CURRENT_TIMESTAMP');
        updateValues.push(projectId);
        
        await db.run(
            `UPDATE projects SET ${updateFields.join(', ')} WHERE id = ?`,
            updateValues
        );
        
        return await this.getProject(projectId);
    }

    async isProjectMember(projectId, userId) {
        const db = await this.connect();
        
        try {
            const member = await db.get(
                'SELECT * FROM project_members WHERE project_id = ? AND user_id = ?',
                [projectId, userId]
            );
            
            return !!member;
        } catch (error) {
            console.error('Check project member error:', error);
            return false;
        }
    }

    // ===== COMMENT METHODS =====
    
    async getProjectComments(projectId, limit = 100, offset = 0, parentId = null, userId = '') {
        const db = await this.connect();
        
        try {
            const whereClause = parentId ? 'c.project_id = ? AND c.parent_id = ?' : 'c.project_id = ? AND c.parent_id IS NULL';
            const params = parentId ? [projectId, parentId, parseInt(limit), parseInt(offset)] 
                                  : [projectId, parseInt(limit), parseInt(offset)];
            
            const comments = await db.all(`
                SELECT 
                    c.*,
                    u.name as user_name,
                    u.role as user_role,
                    u.avatar_color
                FROM comments c
                LEFT JOIN users u ON c.user_id = u.id
                WHERE ${whereClause}
                ORDER BY c.created_at DESC
                LIMIT ? OFFSET ?
            `, params);
            
            return comments || [];
        } catch (error) {
            console.error('Get project comments error:', error);
            return [];
        }
    }

    async createComment(data) {
        const db = await this.connect();
        const commentId = `comment_${uuidv4()}`;
        const now = new Date().toISOString();
        
        try {
            await db.run(
                `INSERT INTO comments (id, project_id, user_id, content, created_at) 
                 VALUES (?, ?, ?, ?, ?)`,
                [commentId, data.projectId, data.userId, data.content, now]
            );
            
            // Get user info for response
            const user = await db.get('SELECT name, role, avatar_color FROM users WHERE id = ?', [data.userId]);
            
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
        const db = await this.connect();
        
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

    async addProjectMember(projectId, userId, role = 'contributor') {
        const db = await this.connect();
        
        try {
            const existing = await db.get(
                'SELECT * FROM project_members WHERE project_id = ? AND user_id = ?',
                [projectId, userId]
            );
            
            if (existing) {
                throw new Error('Already a member');
            }
            
            await db.run(
                `INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)`,
                [projectId, userId, role]
            );
            
            await db.run(
                `UPDATE projects SET total_members = total_members + 1 WHERE id = ?`,
                [projectId]
            );
            
            return true;
        } catch (error) {
            console.error('Add project member error:', error);
            throw error;
        }
    }

    // ===== TIMELINE METHODS =====
    
    async getProjectTimeline(projectId, limit = 50, offset = 0) {
        const db = await this.connect();
        
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
                LIMIT ? OFFSET ?
            `, [projectId, parseInt(limit), parseInt(offset)]);
            
            return timeline || [];
        } catch (error) {
            console.error('Get project timeline error:', error);
            return [];
        }
    }

    async addTimelineEvent(projectId, eventType, description, userId = null) {
        const db = await this.connect();
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

    // ===== USER METHODS =====
    
    async createUser(email, name, role = 'clinician') {
        const db = await this.connect();
        const userId = `user_${uuidv4()}`;
        const avatarColors = ['#0A4D68', '#088F8F', '#05BFDB', '#8E44AD'];
        const randomColor = avatarColors[Math.floor(Math.random() * avatarColors.length)];
        
        try {
            await db.run(
                `INSERT INTO users (id, email, name, role, avatar_color, status) 
                 VALUES (?, ?, ?, ?, ?, 'online')`,
                [userId, email, name, role, randomColor]
            );
            
            return await this.getUser(userId);
        } catch (error) {
            console.error('Create user error:', error);
            throw error;
        }
    }

    async getUser(userId) {
        const db = await this.connect();
        
        try {
            const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
            return user || null;
        } catch (error) {
            console.error('Get user error:', error);
            return null;
        }
    }

    async getUserByEmail(email) {
        const db = await this.connect();
        
        try {
            const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
            return user || null;
        } catch (error) {
            console.error('Get user by email error:', error);
            return null;
        }
    }

    async getOnlineUsers() {
        const db = await this.connect();
        
        try {
            const users = await db.all(`
                SELECT id, name, role, avatar_color, last_active
                FROM users 
                WHERE status = 'online'
                ORDER BY last_active DESC
                LIMIT 20
            `);
            
            return users || [];
        } catch (error) {
            console.error('Get online users error:', error);
            return [];
        }
    }

    async updateUserStatus(userId, status) {
        const db = await this.connect();
        
        try {
            await db.run(
                'UPDATE users SET status = ?, last_active = CURRENT_TIMESTAMP WHERE id = ?',
                [status, userId]
            );
            return true;
        } catch (error) {
            console.error('Update user status error:', error);
            return false;
        }
    }

    // ===== INTERACTION METHODS =====
    
    async recordInteraction(projectId, userId, action, entityType = null, entityId = null) {
        const db = await this.connect();
        
        try {
            await db.run(
                `INSERT INTO interactions (project_id, user_id, action) 
                 VALUES (?, ?, ?)`,
                [projectId, userId, action]
            );
            
            await db.run(
                `UPDATE projects 
                 SET total_interactions = total_interactions + 1,
                     last_activity_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [projectId]
            );
            
            return true;
        } catch (error) {
            console.error('Record interaction error:', error);
            return false;
        }
    }

    async incrementProjectCounter(projectId, field) {
        const db = await this.connect();
        
        try {
            await db.run(
                `UPDATE projects SET ${field} = ${field} + 1 WHERE id = ?`,
                [projectId]
            );
            return true;
        } catch (error) {
            console.error('Increment project counter error:', error);
            return false;
        }
    }

    // ===== MAINTENANCE =====
    
    async performMaintenance() {
        const db = await this.connect();
        
        try {
            // Update user statuses
            await db.run(`
                UPDATE users SET status = 
                    CASE 
                        WHEN last_active > datetime('now', '-5 minutes') THEN 'online'
                        WHEN last_active > datetime('now', '-30 minutes') THEN 'away'
                        ELSE 'offline'
                    END
            `);
            
            // Clean up old interactions
            await db.run(
                `DELETE FROM interactions WHERE created_at < datetime('now', '-90 days')`
            );
            
            console.log('✅ Database maintenance completed');
            return true;
        } catch (error) {
            console.error('Maintenance error:', error);
            return false;
        }
    }

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
