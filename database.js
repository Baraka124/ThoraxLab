const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

class ThoraxLabDatabase {
    constructor() {
        this.db = null;
        this.connected = false;
        this.DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'thoraxlab.db');
        
        // Ensure data directory exists
        const dataDir = path.dirname(this.DB_PATH);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
    }

    async connect() {
        if (this.connected) return this.db;
        
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.DB_PATH, (err) => {
                if (err) {
                    console.error('Database connection failed:', err.message);
                    reject(err);
                } else {
                    this.connected = true;
                    console.log('✅ Database connected to:', this.DB_PATH);
                    this.initializeSchema()
                        .then(() => resolve(this.db))
                        .catch(reject);
                }
            });
        });
    }

    async initializeSchema() {
        await this.run('PRAGMA foreign_keys = ON');
        await this.run('PRAGMA journal_mode = WAL');
        
        const tables = [
            // Users table
            `CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                organization TEXT DEFAULT '',
                role TEXT DEFAULT 'clinician',
                avatar_initials TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // Sessions table
            `CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                token TEXT UNIQUE NOT NULL,
                expires_at DATETIME NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )`,
            
            // Projects table
            `CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                type TEXT DEFAULT 'clinical',
                lead_id TEXT NOT NULL,
                status TEXT DEFAULT 'active',
                objectives TEXT DEFAULT '{"clinical":[],"industry":[],"shared":[]}',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (lead_id) REFERENCES users(id)
            )`,
            
            // Project team table
            `CREATE TABLE IF NOT EXISTS project_team (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                role TEXT NOT NULL,
                joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(project_id, user_id),
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )`,
            
            // Discussions table
            `CREATE TABLE IF NOT EXISTS discussions (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                type TEXT NOT NULL,
                author_id TEXT NOT NULL,
                evidence_count INTEGER DEFAULT 0,
                comment_count INTEGER DEFAULT 0,
                vote_count INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (author_id) REFERENCES users(id)
            )`,
            
            // Discussion votes table
            `CREATE TABLE IF NOT EXISTS discussion_votes (
                id TEXT PRIMARY KEY,
                discussion_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                vote_type TEXT CHECK(vote_type IN ('upvote', 'downvote')) NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(discussion_id, user_id),
                FOREIGN KEY (discussion_id) REFERENCES discussions(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )`,
            
            // Comments table
            `CREATE TABLE IF NOT EXISTS comments (
                id TEXT PRIMARY KEY,
                discussion_id TEXT NOT NULL,
                content TEXT NOT NULL,
                author_id TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (discussion_id) REFERENCES discussions(id) ON DELETE CASCADE,
                FOREIGN KEY (author_id) REFERENCES users(id)
            )`,
            
            // Decisions table
            `CREATE TABLE IF NOT EXISTS decisions (
                id TEXT PRIMARY KEY,
                discussion_id TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                created_by TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (discussion_id) REFERENCES discussions(id) ON DELETE CASCADE,
                FOREIGN KEY (created_by) REFERENCES users(id)
            )`
        ];

        for (const tableSql of tables) {
            await this.run(tableSql);
        }

        console.log('✅ Database schema initialized');
        return true;
    }

    // ===== CORE DATABASE METHODS =====

    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve({ lastID: this.lastID, changes: this.changes });
            });
        });
    }

    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row || null);
            });
        });
    }

    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    }

    // ===== USER METHODS =====

    async createUser(userData) {
        const userId = `user_${uuidv4()}`;
        const initials = userData.name
            .split(' ')
            .map(n => n[0])
            .join('')
            .toUpperCase()
            .substring(0, 2);
        
        await this.run(
            `INSERT INTO users (id, email, name, organization, role, avatar_initials) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                userId,
                userData.email.toLowerCase(),
                userData.name,
                userData.organization || '',
                userData.role || 'clinician',
                initials
            ]
        );
        
        return this.getUser(userId);
    }

    async getUser(userId) {
        return this.get('SELECT * FROM users WHERE id = ?', [userId]);
    }

    async findUserByEmail(email) {
        return this.get('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
    }

    // ===== SESSION METHODS =====

    async createSession(userId, token, expiresInHours = 24) {
        const sessionId = `sess_${uuidv4()}`;
        const expiresAt = new Date(Date.now() + expiresInHours * 3600000);
        
        await this.run(
            'INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)',
            [sessionId, userId, token, expiresAt.toISOString()]
        );
        
        return this.getSessionByToken(token);
    }

    async getSessionByToken(token) {
        const session = await this.get('SELECT * FROM sessions WHERE token = ?', [token]);
        if (!session) return null;
        
        // Check expiration
        if (new Date() > new Date(session.expires_at)) {
            await this.deleteSession(token);
            return null;
        }
        
        return session;
    }

    async deleteSession(token) {
        await this.run('DELETE FROM sessions WHERE token = ?', [token]);
        return true;
    }

    // ===== PROJECT METHODS =====

    async createProject(projectData, userId) {
        const projectId = `project_${uuidv4()}`;
        const user = await this.getUser(userId);
        if (!user) throw new Error('User not found');
        
        await this.run(
            `INSERT INTO projects (id, title, description, type, lead_id, objectives) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                projectId,
                projectData.title,
                projectData.description,
                projectData.type || 'clinical',
                userId,
                JSON.stringify(projectData.objectives || { clinical: [], industry: [], shared: [] })
            ]
        );
        
        // Add creator as lead
        await this.addTeamMember(projectId, userId, 'lead');
        
        return this.getProject(projectId);
    }

    async getProject(projectId) {
        const project = await this.get(`
            SELECT p.*, u.name as lead_name, u.email as lead_email 
            FROM projects p 
            LEFT JOIN users u ON p.lead_id = u.id 
            WHERE p.id = ?
        `, [projectId]);
        
        if (project && project.objectives) {
            try {
                project.objectives = JSON.parse(project.objectives);
            } catch {
                project.objectives = { clinical: [], industry: [], shared: [] };
            }
        }
        
        return project;
    }

    async getProjectsForUser(userId) {
        const projects = await this.all(`
            SELECT p.*, u.name as lead_name, pt.role as user_role 
            FROM projects p 
            JOIN project_team pt ON p.id = pt.project_id 
            LEFT JOIN users u ON p.lead_id = u.id 
            WHERE pt.user_id = ? 
            ORDER BY p.updated_at DESC
        `, [userId]);
        
        return projects.map(project => {
            if (project.objectives) {
                try {
                    project.objectives = JSON.parse(project.objectives);
                } catch {
                    project.objectives = { clinical: [], industry: [], shared: [] };
                }
            }
            return project;
        });
    }

    async updateProject(projectId, updates) {
        const allowedFields = ['title', 'description', 'type', 'status'];
        const setClauses = [];
        const values = [];
        
        for (const [field, value] of Object.entries(updates)) {
            if (allowedFields.includes(field) && value !== undefined) {
                setClauses.push(`${field} = ?`);
                values.push(value);
            }
        }
        
        if (setClauses.length === 0) {
            return this.getProject(projectId);
        }
        
        setClauses.push('updated_at = CURRENT_TIMESTAMP');
        values.push(projectId);
        
        const sql = `UPDATE projects SET ${setClauses.join(', ')} WHERE id = ?`;
        await this.run(sql, values);
        
        return this.getProject(projectId);
    }

    async isUserInProject(projectId, userId) {
        const result = await this.get(
            'SELECT 1 FROM project_team WHERE project_id = ? AND user_id = ?',
            [projectId, userId]
        );
        return !!result;
    }

    async addTeamMember(projectId, userId, role = 'member') {
        const teamId = `team_${uuidv4()}`;
        
        try {
            await this.run(
                'INSERT INTO project_team (id, project_id, user_id, role) VALUES (?, ?, ?, ?)',
                [teamId, projectId, userId, role]
            );
        } catch (error) {
            if (error.message.includes('UNIQUE constraint failed')) {
                // User already in project
                return this.get('SELECT * FROM project_team WHERE project_id = ? AND user_id = ?', [projectId, userId]);
            }
            throw error;
        }
        
        return { id: teamId, project_id: projectId, user_id: userId, role };
    }

    async getProjectTeam(projectId) {
        return this.all(`
            SELECT pt.*, u.name, u.email, u.role as user_role, u.avatar_initials
            FROM project_team pt
            JOIN users u ON pt.user_id = u.id
            WHERE pt.project_id = ?
            ORDER BY 
                CASE pt.role 
                    WHEN 'lead' THEN 1
                    WHEN 'admin' THEN 2
                    ELSE 3 
                END,
                pt.joined_at
        `, [projectId]);
    }

    // ===== DASHBOARD METHODS =====

    async getDashboardData(userId) {
        const projects = await this.getProjectsForUser(userId);
        const projectCount = projects.length;
        
        // Get all discussions from user's projects
        let discussionCount = 0;
        let upvoteCount = 0;
        
        for (const project of projects.slice(0, 10)) { // Limit to first 10 for performance
            const metrics = await this.getProjectMetrics(project.id);
            discussionCount += metrics.threads;
            upvoteCount += metrics.upvotes;
        }
        
        // Get team members count (excluding self)
        const teamCount = await this.getUserTeamCount(userId);
        
        // Get recent activity
        const recentActivity = await this.getRecentActivity(userId, 8);
        
        return {
            metrics: {
                projectCount,
                discussionCount,
                upvoteCount,
                teamMembers: teamCount
            },
            recentProjects: projects.slice(0, 5).map(p => ({
                id: p.id,
                title: p.title,
                type: p.type,
                status: p.status,
                updated_at: p.updated_at
            })),
            recentActivity
        };
    }

    async getUserTeamCount(userId) {
        const result = await this.get(
            `SELECT COUNT(DISTINCT pt2.user_id) as count 
             FROM project_team pt1 
             JOIN project_team pt2 ON pt1.project_id = pt2.project_id 
             WHERE pt1.user_id = ? AND pt2.user_id != ?`,
            [userId, userId]
        );
        return result?.count || 0;
    }

    async getRecentActivity(userId, limit = 10) {
        return this.all(`
            SELECT 
                d.id,
                d.title,
                d.type,
                d.created_at,
                u.name as author_name,
                p.title as project_title,
                'discussion' as activity_type,
                'Discussion: ' || d.title as activity_title
            FROM discussions d
            JOIN projects p ON d.project_id = p.id
            JOIN users u ON d.author_id = u.id
            WHERE p.id IN (
                SELECT project_id FROM project_team WHERE user_id = ?
            )
            UNION ALL
            SELECT 
                c.id,
                d.title,
                NULL as type,
                c.created_at,
                u.name as author_name,
                p.title as project_title,
                'comment' as activity_type,
                'Comment on: ' || d.title as activity_title
            FROM comments c
            JOIN discussions d ON c.discussion_id = d.id
            JOIN projects p ON d.project_id = p.id
            JOIN users u ON c.author_id = u.id
            WHERE p.id IN (
                SELECT project_id FROM project_team WHERE user_id = ?
            )
            ORDER BY created_at DESC
            LIMIT ?
        `, [userId, userId, limit]);
    }

    // ===== PROJECT METRICS & ACTIVITY =====

    async getProjectMetrics(projectId) {
        const [threadCount, commentCount, memberCount, upvoteCount] = await Promise.all([
            this.get('SELECT COUNT(*) as count FROM discussions WHERE project_id = ?', [projectId]),
            this.get(`
                SELECT COUNT(*) as count FROM comments 
                WHERE discussion_id IN (SELECT id FROM discussions WHERE project_id = ?)
            `, [projectId]),
            this.get('SELECT COUNT(*) as count FROM project_team WHERE project_id = ?', [projectId]),
            this.get(`
                SELECT COUNT(*) as count FROM discussion_votes 
                WHERE vote_type = 'upvote' 
                AND discussion_id IN (SELECT id FROM discussions WHERE project_id = ?)
            `, [projectId])
        ]);
        
        return {
            threads: threadCount?.count || 0,
            comments: commentCount?.count || 0,
            members: memberCount?.count || 0,
            files: 0, // Placeholder for future implementation
            upvotes: upvoteCount?.count || 0
        };
    }

    async getProjectActivity(projectId, limit = 20) {
        return this.all(`
            SELECT * FROM (
                SELECT 
                    d.id,
                    d.title,
                    d.type,
                    d.created_at,
                    u.name as author_name,
                    'discussion' as activity_type,
                    'Discussion: ' || d.title as activity_title
                FROM discussions d
                JOIN users u ON d.author_id = u.id
                WHERE d.project_id = ?
                UNION ALL
                SELECT 
                    c.id,
                    d.title,
                    NULL as type,
                    c.created_at,
                    u.name as author_name,
                    'comment' as activity_type,
                    'Comment on: ' || d.title as activity_title
                FROM comments c
                JOIN discussions d ON c.discussion_id = d.id
                JOIN users u ON c.author_id = u.id
                WHERE d.project_id = ?
            )
            ORDER BY created_at DESC
            LIMIT ?
        `, [projectId, projectId, limit]);
    }

    async getProjectThreads(projectId) {
        return this.all(`
            SELECT 
                d.*,
                u.name as author_name,
                u.role as author_role,
                u.avatar_initials,
                (SELECT COUNT(*) FROM comments WHERE discussion_id = d.id) as comment_count,
                (SELECT COUNT(*) FROM discussion_votes WHERE discussion_id = d.id AND vote_type = 'upvote') as upvotes,
                (SELECT COUNT(*) FROM discussion_votes WHERE discussion_id = d.id AND vote_type = 'downvote') as downvotes
            FROM discussions d
            JOIN users u ON d.author_id = u.id
            WHERE d.project_id = ?
            ORDER BY d.created_at DESC
        `, [projectId]);
    }

    // ===== DISCUSSION METHODS =====

    async createDiscussion(discussionData) {
        const discussionId = `disc_${uuidv4()}`;
        
        await this.run(
            'INSERT INTO discussions (id, project_id, title, content, type, author_id) VALUES (?, ?, ?, ?, ?, ?)',
            [
                discussionId,
                discussionData.projectId,
                discussionData.title,
                discussionData.content,
                discussionData.type,
                discussionData.authorId
            ]
        );
        
        return this.getDiscussion(discussionId);
    }

    async getDiscussion(discussionId) {
        const discussion = await this.get(`
            SELECT 
                d.*,
                u.name as author_name,
                u.role as author_role,
                u.avatar_initials,
                p.title as project_title
            FROM discussions d
            JOIN users u ON d.author_id = u.id
            JOIN projects p ON d.project_id = p.id
            WHERE d.id = ?
        `, [discussionId]);
        
        if (discussion) {
            discussion.votes = await this.getDiscussionVotes(discussionId);
            discussion.comments = await this.getDiscussionComments(discussionId);
        }
        
        return discussion;
    }

    async getProjectDiscussions(projectId) {
        const discussions = await this.all(`
            SELECT 
                d.*,
                u.name as author_name,
                u.role as author_role,
                u.avatar_initials
            FROM discussions d
            JOIN users u ON d.author_id = u.id
            WHERE d.project_id = ?
            ORDER BY d.created_at DESC
        `, [projectId]);
        
        // Get votes for each discussion
        for (const discussion of discussions) {
            discussion.votes = await this.getDiscussionVotes(discussion.id);
        }
        
        return discussions;
    }

    async addDiscussionVote(discussionId, userId, voteType) {
        const voteId = `vote_${uuidv4()}`;
        
        try {
            await this.run(
                'INSERT INTO discussion_votes (id, discussion_id, user_id, vote_type) VALUES (?, ?, ?, ?)',
                [voteId, discussionId, userId, voteType]
            );
        } catch (error) {
            if (error.message.includes('UNIQUE constraint failed')) {
                // Update existing vote
                await this.run(
                    'UPDATE discussion_votes SET vote_type = ? WHERE discussion_id = ? AND user_id = ?',
                    [voteType, discussionId, userId]
                );
            } else {
                throw error;
            }
        }
        
        // Update discussion vote count
        await this.run(`
            UPDATE discussions 
            SET vote_count = (
                SELECT COUNT(*) FROM discussion_votes 
                WHERE discussion_id = ? AND vote_type = 'upvote'
            ) - (
                SELECT COUNT(*) FROM discussion_votes 
                WHERE discussion_id = ? AND vote_type = 'downvote'
            )
            WHERE id = ?
        `, [discussionId, discussionId, discussionId]);
        
        return { id: voteId, discussion_id: discussionId, user_id: userId, vote_type: voteType };
    }

    async getDiscussionVotes(discussionId) {
        return this.all(`
            SELECT dv.*, u.name as user_name
            FROM discussion_votes dv
            JOIN users u ON dv.user_id = u.id
            WHERE dv.discussion_id = ?
        `, [discussionId]);
    }

    // ===== COMMENT METHODS =====

    async createComment(commentData) {
        const commentId = `comment_${uuidv4()}`;
        
        await this.run(
            'INSERT INTO comments (id, discussion_id, content, author_id) VALUES (?, ?, ?, ?)',
            [commentId, commentData.discussionId, commentData.content, commentData.authorId]
        );
        
        // Update discussion comment count
        await this.run(
            'UPDATE discussions SET comment_count = comment_count + 1 WHERE id = ?',
            [commentData.discussionId]
        );
        
        return this.get('SELECT * FROM comments WHERE id = ?', [commentId]);
    }

    async getDiscussionComments(discussionId) {
        return this.all(`
            SELECT 
                c.*,
                u.name as author_name,
                u.role as author_role,
                u.avatar_initials
            FROM comments c
            JOIN users u ON c.author_id = u.id
            WHERE c.discussion_id = ?
            ORDER BY c.created_at ASC
        `, [discussionId]);
    }

    // ===== DECISION METHODS =====

    async createDecision(decisionData) {
        const decisionId = `dec_${uuidv4()}`;
        
        await this.run(
            'INSERT INTO decisions (id, discussion_id, title, description, created_by) VALUES (?, ?, ?, ?, ?)',
            [
                decisionId,
                decisionData.discussionId,
                decisionData.title,
                decisionData.description,
                decisionData.createdBy
            ]
        );
        
        return this.get('SELECT * FROM decisions WHERE id = ?', [decisionId]);
    }

    async getProjectDecisions(projectId) {
        return this.all(`
            SELECT 
                d.*,
                u.name as created_by_name,
                u.avatar_initials,
                disc.title as discussion_title
            FROM decisions d
            JOIN users u ON d.created_by = u.id
            JOIN discussions disc ON d.discussion_id = disc.id
            WHERE disc.project_id = ?
            ORDER BY d.created_at DESC
        `, [projectId]);
    }

    // ===== CLEANUP =====

    async close() {
        if (this.db) {
            return new Promise((resolve, reject) => {
                this.db.close((err) => {
                    if (err) {
                        reject(err);
                    } else {
                        this.db = null;
                        this.connected = false;
                        console.log('Database connection closed');
                        resolve();
                    }
                });
            });
        }
    }
}

// Create singleton instance
const database = new ThoraxLabDatabase();

// Handle process termination
process.on('SIGTERM', async () => {
    await database.close();
});

process.on('SIGINT', async () => {
    await database.close();
});

module.exports = { database };
