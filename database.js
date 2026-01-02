const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

class ThoraxLabDatabase {
    constructor() {
        this.db = null;
        this.connected = false;
        this.DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'thoraxlab.db');
    }

    async connect() {
        if (this.connected) return this.db;
        
        return new Promise((resolve, reject) => {
            const dataDir = path.dirname(this.DB_PATH);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }
            
            this.db = new sqlite3.Database(this.DB_PATH, (err) => {
                if (err) {
                    console.error('Database connection failed:', err.message);
                    reject(err);
                } else {
                    this.connected = true;
                    console.log('Database connected:', this.DB_PATH);
                    this.initializeSchema().then(() => resolve(this.db)).catch(reject);
                }
            });
        });
    }

    async initializeSchema() {
        await this.run('PRAGMA foreign_keys = ON');
        
        await this.run(`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                organization TEXT NOT NULL,
                role TEXT NOT NULL,
                avatar_initials TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await this.run(`
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                token TEXT UNIQUE NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        await this.run(`
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                type TEXT NOT NULL,
                lead_id TEXT NOT NULL,
                status TEXT DEFAULT 'active',
                objectives TEXT DEFAULT '{"clinical":[],"industry":[],"shared":[]}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (lead_id) REFERENCES users(id)
            )
        `);

        await this.run(`
            CREATE TABLE IF NOT EXISTS project_team (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                role TEXT NOT NULL,
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(project_id, user_id),
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        await this.run(`
            CREATE TABLE IF NOT EXISTS discussions (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                type TEXT NOT NULL,
                author_id TEXT NOT NULL,
                evidence_count INTEGER DEFAULT 0,
                comment_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (author_id) REFERENCES users(id)
            )
        `);

        await this.run(`
            CREATE TABLE IF NOT EXISTS discussion_votes (
                id TEXT PRIMARY KEY,
                discussion_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                vote_type TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(discussion_id, user_id),
                FOREIGN KEY (discussion_id) REFERENCES discussions(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        await this.run(`
            CREATE TABLE IF NOT EXISTS comments (
                id TEXT PRIMARY KEY,
                discussion_id TEXT NOT NULL,
                content TEXT NOT NULL,
                author_id TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (discussion_id) REFERENCES discussions(id) ON DELETE CASCADE,
                FOREIGN KEY (author_id) REFERENCES users(id)
            )
        `);

        await this.run(`
            CREATE TABLE IF NOT EXISTS decisions (
                id TEXT PRIMARY KEY,
                discussion_id TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                created_by TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (discussion_id) REFERENCES discussions(id) ON DELETE CASCADE,
                FOREIGN KEY (created_by) REFERENCES users(id)
            )
        `);

        console.log('Database schema ready');
    }

    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                err ? reject(err) : resolve(this);
            });
        });
    }

    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                err ? reject(err) : resolve(row);
            });
        });
    }

    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                err ? reject(err) : resolve(rows);
            });
        });
    }

    async createUser(userData) {
        const userId = `user_${uuidv4()}`;
        const initials = userData.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
        
        await this.run(
            'INSERT INTO users (id, email, name, organization, role, avatar_initials) VALUES (?, ?, ?, ?, ?, ?)',
            [userId, userData.email.toLowerCase(), userData.name, userData.organization || '', userData.role || 'clinician', initials]
        );
        
        return this.getUser(userId);
    }

    async getUser(userId) {
        return this.get('SELECT * FROM users WHERE id = ?', [userId]);
    }

    async findUserByEmail(email) {
        return this.get('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
    }

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
        
        if (new Date() > new Date(session.expires_at)) {
            await this.run('DELETE FROM sessions WHERE id = ?', [session.id]);
            return null;
        }
        
        return session;
    }

    async deleteSession(token) {
        await this.run('DELETE FROM sessions WHERE token = ?', [token]);
        return true;
    }

    async createProject(projectData, userId) {
        const projectId = `project_${uuidv4()}`;
        const user = await this.getUser(userId);
        if (!user) throw new Error('User not found');
        
        await this.run(
            `INSERT INTO projects (id, title, description, type, lead_id, objectives) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [projectId, projectData.title, projectData.description, projectData.type || 'clinical', userId, 
             JSON.stringify(projectData.objectives || {clinical: [], industry: [], shared: []})]
        );
        
        await this.addTeamMember(projectId, userId, 'lead');
        
        return this.getProject(projectId);
    }

    async getProject(projectId) {
        const project = await this.get(`
            SELECT p.*, u.name as lead_name 
            FROM projects p 
            JOIN users u ON p.lead_id = u.id 
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
            SELECT p.*, pt.role as user_role 
            FROM projects p 
            JOIN project_team pt ON p.id = pt.project_id 
            WHERE pt.user_id = ? 
            ORDER BY p.updated_at DESC
        `, [userId]);
        
        return projects.map(p => {
            if (p.objectives) {
                try { p.objectives = JSON.parse(p.objectives); } catch {}
            }
            return p;
        });
    }

    async updateProject(projectId, updates) {
        const fields = [];
        const values = [];
        
        if (updates.title !== undefined) {
            fields.push('title = ?');
            values.push(updates.title);
        }
        if (updates.description !== undefined) {
            fields.push('description = ?');
            values.push(updates.description);
        }
        if (updates.status !== undefined) {
            fields.push('status = ?');
            values.push(updates.status);
        }
        if (updates.type !== undefined) {
            fields.push('type = ?');
            values.push(updates.type);
        }
        
        fields.push('updated_at = CURRENT_TIMESTAMP');
        
        if (fields.length > 0) {
            const sql = `UPDATE projects SET ${fields.join(', ')} WHERE id = ?`;
            values.push(projectId);
            await this.run(sql, values);
        }
        
        return this.getProject(projectId);
    }

    async getProjectMetrics(projectId) {
        const threadCount = await this.get(
            'SELECT COUNT(*) as count FROM discussions WHERE project_id = ?',
            [projectId]
        );
        
        const commentCount = await this.get(`
            SELECT COUNT(*) as count FROM comments 
            WHERE discussion_id IN (SELECT id FROM discussions WHERE project_id = ?)
        `, [projectId]);
        
        const memberCount = await this.get(
            'SELECT COUNT(*) as count FROM project_team WHERE project_id = ?',
            [projectId]
        );
        
        const upvoteCount = await this.get(`
            SELECT COUNT(*) as count FROM discussion_votes 
            WHERE vote_type = 'upvote' 
            AND discussion_id IN (SELECT id FROM discussions WHERE project_id = ?)
        `, [projectId]);
        
        return {
            threads: threadCount?.count || 0,
            comments: commentCount?.count || 0,
            members: memberCount?.count || 0,
            files: 0,
            upvotes: upvoteCount?.count || 0
        };
    }

    async getProjectActivity(projectId, limit = 10) {
        const discussions = await this.all(`
            SELECT d.*, u.name as author_name, 'discussion' as type
            FROM discussions d
            JOIN users u ON d.author_id = u.id
            WHERE d.project_id = ?
            ORDER BY d.created_at DESC
            LIMIT ?
        `, [projectId, Math.floor(limit / 2)]);
        
        const comments = await this.all(`
            SELECT c.*, u.name as author_name, d.title as discussion_title, 'comment' as type
            FROM comments c
            JOIN users u ON c.author_id = u.id
            JOIN discussions d ON c.discussion_id = d.id
            WHERE d.project_id = ?
            ORDER BY c.created_at DESC
            LIMIT ?
        `, [projectId, Math.floor(limit / 2)]);
        
        const activity = [...discussions, ...comments]
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, limit);
        
        return activity;
    }

    async getProjectThreads(projectId) {
        const threads = await this.all(`
            SELECT d.*, u.name as author_name, u.role as author_role,
                   (SELECT COUNT(*) FROM comments WHERE discussion_id = d.id) as comment_count,
                   (SELECT COUNT(*) FROM discussion_votes WHERE discussion_id = d.id AND vote_type = 'upvote') as upvotes
            FROM discussions d
            JOIN users u ON d.author_id = u.id
            WHERE d.project_id = ?
            ORDER BY d.created_at DESC
        `, [projectId]);
        
        return threads;
    }

    async addTeamMember(projectId, userId, role) {
        const teamId = `team_${uuidv4()}`;
        
        await this.run(
            'INSERT INTO project_team (id, project_id, user_id, role) VALUES (?, ?, ?, ?)',
            [teamId, projectId, userId, role]
        );
        
        return { id: teamId, project_id: projectId, user_id: userId, role };
    }

    async getProjectTeam(projectId) {
        return this.all(`
            SELECT pt.*, u.name, u.email, u.role as user_role, u.avatar_initials
            FROM project_team pt
            JOIN users u ON pt.user_id = u.id
            WHERE pt.project_id = ?
            ORDER BY pt.joined_at
        `, [projectId]);
    }

    async isUserInProject(projectId, userId) {
        const result = await this.get(
            'SELECT 1 FROM project_team WHERE project_id = ? AND user_id = ?',
            [projectId, userId]
        );
        return !!result;
    }

    async createDiscussion(discussionData) {
        const discussionId = `disc_${uuidv4()}`;
        
        await this.run(
            'INSERT INTO discussions (id, project_id, title, content, type, author_id) VALUES (?, ?, ?, ?, ?, ?)',
            [discussionId, discussionData.projectId, discussionData.title, discussionData.content, 
             discussionData.type, discussionData.authorId]
        );
        
        return this.getDiscussion(discussionId);
    }

    async getDiscussion(discussionId) {
        const discussion = await this.get(`
            SELECT d.*, u.name as author_name, u.role as author_role
            FROM discussions d
            JOIN users u ON d.author_id = u.id
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
            SELECT d.*, u.name as author_name, u.role as author_role
            FROM discussions d
            JOIN users u ON d.author_id = u.id
            WHERE d.project_id = ?
            ORDER BY d.created_at DESC
        `, [projectId]);
        
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
                await this.run(
                    'UPDATE discussion_votes SET vote_type = ? WHERE discussion_id = ? AND user_id = ?',
                    [voteType, discussionId, userId]
                );
            } else {
                throw error;
            }
        }
        
        return { id: voteId, discussion_id: discussionId, user_id: userId, vote_type: voteType };
    }

    async getDiscussionVotes(discussionId) {
        return this.all('SELECT * FROM discussion_votes WHERE discussion_id = ?', [discussionId]);
    }

    async createComment(commentData) {
        const commentId = `comment_${uuidv4()}`;
        
        await this.run(
            'INSERT INTO comments (id, discussion_id, content, author_id) VALUES (?, ?, ?, ?)',
            [commentId, commentData.discussionId, commentData.content, commentData.authorId]
        );
        
        await this.run(
            'UPDATE discussions SET comment_count = comment_count + 1 WHERE id = ?',
            [commentData.discussionId]
        );
        
        return this.get('SELECT * FROM comments WHERE id = ?', [commentId]);
    }

    async getDiscussionComments(discussionId) {
        return this.all(`
            SELECT c.*, u.name as author_name, u.role as author_role
            FROM comments c
            JOIN users u ON c.author_id = u.id
            WHERE c.discussion_id = ?
            ORDER BY c.created_at ASC
        `, [discussionId]);
    }

    async createDecision(decisionData) {
        const decisionId = `dec_${uuidv4()}`;
        
        await this.run(
            'INSERT INTO decisions (id, discussion_id, title, description, created_by) VALUES (?, ?, ?, ?, ?)',
            [decisionId, decisionData.discussionId, decisionData.title, decisionData.description, decisionData.createdBy]
        );
        
        return this.get('SELECT * FROM decisions WHERE id = ?', [decisionId]);
    }

    async getProjectDecisions(projectId) {
        return this.all(`
            SELECT d.*, u.name as created_by_name
            FROM decisions d
            JOIN users u ON d.created_by = u.id
            WHERE d.discussion_id IN (SELECT id FROM discussions WHERE project_id = ?)
            ORDER BY d.created_at DESC
        `, [projectId]);
    }

    async getDashboardData(userId) {
        const projects = await this.getProjectsForUser(userId);
        const projectCount = projects.length;
        
        let discussionCount = 0;
        let upvoteCount = 0;
        
        for (const project of projects) {
            const discussions = await this.getProjectDiscussions(project.id);
            discussionCount += discussions.length;
            
            for (const discussion of discussions) {
                const votes = await this.getDiscussionVotes(discussion.id);
                upvoteCount += votes.filter(v => v.vote_type === 'upvote').length;
            }
        }
        
        const teamCount = await this.getUserTeamCount(userId);
        
        return {
            metrics: {
                projectCount,
                discussionCount,
                upvoteCount,
                teamMembers: teamCount
            },
            recentProjects: projects.slice(0, 5),
            recentActivity: await this.getRecentActivity(userId, 10)
        };
    }

    async getRecentActivity(userId, limit = 10) {
        return this.all(`
            SELECT d.*, p.title as project_title, u.name as author_name
            FROM discussions d
            JOIN projects p ON d.project_id = p.id
            JOIN users u ON d.author_id = u.id
            WHERE p.id IN (SELECT project_id FROM project_team WHERE user_id = ?)
            ORDER BY d.created_at DESC
            LIMIT ?
        `, [userId, limit]);
    }

    async getUserTeamCount(userId) {
        const result = await this.get(
            'SELECT COUNT(DISTINCT pt2.user_id) as count FROM project_team pt1 JOIN project_team pt2 ON pt1.project_id = pt2.project_id WHERE pt1.user_id = ? AND pt2.user_id != ?',
            [userId, userId]
        );
        return result?.count || 0;
    }

    async close() {
        if (this.db) {
            return new Promise((resolve, reject) => {
                this.db.close((err) => {
                    if (err) reject(err);
                    else {
                        this.db = null;
                        this.connected = false;
                        resolve();
                    }
                });
            });
        }
    }
}

const database = new ThoraxLabDatabase();
module.exports = { database };
