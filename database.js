const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

class ThoraxLabDatabase {
    constructor() {
        this.db = null;
        this.connected = false;
        
        const dataDir = path.join(__dirname, 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        
        this.DB_PATH = path.join(dataDir, 'thoraxlab.db');
    }

    async connect() {
        if (this.connected) return this.db;
        
        console.log('🔌 Connecting to SQLite database...');
        
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.DB_PATH, (err) => {
                if (err) {
                    console.error('❌ Database connection failed:', err);
                    reject(err);
                } else {
                    console.log('✅ Database connected successfully');
                    this.connected = true;
                    
                    this.initializeSchema()
                        .then(() => resolve(this.db))
                        .catch(reject);
                }
            });
        });
    }

    async initializeSchema() {
        const run = (sql, params = []) => {
            return new Promise((resolve, reject) => {
                this.db.run(sql, params, function(err) {
                    if (err) reject(err);
                    else resolve(this);
                });
            });
        };

        const get = (sql, params = []) => {
            return new Promise((resolve, reject) => {
                this.db.get(sql, params, (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
        };

        const all = (sql, params = []) => {
            return new Promise((resolve, reject) => {
                this.db.all(sql, params, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
        };

        const exec = (sql) => {
            return new Promise((resolve, reject) => {
                this.db.exec(sql, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        };
        
        await exec('PRAGMA foreign_keys = ON');
        
        // Users table
        await run(`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                organization TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'clinician',
                specialty TEXT,
                avatar_color TEXT DEFAULT '#1A5F7A',
                impact_score INTEGER DEFAULT 100,
                is_admin BOOLEAN DEFAULT 0,
                status TEXT DEFAULT 'offline',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Projects table
        await run(`
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                type TEXT NOT NULL DEFAULT 'clinical',
                status TEXT NOT NULL DEFAULT 'planning',
                lead_id TEXT NOT NULL,
                lead_name TEXT NOT NULL,
                lead_email TEXT NOT NULL,
                objectives TEXT DEFAULT '[]',
                methodology TEXT,
                start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                estimated_duration TEXT,
                progress INTEGER DEFAULT 0,
                consensus_score INTEGER DEFAULT 0,
                engagement_score INTEGER DEFAULT 0,
                discussion_count INTEGER DEFAULT 0,
                comment_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Project team members
        await run(`
            CREATE TABLE IF NOT EXISTS project_team (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'contributor',
                organization_id TEXT,
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(project_id, user_id)
            )
        `);

        // Discussions
        await run(`
            CREATE TABLE IF NOT EXISTS discussions (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                type TEXT NOT NULL DEFAULT 'clinical',
                author_id TEXT NOT NULL,
                author_name TEXT NOT NULL,
                author_role TEXT NOT NULL,
                author_organization TEXT,
                tags TEXT DEFAULT '[]',
                upvote_count INTEGER DEFAULT 0,
                downvote_count INTEGER DEFAULT 0,
                comment_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Comments
        await run(`
            CREATE TABLE IF NOT EXISTS comments (
                id TEXT PRIMARY KEY,
                discussion_id TEXT NOT NULL,
                project_id TEXT NOT NULL,
                content TEXT NOT NULL,
                author_id TEXT NOT NULL,
                author_name TEXT NOT NULL,
                author_role TEXT NOT NULL,
                author_organization TEXT,
                comment_type TEXT DEFAULT 'general',
                evidence_links TEXT DEFAULT '[]',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Activity log
        await run(`
            CREATE TABLE IF NOT EXISTS activity_log (
                id TEXT PRIMARY KEY,
                project_id TEXT,
                user_id TEXT,
                activity_type TEXT NOT NULL,
                description TEXT NOT NULL,
                metadata TEXT DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('✅ Database schema initialized');
        await this.initializeDefaultData();
    }

    async initializeDefaultData() {
        const userCount = await this.get('SELECT COUNT(*) as count FROM users');
        if (userCount.count > 0) return;
        
        console.log('📝 Initializing default data...');
        
        await this.run(`
            INSERT OR IGNORE INTO users (id, email, name, organization, role, is_admin, avatar_color)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, ['admin', 'admin@thoraxlab.org', 'Platform Administrator', 'ThoraxLab', 'admin', 1, '#1A5F7A']);
        
        console.log('✅ Default data initialized');
    }

    // Helper methods
    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve(this);
            });
        });
    }

    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    // ===== USER METHODS =====
    
    async createUser(userData) {
        const userId = `user_${uuidv4()}`;
        const now = new Date().toISOString();
        
        await this.run(`
            INSERT INTO users (id, email, name, organization, role, specialty, avatar_color, is_admin, created_at, last_activity)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            userId,
            userData.email.trim().toLowerCase(),
            userData.name.trim(),
            userData.organization || 'Medical Center',
            userData.role || 'clinician',
            userData.specialty || 'pulmonology',
            '#1A5F7A',
            userData.email === 'admin@thoraxlab.org' ? 1 : 0,
            now,
            now
        ]);
        
        return this.getUser(userId);
    }
    
    async getUser(userId) {
        return this.get('SELECT * FROM users WHERE id = ?', [userId]);
    }
    
    async findUserByEmail(email) {
        return this.get('SELECT * FROM users WHERE email = ?', [email.trim().toLowerCase()]);
    }
    
    async getAllUsers() {
        return this.all('SELECT * FROM users ORDER BY created_at DESC LIMIT 100');
    }
    
    async updateUserActivity(userId) {
        await this.run(`
            UPDATE users SET last_activity = CURRENT_TIMESTAMP, status = 'online' WHERE id = ?
        `, [userId]);
        return true;
    }
    
    // ===== PROJECT METHODS =====
    
    async createProject(projectData, userId) {
        const projectId = `project_${uuidv4()}`;
        const now = new Date().toISOString();
        
        const user = await this.getUser(userId);
        if (!user) throw new Error('User not found');
        
        await this.run(`
            INSERT INTO projects (id, title, description, type, status, lead_id, lead_name, lead_email, objectives, start_date, created_at, updated_at, last_activity_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            projectId,
            projectData.title.trim(),
            projectData.description.trim(),
            projectData.type || 'clinical',
            projectData.status || 'planning',
            userId,
            user.name,
            user.email,
            JSON.stringify(projectData.objectives || []),
            now,
            now,
            now,
            now
        ]);
        
        await this.addTeamMember(projectId, userId, 'lead', user.organization);
        
        return this.getProject(projectId);
    }
    
    async getProject(projectId) {
        const project = await this.get(`
            SELECT p.*,
                   (SELECT COUNT(*) FROM project_team WHERE project_id = p.id) as team_count,
                   (SELECT COUNT(*) FROM discussions WHERE project_id = p.id) as discussion_count
            FROM projects p
            WHERE p.id = ?
        `, [projectId]);
        
        if (!project) return null;
        
        if (project.objectives) {
            try {
                project.objectives = JSON.parse(project.objectives);
            } catch {
                project.objectives = [];
            }
        }
        
        return project;
    }
    
    async getAllProjects() {
        const projects = await this.all(`
            SELECT p.*,
                   u.name as lead_name,
                   (SELECT COUNT(*) FROM project_team WHERE project_id = p.id) as team_count,
                   (SELECT COUNT(*) FROM discussions WHERE project_id = p.id) as discussion_count
            FROM projects p
            LEFT JOIN users u ON p.lead_id = u.id
            WHERE p.status != 'archived'
            ORDER BY p.last_activity_at DESC
            LIMIT 100
        `);
        
        return projects.map(p => {
            if (p.objectives) {
                try {
                    p.objectives = JSON.parse(p.objectives);
                } catch {
                    p.objectives = [];
                }
            }
            return p;
        });
    }
    
    async getProjectsForUser(userId) {
        return this.all(`
            SELECT p.*, pt.role as user_role
            FROM projects p
            JOIN project_team pt ON p.id = pt.project_id
            WHERE pt.user_id = ? AND p.status = 'active'
            ORDER BY p.last_activity_at DESC
        `, [userId]);
    }
    
    async updateProject(projectId, updates) {
        const setClause = [];
        const values = [];
        
        Object.keys(updates).forEach(key => {
            if (key === 'objectives') {
                setClause.push(`${key} = ?`);
                values.push(JSON.stringify(updates[key]));
            } else if (updates[key] !== undefined) {
                setClause.push(`${key} = ?`);
                values.push(updates[key]);
            }
        });
        
        if (setClause.length === 0) {
            return this.getProject(projectId);
        }
        
        setClause.push('updated_at = CURRENT_TIMESTAMP');
        values.push(projectId);
        
        await this.run(`UPDATE projects SET ${setClause.join(', ')} WHERE id = ?`, values);
        
        return this.getProject(projectId);
    }
    
    // ===== TEAM METHODS =====
    
    async addTeamMember(projectId, userId, role = 'contributor', organization = null) {
        const teamId = `team_${uuidv4()}`;
        
        await this.run(`
            INSERT INTO project_team (id, project_id, user_id, role, organization_id)
            VALUES (?, ?, ?, ?, ?)
        `, [teamId, projectId, userId, role, organization]);
        
        await this.run(`
            UPDATE projects SET updated_at = CURRENT_TIMESTAMP, last_activity_at = CURRENT_TIMESTAMP WHERE id = ?
        `, [projectId]);
        
        return { id: teamId, project_id: projectId, user_id: userId, role, organization_id: organization };
    }
    
    async getProjectTeam(projectId) {
        const team = await this.all(`
            SELECT pt.*, u.name, u.email, u.role as user_role, u.avatar_color, u.specialty
            FROM project_team pt
            LEFT JOIN users u ON pt.user_id = u.id
            WHERE pt.project_id = ?
            ORDER BY pt.joined_at
        `, [projectId]);
        
        return team;
    }
    
    // ===== DISCUSSION METHODS =====
    
    async createDiscussion(discussionData) {
        const discussionId = `disc_${uuidv4()}`;
        const now = new Date().toISOString();
        
        await this.run(`
            INSERT INTO discussions (id, project_id, title, content, type, author_id, author_name, author_role, author_organization, tags, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            discussionId,
            discussionData.projectId,
            discussionData.title.trim(),
            discussionData.content.trim(),
            discussionData.type || 'clinical',
            discussionData.author.id,
            discussionData.author.name,
            discussionData.author.role,
            discussionData.author.organization,
            JSON.stringify(discussionData.tags || []),
            now,
            now
        ]);
        
        await this.run(`
            UPDATE projects 
            SET discussion_count = discussion_count + 1,
                updated_at = CURRENT_TIMESTAMP,
                last_activity_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [discussionData.projectId]);
        
        return this.getDiscussion(discussionId);
    }
    
    async getDiscussion(discussionId) {
        const discussion = await this.get('SELECT * FROM discussions WHERE id = ?', [discussionId]);
        
        if (discussion && discussion.tags) {
            try {
                discussion.tags = JSON.parse(discussion.tags);
            } catch {
                discussion.tags = [];
            }
        }
        
        return discussion;
    }
    
    async getProjectDiscussions(projectId) {
        const discussions = await this.all(`
            SELECT * FROM discussions 
            WHERE project_id = ?
            ORDER BY created_at DESC
            LIMIT 100
        `, [projectId]);
        
        return discussions.map(d => {
            if (d.tags) {
                try {
                    d.tags = JSON.parse(d.tags);
                } catch {
                    d.tags = [];
                }
            }
            return d;
        });
    }
    
    // ===== COMMENT METHODS =====
    
    async createComment(commentData) {
        const commentId = `comment_${uuidv4()}`;
        const now = new Date().toISOString();
        
        await this.run(`
            INSERT INTO comments (id, discussion_id, project_id, content, author_id, author_name, author_role, author_organization, comment_type, evidence_links, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            commentId,
            commentData.discussionId,
            commentData.projectId,
            commentData.content.trim(),
            commentData.author.id,
            commentData.author.name,
            commentData.author.role,
            commentData.author.organization,
            commentData.commentType || 'general',
            JSON.stringify(commentData.evidenceLinks || []),
            now
        ]);
        
        await this.run(`
            UPDATE discussions 
            SET comment_count = comment_count + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [commentData.discussionId]);
        
        await this.run(`
            UPDATE projects 
            SET comment_count = comment_count + 1,
                updated_at = CURRENT_TIMESTAMP,
                last_activity_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [commentData.projectId]);
        
        return this.getComment(commentId);
    }
    
    async getComment(commentId) {
        const comment = await this.get('SELECT * FROM comments WHERE id = ?', [commentId]);
        
        if (comment && comment.evidence_links) {
            try {
                comment.evidence_links = JSON.parse(comment.evidence_links);
            } catch {
                comment.evidence_links = [];
            }
        }
        
        return comment;
    }
    
    async getDiscussionComments(discussionId) {
        const comments = await this.all(`
            SELECT * FROM comments 
            WHERE discussion_id = ?
            ORDER BY created_at ASC
        `, [discussionId]);
        
        return comments.map(c => {
            if (c.evidence_links) {
                try {
                    c.evidence_links = JSON.parse(c.evidence_links);
                } catch {
                    c.evidence_links = [];
                }
            }
            return c;
        });
    }
    
    // ===== ANALYTICS METHODS =====
    
    async getPlatformStats() {
        const stats = await this.get(`
            SELECT 
                COUNT(DISTINCT p.id) as total_projects,
                COUNT(DISTINCT CASE WHEN p.status = 'active' THEN p.id END) as active_projects,
                COUNT(DISTINCT u.id) as total_users,
                COALESCE(SUM(p.discussion_count), 0) as total_discussions,
                COALESCE(SUM(p.comment_count), 0) as total_comments,
                COALESCE(AVG(p.consensus_score), 0) as avg_consensus,
                COALESCE(AVG(p.engagement_score), 0) as avg_engagement
            FROM projects p, users u
        `);
        
        return {
            ...stats,
            updated_at: new Date().toISOString(),
            status: 'excellent'
        };
    }
    
    async getDashboardData(userId) {
        const user = await this.getUser(userId);
        if (!user) return null;
        
        const projects = await this.getProjectsForUser(userId);
        
        return {
            user: {
                id: user.id,
                name: user.name,
                organization: user.organization,
                role: user.role,
                projectCount: projects.length,
                impactScore: user.impact_score || 100
            },
            metrics: {
                clinicalActivity: Math.floor(Math.random() * 50),
                industryActivity: Math.floor(Math.random() * 30),
                crossPollination: Math.floor(Math.random() * 40),
                totalVotes: Math.floor(Math.random() * 100),
                pendingDecisions: Math.floor(Math.random() * 5),
                decisionVelocity: 3.2
            },
            activeProjects: projects.slice(0, 5).map(p => ({
                id: p.id,
                title: p.title,
                type: p.type,
                progress: p.progress || 0
            })),
            platformStats: await this.getPlatformStats()
        };
    }
    
    async getRecentActivity(userId) {
        const activity = await this.all(`
            SELECT 
                al.*,
                p.title as project_title
            FROM activity_log al
            LEFT JOIN projects p ON al.project_id = p.id
            WHERE al.user_id = ? OR al.project_id IN (
                SELECT project_id FROM project_team WHERE user_id = ?
            )
            ORDER BY al.created_at DESC
            LIMIT 10
        `, [userId, userId]);
        
        return activity.map(a => {
            if (a.metadata) {
                try {
                    a.metadata = JSON.parse(a.metadata);
                } catch {
                    a.metadata = {};
                }
            }
            return a;
        });
    }
    
    // ===== UTILITY METHODS =====
    
    async checkConnection() {
        try {
            await this.get('SELECT 1');
            return true;
        } catch (error) {
            return false;
        }
    }
    
    async close() {
        if (this.db) {
            await new Promise((resolve, reject) => {
                this.db.close((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            this.db = null;
            this.connected = false;
            console.log('🔌 Database connection closed');
        }
    }
}

const database = new ThoraxLabDatabase();

module.exports = { database };
