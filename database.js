const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

class ThoraxLabDatabase {
    constructor() {
        this.db = null;
        this.connected = false;
        const dataDir = path.join(__dirname, 'data');
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        this.DB_PATH = path.join(dataDir, 'thoraxlab.db');
    }

    async connect() {
        if (this.connected) return this.db;
        console.log('🔌 Connecting to database...');
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.DB_PATH, (err) => {
                if (err) {
                    console.error('❌ Database connection failed:', err);
                    reject(err);
                } else {
                    console.log('✅ Database connected');
                    this.connected = true;
                    this.initializeSchema().then(() => resolve(this.db)).catch(reject);
                }
            });
        });
    }

    async initializeSchema() {
        await this.run('PRAGMA foreign_keys = ON');
        
        // ===== ENHANCED: USER SESSIONS TABLE =====
        await this.run(`
            CREATE TABLE IF NOT EXISTS user_sessions (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                token TEXT NOT NULL UNIQUE,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // ===== ENHANCED: USER PRESENCE TRACKING =====
        await this.run(`
            CREATE TABLE IF NOT EXISTS user_presence (
                user_id TEXT PRIMARY KEY,
                status TEXT NOT NULL DEFAULT 'offline' CHECK(status IN ('online', 'away', 'offline')),
                last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                current_project TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // ===== ENHANCED: USER NOTIFICATIONS =====
        await this.run(`
            CREATE TABLE IF NOT EXISTS user_notifications (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                type TEXT NOT NULL,
                title TEXT NOT NULL,
                message TEXT,
                read BOOLEAN DEFAULT 0,
                metadata TEXT DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // Users table (enhanced)
        await this.run(`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                organization TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('clinician', 'industry', 'lead')),
                specialty TEXT,
                avatar_color TEXT DEFAULT '#1A5F7A',
                avatar_initials TEXT,
                impact_score INTEGER DEFAULT 100,
                is_admin BOOLEAN DEFAULT 0,
                is_active BOOLEAN DEFAULT 1,
                status TEXT DEFAULT 'offline',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Projects table with objectives matrix
        await this.run(`
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                type TEXT NOT NULL CHECK(type IN ('clinical', 'industry', 'collaborative')),
                status TEXT NOT NULL DEFAULT 'planning' CHECK(status IN ('planning', 'active', 'completed', 'archived')),
                lead_id TEXT NOT NULL,
                lead_name TEXT NOT NULL,
                lead_email TEXT NOT NULL,
                objectives TEXT DEFAULT '{"clinical":[],"industry":[],"shared":[]}',
                methodology TEXT,
                start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                estimated_duration TEXT,
                progress INTEGER DEFAULT 0,
                consensus_score INTEGER DEFAULT 0,
                engagement_score INTEGER DEFAULT 0,
                discussion_count INTEGER DEFAULT 0,
                comment_count INTEGER DEFAULT 0,
                decision_count INTEGER DEFAULT 0,
                is_archived BOOLEAN DEFAULT 0,
                cover_color TEXT DEFAULT '#1A5F7A',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (lead_id) REFERENCES users(id)
            )
        `);

        // Project team
        await this.run(`
            CREATE TABLE IF NOT EXISTS project_team (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('clinician', 'industry', 'contributor', 'lead')),
                organization TEXT,
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(project_id, user_id),
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // Discussions with type enforcement
        await this.run(`
            CREATE TABLE IF NOT EXISTS discussions (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                type TEXT NOT NULL CHECK(type IN ('clinical_question', 'technical_solution', 'joint_review')),
                author_id TEXT NOT NULL,
                author_name TEXT NOT NULL,
                author_role TEXT NOT NULL,
                author_organization TEXT,
                evidence_count INTEGER DEFAULT 0,
                clinical_agree_count INTEGER DEFAULT 0,
                clinical_disagree_count INTEGER DEFAULT 0,
                technical_feasible_count INTEGER DEFAULT 0,
                technical_infeasible_count INTEGER DEFAULT 0,
                needs_evidence_count INTEGER DEFAULT 0,
                comment_count INTEGER DEFAULT 0,
                consensus_status TEXT DEFAULT 'pending' CHECK(consensus_status IN ('pending', 'low', 'medium', 'high', 'decided')),
                tags TEXT DEFAULT '[]',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (author_id) REFERENCES users(id)
            )
        `);

        // Discussion votes for consensus tracking
        await this.run(`
            CREATE TABLE IF NOT EXISTS discussion_votes (
                id TEXT PRIMARY KEY,
                discussion_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                vote_type TEXT NOT NULL CHECK(vote_type IN ('clinical_agree', 'clinical_disagree', 'technical_feasible', 'technical_infeasible', 'needs_evidence')),
                user_role TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(discussion_id, user_id, vote_type),
                FOREIGN KEY (discussion_id) REFERENCES discussions(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // Evidence links
        await this.run(`
            CREATE TABLE IF NOT EXISTS evidence_links (
                id TEXT PRIMARY KEY,
                discussion_id TEXT,
                comment_id TEXT,
                decision_id TEXT,
                evidence_type TEXT NOT NULL CHECK(evidence_type IN ('pubmed', 'clinical_trial', 'guideline', 'regulatory', 'other')),
                source_id TEXT NOT NULL,
                title TEXT,
                url TEXT,
                added_by TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (discussion_id) REFERENCES discussions(id) ON DELETE CASCADE,
                FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
                FOREIGN KEY (decision_id) REFERENCES decisions(id) ON DELETE CASCADE,
                FOREIGN KEY (added_by) REFERENCES users(id)
            )
        `);

        // Comments
        await this.run(`
            CREATE TABLE IF NOT EXISTS comments (
                id TEXT PRIMARY KEY,
                discussion_id TEXT NOT NULL,
                project_id TEXT NOT NULL,
                content TEXT NOT NULL,
                author_id TEXT NOT NULL,
                author_name TEXT NOT NULL,
                author_role TEXT NOT NULL,
                author_organization TEXT,
                evidence_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (discussion_id) REFERENCES discussions(id) ON DELETE CASCADE,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (author_id) REFERENCES users(id)
            )
        `);

        // Decisions from consensus
        await this.run(`
            CREATE TABLE IF NOT EXISTS decisions (
                id TEXT PRIMARY KEY,
                discussion_id TEXT NOT NULL,
                project_id TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                decision_type TEXT NOT NULL CHECK(decision_type IN ('clinical', 'technical', 'joint')),
                status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'implemented', 'rejected', 'archived')),
                priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'critical')),
                impact_score INTEGER DEFAULT 0,
                consensus_data TEXT DEFAULT '{}',
                created_by TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                implemented_at TIMESTAMP,
                FOREIGN KEY (discussion_id) REFERENCES discussions(id) ON DELETE CASCADE,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (created_by) REFERENCES users(id)
            )
        `);

        // Activity log
        await this.run(`
            CREATE TABLE IF NOT EXISTS activity_log (
                id TEXT PRIMARY KEY,
                project_id TEXT,
                user_id TEXT,
                activity_type TEXT NOT NULL,
                description TEXT NOT NULL,
                metadata TEXT DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
            )
        `);

        console.log('✅ Schema initialized with enhancements');
        
        // Create admin user if none exists
        const userCount = await this.get('SELECT COUNT(*) as count FROM users');
        if (userCount.count === 0) {
            await this.run(`
                INSERT INTO users (id, email, name, organization, role, is_admin, avatar_color, avatar_initials)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, ['admin', 'admin@thoraxlab.org', 'Platform Admin', 'ThoraxLab', 'lead', 1, '#1A5F7A', 'PA']);
            console.log('✅ Created admin user');
        }
    }

    // ===== CORE METHODS =====
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

    // ===== ENHANCED: SESSION MANAGEMENT =====
    async createSession(userId, token, expiresInHours = 24) {
        const sessionId = `sess_${uuidv4()}`;
        const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();
        
        await this.run(`
            INSERT INTO user_sessions (id, user_id, token, expires_at)
            VALUES (?, ?, ?, ?)
        `, [sessionId, userId, token, expiresAt]);
        
        return this.getSessionByToken(token);
    }

    async getSessionByToken(token) {
        const session = await this.get('SELECT * FROM user_sessions WHERE token = ?', [token]);
        if (!session) return null;
        
        // Check if session is expired
        const now = new Date();
        const expiresAt = new Date(session.expires_at);
        if (now > expiresAt) {
            await this.run('DELETE FROM user_sessions WHERE id = ?', [session.id]);
            return null;
        }
        
        // Update last activity
        await this.run('UPDATE user_sessions SET last_activity = CURRENT_TIMESTAMP WHERE id = ?', [session.id]);
        
        return session;
    }

    async deleteSession(token) {
        await this.run('DELETE FROM user_sessions WHERE token = ?', [token]);
        return true;
    }

    async deleteAllUserSessions(userId) {
        await this.run('DELETE FROM user_sessions WHERE user_id = ?', [userId]);
        return true;
    }

    // ===== ENHANCED: USER METHODS =====
    async createUser(userData) {
        const userId = `user_${uuidv4()}`;
        const now = new Date().toISOString();
        const initials = this.getUserInitials(userData.name);
        
        await this.run(`
            INSERT INTO users (id, email, name, organization, role, specialty, avatar_color, avatar_initials, created_at, last_activity)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            userId,
            userData.email.trim().toLowerCase(),
            userData.name.trim(),
            userData.organization || 'Medical Center',
            userData.role || 'clinician',
            userData.specialty || 'general',
            userData.avatar_color || '#1A5F7A',
            initials,
            now,
            now
        ]);

        // Initialize presence record
        await this.run(`
            INSERT INTO user_presence (user_id, status, last_seen)
            VALUES (?, 'offline', ?)
        `, [userId, now]);

        await this.logActivity(null, userId, 'user_registered', 'User registered on platform');
        return this.getUser(userId);
    }

    async getUser(userId) {
        const user = await this.get('SELECT * FROM users WHERE id = ?', [userId]);
        if (user) {
            // Get presence status
            const presence = await this.get('SELECT * FROM user_presence WHERE user_id = ?', [userId]);
            user.presence = presence || { status: 'offline', last_seen: user.last_activity };
        }
        return user;
    }

    async findUserByEmail(email) {
        return this.get('SELECT * FROM users WHERE email = ?', [email.trim().toLowerCase()]);
    }

    async getAllUsers() {
        const users = await this.all('SELECT * FROM users WHERE is_active = 1 ORDER BY created_at DESC');
        
        // Add presence data to each user
        for (const user of users) {
            const presence = await this.get('SELECT * FROM user_presence WHERE user_id = ?', [user.id]);
            user.presence = presence || { status: 'offline', last_seen: user.last_activity };
        }
        
        return users;
    }

    async updateUserActivity(userId) {
        await this.run(`
            UPDATE users SET last_activity = CURRENT_TIMESTAMP WHERE id = ?
        `, [userId]);
        return true;
    }

    async updateUserPresence(userId, status, currentProject = null) {
        await this.run(`
            INSERT OR REPLACE INTO user_presence (user_id, status, last_seen, current_project)
            VALUES (?, ?, CURRENT_TIMESTAMP, ?)
        `, [userId, status, currentProject]);
        
        // Also update user status in users table
        await this.run(`
            UPDATE users SET status = ?, last_activity = CURRENT_TIMESTAMP WHERE id = ?
        `, [status, userId]);
        
        return this.get('SELECT * FROM user_presence WHERE user_id = ?', [userId]);
    }

    async getUsersByPresence(status = null) {
        let query = `
            SELECT u.*, up.status as presence_status, up.last_seen, up.current_project
            FROM users u
            JOIN user_presence up ON u.id = up.user_id
            WHERE u.is_active = 1
        `;
        
        const params = [];
        if (status) {
            query += ' AND up.status = ?';
            params.push(status);
        }
        
        query += ' ORDER BY up.last_seen DESC';
        
        return this.all(query, params);
    }

    // ===== ENHANCED: PROJECT METHODS =====
    async createProject(projectData, userId) {
        const projectId = `project_${uuidv4()}`;
        const now = new Date().toISOString();
        const user = await this.getUser(userId);
        if (!user) throw new Error('User not found');

        const coverColors = ['#1A5F7A', '#0D8B70', '#6D5ACF', '#F59E0B', '#10B981'];
        const randomColor = coverColors[Math.floor(Math.random() * coverColors.length)];

        await this.run(`
            INSERT INTO projects (id, title, description, type, status, lead_id, lead_name, lead_email, 
                                  objectives, methodology, cover_color, start_date, created_at, updated_at, last_activity_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            projectId,
            projectData.title.trim(),
            projectData.description.trim(),
            projectData.type || 'clinical',
            projectData.status || 'planning',
            userId,
            user.name,
            user.email,
            JSON.stringify(projectData.objectives || { clinical: [], industry: [], shared: [] }),
            projectData.methodology || '',
            randomColor,
            now,
            now,
            now,
            now
        ]);

        await this.addTeamMember(projectId, userId, 'lead', user.organization);
        await this.logActivity(projectId, userId, 'project_created', `Created project: ${projectData.title}`);

        return this.getProject(projectId);
    }

    async getProject(projectId) {
        const project = await this.get(`
            SELECT p.*,
                   (SELECT COUNT(*) FROM project_team WHERE project_id = p.id) as team_count,
                   (SELECT COUNT(*) FROM discussions WHERE project_id = p.id) as discussion_count,
                   (SELECT COUNT(*) FROM comments WHERE project_id = p.id) as comment_count,
                   (SELECT COUNT(*) FROM decisions WHERE project_id = p.id) as decision_count
            FROM projects p
            WHERE p.id = ? AND p.is_archived = 0
        `, [projectId]);

        if (!project) return null;
        
        // Parse objectives JSON
        if (project.objectives) {
            try {
                project.objectives = JSON.parse(project.objectives);
            } catch {
                project.objectives = { clinical: [], industry: [], shared: [] };
            }
        }

        // Calculate consensus score from discussions
        const discussions = await this.getProjectDiscussions(projectId);
        const totalConsensus = discussions.reduce((sum, d) => {
            const consensus = d.consensus || { clinicalAgreement: 0, technicalFeasibility: 0 };
            return sum + (consensus.clinicalAgreement + consensus.technicalFeasibility) / 2;
        }, 0);
        
        project.consensus_score = discussions.length > 0 ? Math.round(totalConsensus / discussions.length) : 0;

        return project;
    }

    async getAllProjects(options = {}) {
        let query = `
            SELECT p.*, u.name as lead_name,
                   (SELECT COUNT(*) FROM project_team WHERE project_id = p.id) as team_count,
                   (SELECT COUNT(*) FROM discussions WHERE project_id = p.id) as discussion_count
            FROM projects p
            LEFT JOIN users u ON p.lead_id = u.id
            WHERE p.is_archived = 0
        `;
        
        const params = [];
        
        if (options.search) {
            query += ' AND (p.title LIKE ? OR p.description LIKE ?)';
            const searchTerm = `%${options.search}%`;
            params.push(searchTerm, searchTerm);
        }
        
        if (options.type) {
            query += ' AND p.type = ?';
            params.push(options.type);
        }
        
        if (options.status) {
            query += ' AND p.status = ?';
            params.push(options.status);
        }
        
        if (options.userId) {
            query += ` AND p.id IN (SELECT project_id FROM project_team WHERE user_id = ?)`;
            params.push(options.userId);
        }
        
        query += ' ORDER BY p.last_activity_at DESC';
        
        if (options.limit) {
            query += ' LIMIT ?';
            params.push(options.limit);
        }

        const projects = await this.all(query, params);

        return projects.map(p => {
            if (p.objectives) {
                try {
                    p.objectives = JSON.parse(p.objectives);
                } catch {
                    p.objectives = { clinical: [], industry: [], shared: [] };
                }
            }
            return p;
        });
    }

    async getProjectsForUser(userId, options = {}) {
        return this.all(`
            SELECT p.*, pt.role as user_role
            FROM projects p
            JOIN project_team pt ON p.id = pt.project_id
            WHERE pt.user_id = ? AND p.is_archived = 0
            ORDER BY p.last_activity_at DESC
        `, [userId]);
    }

    async updateProject(projectId, updates) {
        const setClause = [];
        const values = [];
        
        Object.keys(updates).forEach(key => {
            if (updates[key] !== undefined && key !== 'id') {
                if (key === 'objectives') {
                    setClause.push(`${key} = ?`);
                    values.push(JSON.stringify(updates[key]));
                } else {
                    setClause.push(`${key} = ?`);
                    values.push(updates[key]);
                }
            }
        });

        if (setClause.length === 0) return this.getProject(projectId);

        setClause.push('updated_at = CURRENT_TIMESTAMP');
        values.push(projectId);

        await this.run(`UPDATE projects SET ${setClause.join(', ')} WHERE id = ?`, values);
        return this.getProject(projectId);
    }

    async archiveProject(projectId) {
        await this.run(`
            UPDATE projects 
            SET is_archived = 1, status = 'archived', updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        `, [projectId]);
        return this.getProject(projectId);
    }

    async getProjectStats(projectId) {
        const project = await this.getProject(projectId);
        if (!project) return null;

        const team = await this.getProjectTeam(projectId);
        const discussions = await this.getProjectDiscussions(projectId);
        const decisions = await this.getProjectDecisions(projectId);
        
        // Calculate metrics
        const clinicalTeam = team.filter(m => m.role === 'clinician').length;
        const industryTeam = team.filter(m => m.role === 'industry').length;
        
        const clinicalDiscussions = discussions.filter(d => d.type === 'clinical_question').length;
        const technicalDiscussions = discussions.filter(d => d.type === 'technical_solution').length;
        const jointDiscussions = discussions.filter(d => d.type === 'joint_review').length;
        
        const openDecisions = decisions.filter(d => d.status === 'open').length;
        const implementedDecisions = decisions.filter(d => d.status === 'implemented').length;

        return {
            team: {
                total: team.length,
                clinical: clinicalTeam,
                industry: industryTeam,
                contributors: team.length - clinicalTeam - industryTeam
            },
            discussions: {
                total: discussions.length,
                clinical: clinicalDiscussions,
                technical: technicalDiscussions,
                joint: jointDiscussions
            },
            decisions: {
                total: decisions.length,
                open: openDecisions,
                implemented: implementedDecisions,
                completionRate: decisions.length > 0 ? Math.round((implementedDecisions / decisions.length) * 100) : 0
            },
            consensus: project.consensus_score,
            activity: {
                last_activity: project.last_activity_at,
                days_active: Math.ceil((new Date() - new Date(project.created_at)) / (1000 * 60 * 60 * 24))
            }
        };
    }

    // ===== ENHANCED: TEAM METHODS =====
    async addTeamMember(projectId, userId, role, organization = null) {
        const teamId = `team_${uuidv4()}`;
        
        await this.run(`
            INSERT INTO project_team (id, project_id, user_id, role, organization)
            VALUES (?, ?, ?, ?, ?)
        `, [teamId, projectId, userId, role, organization]);

        await this.run(`
            UPDATE projects SET updated_at = CURRENT_TIMESTAMP, last_activity_at = CURRENT_TIMESTAMP WHERE id = ?
        `, [projectId]);

        const user = await this.getUser(userId);
        await this.logActivity(projectId, userId, 'team_member_added', 
            `${user?.name || 'User'} joined as ${role}`);

        return { id: teamId, project_id: projectId, user_id: userId, role, organization };
    }

    async getProjectTeam(projectId) {
        return this.all(`
            SELECT pt.*, u.name, u.email, u.role as user_role, u.avatar_color, u.avatar_initials, u.specialty,
                   up.status as presence_status, up.last_seen as last_active
            FROM project_team pt
            LEFT JOIN users u ON pt.user_id = u.id
            LEFT JOIN user_presence up ON u.id = up.user_id
            WHERE pt.project_id = ?
            ORDER BY 
                CASE WHEN pt.role = 'lead' THEN 1
                     WHEN pt.role = 'clinician' THEN 2
                     WHEN pt.role = 'industry' THEN 3
                     ELSE 4 END,
                pt.joined_at
        `, [projectId]);
    }

    async removeTeamMember(projectId, userId) {
        await this.run('DELETE FROM project_team WHERE project_id = ? AND user_id = ?', [projectId, userId]);
        return true;
    }

    // ===== ENHANCED: DISCUSSION METHODS =====
    async createDiscussion(discussionData) {
        const discussionId = `disc_${uuidv4()}`;
        const now = new Date().toISOString();

        await this.run(`
            INSERT INTO discussions (id, project_id, title, content, type, author_id, author_name, author_role, author_organization, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            discussionId,
            discussionData.projectId,
            discussionData.title.trim(),
            discussionData.content.trim(),
            discussionData.type,
            discussionData.author.id,
            discussionData.author.name,
            discussionData.author.role,
            discussionData.author.organization,
            now,
            now
        ]);

        // Add evidence links if provided
        if (discussionData.evidenceLinks && discussionData.evidenceLinks.length > 0) {
            for (const evidence of discussionData.evidenceLinks) {
                await this.addEvidence(discussionId, null, null, {
                    evidenceType: evidence.type || 'other',
                    sourceId: evidence.id || evidence.url,
                    title: evidence.title,
                    url: evidence.url,
                    addedBy: discussionData.author.id
                });
            }
            await this.updateDiscussionEvidenceCount(discussionId);
        }

        // Update project metrics
        await this.run(`
            UPDATE projects 
            SET discussion_count = discussion_count + 1,
                updated_at = CURRENT_TIMESTAMP,
                last_activity_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [discussionData.projectId]);

        await this.logActivity(discussionData.projectId, discussionData.author.id, 
            'discussion_created', `Started ${discussionData.type}: ${discussionData.title}`);

        return this.getDiscussion(discussionId);
    }

    async getDiscussion(discussionId) {
        const discussion = await this.get('SELECT * FROM discussions WHERE id = ?', [discussionId]);
        if (discussion) {
            discussion.evidence = await this.getDiscussionEvidence(discussionId);
            discussion.consensus = await this.calculateConsensus(discussionId);
        }
        return discussion;
    }

    async getProjectDiscussions(projectId, options = {}) {
        let query = `
            SELECT * FROM discussions 
            WHERE project_id = ?
        `;
        
        const params = [projectId];
        
        if (options.type) {
            query += ' AND type = ?';
            params.push(options.type);
        }
        
        if (options.search) {
            query += ' AND (title LIKE ? OR content LIKE ?)';
            const searchTerm = `%${options.search}%`;
            params.push(searchTerm, searchTerm);
        }
        
        query += ' ORDER BY created_at DESC';
        
        if (options.limit) {
            query += ' LIMIT ?';
            params.push(options.limit);
        }

        const discussions = await this.all(query, params);

        // Add evidence and consensus data
        for (const discussion of discussions) {
            discussion.evidence = await this.getDiscussionEvidence(discussion.id);
            discussion.consensus = await this.calculateConsensus(discussion.id);
        }

        return discussions;
    }

    async addDiscussionVote(discussionId, userId, voteType, userRole) {
        const voteId = `vote_${uuidv4()}`;
        
        try {
            await this.run(`
                INSERT INTO discussion_votes (id, discussion_id, user_id, vote_type, user_role)
                VALUES (?, ?, ?, ?, ?)
            `, [voteId, discussionId, userId, voteType, userRole]);

            // Update discussion vote counts
            const voteColumn = this.getVoteColumnName(voteType);
            if (voteColumn) {
                await this.run(`
                    UPDATE discussions 
                    SET ${voteColumn} = ${voteColumn} + 1,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `, [discussionId]);
            }

            return { id: voteId, discussion_id: discussionId, user_id: userId, vote_type: voteType };
        } catch (error) {
            // User already voted, update vote
            if (error.message.includes('UNIQUE constraint failed')) {
                const existingVote = await this.get(
                    'SELECT * FROM discussion_votes WHERE discussion_id = ? AND user_id = ? AND vote_type = ?',
                    [discussionId, userId, voteType]
                );
                return existingVote;
            }
            throw error;
        }
    }

    async calculateConsensus(discussionId) {
        const discussion = await this.getDiscussion(discussionId);
        if (!discussion) return null;

        const team = await this.getProjectTeam(discussion.project_id);
        const clinicalTeam = team.filter(m => m.role === 'clinician');
        const industryTeam = team.filter(m => m.role === 'industry');

        const votes = await this.all(
            'SELECT * FROM discussion_votes WHERE discussion_id = ?',
            [discussionId]
        );

        const clinicalVotes = votes.filter(v => v.user_role === 'clinician');
        const industryVotes = votes.filter(v => v.user_role === 'industry');

        // Calculate clinical agreement
        const clinicalAgrees = clinicalVotes.filter(v => v.vote_type === 'clinical_agree').length;
        const clinicalAgreement = clinicalTeam.length > 0 
            ? Math.round((clinicalAgrees / clinicalTeam.length) * 100) 
            : 0;

        // Calculate technical feasibility
        const technicalFeasible = industryVotes.filter(v => v.vote_type === 'technical_feasible').length;
        const technicalFeasibility = industryTeam.length > 0
            ? Math.round((technicalFeasible / industryTeam.length) * 100)
            : 0;

        // Overall consensus status
        let consensusStatus = 'pending';
        if (clinicalAgreement >= 70 && technicalFeasibility >= 70) {
            consensusStatus = 'high';
        } else if (clinicalAgreement >= 50 || technicalFeasibility >= 50) {
            consensusStatus = 'medium';
        } else if (clinicalAgreement > 0 || technicalFeasibility > 0) {
            consensusStatus = 'low';
        }

        return {
            clinicalAgreement,
            technicalFeasibility,
            needsEvidence: votes.filter(v => v.vote_type === 'needs_evidence').length,
            totalVotes: votes.length,
            clinicalVotes: clinicalVotes.length,
            industryVotes: industryVotes.length,
            status: consensusStatus
        };
    }

    // ===== ENHANCED: EVIDENCE METHODS =====
    async addEvidence(discussionId, commentId, decisionId, evidenceData) {
        const evidenceId = `ev_${uuidv4()}`;
        
        // Generate URL if not provided
        let url = evidenceData.url;
        if (!url && evidenceData.evidenceType) {
            url = this.generateEvidenceUrl(evidenceData.evidenceType, evidenceData.sourceId);
        }
        
        await this.run(`
            INSERT INTO evidence_links (id, discussion_id, comment_id, decision_id, evidence_type, source_id, title, url, added_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            evidenceId,
            discussionId,
            commentId,
            decisionId,
            evidenceData.evidenceType,
            evidenceData.sourceId,
            evidenceData.title,
            url,
            evidenceData.addedBy || 'system'
        ]);

        return this.get('SELECT * FROM evidence_links WHERE id = ?', [evidenceId]);
    }

    generateEvidenceUrl(evidenceType, sourceId) {
        if (!sourceId) return '';
        
        switch(evidenceType) {
            case 'pubmed':
                return `https://pubmed.ncbi.nlm.nih.gov/${sourceId}/`;
            case 'clinical_trial':
                return `https://clinicaltrials.gov/ct2/show/${sourceId}`;
            case 'guideline':
                return sourceId.startsWith('http') ? sourceId : '';
            case 'regulatory':
                return sourceId.startsWith('http') ? sourceId : '';
            default:
                return sourceId.startsWith('http') ? sourceId : '';
        }
    }

    async getDiscussionEvidence(discussionId) {
        return this.all(`
            SELECT * FROM evidence_links 
            WHERE discussion_id = ? 
            ORDER BY created_at DESC
        `, [discussionId]);
    }

    async updateDiscussionEvidenceCount(discussionId) {
        const count = await this.get(
            'SELECT COUNT(*) as count FROM evidence_links WHERE discussion_id = ?',
            [discussionId]
        );
        
        await this.run(
            'UPDATE discussions SET evidence_count = ? WHERE id = ?',
            [count.count, discussionId]
        );
        
        return count.count;
    }

    // ===== ENHANCED: COMMENT METHODS =====
    async createComment(commentData) {
        const commentId = `comment_${uuidv4()}`;
        const now = new Date().toISOString();

        await this.run(`
            INSERT INTO comments (id, discussion_id, project_id, content, author_id, author_name, author_role, author_organization, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            commentId,
            commentData.discussionId,
            commentData.projectId,
            commentData.content.trim(),
            commentData.author.id,
            commentData.author.name,
            commentData.author.role,
            commentData.author.organization,
            now
        ]);

        // Add evidence links if provided
        if (commentData.evidenceLinks && commentData.evidenceLinks.length > 0) {
            for (const evidence of commentData.evidenceLinks) {
                await this.addEvidence(null, commentId, null, {
                    evidenceType: evidence.type || 'other',
                    sourceId: evidence.id || evidence.url,
                    title: evidence.title,
                    url: evidence.url,
                    addedBy: commentData.author.id
                });
            }
        }

        // Update discussion comment count
        await this.run(`
            UPDATE discussions 
            SET comment_count = comment_count + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [commentData.discussionId]);

        // Update project metrics
        await this.run(`
            UPDATE projects 
            SET comment_count = comment_count + 1,
                updated_at = CURRENT_TIMESTAMP,
                last_activity_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [commentData.projectId]);

        await this.logActivity(commentData.projectId, commentData.author.id, 
            'comment_added', 'Added a comment');

        return this.getComment(commentId);
    }

    async getComment(commentId) {
        return this.get('SELECT * FROM comments WHERE id = ?', [commentId]);
    }

    async getDiscussionComments(discussionId) {
        const comments = await this.all(`
            SELECT * FROM comments 
            WHERE discussion_id = ?
            ORDER BY created_at ASC
        `, [discussionId]);

        // Add evidence to each comment
        for (const comment of comments) {
            comment.evidence = await this.all(
                'SELECT * FROM evidence_links WHERE comment_id = ? ORDER BY created_at DESC',
                [comment.id]
            );
        }

        return comments;
    }

    // ===== ENHANCED: DECISION METHODS =====
    async createDecision(decisionData) {
        const decisionId = `dec_${uuidv4()}`;
        const now = new Date().toISOString();

        await this.run(`
            INSERT INTO decisions (id, discussion_id, project_id, title, description, decision_type, 
                                  status, priority, impact_score, consensus_data, created_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            decisionId,
            decisionData.discussionId,
            decisionData.projectId,
            decisionData.title.trim(),
            decisionData.description.trim(),
            decisionData.decisionType || 'joint',
            decisionData.status || 'open',
            decisionData.priority || 'medium',
            decisionData.impactScore || 0,
            JSON.stringify(decisionData.consensusData || {}),
            decisionData.createdBy || 'system',
            now,
            now
        ]);

        // Update project decision count
        await this.run(`
            UPDATE projects 
            SET decision_count = decision_count + 1,
                updated_at = CURRENT_TIMESTAMP,
                last_activity_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [decisionData.projectId]);

        // Update discussion consensus status
        await this.run(`
            UPDATE discussions 
            SET consensus_status = 'decided',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [decisionData.discussionId]);

        await this.logActivity(decisionData.projectId, decisionData.createdBy, 
            'decision_reached', `Decision reached: ${decisionData.title}`);

        return this.get('SELECT * FROM decisions WHERE id = ?', [decisionId]);
    }

    async getProjectDecisions(projectId) {
        return this.all(`
            SELECT * FROM decisions 
            WHERE project_id = ?
            ORDER BY 
                CASE priority 
                    WHEN 'critical' THEN 1
                    WHEN 'high' THEN 2
                    WHEN 'medium' THEN 3
                    WHEN 'low' THEN 4
                    ELSE 5
                END,
                created_at DESC
        `, [projectId]);
    }

    // ===== ENHANCED: ACTIVITY METHODS =====
    async logActivity(projectId, userId, activityType, description, metadata = {}) {
        const activityId = `act_${uuidv4()}`;
        
        await this.run(`
            INSERT INTO activity_log (id, project_id, user_id, activity_type, description, metadata)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [activityId, projectId, userId, activityType, description, JSON.stringify(metadata)]);

        return activityId;
    }

    async getRecentActivity(userId, options = {}) {
        let query = `
            SELECT al.*, p.title as project_title, u.name as user_name, u.avatar_color, u.avatar_initials
            FROM activity_log al
            LEFT JOIN projects p ON al.project_id = p.id
            LEFT JOIN users u ON al.user_id = u.id
            WHERE al.user_id = ? OR al.project_id IN (
                SELECT project_id FROM project_team WHERE user_id = ?
            )
        `;
        
        const params = [userId, userId];
        
        if (options.projectId) {
            query += ' AND al.project_id = ?';
            params.push(options.projectId);
        }
        
        if (options.activityType) {
            query += ' AND al.activity_type = ?';
            params.push(options.activityType);
        }
        
        query += ' ORDER BY al.created_at DESC';
        
        if (options.limit) {
            query += ' LIMIT ?';
            params.push(options.limit);
        } else {
            query += ' LIMIT 20';
        }

        return this.all(query, params);
    }

    // ===== ENHANCED: NOTIFICATION METHODS =====
    async createNotification(notificationData) {
        const notificationId = `notif_${uuidv4()}`;
        
        await this.run(`
            INSERT INTO user_notifications (id, user_id, type, title, message, metadata)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [
            notificationId,
            notificationData.userId,
            notificationData.type,
            notificationData.title,
            notificationData.message || '',
            JSON.stringify(notificationData.metadata || {})
        ]);
        
        return this.get('SELECT * FROM user_notifications WHERE id = ?', [notificationId]);
    }

    async getUserNotifications(userId, unreadOnly = false) {
        let query = 'SELECT * FROM user_notifications WHERE user_id = ?';
        const params = [userId];
        
        if (unreadOnly) {
            query += ' AND read = 0';
        }
        
        query += ' ORDER BY created_at DESC LIMIT 50';
        
        return this.all(query, params);
    }

    async markNotificationRead(notificationId) {
        await this.run('UPDATE user_notifications SET read = 1 WHERE id = ?', [notificationId]);
        return true;
    }

    async markAllNotificationsRead(userId) {
        await this.run('UPDATE user_notifications SET read = 1 WHERE user_id = ? AND read = 0', [userId]);
        return true;
    }

    // ===== UTILITY METHODS =====
    getVoteColumnName(voteType) {
        const mapping = {
            'clinical_agree': 'clinical_agree_count',
            'clinical_disagree': 'clinical_disagree_count',
            'technical_feasible': 'technical_feasible_count',
            'technical_infeasible': 'technical_infeasible_count',
            'needs_evidence': 'needs_evidence_count'
        };
        return mapping[voteType];
    }

    getUserInitials(name) {
        if (!name) return '??';
        return name.split(' ')
            .map(n => n[0])
            .join('')
            .toUpperCase()
            .substring(0, 2);
    }

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
                    else {
                        this.db = null;
                        this.connected = false;
                        console.log('🔌 Database closed');
                        resolve();
                    }
                });
            });
        }
    }
}

const database = new ThoraxLabDatabase();
module.exports = { database };
