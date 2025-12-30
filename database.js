const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

class ThoraxLabDatabase {
    constructor() {
        this.db = null;
        this.DB_PATH = path.join(__dirname, 'thoraxlab.db');
        this.connected = false;
    }

    async connect() {
        if (this.connected) return this.db;
        
        console.log('🚀 Connecting to ThoraxLab database...');
        
        try {
            this.db = await open({
                filename: this.DB_PATH,
                driver: sqlite3.Database,
                mode: sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE
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

    async checkConnection() {
        try {
            if (!this.db) await this.connect();
            await this.db.get('SELECT 1');
            return true;
        } catch (error) {
            return false;
        }
    }

    async initialize() {
        // Enable database optimizations
        await this.db.exec('PRAGMA journal_mode = WAL');
        await this.db.exec('PRAGMA foreign_keys = ON');
        await this.db.exec('PRAGMA busy_timeout = 10000');
        await this.db.exec('PRAGMA synchronous = NORMAL');
        
        // ===== SCHEMA DEFINITION =====
        
        // Users table
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                role TEXT CHECK(role IN ('clinician', 'industry', 'public', 'admin')) DEFAULT 'clinician',
                avatar_color TEXT DEFAULT '#0C7C59',
                institution TEXT,
                specialty TEXT,
                status TEXT CHECK(status IN ('online', 'away', 'offline')) DEFAULT 'offline',
                last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                metadata TEXT DEFAULT '{}'
            );
        `);

        // Projects table
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                type TEXT CHECK(type IN ('clinical', 'industry', 'collaborative')) DEFAULT 'clinical',
                status TEXT CHECK(status IN ('active', 'planning', 'review', 'completed', 'archived')) DEFAULT 'active',
                phase TEXT CHECK(phase IN ('discovery', 'design', 'development', 'testing', 'deployment')) DEFAULT 'discovery',
                created_by TEXT NOT NULL,
                
                -- Engagement metrics
                pulse_score INTEGER DEFAULT 50 CHECK(pulse_score >= 0 AND pulse_score <= 100),
                velocity_score INTEGER DEFAULT 50 CHECK(velocity_score >= 0 AND velocity_score <= 100),
                engagement_score INTEGER DEFAULT 50 CHECK(engagement_score >= 0 AND engagement_score <= 100),
                
                -- Counters
                total_interactions INTEGER DEFAULT 0,
                total_comments INTEGER DEFAULT 0,
                total_decisions INTEGER DEFAULT 0,
                total_members INTEGER DEFAULT 1,
                
                -- Timestamps
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                target_date DATE,
                
                -- Metadata
                tags TEXT DEFAULT '[]',
                metadata TEXT DEFAULT '{}',
                
                FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
            );
        `);

        // Project members with roles
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS project_members (
                project_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                role TEXT CHECK(role IN ('owner', 'admin', 'lead', 'contributor', 'viewer')) DEFAULT 'contributor',
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                notifications_enabled BOOLEAN DEFAULT 1,
                
                PRIMARY KEY (project_id, user_id),
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `);

        // Comments with threading support
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS comments (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                parent_id TEXT,
                content TEXT NOT NULL,
                content_html TEXT,
                mentions TEXT DEFAULT '[]',
                
                -- Engagement
                likes INTEGER DEFAULT 0,
                reactions TEXT DEFAULT '{}',
                is_pinned BOOLEAN DEFAULT 0,
                is_edited BOOLEAN DEFAULT 0,
                
                -- Timestamps
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                edited_at TIMESTAMP,
                
                -- Metadata
                metadata TEXT DEFAULT '{}',
                
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE
            );
        `);

        // Comment reactions
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS comment_reactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                comment_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                reaction TEXT CHECK(reaction IN ('like', 'love', 'insightful', 'question', 'celebrate')) DEFAULT 'like',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                
                UNIQUE(comment_id, user_id, reaction),
                FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );
        `);

        // Decisions with voting
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS decisions (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                status TEXT CHECK(status IN ('pending', 'approved', 'rejected', 'deferred', 'implemented')) DEFAULT 'pending',
                priority TEXT CHECK(priority IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
                
                -- Voting
                votes_required INTEGER DEFAULT 1,
                votes_approve INTEGER DEFAULT 0,
                votes_reject INTEGER DEFAULT 0,
                votes_abstain INTEGER DEFAULT 0,
                
                -- Ownership
                created_by TEXT NOT NULL,
                assigned_to TEXT,
                resolved_by TEXT,
                
                -- Timestamps
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                deadline DATE,
                resolved_at TIMESTAMP,
                
                -- Metadata
                metadata TEXT DEFAULT '{}',
                
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (created_by) REFERENCES users(id),
                FOREIGN KEY (assigned_to) REFERENCES users(id),
                FOREIGN KEY (resolved_by) REFERENCES users(id)
            );
        `);

        // Decision votes
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS decision_votes (
                decision_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                vote TEXT CHECK(vote IN ('approve', 'reject', 'abstain')) NOT NULL,
                comment TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                
                PRIMARY KEY (decision_id, user_id),
                FOREIGN KEY (decision_id) REFERENCES decisions(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );
        `);

        // Activity timeline
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS timeline_events (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                user_id TEXT,
                event_type TEXT CHECK(event_type IN (
                    'project_created', 'project_updated', 'project_archived',
                    'member_joined', 'member_left', 'member_role_changed',
                    'comment_added', 'comment_edited', 'comment_deleted',
                    'decision_created', 'decision_updated', 'decision_resolved',
                    'milestone_reached', 'file_uploaded', 'meeting_scheduled',
                    'status_changed', 'phase_changed'
                )) NOT NULL,
                description TEXT NOT NULL,
                icon TEXT,
                color TEXT,
                
                -- Reference to related entity
                entity_type TEXT,
                entity_id TEXT,
                
                -- Metadata
                metadata TEXT DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );
        `);

        // Analytics interactions
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS interactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                session_id TEXT,
                
                -- Interaction details
                action TEXT CHECK(action IN (
                    'view', 'click', 'hover', 'scroll',
                    'comment_create', 'comment_edit', 'comment_delete',
                    'comment_like', 'comment_reply',
                    'decision_create', 'decision_vote', 'decision_resolve',
                    'project_create', 'project_join', 'project_leave',
                    'file_upload', 'file_download',
                    'meeting_schedule', 'meeting_join'
                )) NOT NULL,
                
                -- Target entity
                entity_type TEXT,
                entity_id TEXT,
                
                -- Context
                duration_ms INTEGER,
                page_url TEXT,
                user_agent TEXT,
                
                -- Metadata
                metadata TEXT DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );
        `);

        // Platform metrics
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS platform_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                metric_date DATE NOT NULL,
                
                -- Usage metrics
                active_projects INTEGER DEFAULT 0,
                active_users INTEGER DEFAULT 0,
                total_interactions INTEGER DEFAULT 0,
                total_comments INTEGER DEFAULT 0,
                total_decisions INTEGER DEFAULT 0,
                
                -- Performance metrics
                avg_pulse_score DECIMAL(5,2) DEFAULT 50.00,
                avg_velocity_score DECIMAL(5,2) DEFAULT 50.00,
                avg_engagement_score DECIMAL(5,2) DEFAULT 50.00,
                
                -- User distribution
                clinicians_count INTEGER DEFAULT 0,
                industry_count INTEGER DEFAULT 0,
                public_count INTEGER DEFAULT 0,
                
                -- Growth metrics
                new_projects_today INTEGER DEFAULT 0,
                new_users_today INTEGER DEFAULT 0,
                
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                
                UNIQUE(metric_date)
            );
        `);

        // Create indexes for performance
        await this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_projects_status_updated ON projects(status, updated_at);
            CREATE INDEX IF NOT EXISTS idx_projects_pulse ON projects(pulse_score DESC);
            CREATE INDEX IF NOT EXISTS idx_projects_last_activity ON projects(last_activity_at DESC);
            
            CREATE INDEX IF NOT EXISTS idx_comments_project_created ON comments(project_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_comments_user ON comments(user_id, created_at DESC);
            
            CREATE INDEX IF NOT EXISTS idx_decisions_project_status ON decisions(project_id, status, priority DESC);
            CREATE INDEX IF NOT EXISTS idx_decisions_deadline ON decisions(deadline) WHERE deadline IS NOT NULL AND status = 'pending';
            
            CREATE INDEX IF NOT EXISTS idx_timeline_project_created ON timeline_events(project_id, created_at DESC);
            
            CREATE INDEX IF NOT EXISTS idx_interactions_project_user ON interactions(project_id, user_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_interactions_created_at ON interactions(created_at DESC);
            
            CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members(project_id);
            CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id);
            
            CREATE INDEX IF NOT EXISTS idx_users_status_last_active ON users(status, last_active DESC);
            CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
        `);

        // Create default admin user if not exists
        const adminExists = await this.db.get(
            "SELECT id FROM users WHERE email = 'admin@thoraxlab.local'"
        );
        
        if (!adminExists) {
            const adminId = uuidv4();
            await this.db.run(
                `INSERT INTO users (id, email, name, role, avatar_color, institution, specialty, status) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [adminId, 'admin@thoraxlab.local', 'ThoraxLab Admin', 'admin', '#1A365D', 
                 'ThoraxLab Platform', 'Platform Administration', 'online']
            );
            console.log('👑 Created default admin user');
        }

        // Check for sample data
        const projectCount = await this.db.get('SELECT COUNT(*) as count FROM projects');
        if (projectCount.count === 0) {
            await this.createSampleData();
        }

        // Initialize today's platform metrics
        await this.updatePlatformMetrics();
        
        console.log('✅ Database schema initialized successfully');
    }

    async createSampleData() {
        console.log('📝 Creating sample data for demonstration...');
        
        try {
            // Create sample users
            const sampleUsers = [
                {
                    id: uuidv4(),
                    email: 'dr.chen@hospital.edu',
                    name: 'Dr. Sarah Chen',
                    role: 'clinician',
                    avatar_color: '#0C7C59',
                    institution: 'University Medical Center',
                    specialty: 'Pulmonology & Critical Care'
                },
                {
                    id: uuidv4(),
                    email: 'm.wang@medtech.com',
                    name: 'Michael Wang',
                    role: 'industry',
                    avatar_color: '#D35400',
                    institution: 'MedTech Solutions Inc.',
                    specialty: 'AI & Machine Learning'
                },
                {
                    id: uuidv4(),
                    email: 'rajesh.kumar@research.org',
                    name: 'Dr. Rajesh Kumar',
                    role: 'clinician',
                    avatar_color: '#7B68EE',
                    institution: 'National Research Institute',
                    specialty: 'Data Science & Analytics'
                },
                {
                    id: uuidv4(),
                    email: 'lisa.williams@patient.org',
                    name: 'Lisa Williams',
                    role: 'public',
                    avatar_color: '#8B5CF6',
                    institution: 'Patient Advocacy Network',
                    specialty: 'Patient Experience & Engagement'
                },
                {
                    id: uuidv4(),
                    email: 'tech.lead@healthtech.com',
                    name: 'Alex Rodriguez',
                    role: 'industry',
                    avatar_color: '#2D9CDB',
                    institution: 'HealthTech Innovations',
                    specialty: 'Product Development'
                },
                {
                    id: uuidv4(),
                    email: 'research.director@institute.edu',
                    name: 'Dr. James Wilson',
                    role: 'clinician',
                    avatar_color: '#27AE60',
                    institution: 'Clinical Research Institute',
                    specialty: 'Clinical Trials Design'
                }
            ];

            for (const user of sampleUsers) {
                await this.db.run(
                    `INSERT INTO users (id, email, name, role, avatar_color, institution, specialty, status, last_active) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-${Math.floor(Math.random() * 24)} hours'))`,
                    [user.id, user.email, user.name, user.role, user.avatar_color, 
                     user.institution, user.specialty, Math.random() > 0.3 ? 'online' : 'away']
                );
            }

            // Create sample projects
            const sampleProjects = [
                {
                    id: `proj_${uuidv4()}`,
                    title: 'AI-Powered COPD Early Detection',
                    description: 'Developing machine learning algorithms to detect Chronic Obstructive Pulmonary Disease (COPD) patterns from routine chest X-rays 6-12 months earlier than current diagnostic methods. Collaboration between leading pulmonologists and AI specialists.',
                    type: 'clinical',
                    phase: 'development',
                    created_by: sampleUsers[0].id,
                    pulse_score: 87,
                    velocity_score: 85,
                    engagement_score: 89,
                    tags: JSON.stringify(['AI', 'COPD', 'Medical Imaging', 'Early Detection'])
                },
                {
                    id: `proj_${uuidv4()}`,
                    title: 'Smart Inhaler with Adherence Tracking',
                    description: 'IoT-enabled inhaler device with real-time adherence monitoring and clinical dashboard integration. Includes patient reminders and healthcare provider alerts.',
                    type: 'industry',
                    phase: 'testing',
                    created_by: sampleUsers[1].id,
                    pulse_score: 76,
                    velocity_score: 72,
                    engagement_score: 81,
                    tags: JSON.stringify(['IoT', 'Adherence', 'Remote Monitoring', 'Medical Devices'])
                },
                {
                    id: `proj_${uuidv4()}`,
                    title: 'Remote Pulmonary Rehabilitation Platform',
                    description: 'Digital platform for remote pulmonary rehabilitation with exercise tracking, symptom monitoring, and virtual therapist sessions. Aimed at improving access to care.',
                    type: 'collaborative',
                    phase: 'design',
                    created_by: sampleUsers[2].id,
                    pulse_score: 92,
                    velocity_score: 88,
                    engagement_score: 94,
                    tags: JSON.stringify(['Telehealth', 'Rehabilitation', 'Remote Care', 'Digital Health'])
                }
            ];

            for (const project of sampleProjects) {
                await this.db.run(
                    `INSERT INTO projects (
                        id, title, description, type, phase, created_by, 
                        pulse_score, velocity_score, engagement_score,
                        total_interactions, total_comments, total_decisions, total_members,
                        created_at, updated_at, last_activity_at, tags
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-${Math.floor(Math.random() * 30)} days'), 
                    datetime('now', '-${Math.floor(Math.random() * 7)} days'), datetime('now', '-${Math.floor(Math.random() * 2)} days'), ?)`,
                    [project.id, project.title, project.description, project.type, project.phase, project.created_by,
                     project.pulse_score, project.velocity_score, project.engagement_score,
                     Math.floor(Math.random() * 200) + 50, Math.floor(Math.random() * 50) + 10, 
                     Math.floor(Math.random() * 20) + 5, Math.floor(Math.random() * 8) + 3,
                     project.tags]
                );

                // Add project members (mix of all users)
                const memberCount = Math.min(Math.floor(Math.random() * 6) + 2, sampleUsers.length);
                const shuffledUsers = [...sampleUsers].sort(() => Math.random() - 0.5);
                
                for (let i = 0; i < memberCount; i++) {
                    const role = i === 0 ? 'owner' : 
                                i === 1 ? 'admin' : 
                                i === 2 ? 'lead' : 'contributor';
                    
                    await this.db.run(
                        `INSERT INTO project_members (project_id, user_id, role, joined_at) 
                         VALUES (?, ?, ?, datetime('now', '-${Math.floor(Math.random() * 30)} days'))`,
                        [project.id, shuffledUsers[i].id, role]
                    );
                }
            }

            console.log('✅ Sample data created successfully');
        } catch (error) {
            console.error('Error creating sample data:', error);
        }
    }

    // ===== PLATFORM METRICS =====
    
    async getPlatformStatus() {
        try {
            const now = new Date();
            const today = now.toISOString().split('T')[0];
            
            const metrics = await this.db.get(`
                SELECT 
                    -- Current activity
                    (SELECT COUNT(DISTINCT project_id) FROM interactions 
                     WHERE created_at > datetime('now', '-1 hour')) as active_projects_now,
                    
                    (SELECT COUNT(DISTINCT user_id) FROM users 
                     WHERE status = 'online') as online_users_now,
                    
                    -- Today's stats
                    COALESCE((SELECT SUM(total_interactions) FROM projects), 0) as total_interactions,
                    COALESCE((SELECT COUNT(*) FROM projects WHERE status = 'active'), 0) as active_projects,
                    COALESCE((SELECT COUNT(*) FROM users), 0) as total_users,
                    
                    -- Performance metrics
                    COALESCE((SELECT AVG(pulse_score) FROM projects WHERE status = 'active'), 50) as avg_pulse,
                    COALESCE((SELECT AVG(velocity_score) FROM projects WHERE status = 'active'), 50) as avg_velocity,
                    COALESCE((SELECT AVG(engagement_score) FROM projects WHERE status = 'active'), 50) as avg_engagement,
                    
                    -- Pending work
                    COALESCE((SELECT COUNT(*) FROM decisions WHERE status = 'pending'), 0) as pending_decisions,
                    COALESCE((SELECT COUNT(*) FROM comments 
                     WHERE created_at > datetime('now', '-24 hours')), 0) as comments_today
                    
                FROM platform_metrics 
                WHERE metric_date = ?
                LIMIT 1
            `, [today]);
            
            // Calculate overall platform health score
            const healthScore = Math.round(
                (metrics.avg_pulse * 0.4) + 
                (metrics.avg_velocity * 0.3) + 
                (metrics.avg_engagement * 0.3)
            );
            
            return {
                health_score: healthScore,
                pulse_score: Math.round(metrics.avg_pulse),
                velocity_score: Math.round(metrics.avg_velocity),
                engagement_score: Math.round(metrics.avg_engagement),
                
                active_projects: metrics.active_projects,
                active_projects_now: metrics.active_projects_now || 0,
                online_users: metrics.online_users_now || 0,
                total_users: metrics.total_users,
                
                total_interactions: metrics.total_interactions,
                pending_decisions: metrics.pending_decisions,
                comments_today: metrics.comments_today,
                
                updated_at: now.toISOString(),
                status: this.getStatusLevel(healthScore)
            };
        } catch (error) {
            console.error('Platform metrics error:', error);
            return this.getDefaultMetrics();
        }
    }
    
    getStatusLevel(score) {
        if (score >= 80) return 'excellent';
        if (score >= 60) return 'good';
        if (score >= 40) return 'fair';
        return 'needs_attention';
    }
    
    getDefaultMetrics() {
        return {
            health_score: 75,
            pulse_score: 75,
            velocity_score: 75,
            engagement_score: 75,
            active_projects: 3,
            active_projects_now: 2,
            online_users: 4,
            total_users: 6,
            total_interactions: 450,
            pending_decisions: 8,
            comments_today: 24,
            updated_at: new Date().toISOString(),
            status: 'good'
        };
    }
    
    async updatePlatformMetrics() {
        try {
            const today = new Date().toISOString().split('T')[0];
            
            // Get current metrics
            const metrics = await this.getPlatformStatus();
            
            // Insert or update daily metrics
            await this.db.run(`
                INSERT OR REPLACE INTO platform_metrics (
                    metric_date, active_projects, active_users, total_interactions,
                    avg_pulse_score, avg_velocity_score, avg_engagement_score,
                    clinicians_count, industry_count, public_count,
                    new_projects_today, new_users_today
                ) VALUES (
                    ?, ?, ?, ?, ?, ?, ?, 
                    (SELECT COUNT(*) FROM users WHERE role = 'clinician'),
                    (SELECT COUNT(*) FROM users WHERE role = 'industry'),
                    (SELECT COUNT(*) FROM users WHERE role = 'public'),
                    (SELECT COUNT(*) FROM projects WHERE DATE(created_at) = ?),
                    (SELECT COUNT(*) FROM users WHERE DATE(created_at) = ?)
                )
            `, [
                today,
                metrics.active_projects,
                metrics.online_users,
                metrics.total_interactions,
                metrics.pulse_score,
                metrics.velocity_score,
                metrics.engagement_score,
                today,
                today
            ]);
            
            console.log('📊 Platform metrics updated');
        } catch (error) {
            console.error('Metrics update error:', error);
        }
    }
    
    // ===== PROJECT OPERATIONS =====
    
    async createProject(data) {
        const db = await this.connect();
        const projectId = `proj_${uuidv4()}`;
        const now = new Date().toISOString();
        
        await db.run(
            `INSERT INTO projects (
                id, title, description, type, created_by, 
                created_at, updated_at, last_activity_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [projectId, data.title, data.description, data.type || 'clinical', 
             data.createdBy, now, now, now]
        );
        
        await db.run(
            `INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)`,
            [projectId, data.createdBy, 'owner']
        );
        
        const project = await db.get(`
            SELECT p.*, u.name as creator_name, u.avatar_color as creator_color
            FROM projects p
            LEFT JOIN users u ON p.created_by = u.id
            WHERE p.id = ?
        `, [projectId]);
        
        return project;
    }
    
    async getProject(projectId) {
        const db = await this.connect();
        
        const project = await db.get(`
            SELECT 
                p.*,
                u.name as creator_name,
                u.avatar_color as creator_color,
                (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = p.id) as team_size,
                (SELECT COUNT(*) FROM comments c WHERE c.project_id = p.id) as comment_count,
                (SELECT COUNT(*) FROM decisions d WHERE d.project_id = p.id AND d.status = 'pending') as pending_decisions
            FROM projects p
            LEFT JOIN users u ON p.created_by = u.id
            WHERE p.id = ?
        `, [projectId]);
        
        return project;
    }
    
    async getAllProjects(status = 'active', limit = 50, offset = 0) {
        const db = await this.connect();
        
        const projects = await db.all(`
            SELECT 
                p.*,
                u.name as creator_name,
                u.avatar_color as creator_color,
                COUNT(DISTINCT pm.user_id) as team_size,
                COUNT(DISTINCT c.id) as comment_count,
                COUNT(DISTINCT d.id) as decision_count
            FROM projects p
            LEFT JOIN users u ON p.created_by = u.id
            LEFT JOIN project_members pm ON p.id = pm.project_id
            LEFT JOIN comments c ON p.id = c.project_id
            LEFT JOIN decisions d ON p.id = d.project_id
            WHERE p.status = ?
            GROUP BY p.id
            ORDER BY p.last_activity_at DESC
            LIMIT ? OFFSET ?
        `, [status, parseInt(limit), parseInt(offset)]);
        
        return projects;
    }
    
    async getUserProjects(userId) {
        const db = await this.connect();
        
        return await db.all(`
            SELECT 
                p.*,
                u.name as creator_name,
                u.avatar_color as creator_color,
                pm.role as user_role,
                (SELECT COUNT(*) FROM project_members pm2 WHERE pm2.project_id = p.id) as team_size,
                (SELECT COUNT(*) FROM comments c WHERE c.project_id = p.id) as comment_count,
                (SELECT COUNT(*) FROM decisions d WHERE d.project_id = p.id AND d.status = 'pending') as pending_decisions
            FROM projects p
            LEFT JOIN users u ON p.created_by = u.id
            LEFT JOIN project_members pm ON p.id = pm.project_id AND pm.user_id = ?
            WHERE p.status = 'active' AND pm.user_id = ?
            ORDER BY p.last_activity_at DESC
            LIMIT 50
        `, [userId, userId]);
    }
    
    async updateProject(projectId, updates) {
        const db = await this.connect();
        
        const allowedFields = ['title', 'description', 'type', 'status', 'phase', 'target_date', 'tags'];
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
        
        const member = await db.get(
            'SELECT * FROM project_members WHERE project_id = ? AND user_id = ?',
            [projectId, userId]
        );
        
        return !!member;
    }
    
    async incrementProjectCounter(projectId, field) {
        const db = await this.connect();
        
        await db.run(
            `UPDATE projects SET ${field} = ${field} + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [projectId]
        );
    }
    
    // ===== USER OPERATIONS =====
    
    async createUser(email, name, role = 'clinician') {
        const db = await this.connect();
        const userId = `user_${uuidv4()}`;
        
        const avatarColors = ['#0C7C59', '#D35400', '#7B68EE', '#1A365D', '#8B5CF6', '#2D9CDB', '#27AE60'];
        const randomColor = avatarColors[Math.floor(Math.random() * avatarColors.length)];
        
        await db.run(
            `INSERT INTO users (id, email, name, role, avatar_color, status) 
             VALUES (?, ?, ?, ?, ?, 'online')`,
            [userId, email, name, role, randomColor]
        );
        
        return await this.getUser(userId);
    }
    
    async getUser(userId) {
        const db = await this.connect();
        
        const user = await db.get(
            'SELECT * FROM users WHERE id = ?',
            [userId]
        );
        
        return user;
    }
    
    async getUserByEmail(email) {
        const db = await this.connect();
        
        const user = await db.get(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );
        
        return user;
    }
    
    async getUserProfile(userId) {
        const db = await this.connect();
        
        const user = await db.get(`
            SELECT 
                u.*,
                COUNT(DISTINCT pm.project_id) as project_count,
                COUNT(DISTINCT c.id) as comment_count,
                COUNT(DISTINCT d.id) as decision_count
            FROM users u
            LEFT JOIN project_members pm ON u.id = pm.user_id
            LEFT JOIN comments c ON u.id = c.user_id
            LEFT JOIN decisions d ON u.id = d.created_by
            WHERE u.id = ?
            GROUP BY u.id
        `, [userId]);
        
        return user;
    }
    
    async updateUserStatus(userId, status) {
        const db = await this.connect();
        
        await db.run(
            'UPDATE users SET status = ?, last_active = CURRENT_TIMESTAMP WHERE id = ?',
            [status, userId]
        );
    }
    
    async updateAllUsersStatus(status) {
        const db = await this.connect();
        
        await db.run(
            'UPDATE users SET status = ?',
            [status]
        );
    }
    
    async getOnlineUsers() {
        const db = await this.connect();
        
        return await db.all(`
            SELECT 
                u.id,
                u.name,
                u.role,
                u.avatar_color,
                u.institution,
                u.specialty,
                u.last_active,
                COUNT(DISTINCT pm.project_id) as project_count,
                (SELECT COUNT(*) FROM comments c 
                 WHERE c.user_id = u.id AND c.created_at > datetime('now', '-1 day')) as comments_today
            FROM users u
            LEFT JOIN project_members pm ON u.id = pm.user_id
            WHERE u.status = 'online'
            GROUP BY u.id
            ORDER BY u.last_active DESC
            LIMIT 20
        `);
    }
    
    // ===== COMMENT OPERATIONS =====
    
    async createComment(data) {
        const db = await this.connect();
        const commentId = `comment_${uuidv4()}`;
        const now = new Date().toISOString();
        
        await db.run(
            `INSERT INTO comments (id, project_id, user_id, parent_id, content, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [commentId, data.projectId, data.userId, data.parentId, data.content, now, now]
        );
        
        const comment = await db.get(`
            SELECT 
                c.*,
                u.name as user_name,
                u.role as user_role,
                u.avatar_color,
                0 as likes,
                0 as user_reacted,
                0 as reply_count
            FROM comments c
            LEFT JOIN users u ON c.user_id = u.id
            WHERE c.id = ?
        `, [commentId]);
        
        return comment;
    }
    
    async getComment(commentId) {
        const db = await this.connect();
        
        const comment = await db.get(
            'SELECT * FROM comments WHERE id = ?',
            [commentId]
        );
        
        return comment;
    }
    
    async getProjectComments(projectId, limit = 100, offset = 0, parentId = null, userId = '') {
        const db = await this.connect();
        
        const whereClause = parentId ? 'c.project_id = ? AND c.parent_id = ?' : 'c.project_id = ? AND c.parent_id IS NULL';
        const params = parentId ? [projectId, parentId, parseInt(limit), parseInt(offset), userId] 
                              : [projectId, parseInt(limit), parseInt(offset), userId];
        
        const comments = await db.all(`
            SELECT 
                c.*,
                u.name as user_name,
                u.role as user_role,
                u.avatar_color,
                (SELECT COUNT(*) FROM comment_reactions cr WHERE cr.comment_id = c.id) as likes,
                (SELECT COUNT(*) FROM comment_reactions cr WHERE cr.comment_id = c.id AND cr.user_id = ?) as user_reacted,
                (SELECT COUNT(*) FROM comments child WHERE child.parent_id = c.id) as reply_count
            FROM comments c
            LEFT JOIN users u ON c.user_id = u.id
            WHERE ${whereClause}
            ORDER BY c.is_pinned DESC, c.created_at DESC
            LIMIT ? OFFSET ?
        `, params);
        
        return comments;
    }
    
    async toggleCommentReaction(commentId, userId, reaction = 'like') {
        const db = await this.connect();
        
        const existingReaction = await db.get(
            'SELECT * FROM comment_reactions WHERE comment_id = ? AND user_id = ? AND reaction = ?',
            [commentId, userId, reaction]
        );
        
        if (existingReaction) {
            await db.run(
                'DELETE FROM comment_reactions WHERE comment_id = ? AND user_id = ? AND reaction = ?',
                [commentId, userId, reaction]
            );
            
            await db.run(
                'UPDATE comments SET likes = likes - 1 WHERE id = ?',
                [commentId]
            );
        } else {
            await db.run(
                `INSERT INTO comment_reactions (comment_id, user_id, reaction) VALUES (?, ?, ?)`,
                [commentId, userId, reaction]
            );
            
            await db.run(
                'UPDATE comments SET likes = likes + 1 WHERE id = ?',
                [commentId]
            );
        }
        
        const comment = await db.get(`
            SELECT 
                c.*,
                u.name as user_name,
                u.role as user_role,
                u.avatar_color,
                (SELECT COUNT(*) FROM comment_reactions cr WHERE cr.comment_id = c.id) as likes,
                (SELECT COUNT(*) FROM comment_reactions cr WHERE cr.comment_id = c.id AND cr.user_id = ?) as user_reacted
            FROM comments c
            LEFT JOIN users u ON c.user_id = u.id
            WHERE c.id = ?
        `, [userId, commentId]);
        
        return { comment, action: existingReaction ? 'removed' : 'added' };
    }
    
    // ===== TEAM OPERATIONS =====
    
    async getProjectTeam(projectId) {
        const db = await this.connect();
        
        return await db.all(`
            SELECT 
                u.id,
                u.name,
                u.role,
                u.avatar_color,
                u.institution,
                u.specialty,
                pm.role as project_role,
                pm.joined_at,
                pm.last_active as project_last_active,
                CASE 
                    WHEN u.last_active > datetime('now', '-5 minutes') THEN 'online'
                    WHEN u.last_active > datetime('now', '-30 minutes') THEN 'away'
                    ELSE 'offline'
                END as status,
                (SELECT COUNT(*) FROM comments c WHERE c.user_id = u.id AND c.project_id = ?) as project_comments,
                (SELECT COUNT(*) FROM decisions d WHERE d.created_by = u.id AND d.project_id = ?) as project_decisions
            FROM project_members pm
            LEFT JOIN users u ON pm.user_id = u.id
            WHERE pm.project_id = ?
            ORDER BY 
                CASE pm.role 
                    WHEN 'owner' THEN 1
                    WHEN 'admin' THEN 2
                    WHEN 'lead' THEN 3
                    ELSE 4
                END,
                pm.joined_at
        `, [projectId, projectId, projectId]);
    }
    
    async addProjectMember(projectId, userId, role = 'contributor') {
        const db = await this.connect();
        
        const existingMember = await db.get(
            'SELECT * FROM project_members WHERE project_id = ? AND user_id = ?',
            [projectId, userId]
        );
        
        if (existingMember) {
            throw new Error('Already a member');
        }
        
        await db.run(
            `INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)`,
            [projectId, userId, role]
        );
        
        await db.run(
            `UPDATE projects SET total_members = total_members + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [projectId]
        );
        
        return true;
    }
    
    // ===== TIMELINE OPERATIONS =====
    
    async addTimelineEvent(projectId, eventType, description, userId = null, entityType = null, entityId = null, metadata = {}) {
        const db = await this.connect();
        
        const eventId = uuidv4();
        
        await db.run(
            `INSERT INTO timeline_events (id, project_id, event_type, description, user_id, entity_type, entity_id, metadata) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [eventId, projectId, eventType, description, userId, entityType, entityId, JSON.stringify(metadata)]
        );
        
        return eventId;
    }
    
    async getProjectTimeline(projectId, limit = 50, offset = 0) {
        const db = await this.connect();
        
        return await db.all(`
            SELECT 
                te.*,
                u.name as user_name,
                u.avatar_color,
                p.title as project_title
            FROM timeline_events te
            LEFT JOIN users u ON te.user_id = u.id
            LEFT JOIN projects p ON te.project_id = p.id
            WHERE te.project_id = ?
            ORDER BY te.created_at DESC
            LIMIT ? OFFSET ?
        `, [projectId, parseInt(limit), parseInt(offset)]);
    }
    
    async getRecentActivity(limit = 20) {
        const db = await this.connect();
        
        return await db.all(`
            SELECT 
                te.*,
                u.name as user_name,
                u.avatar_color,
                p.title as project_title
            FROM timeline_events te
            LEFT JOIN users u ON te.user_id = u.id
            LEFT JOIN projects p ON te.project_id = p.id
            WHERE te.created_at > datetime('now', '-7 days')
            ORDER BY te.created_at DESC
            LIMIT ?
        `, [limit]);
    }
    
    // ===== DECISION OPERATIONS =====
    
    async getProjectDecisions(projectId, status = null, limit = 100, offset = 0) {
        const db = await this.connect();
        
        let query = `
            SELECT 
                d.*,
                u.name as creator_name,
                u.avatar_color as creator_color,
                a.name as assigned_to_name,
                (SELECT COUNT(*) FROM decision_votes dv WHERE dv.decision_id = d.id AND dv.vote = 'approve') as approve_count,
                (SELECT COUNT(*) FROM decision_votes dv WHERE dv.decision_id = d.id AND dv.vote = 'reject') as reject_count,
                (SELECT COUNT(*) FROM decision_votes dv WHERE dv.decision_id = d.id AND dv.vote = 'abstain') as abstain_count
            FROM decisions d
            LEFT JOIN users u ON d.created_by = u.id
            LEFT JOIN users a ON d.assigned_to = a.id
            WHERE d.project_id = ?
        `;
        
        const params = [projectId];
        
        if (status) {
            query += ' AND d.status = ?';
            params.push(status);
        }
        
        query += ' ORDER BY d.priority DESC, d.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));
        
        return await db.all(query, params);
    }
    
    // ===== INTERACTION OPERATIONS =====
    
    async recordInteraction(projectId, userId, action, entityType = null, entityId = null, metadata = {}) {
        try {
            const db = await this.connect();
            
            await db.run(
                `INSERT INTO interactions (project_id, user_id, action, entity_type, entity_id, metadata) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [projectId, userId, action, entityType, entityId, JSON.stringify(metadata)]
            );
            
            // Update project counters
            await db.run(
                `UPDATE projects 
                 SET total_interactions = total_interactions + 1, 
                     updated_at = CURRENT_TIMESTAMP,
                     last_activity_at = CURRENT_TIMESTAMP 
                 WHERE id = ?`,
                [projectId]
            );
            
            // Update user last active
            await db.run(
                `UPDATE users SET last_active = CURRENT_TIMESTAMP, status = 'online' WHERE id = ?`,
                [userId]
            );
            
            return true;
        } catch (error) {
            console.error('Interaction recording error:', error);
            return false;
        }
    }
    
    // ===== MAINTENANCE =====
    
    async performMaintenance() {
        try {
            const db = await this.connect();
            
            console.log('🔧 Performing database maintenance...');
            
            // Update user statuses
            await db.run(`
                UPDATE users SET status = 
                    CASE 
                        WHEN last_active > datetime('now', '-5 minutes') THEN 'online'
                        WHEN last_active > datetime('now', '-30 minutes') THEN 'away'
                        ELSE 'offline'
                    END
            `);
            
            // Update platform metrics
            await this.updatePlatformMetrics();
            
            // Clean up old interactions (keep 90 days)
            await db.run(
                `DELETE FROM interactions WHERE created_at < datetime('now', '-90 days')`
            );
            
            console.log('✅ Database maintenance completed');
            
        } catch (error) {
            console.error('Maintenance error:', error);
        }
    }
    
    async close() {
        if (this.db) {
            // Update all online users to away before closing
            await this.db.run(
                `UPDATE users SET status = 'away' WHERE status = 'online'`
            );
            
            await this.db.close();
            this.db = null;
            this.connected = false;
            console.log('🔌 Database connection closed');
        }
    }
}

// Create singleton instance
const database = new ThoraxLabDatabase();

// Export both the class and instance
module.exports = { ThoraxLabDatabase, database };
