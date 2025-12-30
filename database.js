const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

class ThoraxLabDatabase {
    constructor() {
        this.db = null;
        this.DB_PATH = path.join(__dirname, 'thoraxlab.db');
    }

    async connect() {
        if (!this.db) {
            console.log('📊 Connecting to ThoraxLab database...');
            
            this.db = await open({
                filename: this.DB_PATH,
                driver: sqlite3.Database
            });
            
            await this.initialize();
            console.log('✅ Database connected successfully');
        }
        return this.db;
    }

    async initialize() {
        // Enable WAL mode for better performance
        await this.db.exec('PRAGMA journal_mode = WAL');
        await this.db.exec('PRAGMA foreign_keys = ON');
        await this.db.exec('PRAGMA busy_timeout = 5000');
        
        // Users table
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                role TEXT CHECK(role IN ('clinician', 'industry', 'public')) DEFAULT 'clinician',
                avatar_color TEXT DEFAULT '#0C7C59',
                institution TEXT,
                specialty TEXT,
                status TEXT DEFAULT 'offline',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
                status TEXT CHECK(status IN ('active', 'planning', 'review', 'completed')) DEFAULT 'active',
                created_by TEXT NOT NULL,
                pulse_score INTEGER DEFAULT 50,
                velocity INTEGER DEFAULT 50,
                total_interactions INTEGER DEFAULT 0,
                total_comments INTEGER DEFAULT 0,
                total_decisions INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                target_date DATE,
                metadata TEXT DEFAULT '{}',
                FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
            );
        `);

        // Project members
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS project_members (
                project_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                role TEXT CHECK(role IN ('admin', 'lead', 'contributor', 'viewer')) DEFAULT 'contributor',
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
                parent_id TEXT,
                likes INTEGER DEFAULT 0,
                is_public BOOLEAN DEFAULT 1,
                is_edited BOOLEAN DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                metadata TEXT DEFAULT '{}',
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE
            );
        `);

        // Comment reactions
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS comment_reactions (
                comment_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                reaction TEXT CHECK(reaction IN ('like', 'helpful', 'insightful', 'question')) DEFAULT 'like',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (comment_id, user_id, reaction),
                FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );
        `);

        // Decisions
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS decisions (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                status TEXT CHECK(status IN ('pending', 'approved', 'rejected', 'deferred')) DEFAULT 'pending',
                created_by TEXT NOT NULL,
                resolved_by TEXT,
                priority TEXT CHECK(priority IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                resolved_at TIMESTAMP,
                deadline DATE,
                metadata TEXT DEFAULT '{}',
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (created_by) REFERENCES users(id),
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

        // Timeline events
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS timeline_events (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                event_type TEXT CHECK(event_type IN (
                    'project_created', 'project_updated', 'member_joined', 'member_left',
                    'comment_added', 'comment_edited', 'comment_deleted',
                    'decision_created', 'decision_updated', 'decision_resolved',
                    'milestone_achieved', 'file_uploaded', 'meeting_scheduled'
                )) NOT NULL,
                description TEXT NOT NULL,
                user_id TEXT,
                metadata TEXT DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );
        `);

        // Interactions (analytics)
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS interactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                interaction_type TEXT CHECK(interaction_type IN (
                    'view', 'comment', 'comment_like', 'comment_reply',
                    'decision_create', 'decision_vote', 'decision_resolve',
                    'project_join', 'project_leave', 'file_upload', 'meeting_scheduled'
                )) NOT NULL,
                entity_id TEXT,
                entity_type TEXT,
                metadata TEXT DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );
        `);

        // Files
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS files (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                filetype TEXT NOT NULL,
                filesize INTEGER NOT NULL,
                filepath TEXT NOT NULL,
                description TEXT,
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );
        `);

        // Meetings
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS meetings (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                scheduled_by TEXT NOT NULL,
                scheduled_for TIMESTAMP NOT NULL,
                duration_minutes INTEGER DEFAULT 60,
                status TEXT CHECK(status IN ('scheduled', 'in_progress', 'completed', 'cancelled')) DEFAULT 'scheduled',
                meeting_link TEXT,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (scheduled_by) REFERENCES users(id)
            );
        `);

        // Meeting participants
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS meeting_participants (
                meeting_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                status TEXT CHECK(status IN ('invited', 'accepted', 'declined', 'attended', 'absent')) DEFAULT 'invited',
                responded_at TIMESTAMP,
                PRIMARY KEY (meeting_id, user_id),
                FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );
        `);

        // Create indexes for performance
        await this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
            CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at);
            CREATE INDEX IF NOT EXISTS idx_projects_pulse ON projects(pulse_score);
            CREATE INDEX IF NOT EXISTS idx_comments_project ON comments(project_id);
            CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at);
            CREATE INDEX IF NOT EXISTS idx_decisions_project_status ON decisions(project_id, status);
            CREATE INDEX IF NOT EXISTS idx_decisions_priority ON decisions(project_id, priority, status);
            CREATE INDEX IF NOT EXISTS idx_timeline_project ON timeline_events(project_id);
            CREATE INDEX IF NOT EXISTS idx_interactions_project_user ON interactions(project_id, user_id);
            CREATE INDEX IF NOT EXISTS idx_interactions_created_at ON interactions(created_at);
            CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members(project_id);
            CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id);
            CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen);
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
                [adminId, 'admin@thoraxlab.local', 'ThoraxLab Admin', 'clinician', '#1A365D', 'ThoraxLab', 'Platform Administration', 'online']
            );
            console.log('👑 Created default admin user');
        }

        // Create sample data for demonstration (only if tables are empty)
        const projectCount = await this.db.get('SELECT COUNT(*) as count FROM projects');
        if (projectCount.count === 0) {
            await this.createSampleData();
        }
    }

    async createSampleData() {
        console.log('📝 Creating sample data for demonstration...');
        
        const db = this.db;
        
        // Create sample users
        const sampleUsers = [
            {
                id: uuidv4(),
                email: 'dr.chen@hospital.edu',
                name: 'Dr. Sarah Chen',
                role: 'clinician',
                avatar_color: '#0C7C59',
                institution: 'University Medical Center',
                specialty: 'Pulmonology'
            },
            {
                id: uuidv4(),
                email: 'm.wang@medtech.com',
                name: 'Michael Wang',
                role: 'industry',
                avatar_color: '#D35400',
                institution: 'MedTech Solutions',
                specialty: 'AI Engineering'
            },
            {
                id: uuidv4(),
                email: 'rajesh.kumar@research.org',
                name: 'Dr. Rajesh Kumar',
                role: 'clinician',
                avatar_color: '#7B68EE',
                institution: 'Research Institute',
                specialty: 'Data Science'
            },
            {
                id: uuidv4(),
                email: 'lisa.williams@patient.org',
                name: 'Lisa Williams',
                role: 'public',
                avatar_color: '#8B5CF6',
                institution: 'Patient Advocacy Group',
                specialty: 'Patient Experience'
            }
        ];

        for (const user of sampleUsers) {
            await db.run(
                `INSERT INTO users (id, email, name, role, avatar_color, institution, specialty, status, last_seen) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-1 hour'))`,
                [user.id, user.email, user.name, user.role, user.avatar_color, user.institution, user.specialty, 'online']
            );
        }

        // Create sample project
        const projectId = `proj_${uuidv4()}`;
        const now = new Date().toISOString();
        
        await db.run(
            `INSERT INTO projects (id, title, description, type, created_by, pulse_score, velocity, total_interactions, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [projectId, 'AI-Powered COPD Early Detection', 
             'Developing machine learning algorithms to detect Chronic Obstructive Pulmonary Disease (COPD) patterns from routine chest X-rays 6-12 months earlier than current diagnostic methods. Collaboration between clinicians and AI specialists.', 
             'clinical', sampleUsers[0].id, 84, 85, 156, now, now]
        );

        // Add all users as project members
        for (const user of sampleUsers) {
            await db.run(
                `INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)`,
                [projectId, user.id, user.id === sampleUsers[0].id ? 'admin' : 'contributor']
            );
        }

        // Create sample comments
        const sampleComments = [
            {
                id: `comment_${uuidv4()}`,
                project_id: projectId,
                user_id: sampleUsers[0].id,
                content: 'The latest algorithm update shows promising results with 94% accuracy on our test set. False positives reduced by 32% compared to last month.',
                likes: 12
            },
            {
                id: `comment_${uuidv4()}`,
                project_id: projectId,
                user_id: sampleUsers[1].id,
                content: 'Great progress! We should discuss the deployment timeline. Are we targeting Q2 for the pilot implementation?',
                likes: 8
            },
            {
                id: `comment_${uuidv4()}`,
                project_id: projectId,
                user_id: sampleUsers[2].id,
                content: 'I\'ve uploaded the latest dataset with 5,000 additional annotated scans. Model training scheduled for completion by Friday.',
                likes: 15
            }
        ];

        for (const comment of sampleComments) {
            await db.run(
                `INSERT INTO comments (id, project_id, user_id, content, likes, created_at) 
                 VALUES (?, ?, ?, ?, ?, datetime('now', '-${Math.floor(Math.random() * 3)} days'))`,
                [comment.id, comment.project_id, comment.user_id, comment.content, comment.likes]
            );
        }

        // Create sample decisions
        const sampleDecisions = [
            {
                id: `decision_${uuidv4()}`,
                project_id: projectId,
                title: 'Finalize patient inclusion criteria',
                description: 'Need to decide on final inclusion/exclusion criteria for clinical validation study.',
                created_by: sampleUsers[0].id,
                priority: 'high'
            },
            {
                id: `decision_${uuidv4()}`,
                project_id: projectId,
                title: 'Approve prototype development budget',
                description: 'Budget approval required for prototype development phase.',
                created_by: sampleUsers[1].id,
                priority: 'medium'
            }
        ];

        for (const decision of sampleDecisions) {
            await db.run(
                `INSERT INTO decisions (id, project_id, title, description, created_by, priority, created_at) 
                 VALUES (?, ?, ?, ?, ?, ?, datetime('now', '-${Math.floor(Math.random() * 2)} days'))`,
                [decision.id, decision.project_id, decision.title, decision.description, decision.created_by, decision.priority]
            );
        }

        // Create sample timeline events
        const timelineEvents = [
            {
                id: uuidv4(),
                project_id: projectId,
                event_type: 'project_created',
                description: 'Project "AI-Powered COPD Early Detection" created',
                user_id: sampleUsers[0].id
            },
            {
                id: uuidv4(),
                project_id: projectId,
                event_type: 'member_joined',
                description: 'Michael Wang joined the project',
                user_id: sampleUsers[1].id
            },
            {
                id: uuidv4(),
                project_id: projectId,
                event_type: 'comment_added',
                description: 'New discussion started about algorithm accuracy',
                user_id: sampleUsers[0].id
            }
        ];

        for (const event of timelineEvents) {
            await db.run(
                `INSERT INTO timeline_events (id, project_id, event_type, description, user_id, created_at) 
                 VALUES (?, ?, ?, ?, ?, datetime('now', '-${Math.floor(Math.random() * 5)} days'))`,
                [event.id, event.project_id, event.event_type, event.description, event.user_id]
            );
        }

        console.log('✅ Sample data created successfully');
    }

    // Pulse calculation algorithm
    async calculatePulseScore(projectId) {
        try {
            const db = await this.connect();
            
            // Get interaction data from last 7 days
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            
            const stats = await db.get(`
                SELECT 
                    -- Engagement metrics
                    COUNT(DISTINCT i.id) as total_interactions_7d,
                    COUNT(DISTINCT i.user_id) as unique_users_7d,
                    COUNT(DISTINCT c.id) as comments_7d,
                    COUNT(DISTINCT d.id) as decisions_7d,
                    
                    -- Activity recency
                    MAX(i.created_at) as last_interaction_at,
                    
                    -- Diversity metrics
                    COUNT(DISTINCT CASE WHEN u.role = 'clinician' THEN u.id END) as clinicians_7d,
                    COUNT(DISTINCT CASE WHEN u.role = 'industry' THEN u.role END) as industry_7d,
                    
                    -- Progress metrics
                    COUNT(DISTINCT CASE WHEN d.status = 'approved' THEN d.id END) as decisions_resolved_7d
                    
                FROM projects p
                LEFT JOIN interactions i ON p.id = i.project_id 
                    AND i.created_at > datetime(?)
                LEFT JOIN comments c ON p.id = c.project_id 
                    AND c.created_at > datetime(?)
                LEFT JOIN decisions d ON p.id = d.project_id 
                    AND d.created_at > datetime(?)
                LEFT JOIN users u ON i.user_id = u.id
                WHERE p.id = ?
                GROUP BY p.id
            `, [weekAgo.toISOString(), weekAgo.toISOString(), weekAgo.toISOString(), projectId]);
            
            if (!stats) return 50;
            
            let score = 50; // Base score
            
            // Engagement weight: 40%
            const engagementScore = Math.min(
                (stats.total_interactions_7d || 0) * 0.5 +
                (stats.comments_7d || 0) * 2 +
                (stats.decisions_7d || 0) * 3,
                40
            );
            score += engagementScore;
            
            // Diversity weight: 30%
            const diversityScore = Math.min(
                (stats.unique_users_7d || 0) * 4 +
                ((stats.clinicians_7d || 0) > 0 ? 5 : 0) +
                ((stats.industry_7d || 0) > 0 ? 5 : 0),
                30
            );
            score += diversityScore;
            
            // Progress weight: 20%
            const progressScore = Math.min(
                (stats.decisions_resolved_7d || 0) * 5,
                20
            );
            score += progressScore;
            
            // Recency weight: 10%
            if (stats.last_interaction_at) {
                const lastInteraction = new Date(stats.last_interaction_at);
                const hoursSince = (new Date() - lastInteraction) / (1000 * 60 * 60);
                
                if (hoursSince < 1) score += 10;
                else if (hoursSince < 6) score += 8;
                else if (hoursSince < 24) score += 5;
                else if (hoursSince < 72) score += 2;
            }
            
            // Cap between 0-100
            return Math.max(0, Math.min(100, Math.round(score)));
        } catch (error) {
            console.error('Pulse calculation error:', error);
            return 50;
        }
    }

    async recordInteraction(projectId, userId, interactionType, entityId = null, metadata = {}) {
        try {
            const db = await this.connect();
            
            await db.run(
                `INSERT INTO interactions (project_id, user_id, interaction_type, entity_id, metadata) 
                 VALUES (?, ?, ?, ?, ?)`,
                [projectId, userId, interactionType, entityId, JSON.stringify(metadata)]
            );
            
            // Update project interaction count
            await db.run(
                `UPDATE projects 
                 SET total_interactions = total_interactions + 1, 
                     updated_at = CURRENT_TIMESTAMP 
                 WHERE id = ?`,
                [projectId]
            );
            
            // Update user last seen
            await db.run(
                `UPDATE users SET last_seen = CURRENT_TIMESTAMP, status = 'online' WHERE id = ?`,
                [userId]
            );
            
            // Recalculate pulse score
            const newPulse = await this.calculatePulseScore(projectId);
            await db.run(
                `UPDATE projects SET pulse_score = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [newPulse, projectId]
            );
            
            return newPulse;
        } catch (error) {
            console.error('Interaction recording error:', error);
            throw error;
        }
    }

    async addTimelineEvent(projectId, eventType, description, userId = null, metadata = {}) {
        try {
            const db = await this.connect();
            
            await db.run(
                `INSERT INTO timeline_events (id, project_id, event_type, description, user_id, metadata) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [uuidv4(), projectId, eventType, description, userId, JSON.stringify(metadata)]
            );
        } catch (error) {
            console.error('Timeline event error:', error);
        }
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
            ORDER BY p.updated_at DESC
        `, [userId, userId]);
    }

    async getProjectAnalytics(projectId, timeframe = '7d') {
        const db = await this.connect();
        
        let dateFilter;
        switch (timeframe) {
            case '24h': dateFilter = "datetime('now', '-1 day')"; break;
            case '7d': dateFilter = "datetime('now', '-7 days')"; break;
            case '30d': dateFilter = "datetime('now', '-30 days')"; break;
            default: dateFilter = "datetime('now', '-7 days')";
        }
        
        return await db.get(`
            SELECT 
                -- Engagement
                COUNT(DISTINCT i.id) as total_interactions,
                COUNT(DISTINCT i.user_id) as unique_users,
                COUNT(DISTINCT c.id) as comments,
                COUNT(DISTINCT cr.comment_id) as reactions,
                
                -- Decisions
                COUNT(DISTINCT d.id) as total_decisions,
                COUNT(DISTINCT CASE WHEN d.status = 'pending' THEN d.id END) as pending_decisions,
                COUNT(DISTINCT CASE WHEN d.status = 'approved' THEN d.id END) as approved_decisions,
                
                -- Team
                COUNT(DISTINCT pm.user_id) as team_size,
                COUNT(DISTINCT CASE WHEN u.status = 'online' THEN u.id END) as online_now,
                
                -- Timeline
                COUNT(DISTINCT te.id) as timeline_events,
                
                -- Velocity calculation
                ROUND(
                    (COUNT(DISTINCT i.id) * 0.3 + 
                     COUNT(DISTINCT c.id) * 0.4 + 
                     COUNT(DISTINCT CASE WHEN d.status = 'approved' THEN d.id END) * 0.3) / 
                    GREATEST(JULIANDAY('now') - JULIANDAY(MIN(i.created_at)), 1),
                    1
                ) as daily_velocity
                
            FROM projects p
            LEFT JOIN interactions i ON p.id = i.project_id AND i.created_at > ${dateFilter}
            LEFT JOIN comments c ON p.id = c.project_id AND c.created_at > ${dateFilter}
            LEFT JOIN comment_reactions cr ON c.id = cr.comment_id
            LEFT JOIN decisions d ON p.id = d.project_id AND d.created_at > ${dateFilter}
            LEFT JOIN project_members pm ON p.id = pm.project_id
            LEFT JOIN users u ON pm.user_id = u.id
            LEFT JOIN timeline_events te ON p.id = te.project_id AND te.created_at > ${dateFilter}
            WHERE p.id = ?
            GROUP BY p.id
        `, [projectId]);
    }

    async close() {
        if (this.db) {
            await this.db.close();
            this.db = null;
            console.log('🔌 Database connection closed');
        }
    }
}

// Create singleton instance
const database = new ThoraxLabDatabase();

module.exports = database;
