const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

class ThoraxLabDatabase {
    constructor() {
        this.db = null;
        this.connected = false;
        
        // Create data directory
        const dataDir = path.join(__dirname, 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        
        this.DB_PATH = path.join(dataDir, 'thoraxlab.db');
    }

    async connect() {
        if (this.connected) return this.db;
        
        console.log('🔌 Connecting to SQLite database...');
        
        try {
            this.db = await open({
                filename: this.DB_PATH,
                driver: sqlite3.Database
            });
            
            await this.initializeSchema();
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

    async initializeSchema() {
        const db = await this.getDB();
        
        // Enable database features
        await db.exec('PRAGMA journal_mode = WAL');
        await db.exec('PRAGMA foreign_keys = ON');
        await db.exec('PRAGMA busy_timeout = 5000');
        
        // ===== CORE TABLES =====
        
        // Users table
        await db.exec(`
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
                preferences TEXT DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                metadata TEXT DEFAULT '{}'
            )
        `);

        // Organizations table
        await db.exec(`
            CREATE TABLE IF NOT EXISTS organizations (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                type TEXT NOT NULL, -- 'hospital', 'pharma', 'academic', 'startup'
                description TEXT,
                logo_color TEXT DEFAULT '#6D5ACF',
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
                status TEXT NOT NULL DEFAULT 'planning',
                
                -- Lead information
                lead_id TEXT NOT NULL,
                lead_name TEXT NOT NULL,
                lead_email TEXT NOT NULL,
                
                -- Project details
                objectives TEXT DEFAULT '[]',
                methodology TEXT,
                
                -- Timeline
                start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                estimated_duration TEXT,
                progress INTEGER DEFAULT 0,
                
                -- Metrics
                consensus_score INTEGER DEFAULT 0,
                engagement_score INTEGER DEFAULT 0,
                discussion_count INTEGER DEFAULT 0,
                comment_count INTEGER DEFAULT 0,
                decision_velocity REAL DEFAULT 0,
                
                -- Settings
                is_public BOOLEAN DEFAULT 0,
                allow_comments BOOLEAN DEFAULT 1,
                allow_voting BOOLEAN DEFAULT 1,
                
                -- Timestamps
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                
                FOREIGN KEY (lead_id) REFERENCES users(id)
            )
        `);

        // Project team members
        await db.exec(`
            CREATE TABLE IF NOT EXISTS project_team (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'contributor',
                organization_id TEXT,
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (organization_id) REFERENCES organizations(id),
                UNIQUE(project_id, user_id)
            )
        `);

        // Discussions
        await db.exec(`
            CREATE TABLE IF NOT EXISTS discussions (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                type TEXT NOT NULL DEFAULT 'clinical',
                
                -- Author info
                author_id TEXT NOT NULL,
                author_name TEXT NOT NULL,
                author_role TEXT NOT NULL,
                author_organization TEXT,
                
                -- Discussion metadata
                tags TEXT DEFAULT '[]',
                
                -- Metrics
                upvote_count INTEGER DEFAULT 0,
                downvote_count INTEGER DEFAULT 0,
                comment_count INTEGER DEFAULT 0,
                consensus_score INTEGER DEFAULT 0,
                evidence_count INTEGER DEFAULT 0,
                
                -- Timestamps
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (author_id) REFERENCES users(id)
            )
        `);

        // Comments
        await db.exec(`
            CREATE TABLE IF NOT EXISTS comments (
                id TEXT PRIMARY KEY,
                discussion_id TEXT NOT NULL,
                project_id TEXT NOT NULL,
                content TEXT NOT NULL,
                
                -- Author info
                author_id TEXT NOT NULL,
                author_name TEXT NOT NULL,
                author_role TEXT NOT NULL,
                author_organization TEXT,
                
                -- Comment type
                comment_type TEXT DEFAULT 'general', -- 'evidence', 'solution', 'question', 'clarification'
                
                -- Evidence links
                evidence_links TEXT DEFAULT '[]',
                
                -- Timestamps
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                
                FOREIGN KEY (discussion_id) REFERENCES discussions(id) ON DELETE CASCADE,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (author_id) REFERENCES users(id)
            )
        `);

        // Decisions
        await db.exec(`
            CREATE TABLE IF NOT EXISTS decisions (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'open',
                
                -- Decision details
                decision_type TEXT NOT NULL, -- 'clinical', 'technical', 'joint'
                required_votes INTEGER DEFAULT 1,
                
                -- Metrics
                vote_count INTEGER DEFAULT 0,
                progress INTEGER DEFAULT 0,
                
                -- Timestamps
                deadline TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            )
        `);

        // Votes
        await db.exec(`
            CREATE TABLE IF NOT EXISTS votes (
                id TEXT PRIMARY KEY,
                discussion_id TEXT,
                decision_id TEXT,
                user_id TEXT NOT NULL,
                vote_type TEXT NOT NULL, -- 'upvote', 'downvote', 'support', 'oppose'
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                
                FOREIGN KEY (discussion_id) REFERENCES discussions(id) ON DELETE CASCADE,
                FOREIGN KEY (decision_id) REFERENCES decisions(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE(discussion_id, user_id),
                UNIQUE(decision_id, user_id, vote_type)
            )
        `);

        // Knowledge items
        await db.exec(`
            CREATE TABLE IF NOT EXISTS knowledge_items (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                content TEXT NOT NULL,
                source_type TEXT NOT NULL, -- 'clinical', 'industry', 'joint'
                
                -- Author info
                author_id TEXT NOT NULL,
                author_name TEXT NOT NULL,
                author_organization TEXT,
                
                -- Metadata
                evidence_level TEXT, -- 'case_study', 'rct', 'meta_analysis'
                references TEXT DEFAULT '[]',
                
                -- Timestamps
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (author_id) REFERENCES users(id)
            )
        `);

        // Activity log
        await db.exec(`
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

        // ===== INDEXES =====
        await db.exec(`
            CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
            CREATE INDEX IF NOT EXISTS idx_users_organization ON users(organization);
            
            CREATE INDEX IF NOT EXISTS idx_projects_lead ON projects(lead_id);
            CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
            CREATE INDEX IF NOT EXISTS idx_projects_created ON projects(created_at DESC);
            
            CREATE INDEX IF NOT EXISTS idx_project_team_project ON project_team(project_id);
            CREATE INDEX IF NOT EXISTS idx_project_team_user ON project_team(user_id);
            
            CREATE INDEX IF NOT EXISTS idx_discussions_project ON discussions(project_id);
            CREATE INDEX IF NOT EXISTS idx_discussions_author ON discussions(author_id);
            CREATE INDEX IF NOT EXISTS idx_discussions_created ON discussions(created_at DESC);
            
            CREATE INDEX IF NOT EXISTS idx_comments_discussion ON comments(discussion_id);
            CREATE INDEX IF NOT EXISTS idx_comments_author ON comments(author_id);
            CREATE INDEX IF NOT EXISTS idx_comments_project ON comments(project_id);
            
            CREATE INDEX IF NOT EXISTS idx_decisions_project ON decisions(project_id);
            CREATE INDEX IF NOT EXISTS idx_decisions_status ON decisions(status);
            
            CREATE INDEX IF NOT EXISTS idx_votes_user ON votes(user_id);
            CREATE INDEX IF NOT EXISTS idx_votes_discussion ON votes(discussion_id);
            CREATE INDEX IF NOT EXISTS idx_votes_decision ON votes(decision_id);
            
            CREATE INDEX IF NOT EXISTS idx_activity_project ON activity_log(project_id);
            CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_log(user_id);
            CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at DESC);
        `);

        console.log('✅ Database schema initialized');
        
        // Initialize with default data if empty
        await this.initializeDefaultData();
    }

    async initializeDefaultData() {
        const db = await this.getDB();
        
        // Check if we have any users
        const userCount = await db.get('SELECT COUNT(*) as count FROM users');
        if (userCount.count > 0) {
            return; // Data already exists
        }
        
        console.log('📝 Initializing default data...');
        
        // Create admin user
        const adminId = 'admin';
        await db.run(`
            INSERT OR IGNORE INTO users (id, email, name, organization, role, is_admin, avatar_color)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [adminId, 'admin@thoraxlab.org', 'Platform Administrator', 'ThoraxLab', 'admin', 1, '#1A5F7A']);
        
        // Create sample organizations
        const organizations = [
            ['org_hospital', 'Massachusetts General Hospital', 'hospital', '#3B82F6'],
            ['org_pharma', 'Pfizer Digital Health', 'pharma', '#8B5CF6'],
            ['org_academic', 'Stanford Medical School', 'academic', '#10B981'],
            ['org_startup', 'MedTech Innovations', 'startup', '#F59E0B']
        ];
        
        for (const org of organizations) {
            await db.run(`
                INSERT OR IGNORE INTO organizations (id, name, type, logo_color)
                VALUES (?, ?, ?, ?)
            `, org);
        }
        
        console.log('✅ Default data initialized');
    }

    // ===== USER METHODS =====
    
    async createUser(userData) {
        const db = await this.getDB();
        const userId = `user_${uuidv4()}`;
        const now = new Date().toISOString();
        
        const avatarColors = ['#1A5F7A', '#0D8B70', '#6D5ACF', '#F59E0B'];
        const randomColor = avatarColors[Math.floor(Math.random() * avatarColors.length)];
        
        await db.run(`
            INSERT INTO users (
                id, email, name, organization, role, specialty,
                avatar_color, is_admin, created_at, last_activity
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            userId,
            userData.email.trim().toLowerCase(),
            userData.name.trim(),
            userData.organization || 'Medical Center',
            userData.role || 'clinician',
            userData.specialty || 'pulmonology',
            randomColor,
            userData.email === 'admin@thoraxlab.org' ? 1 : 0,
            now,
            now
        ]);
        
        // Log activity
        await this.logActivity(null, userId, 'user_registered', 'User registered on platform');
        
        return this.getUser(userId);
    }
    
    async getUser(userId) {
        const db = await this.getDB();
        
        const user = await db.get(`
            SELECT 
                id, email, name, organization, role, specialty,
                avatar_color, impact_score, is_admin, status,
                created_at, last_activity
            FROM users 
            WHERE id = ?
        `, [userId]);
        
        return user || null;
    }
    
    async findUserByEmail(email) {
        const db = await this.getDB();
        
        const user = await db.get(`
            SELECT * FROM users WHERE email = ?
        `, [email.trim().toLowerCase()]);
        
        return user || null;
    }
    
    async updateUserActivity(userId) {
        const db = await this.getDB();
        
        await db.run(`
            UPDATE users 
            SET last_activity = CURRENT_TIMESTAMP,
                status = 'online'
            WHERE id = ?
        `, [userId]);
        
        return true;
    }
    
    // ===== PROJECT METHODS =====
    
    async createProject(projectData, userId) {
        const db = await this.getDB();
        const projectId = `project_${uuidv4()}`;
        const now = new Date().toISOString();
        
        // Get user info
        const user = await this.getUser(userId);
        if (!user) throw new Error('User not found');
        
        await db.run(`
            INSERT INTO projects (
                id, title, description, type, status,
                lead_id, lead_name, lead_email,
                objectives, methodology,
                start_date, estimated_duration, progress,
                created_at, updated_at, last_activity_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            projectData.methodology || '',
            now,
            projectData.estimatedDuration || '6 months',
            0,
            now,
            now,
            now
        ]);
        
        // Add creator to team
        await this.addTeamMember(projectId, userId, 'lead', user.organization);
        
        // Log activity
        await this.logActivity(projectId, userId, 'project_created', `Created project: ${projectData.title}`);
        
        return this.getProject(projectId);
    }
    
    async getProject(projectId) {
        const db = await this.getDB();
        
        const project = await db.get(`
            SELECT 
                p.*,
                (SELECT COUNT(*) FROM project_team WHERE project_id = p.id) as team_count,
                (SELECT COUNT(*) FROM discussions WHERE project_id = p.id) as discussion_count,
                (SELECT COUNT(*) FROM comments WHERE project_id = p.id) as comment_count,
                (SELECT COUNT(*) FROM decisions WHERE project_id = p.id) as decision_count
            FROM projects p
            WHERE p.id = ?
        `, [projectId]);
        
        if (!project) return null;
        
        // Parse JSON fields
        if (project.objectives) {
            project.objectives = JSON.parse(project.objectives);
        }
        
        return project;
    }
    
    async getAllProjects() {
        const db = await this.getDB();
        
        const projects = await db.all(`
            SELECT 
                p.*,
                u.name as lead_name,
                u.avatar_color as lead_avatar_color,
                (SELECT COUNT(*) FROM project_team WHERE project_id = p.id) as team_count,
                (SELECT COUNT(*) FROM discussions WHERE project_id = p.id) as discussion_count
            FROM projects p
            LEFT JOIN users u ON p.lead_id = u.id
            WHERE p.status = 'active'
            ORDER BY p.last_activity_at DESC
            LIMIT 100
        `);
        
        // Parse JSON fields
        return projects.map(p => {
            if (p.objectives) {
                p.objectives = JSON.parse(p.objectives);
            }
            return p;
        });
    }
    
    async getProjectsForUser(userId) {
        const db = await this.getDB();
        
        const projects = await db.all(`
            SELECT 
                p.*,
                pt.role as user_role,
                u.name as lead_name,
                (SELECT COUNT(*) FROM project_team WHERE project_id = p.id) as team_count
            FROM projects p
            JOIN project_team pt ON p.id = pt.project_id
            LEFT JOIN users u ON p.lead_id = u.id
            WHERE pt.user_id = ? AND p.status = 'active'
            ORDER BY p.last_activity_at DESC
        `, [userId]);
        
        // Parse JSON fields
        return projects.map(p => {
            if (p.objectives) {
                p.objectives = JSON.parse(p.objectives);
            }
            return p;
        });
    }
    
    async updateProject(projectId, updates) {
        const db = await this.getDB();
        
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
        
        await db.run(`
            UPDATE projects 
            SET ${setClause.join(', ')}
            WHERE id = ?
        `, values);
        
        return this.getProject(projectId);
    }
    
    // ===== TEAM METHODS =====
    
    async addTeamMember(projectId, userId, role = 'contributor', organization = null) {
        const db = await this.getDB();
        const teamId = `team_${uuidv4()}`;
        
        await db.run(`
            INSERT INTO project_team (id, project_id, user_id, role, organization_id)
            VALUES (?, ?, ?, ?, ?)
        `, [teamId, projectId, userId, role, organization]);
        
        // Update project metrics
        await db.run(`
            UPDATE projects 
            SET updated_at = CURRENT_TIMESTAMP,
                last_activity_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [projectId]);
        
        // Log activity
        const user = await this.getUser(userId);
        await this.logActivity(projectId, userId, 'team_member_added', 
            `${user?.name || 'User'} joined the project as ${role}`);
        
        return { id: teamId, project_id: projectId, user_id: userId, role, organization_id: organization };
    }
    
    async getProjectTeam(projectId) {
        const db = await this.getDB();
        
        const team = await db.all(`
            SELECT 
                pt.*,
                u.name,
                u.email,
                u.role as user_role,
                u.avatar_color,
                u.specialty,
                u.impact_score,
                o.name as organization_name,
                o.type as organization_type,
                o.logo_color as organization_color
            FROM project_team pt
            LEFT JOIN users u ON pt.user_id = u.id
            LEFT JOIN organizations o ON pt.organization_id = o.id
            WHERE pt.project_id = ?
            ORDER BY pt.joined_at
        `, [projectId]);
        
        return team;
    }
    
    // ===== DISCUSSION METHODS =====
    
    async createDiscussion(discussionData) {
        const db = await this.getDB();
        const discussionId = `disc_${uuidv4()}`;
        const now = new Date().toISOString();
        
        await db.run(`
            INSERT INTO discussions (
                id, project_id, title, content, type,
                author_id, author_name, author_role, author_organization,
                tags, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        
        // Update project metrics
        await db.run(`
            UPDATE projects 
            SET discussion_count = discussion_count + 1,
                updated_at = CURRENT_TIMESTAMP,
                last_activity_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [discussionData.projectId]);
        
        // Log activity
        await this.logActivity(discussionData.projectId, discussionData.author.id, 
            'discussion_created', `New discussion: ${discussionData.title}`);
        
        return this.getDiscussion(discussionId);
    }
    
    async getDiscussion(discussionId) {
        const db = await this.getDB();
        
        const discussion = await db.get(`
            SELECT * FROM discussions WHERE id = ?
        `, [discussionId]);
        
        if (!discussion) return null;
        
        // Parse JSON fields
        if (discussion.tags) {
            discussion.tags = JSON.parse(discussion.tags);
        }
        
        return discussion;
    }
    
    async getProjectDiscussions(projectId) {
        const db = await this.getDB();
        
        const discussions = await db.all(`
            SELECT * FROM discussions 
            WHERE project_id = ?
            ORDER BY created_at DESC
            LIMIT 100
        `, [projectId]);
        
        // Parse JSON fields
        return discussions.map(d => {
            if (d.tags) {
                d.tags = JSON.parse(d.tags);
            }
            return d;
        });
    }
    
    // ===== COMMENT METHODS =====
    
    async createComment(commentData) {
        const db = await this.getDB();
        const commentId = `comment_${uuidv4()}`;
        const now = new Date().toISOString();
        
        await db.run(`
            INSERT INTO comments (
                id, discussion_id, project_id, content,
                author_id, author_name, author_role, author_organization,
                comment_type, evidence_links, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        
        // Update discussion metrics
        await db.run(`
            UPDATE discussions 
            SET comment_count = comment_count + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [commentData.discussionId]);
        
        // Update project metrics
        await db.run(`
            UPDATE projects 
            SET comment_count = comment_count + 1,
                updated_at = CURRENT_TIMESTAMP,
                last_activity_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [commentData.projectId]);
        
        // Log activity
        await this.logActivity(commentData.projectId, commentData.author.id, 
            'comment_added', 'Added a comment to discussion');
        
        return this.getComment(commentId);
    }
    
    async getComment(commentId) {
        const db = await this.getDB();
        
        const comment = await db.get(`
            SELECT * FROM comments WHERE id = ?
        `, [commentId]);
        
        if (!comment) return null;
        
        // Parse JSON fields
        if (comment.evidence_links) {
            comment.evidence_links = JSON.parse(comment.evidence_links);
        }
        
        return comment;
    }
    
    async getDiscussionComments(discussionId) {
        const db = await this.getDB();
        
        const comments = await db.all(`
            SELECT * FROM comments 
            WHERE discussion_id = ?
            ORDER BY created_at ASC
        `, [discussionId]);
        
        // Parse JSON fields
        return comments.map(c => {
            if (c.evidence_links) {
                c.evidence_links = JSON.parse(c.evidence_links);
            }
            return c;
        });
    }
    
    // ===== ANALYTICS METHODS =====
    
    async getPlatformStats() {
        const db = await this.getDB();
        
        const stats = await db.get(`
            SELECT 
                COUNT(DISTINCT p.id) as total_projects,
                COUNT(DISTINCT CASE WHEN p.status = 'active' THEN p.id END) as active_projects,
                COUNT(DISTINCT u.id) as total_users,
                COUNT(DISTINCT CASE WHEN u.status = 'online' THEN u.id END) as online_users,
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
        const db = await this.getDB();
        
        // Get user info
        const user = await this.getUser(userId);
        if (!user) return null;
        
        // Get user's projects
        const projects = await this.getProjectsForUser(userId);
        
        // Calculate user-specific metrics
        const metrics = await db.get(`
            SELECT 
                COUNT(DISTINCT c.id) as clinical_activity,
                COUNT(DISTINCT d.id) as industry_activity,
                COUNT(DISTINCT v.id) as total_votes,
                COUNT(DISTINCT dec.id) as pending_decisions
            FROM users u
            LEFT JOIN comments c ON u.id = c.author_id AND c.comment_type IN ('clinical', 'evidence')
            LEFT JOIN discussions d ON u.id = d.author_id AND d.type IN ('technical', 'industry')
            LEFT JOIN votes v ON u.id = v.user_id
            LEFT JOIN decisions dec ON dec.status = 'open'
            WHERE u.id = ?
        `, [userId]);
        
        // Get recent activity
        const recentActivity = await db.all(`
            SELECT 
                al.*,
                p.title as project_title
            FROM activity_log al
            LEFT JOIN projects p ON al.project_id = p.id
            WHERE al.user_id = ? OR al.project_id IN (
                SELECT project_id FROM project_team WHERE user_id = ?
            )
            ORDER BY al.created_at DESC
            LIMIT 20
        `, [userId, userId]);
        
        // Parse JSON fields in activity
        const parsedActivity = recentActivity.map(a => {
            if (a.metadata) {
                a.metadata = JSON.parse(a.metadata);
            }
            return a;
        });
        
        return {
            user: {
                id: user.id,
                name: user.name,
                organization: user.organization,
                role: user.role,
                projectCount: projects.length,
                impactScore: user.impact_score
            },
            metrics: {
                clinicalActivity: metrics.clinical_activity || 0,
                industryActivity: metrics.industry_activity || 0,
                crossPollination: Math.round(((metrics.clinical_activity || 0) + (metrics.industry_activity || 0)) / 2),
                totalVotes: metrics.total_votes || 0,
                pendingDecisions: metrics.pending_decisions || 0,
                decisionVelocity: 3.2 // Example
            },
            activeProjects: projects.slice(0, 5),
            recentActivity: parsedActivity,
            platformStats: await this.getPlatformStats()
        };
    }
    
    async getRecentActivity(userId) {
        const db = await this.getDB();
        
        const activity = await db.all(`
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
        
        // Parse JSON fields
        return activity.map(a => {
            if (a.metadata) {
                a.metadata = JSON.parse(a.metadata);
            }
            return a;
        });
    }
    
    // ===== ACTIVITY LOGGING =====
    
    async logActivity(projectId, userId, activityType, description, metadata = {}) {
        const db = await this.getDB();
        const activityId = `act_${uuidv4()}`;
        
        await db.run(`
            INSERT INTO activity_log (id, project_id, user_id, activity_type, description, metadata)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [activityId, projectId, userId, activityType, description, JSON.stringify(metadata)]);
        
        return activityId;
    }
    
    // ===== UTILITY METHODS =====
    
    async checkConnection() {
        try {
            const db = await this.getDB();
            await db.get('SELECT 1');
            return true;
        } catch (error) {
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

// Export for use in server.js
module.exports = { ThoraxLabDatabase, database };

// For direct testing
if (require.main === module) {
    (async () => {
        await database.connect();
        console.log('Database test completed');
        await database.close();
    })();
}
