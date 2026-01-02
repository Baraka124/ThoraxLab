const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

class ThoraxLabDatabase {
    constructor() {
        this.db = null;
        this.connected = false;
        
        const dataDir = process.env.DB_PATH ? 
            path.dirname(process.env.DB_PATH) : 
            path.join(__dirname, 'data');
        
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        
        this.DB_PATH = process.env.DB_PATH || path.join(dataDir, 'thoraxlab.db');
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
        
        // USERS
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
                is_active BOOLEAN DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // SESSIONS
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

        // PROJECTS
        await this.run(`
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                type TEXT NOT NULL CHECK(type IN ('clinical', 'industry', 'collaborative')),
                status TEXT NOT NULL DEFAULT 'planning' CHECK(status IN ('planning', 'active', 'completed', 'archived')),
                lead_id TEXT NOT NULL,
                objectives TEXT DEFAULT '{"clinical":[],"industry":[],"shared":[]}',
                methodology TEXT,
                cover_color TEXT DEFAULT '#1A5F7A',
                discussion_count INTEGER DEFAULT 0,
                team_count INTEGER DEFAULT 0,
                comment_count INTEGER DEFAULT 0,
                decision_count INTEGER DEFAULT 0,
                consensus_score INTEGER DEFAULT 0,
                is_archived BOOLEAN DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (lead_id) REFERENCES users(id)
            )
        `);

        // PROJECT TEAM
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

        // DISCUSSIONS
        await this.run(`
            CREATE TABLE IF NOT EXISTS discussions (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                type TEXT NOT NULL CHECK(type IN ('clinical_question', 'technical_solution', 'joint_review')),
                author_id TEXT NOT NULL,
                evidence_count INTEGER DEFAULT 0,
                comment_count INTEGER DEFAULT 0,
                consensus_status TEXT DEFAULT 'pending' CHECK(consensus_status IN ('pending', 'low', 'medium', 'high', 'decided')),
                clinical_agree_count INTEGER DEFAULT 0,
                clinical_disagree_count INTEGER DEFAULT 0,
                technical_feasible_count INTEGER DEFAULT 0,
                technical_infeasible_count INTEGER DEFAULT 0,
                needs_evidence_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (author_id) REFERENCES users(id)
            )
        `);

        // DISCUSSION VOTES
        await this.run(`
            CREATE TABLE IF NOT EXISTS discussion_votes (
                id TEXT PRIMARY KEY,
                discussion_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                vote_type TEXT NOT NULL CHECK(vote_type IN ('clinical_agree', 'clinical_disagree', 'technical_feasible', 'technical_infeasible', 'needs_evidence')),
                user_role TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(discussion_id, user_id),
                FOREIGN KEY (discussion_id) REFERENCES discussions(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // COMMENTS
        await this.run(`
            CREATE TABLE IF NOT EXISTS comments (
                id TEXT PRIMARY KEY,
                discussion_id TEXT NOT NULL,
                project_id TEXT NOT NULL,
                content TEXT NOT NULL,
                author_id TEXT NOT NULL,
                evidence_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (discussion_id) REFERENCES discussions(id) ON DELETE CASCADE,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (author_id) REFERENCES users(id)
            )
        `);

        // EVIDENCE LINKS
        await this.run(`
            CREATE TABLE IF NOT EXISTS evidence_links (
                id TEXT PRIMARY KEY,
                discussion_id TEXT,
                comment_id TEXT,
                evidence_type TEXT NOT NULL CHECK(evidence_type IN ('pubmed', 'clinical_trial', 'guideline', 'regulatory', 'other')),
                source_id TEXT NOT NULL,
                title TEXT,
                url TEXT,
                added_by TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (discussion_id) REFERENCES discussions(id) ON DELETE CASCADE,
                FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
                FOREIGN KEY (added_by) REFERENCES users(id)
            )
        `);

        // DECISIONS
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

        // ACTIVITY LOG
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

        // NOTIFICATIONS
        await this.run(`
            CREATE TABLE IF NOT EXISTS notifications (
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

        console.log('✅ Database schema initialized');
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

    // ===== USER METHODS =====
    async createUser(userData) {
        const userId = `user_${uuidv4()}`;
        const initials = this.getInitials(userData.name);
        
        await this.run(`
            INSERT INTO users (id, email, name, organization, role, avatar_color, avatar_initials)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            userId,
            userData.email.toLowerCase().trim(),
            userData.name.trim(),
            userData.organization || 'Not specified',
            userData.role || 'clinician',
            userData.avatar_color || '#1A5F7A',
            initials
        ]);
        
        return this.getUser(userId);
    }

    async getUser(userId) {
        return this.get('SELECT * FROM users WHERE id = ?', [userId]);
    }

    async findUserByEmail(email) {
        return this.get('SELECT * FROM users WHERE email = ?', [email.toLowerCase().trim()]);
    }

    async searchUsers(query, excludeUserId = null) {
        let sql = `
            SELECT id, name, email, organization, role, avatar_color, avatar_initials
            FROM users 
            WHERE (name LIKE ? OR email LIKE ? OR organization LIKE ?)
            AND is_active = 1
        `;
        const params = [`%${query}%`, `%${query}%`, `%${query}%`];
        
        if (excludeUserId) {
            sql += ' AND id != ?';
            params.push(excludeUserId);
        }
        
        sql += ' LIMIT 20';
        return this.all(sql, params);
    }

    async updateUser(userId, updates) {
        const allowedFields = ['name', 'organization', 'specialty', 'avatar_color'];
        const setClause = [];
        const values = [];
        
        for (const [key, value] of Object.entries(updates)) {
            if (allowedFields.includes(key) && value !== undefined) {
                setClause.push(`${key} = ?`);
                values.push(value);
            }
        }
        
        if (setClause.length === 0) return this.getUser(userId);
        
        setClause.push('updated_at = CURRENT_TIMESTAMP');
        values.push(userId);
        
        await this.run(`UPDATE users SET ${setClause.join(', ')} WHERE id = ?`, values);
        return this.getUser(userId);
    }

    // ===== SESSION METHODS =====
    async createSession(userId, token, expiresInHours = 24) {
        const sessionId = `sess_${uuidv4()}`;
        const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
        
        await this.run(`
            INSERT INTO user_sessions (id, user_id, token, expires_at)
            VALUES (?, ?, ?, ?)
        `, [sessionId, userId, token, expiresAt.toISOString()]);
        
        return this.getSessionByToken(token);
    }

    async getSessionByToken(token) {
        const session = await this.get('SELECT * FROM user_sessions WHERE token = ?', [token]);
        if (!session) return null;
        
        // Check expiration
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

    // ===== PROJECT METHODS =====
    async createProject(projectData, userId) {
        const projectId = `project_${uuidv4()}`;
        const user = await this.getUser(userId);
        if (!user) throw new Error('User not found');
        
        const objectives = projectData.objectives ? 
            JSON.stringify(projectData.objectives) : 
            '{"clinical":[],"industry":[],"shared":[]}';
        
        await this.run(`
            INSERT INTO projects (
                id, title, description, type, lead_id, 
                objectives, methodology, cover_color
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            projectId,
            projectData.title.trim(),
            projectData.description.trim(),
            projectData.type || 'clinical',
            userId,
            objectives,
            projectData.methodology || '',
            projectData.cover_color || '#1A5F7A'
        ]);
        
        // Add creator as lead team member
        await this.addTeamMember(projectId, userId, 'lead', user.organization);
        
        await this.logActivity(projectId, userId, 'project_created', `Created project: ${projectData.title}`);
        return this.getProject(projectId);
    }

    async getProject(projectId) {
        const project = await this.get(`
            SELECT p.*, u.name as lead_name, u.email as lead_email
            FROM projects p
            JOIN users u ON p.lead_id = u.id
            WHERE p.id = ? AND p.is_archived = 0
        `, [projectId]);
        
        if (!project) return null;
        
        try {
            project.objectives = JSON.parse(project.objectives);
        } catch {
            project.objectives = { clinical: [], industry: [], shared: [] };
        }
        
        return project;
    }

    async updateProject(projectId, updates) {
        const allowedFields = ['title', 'description', 'type', 'status', 'methodology', 'cover_color'];
        const setClause = [];
        const values = [];
        
        for (const [key, value] of Object.entries(updates)) {
            if (allowedFields.includes(key) && value !== undefined) {
                if (key === 'objectives') {
                    setClause.push(`${key} = ?`);
                    values.push(JSON.stringify(value));
                } else {
                    setClause.push(`${key} = ?`);
                    values.push(value);
                }
            }
        }
        
        if (setClause.length === 0) return this.getProject(projectId);
        
        setClause.push('updated_at = CURRENT_TIMESTAMP');
        values.push(projectId);
        
        await this.run(`UPDATE projects SET ${setClause.join(', ')} WHERE id = ?`, values);
        
        if (updates.title) {
            await this.logActivity(projectId, 'system', 'project_updated', `Updated project: ${updates.title}`);
        }
        
        return this.getProject(projectId);
    }

    async updateProjectObjectives(projectId, objectives) {
        const objectivesStr = JSON.stringify(objectives);
        await this.run(
            'UPDATE projects SET objectives = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [objectivesStr, projectId]
        );
        
        await this.logActivity(projectId, 'system', 'objectives_updated', 'Updated project objectives');
        return this.getProject(projectId);
    }

    async archiveProject(projectId) {
        await this.run(
            'UPDATE projects SET is_archived = 1, status = "archived", updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [projectId]
        );
        
        await this.logActivity(projectId, 'system', 'project_archived', 'Archived project');
        return this.getProject(projectId);
    }

    async getProjectsForUser(userId) {
        const projects = await this.all(`
            SELECT p.*, pt.role as user_role
            FROM projects p
            JOIN project_team pt ON p.id = pt.project_id
            WHERE pt.user_id = ? AND p.is_archived = 0
            ORDER BY p.last_activity_at DESC
        `, [userId]);
        
        return projects.map(p => {
            try {
                p.objectives = JSON.parse(p.objectives);
            } catch {
                p.objectives = { clinical: [], industry: [], shared: [] };
            }
            return p;
        });
    }

    async searchProjects(userId, query) {
        return this.all(`
            SELECT DISTINCT p.*, pt.role as user_role
            FROM projects p
            JOIN project_team pt ON p.id = pt.project_id
            WHERE pt.user_id = ? 
            AND p.is_archived = 0
            AND (p.title LIKE ? OR p.description LIKE ?)
            ORDER BY p.last_activity_at DESC
        `, [userId, `%${query}%`, `%${query}%`]);
    }

    // ===== TEAM METHODS =====
    async addTeamMember(projectId, userId, role, organization = null) {
        const teamId = `team_${uuidv4()}`;
        
        await this.run(`
            INSERT INTO project_team (id, project_id, user_id, role, organization)
            VALUES (?, ?, ?, ?, ?)
        `, [teamId, projectId, userId, role, organization]);
        
        await this.run(
            'UPDATE projects SET team_count = team_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [projectId]
        );
        
        const user = await this.getUser(userId);
        await this.logActivity(projectId, userId, 'team_member_added', 
            `Added ${user.name} to team as ${role}`);
        
        return { id: teamId, project_id: projectId, user_id: userId, role };
    }

    async getProjectTeam(projectId) {
        return this.all(`
            SELECT pt.*, u.name, u.email, u.role as user_role, 
                   u.avatar_color, u.avatar_initials
            FROM project_team pt
            JOIN users u ON pt.user_id = u.id
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
        await this.run(
            'DELETE FROM project_team WHERE project_id = ? AND user_id = ?',
            [projectId, userId]
        );
        
        await this.run(
            'UPDATE projects SET team_count = team_count - 1 WHERE id = ?',
            [projectId]
        );
        
        await this.logActivity(projectId, 'system', 'team_member_removed', 'Removed team member');
        return true;
    }

    async isUserInProject(projectId, userId) {
        const result = await this.get(
            'SELECT 1 FROM project_team WHERE project_id = ? AND user_id = ?',
            [projectId, userId]
        );
        return !!result;
    }

    // ===== DISCUSSION METHODS =====
    async createDiscussion(discussionData) {
        const discussionId = `disc_${uuidv4()}`;
        
        await this.run(`
            INSERT INTO discussions (id, project_id, title, content, type, author_id)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [
            discussionId,
            discussionData.projectId,
            discussionData.title.trim(),
            discussionData.content.trim(),
            discussionData.type,
            discussionData.authorId
        ]);
        
        await this.run(
            'UPDATE projects SET discussion_count = discussion_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [discussionData.projectId]
        );
        
        if (discussionData.evidenceLinks && discussionData.evidenceLinks.length > 0) {
            for (const evidence of discussionData.evidenceLinks) {
                await this.addEvidence({
                    discussionId,
                    evidenceType: evidence.type || 'other',
                    sourceId: evidence.sourceId || evidence.url,
                    title: evidence.title,
                    url: evidence.url,
                    addedBy: discussionData.authorId
                });
            }
            await this.updateDiscussionEvidenceCount(discussionId);
        }
        
        await this.logActivity(discussionData.projectId, discussionData.authorId,
            'discussion_created', `Started discussion: ${discussionData.title}`);
        
        return this.getDiscussion(discussionId);
    }

    async getDiscussion(discussionId) {
        const discussion = await this.get(`
            SELECT d.*, u.name as author_name, u.role as author_role, 
                   u.organization as author_organization
            FROM discussions d
            JOIN users u ON d.author_id = u.id
            WHERE d.id = ?
        `, [discussionId]);
        
        if (discussion) {
            discussion.evidence = await this.getDiscussionEvidence(discussionId);
            discussion.consensus = await this.calculateConsensus(discussionId);
        }
        
        return discussion;
    }

    async getProjectDiscussions(projectId, options = {}) {
        let sql = `
            SELECT d.*, u.name as author_name, u.role as author_role, 
                   u.organization as author_organization
            FROM discussions d
            JOIN users u ON d.author_id = u.id
            WHERE d.project_id = ?
        `;
        
        const params = [projectId];
        
        if (options.type) {
            sql += ' AND d.type = ?';
            params.push(options.type);
        }
        
        if (options.search) {
            sql += ' AND (d.title LIKE ? OR d.content LIKE ?)';
            params.push(`%${options.search}%`, `%${options.search}%`);
        }
        
        sql += ' ORDER BY d.created_at DESC';
        
        if (options.limit) {
            sql += ' LIMIT ?';
            params.push(options.limit);
        }
        
        const discussions = await this.all(sql, params);
        
        for (const discussion of discussions) {
            discussion.evidence = await this.getDiscussionEvidence(discussion.id);
            discussion.consensus = await this.calculateConsensus(discussion.id);
        }
        
        return discussions;
    }

    async updateDiscussion(discussionId, updates) {
        const allowedFields = ['title', 'content'];
        const setClause = [];
        const values = [];
        
        for (const [key, value] of Object.entries(updates)) {
            if (allowedFields.includes(key) && value !== undefined) {
                setClause.push(`${key} = ?`);
                values.push(value);
            }
        }
        
        if (setClause.length === 0) return this.getDiscussion(discussionId);
        
        setClause.push('updated_at = CURRENT_TIMESTAMP');
        values.push(discussionId);
        
        await this.run(`UPDATE discussions SET ${setClause.join(', ')} WHERE id = ?`, values);
        return this.getDiscussion(discussionId);
    }

    // ===== VOTING METHODS =====
    async addDiscussionVote(discussionId, userId, voteType, userRole) {
        const voteId = `vote_${uuidv4()}`;
        
        try {
            await this.run(`
                INSERT INTO discussion_votes (id, discussion_id, user_id, vote_type, user_role)
                VALUES (?, ?, ?, ?, ?)
            `, [voteId, discussionId, userId, voteType, userRole]);
        } catch (error) {
            if (error.message.includes('UNIQUE constraint failed')) {
                await this.run(
                    'DELETE FROM discussion_votes WHERE discussion_id = ? AND user_id = ?',
                    [discussionId, userId]
                );
                return this.addDiscussionVote(discussionId, userId, voteType, userRole);
            }
            throw error;
        }
        
        const voteColumn = this.getVoteColumnName(voteType);
        if (voteColumn) {
            await this.run(`UPDATE discussions SET ${voteColumn} = ${voteColumn} + 1 WHERE id = ?`, [discussionId]);
        }
        
        return { id: voteId, discussion_id: discussionId, user_id: userId, vote_type: voteType };
    }

    async calculateConsensus(discussionId) {
        const discussion = await this.getDiscussion(discussionId);
        if (!discussion) return null;
        
        const team = await this.getProjectTeam(discussion.project_id);
        const clinicalTeam = team.filter(m => m.role === 'clinician');
        const industryTeam = team.filter(m => m.role === 'industry');
        
        const votes = await this.all('SELECT * FROM discussion_votes WHERE discussion_id = ?', [discussionId]);
        
        const clinicalVotes = votes.filter(v => v.user_role === 'clinician');
        const industryVotes = votes.filter(v => v.user_role === 'industry');
        
        const clinicalAgrees = clinicalVotes.filter(v => v.vote_type === 'clinical_agree').length;
        const clinicalAgreement = clinicalTeam.length > 0 
            ? Math.round((clinicalAgrees / clinicalTeam.length) * 100) 
            : 0;
        
        const technicalFeasible = industryVotes.filter(v => v.vote_type === 'technical_feasible').length;
        const technicalFeasibility = industryTeam.length > 0
            ? Math.round((technicalFeasible / industryTeam.length) * 100)
            : 0;
        
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

    // ===== EVIDENCE METHODS =====
    async addEvidence(evidenceData) {
        const evidenceId = `ev_${uuidv4()}`;
        
        let url = evidenceData.url;
        if (!url && evidenceData.evidenceType === 'pubmed' && evidenceData.sourceId) {
            url = `https://pubmed.ncbi.nlm.nih.gov/${evidenceData.sourceId}/`;
        }
        
        await this.run(`
            INSERT INTO evidence_links (id, discussion_id, comment_id, evidence_type, source_id, title, url, added_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            evidenceId,
            evidenceData.discussionId || null,
            evidenceData.commentId || null,
            evidenceData.evidenceType,
            evidenceData.sourceId,
            evidenceData.title,
            url,
            evidenceData.addedBy
        ]);
        
        if (evidenceData.discussionId) {
            await this.updateDiscussionEvidenceCount(evidenceData.discussionId);
        }
        
        return this.get('SELECT * FROM evidence_links WHERE id = ?', [evidenceId]);
    }

    async getDiscussionEvidence(discussionId) {
        return this.all('SELECT * FROM evidence_links WHERE discussion_id = ? ORDER BY created_at DESC', [discussionId]);
    }

    async updateDiscussionEvidenceCount(discussionId) {
        const count = await this.get('SELECT COUNT(*) as count FROM evidence_links WHERE discussion_id = ?', [discussionId]);
        await this.run('UPDATE discussions SET evidence_count = ? WHERE id = ?', [count.count, discussionId]);
        return count.count;
    }

    // ===== COMMENT METHODS =====
    async createComment(commentData) {
        const commentId = `comment_${uuidv4()}`;
        
        await this.run(`
            INSERT INTO comments (id, discussion_id, project_id, content, author_id)
            VALUES (?, ?, ?, ?, ?)
        `, [
            commentId,
            commentData.discussionId,
            commentData.projectId,
            commentData.content.trim(),
            commentData.authorId
        ]);
        
        await this.run('UPDATE discussions SET comment_count = comment_count + 1 WHERE id = ?', [commentData.discussionId]);
        await this.run('UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [commentData.projectId]);
        
        await this.logActivity(commentData.projectId, commentData.authorId, 'comment_added', 'Added a comment');
        return this.get('SELECT * FROM comments WHERE id = ?', [commentId]);
    }

    async getDiscussionComments(discussionId) {
        return this.all(`
            SELECT c.*, u.name as author_name, u.role as author_role, u.organization as author_organization
            FROM comments c
            JOIN users u ON c.author_id = u.id
            WHERE c.discussion_id = ?
            ORDER BY c.created_at ASC
        `, [discussionId]);
    }

    // ===== DECISION METHODS =====
    async createDecision(decisionData) {
        const decisionId = `dec_${uuidv4()}`;
        
        await this.run(`
            INSERT INTO decisions (id, discussion_id, project_id, title, description, decision_type, consensus_data, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            decisionId,
            decisionData.discussionId,
            decisionData.projectId,
            decisionData.title.trim(),
            decisionData.description.trim(),
            decisionData.decisionType || 'joint',
            JSON.stringify(decisionData.consensusData || {}),
            decisionData.createdBy
        ]);
        
        await this.run('UPDATE projects SET decision_count = decision_count + 1 WHERE id = ?', [decisionData.projectId]);
        await this.run('UPDATE discussions SET consensus_status = "decided" WHERE id = ?', [decisionData.discussionId]);
        
        await this.logActivity(decisionData.projectId, decisionData.createdBy, 'decision_reached', 
            `Decision reached: ${decisionData.title}`);
        
        return this.get('SELECT * FROM decisions WHERE id = ?', [decisionId]);
    }

    async getProjectDecisions(projectId) {
        return this.all('SELECT * FROM decisions WHERE project_id = ? ORDER BY created_at DESC', [projectId]);
    }

    async updateDecision(decisionId, updates) {
        const allowedFields = ['status', 'priority', 'impact_score'];
        const setClause = [];
        const values = [];
        
        for (const [key, value] of Object.entries(updates)) {
            if (allowedFields.includes(key) && value !== undefined) {
                setClause.push(`${key} = ?`);
                values.push(value);
            }
        }
        
        if (setClause.length === 0) return this.get('SELECT * FROM decisions WHERE id = ?', [decisionId]);
        
        setClause.push('updated_at = CURRENT_TIMESTAMP');
        if (updates.status === 'implemented') {
            setClause.push('implemented_at = CURRENT_TIMESTAMP');
        }
        values.push(decisionId);
        
        await this.run(`UPDATE decisions SET ${setClause.join(', ')} WHERE id = ?`, values);
        return this.get('SELECT * FROM decisions WHERE id = ?', [decisionId]);
    }

    // ===== ACTIVITY & NOTIFICATION METHODS =====
    async logActivity(projectId, userId, activityType, description, metadata = {}) {
        const activityId = `act_${uuidv4()}`;
        
        await this.run(`
            INSERT INTO activity_log (id, project_id, user_id, activity_type, description, metadata)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [activityId, projectId, userId, activityType, description, JSON.stringify(metadata)]);
        
        return activityId;
    }

    async getRecentActivity(userId, limit = 20) {
        return this.all(`
            SELECT al.*, p.title as project_title, u.name as user_name, u.avatar_color
            FROM activity_log al
            LEFT JOIN projects p ON al.project_id = p.id
            LEFT JOIN users u ON al.user_id = u.id
            WHERE al.user_id = ? OR al.project_id IN (
                SELECT project_id FROM project_team WHERE user_id = ?
            )
            ORDER BY al.created_at DESC
            LIMIT ?
        `, [userId, userId, limit]);
    }

    async createNotification(notificationData) {
        const notificationId = `notif_${uuidv4()}`;
        
        await this.run(`
            INSERT INTO notifications (id, user_id, type, title, message, metadata)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [
            notificationId,
            notificationData.userId,
            notificationData.type,
            notificationData.title,
            notificationData.message || '',
            JSON.stringify(notificationData.metadata || {})
        ]);
        
        return this.get('SELECT * FROM notifications WHERE id = ?', [notificationId]);
    }

    async getUserNotifications(userId, unreadOnly = false) {
        let sql = 'SELECT * FROM notifications WHERE user_id = ?';
        const params = [userId];
        
        if (unreadOnly) {
            sql += ' AND read = 0';
        }
        
        sql += ' ORDER BY created_at DESC LIMIT 50';
        return this.all(sql, params);
    }

    async markNotificationRead(notificationId) {
        await this.run('UPDATE notifications SET read = 1 WHERE id = ?', [notificationId]);
        return true;
    }

    async markAllNotificationsRead(userId) {
        await this.run('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0', [userId]);
        return true;
    }

    // ===== DASHBOARD METHODS =====
    async getDashboardData(userId) {
        const projects = await this.getProjectsForUser(userId);
        const recentActivity = await this.getRecentActivity(userId, 10);
        const notifications = await this.getUserNotifications(userId, true);
        
        let clinicalActivity = 0;
        let industryActivity = 0;
        let crossPollination = 0;
        
        for (const project of projects) {
            const discussions = await this.getProjectDiscussions(project.id);
            clinicalActivity += discussions.filter(d => d.type === 'clinical_question').length;
            industryActivity += discussions.filter(d => d.type === 'technical_solution').length;
            
            for (const discussion of discussions) {
                const consensus = await this.calculateConsensus(discussion.id);
                if (consensus.clinicalVotes > 0 && consensus.industryVotes > 0) {
                    crossPollination++;
                }
            }
        }
        
        return {
            metrics: {
                clinicalActivity,
                industryActivity,
                crossPollination,
                projectCount: projects.length,
                unreadNotifications: notifications.length
            },
            activeProjects: projects.slice(0, 6),
            recentActivity,
            notifications: notifications.slice(0, 5)
        };
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

    getInitials(name) {
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
        } catch {
            return false;
        }
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
