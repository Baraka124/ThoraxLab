const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const rateLimit = require('express-rate-limit');

class ThoraxLabServer {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.wss = new WebSocket.Server({ server: this.server });
        
        // Health check FIRST - always works
        this.app.get('/api/health', (req, res) => {
            res.json({
                status: 'ok',
                timestamp: new Date().toISOString(),
                service: 'thoraxlab-pro',
                uptime: process.uptime()
            });
        });
        
        // Setup database paths
        const DB_DIR = process.env.NODE_ENV === 'production' ? '/tmp' : __dirname;
        this.DB_PATH = path.join(DB_DIR, 'thoraxlab-pro.db');
        this.UPLOAD_PATH = path.join(DB_DIR, 'evidence-uploads');
        
        // Ensure directories exist
        [DB_DIR, this.UPLOAD_PATH].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
        
        this.db = new sqlite3.Database(this.DB_PATH);
        this.activeConnections = new Map();
        
        console.log('🚀 ThoraxLab Pro - Collaboration Platform Initializing...');
        this.initialize();
    }

    // ========== DATABASE HELPERS ==========
    runQuery(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                err ? reject(err) : resolve(this);
            });
        });
    }

    getQuery(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                err ? reject(err) : resolve(row);
            });
        });
    }

    allQuery(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                err ? reject(err) : resolve(rows || []);
            });
        });
    }

    // ========== ENHANCED DATABASE SCHEMA ==========
    async initializeSchema() {
        try {
            await this.runQuery('PRAGMA foreign_keys = ON');
            await this.runQuery('PRAGMA journal_mode = WAL');
            
            const tables = [
                // Users (enhanced for collaboration)
                `CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    email TEXT UNIQUE NOT NULL,
                    name TEXT NOT NULL,
                    organization TEXT,
                    primary_role TEXT, -- clinical, technical, both
                    expertise_tags TEXT DEFAULT '[]',
                    avatar_initials TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`,
                
                // Sessions
                `CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    token TEXT UNIQUE NOT NULL,
                    expires_at DATETIME NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )`,
                
                // Enhanced Projects with clinical/technical context
                `CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    description TEXT NOT NULL,
                    clinical_context TEXT,
                    technical_challenge TEXT,
                    expected_outcomes TEXT,
                    status TEXT DEFAULT 'planning', -- planning, active, completed, paused
                    phase TEXT DEFAULT 'discovery', -- discovery, design, development, validation, deployment
                    lead_clinical_id TEXT,
                    lead_technical_id TEXT,
                    created_by TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (lead_clinical_id) REFERENCES users(id),
                    FOREIGN KEY (lead_technical_id) REFERENCES users(id)
                )`,
                
                // Project Team (collaborators)
                `CREATE TABLE IF NOT EXISTS project_team (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    role TEXT, -- contributor, reviewer, stakeholder
                    perspective TEXT, -- clinical, technical, both
                    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(project_id, user_id),
                    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )`,
                
                // Discussion Threads (core collaboration)
                `CREATE TABLE IF NOT EXISTS threads (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    type TEXT DEFAULT 'discussion', -- discussion, hypothesis, question, decision, insight, progress
                    clinical_context TEXT,
                    technical_context TEXT,
                    bridge_insights TEXT,
                    status TEXT DEFAULT 'active', -- active, resolved, closed
                    hypothesis_score INTEGER DEFAULT 0, -- For hypothesis validation
                    created_by TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
                )`,
                
                // Thread Posts (conversations)
                `CREATE TABLE IF NOT EXISTS posts (
                    id TEXT PRIMARY KEY,
                    thread_id TEXT NOT NULL,
                    content TEXT NOT NULL,
                    perspective TEXT, -- clinical, technical, bridge
                    evidence_refs TEXT DEFAULT '[]', -- JSON array of evidence IDs
                    tags TEXT DEFAULT '[]',
                    created_by TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
                )`,
                
                // Evidence Library (papers, data, protocols)
                `CREATE TABLE IF NOT EXISTS evidence (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    type TEXT, -- paper, dataset, protocol, result, regulation, internal
                    source_type TEXT, -- pubmed, doi, url, arxiv, internal
                    source_id TEXT, -- PMID, DOI, URL, filename
                    clinical_relevance TEXT,
                    technical_utility TEXT,
                    bridge_notes TEXT,
                    tags TEXT DEFAULT '[]',
                    uploaded_file TEXT,
                    created_by TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
                )`,
                
                // Decisions Log (structured decisions)
                `CREATE TABLE IF NOT EXISTS decisions (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    thread_id TEXT, -- Link to discussion thread
                    title TEXT NOT NULL,
                    description TEXT,
                    options TEXT DEFAULT '[]', -- JSON: [{id, text, pros, cons}]
                    chosen_option TEXT,
                    rationale TEXT,
                    clinical_impact TEXT,
                    technical_impact TEXT,
                    evidence_refs TEXT DEFAULT '[]',
                    created_by TEXT NOT NULL,
                    made_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                    FOREIGN KEY (thread_id) REFERENCES threads(id)
                )`,
                
                // Milestones & Timeline
                `CREATE TABLE IF NOT EXISTS milestones (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    type TEXT, -- clinical, technical, regulatory, collaboration, deliverable
                    description TEXT,
                    due_date DATETIME,
                    completed_at DATETIME,
                    clinical_owner TEXT,
                    technical_owner TEXT,
                    status TEXT DEFAULT 'planned', -- planned, in_progress, completed, blocked
                    dependencies TEXT DEFAULT '[]',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
                )`,
                
                // Bridge Terms (enhanced glossary)
                `CREATE TABLE IF NOT EXISTS bridge_terms (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    term TEXT NOT NULL,
                    clinical_definition TEXT,
                    technical_definition TEXT,
                    analogy TEXT,
                    usage_examples TEXT,
                    confidence_score INTEGER DEFAULT 1, -- 1-5 confidence
                    created_by TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(project_id, term),
                    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
                )`,
                
                // Engagement & Impact Tracking
                `CREATE TABLE IF NOT EXISTS engagements (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    target_type TEXT, -- thread, post, evidence, decision
                    target_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    engagement_type TEXT, -- upvote, bookmark, bridge_useful
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(project_id, target_type, target_id, user_id, engagement_type),
                    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
                )`,
                
                // Meeting Minutes & Summaries
                `CREATE TABLE IF NOT EXISTS summaries (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    content TEXT NOT NULL,
                    period_start DATETIME,
                    period_end DATETIME,
                    key_decisions TEXT DEFAULT '[]',
                    new_evidence TEXT DEFAULT '[]',
                    action_items TEXT DEFAULT '[]',
                    created_by TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
                )`
            ];

            for (const sql of tables) {
                await this.runQuery(sql);
            }
            
            // Create indexes for performance
            await this.createIndexes();
            
            console.log('✅ Enhanced database schema ready');
            
        } catch (error) {
            console.error('❌ Schema initialization error:', error.message);
        }
    }

    async createIndexes() {
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status)',
            'CREATE INDEX IF NOT EXISTS idx_threads_project ON threads(project_id)',
            'CREATE INDEX IF NOT EXISTS idx_threads_type ON threads(type)',
            'CREATE INDEX IF NOT EXISTS idx_posts_thread ON posts(thread_id)',
            'CREATE INDEX IF NOT EXISTS idx_evidence_project ON evidence(project_id)',
            'CREATE INDEX IF NOT EXISTS idx_decisions_project ON decisions(project_id)',
            'CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones(project_id)',
            'CREATE INDEX IF NOT EXISTS idx_milestones_status ON milestones(status)',
            'CREATE INDEX IF NOT EXISTS idx_engagements_target ON engagements(target_type, target_id)',
            'CREATE INDEX IF NOT EXISTS idx_bridge_terms_project ON bridge_terms(project_id)'
        ];

        for (const sql of indexes) {
            try {
                await this.runQuery(sql);
            } catch (error) {
                console.error('Index creation error:', error.message);
            }
        }
    }

    // ========== MIDDLEWARE ==========
    setupMiddleware() {
        // Static files
        this.app.use(express.static('public'));
        
        // JSON parsing with increased limits
        this.app.use(express.json({ limit: '50mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));
        
        // CORS
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
            
            if (req.method === 'OPTIONS') {
                return res.status(200).end();
            }
            next();
        });
        
        // Rate limiting
        const limiter = rateLimit({
            windowMs: 15 * 60 * 1000,
            max: 200,
            message: { error: 'Too many requests' }
        });
        
        // Authentication middleware
        this.app.use(async (req, res, next) => {
            const publicRoutes = ['/api/login', '/api/health', '/api/bridge/translate'];
            if (publicRoutes.includes(req.path)) {
                return next();
            }
            
            const token = req.headers.authorization?.replace('Bearer ', '');
            if (!token) {
                return res.status(401).json({ error: 'No token provided' });
            }
            
            const session = await this.getQuery(
                'SELECT * FROM sessions WHERE token = ? AND expires_at > datetime("now")',
                [token]
            );
            
            if (!session) {
                return res.status(401).json({ error: 'Invalid or expired token' });
            }
            
            req.userId = session.user_id;
            next();
        });
    }

    // ========== ENHANCED ROUTES ==========

    // ===== AUTHENTICATION =====
    setupRoutes() {
        // Login (enhanced for collaboration)
        this.app.post('/api/login', async (req, res) => {
            try {
                const { email, name, organization, primary_role, expertise } = req.body;
                
                if (!email || !name) {
                    return res.status(400).json({ error: 'Email and name required' });
                }

                let user = await this.getQuery(
                    'SELECT * FROM users WHERE email = ?',
                    [email.toLowerCase()]
                );

                if (!user) {
                    const userId = `user_${crypto.randomBytes(16).toString('hex')}`;
                    const initials = name.split(' ')
                        .map(n => n[0])
                        .join('')
                        .toUpperCase()
                        .substring(0, 2);

                    const expertiseTags = expertise ? JSON.stringify(expertise.split(',').map(t => t.trim())) : '[]';

                    await this.runQuery(
                        'INSERT INTO users (id, email, name, organization, primary_role, expertise_tags, avatar_initials) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        [userId, email.toLowerCase(), name, organization || '', primary_role || 'clinical', expertiseTags, initials]
                    );

                    user = await this.getQuery('SELECT * FROM users WHERE id = ?', [userId]);
                }

                // Create session (30 days for collaboration)
                const token = crypto.randomBytes(32).toString('hex');
                const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

                await this.runQuery(
                    'INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)',
                    [`sess_${crypto.randomBytes(16).toString('hex')}`, user.id, token, expiresAt.toISOString()]
                );

                // Parse expertise tags from JSON
                const userData = {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    organization: user.organization,
                    primary_role: user.primary_role,
                    expertise_tags: JSON.parse(user.expertise_tags || '[]'),
                    avatar_initials: user.avatar_initials
                };

                res.json({
                    success: true,
                    token,
                    user: userData
                });

            } catch (error) {
                console.error('Login error:', error);
                res.status(500).json({ error: 'Login failed' });
            }
        });

        // ===== PROJECTS =====
        
        // Create enhanced project
        this.app.post('/api/projects', async (req, res) => {
            try {
                const { 
                    title, 
                    description, 
                    clinical_context, 
                    technical_challenge,
                    expected_outcomes,
                    status,
                    phase
                } = req.body;
                
                if (!title) {
                    return res.status(400).json({ error: 'Title is required' });
                }
                
                const projectId = `proj_${crypto.randomBytes(16).toString('hex')}`;

                await this.runQuery(
                    `INSERT INTO projects (
                        id, title, description, clinical_context, technical_challenge,
                        expected_outcomes, status, phase, created_by
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        projectId, 
                        title.trim(), 
                        (description || '').trim(),
                        (clinical_context || '').trim(),
                        (technical_challenge || '').trim(),
                        (expected_outcomes || '').trim(),
                        status || 'planning',
                        phase || 'discovery',
                        req.userId
                    ]
                );

                // Add creator to project team
                await this.runQuery(
                    'INSERT INTO project_team (id, project_id, user_id, role, perspective) VALUES (?, ?, ?, ?, ?)',
                    [`team_${crypto.randomBytes(16).toString('hex')}`, projectId, req.userId, 'lead', 'both']
                );

                // Create initial project summary
                await this.createProjectSummary(projectId, 'Project initialized', req.userId);

                const project = await this.getQuery(
                    'SELECT * FROM projects WHERE id = ?',
                    [projectId]
                );

                res.json({
                    success: true,
                    project
                });

            } catch (error) {
                console.error('Create project error:', error);
                res.status(500).json({ error: 'Failed to create project' });
            }
        });

        // Get project dashboard data
        this.app.get('/api/projects/:id/dashboard', async (req, res) => {
            try {
                const projectId = req.params.id;
                
                // Get project with team
                const project = await this.getQuery(`
                    SELECT p.*, 
                           uc.name as clinical_lead_name,
                           ut.name as technical_lead_name
                    FROM projects p
                    LEFT JOIN users uc ON p.lead_clinical_id = uc.id
                    LEFT JOIN users ut ON p.lead_technical_id = ut.id
                    WHERE p.id = ?
                `, [projectId]);

                if (!project) {
                    return res.status(404).json({ error: 'Project not found' });
                }

                // Get all dashboard data in parallel
                const [
                    threads,
                    evidence,
                    decisions,
                    milestones,
                    bridgeTerms,
                    team,
                    summary
                ] = await Promise.all([
                    this.allQuery(`
                        SELECT t.*, u.name as author_name, u.avatar_initials
                        FROM threads t
                        JOIN users u ON t.created_by = u.id
                        WHERE t.project_id = ?
                        ORDER BY t.updated_at DESC
                        LIMIT 10
                    `, [projectId]),
                    
                    this.allQuery(`
                        SELECT e.*, u.name as author_name
                        FROM evidence e
                        JOIN users u ON e.created_by = u.id
                        WHERE e.project_id = ?
                        ORDER BY e.created_at DESC
                        LIMIT 10
                    `, [projectId]),
                    
                    this.allQuery(`
                        SELECT d.*, u.name as author_name
                        FROM decisions d
                        JOIN users u ON d.created_by = u.id
                        WHERE d.project_id = ?
                        ORDER BY d.made_at DESC
                        LIMIT 5
                    `, [projectId]),
                    
                    this.allQuery(`
                        SELECT m.* 
                        FROM milestones m
                        WHERE m.project_id = ?
                        ORDER BY m.due_date
                        LIMIT 10
                    `, [projectId]),
                    
                    this.allQuery(`
                        SELECT b.*, u.name as author_name
                        FROM bridge_terms b
                        JOIN users u ON b.created_by = u.id
                        WHERE b.project_id = ?
                        ORDER BY b.confidence_score DESC
                        LIMIT 10
                    `, [projectId]),
                    
                    this.allQuery(`
                        SELECT pt.*, u.name, u.email, u.primary_role, u.avatar_initials
                        FROM project_team pt
                        JOIN users u ON pt.user_id = u.id
                        WHERE pt.project_id = ?
                        ORDER BY pt.joined_at
                    `, [projectId]),
                    
                    this.getQuery(`
                        SELECT * FROM summaries 
                        WHERE project_id = ?
                        ORDER BY created_at DESC
                        LIMIT 1
                    `, [projectId])
                ]);

                // Get engagement metrics
                const engagement = await this.getQuery(`
                    SELECT 
                        COUNT(DISTINCT threads.id) as active_threads,
                        COUNT(DISTINCT evidence.id) as evidence_count,
                        COUNT(DISTINCT bridge_terms.id) as bridge_terms_count,
                        COUNT(DISTINCT milestones.id) as milestones_count
                    FROM projects p
                    LEFT JOIN threads ON p.id = threads.project_id AND threads.status = 'active'
                    LEFT JOIN evidence ON p.id = evidence.project_id
                    LEFT JOIN bridge_terms ON p.id = bridge_terms.project_id
                    LEFT JOIN milestones ON p.id = milestones.project_id
                    WHERE p.id = ?
                    GROUP BY p.id
                `, [projectId]);

                // Parse JSON fields
                const parsedThreads = threads.map(t => ({
                    ...t,
                    tags: t.tags ? JSON.parse(t.tags) : []
                }));

                const parsedEvidence = evidence.map(e => ({
                    ...e,
                    tags: e.tags ? JSON.parse(e.tags) : []
                }));

                res.json({
                    success: true,
                    dashboard: {
                        project,
                        threads: parsedThreads,
                        evidence: parsedEvidence,
                        decisions: decisions.map(d => ({
                            ...d,
                            options: d.options ? JSON.parse(d.options) : [],
                            evidence_refs: d.evidence_refs ? JSON.parse(d.evidence_refs) : []
                        })),
                        milestones,
                        bridgeTerms,
                        team,
                        summary,
                        engagement: engagement || {
                            active_threads: 0,
                            evidence_count: 0,
                            bridge_terms_count: 0,
                            milestones_count: 0
                        }
                    }
                });

            } catch (error) {
                console.error('Dashboard error:', error);
                res.status(500).json({ error: 'Failed to load dashboard' });
            }
        });

        // ===== DISCUSSION THREADS =====
        
        // Create thread
        this.app.post('/api/projects/:id/threads', async (req, res) => {
            try {
                const projectId = req.params.id;
                const {
                    title,
                    type,
                    clinical_context,
                    technical_context,
                    bridge_insights,
                    tags
                } = req.body;
                
                if (!title || !type) {
                    return res.status(400).json({ error: 'Title and type are required' });
                }
                
                const threadId = `thread_${crypto.randomBytes(16).toString('hex')}`;
                const tagArray = tags ? JSON.stringify(tags) : '[]';

                await this.runQuery(
                    `INSERT INTO threads (
                        id, project_id, title, type, clinical_context, 
                        technical_context, bridge_insights, tags, created_by
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        threadId,
                        projectId,
                        title.trim(),
                        type,
                        (clinical_context || '').trim(),
                        (technical_context || '').trim(),
                        (bridge_insights || '').trim(),
                        tagArray,
                        req.userId
                    ]
                );

                const thread = await this.getQuery(
                    'SELECT t.*, u.name as author_name, u.avatar_initials FROM threads t JOIN users u ON t.created_by = u.id WHERE t.id = ?',
                    [threadId]
                );

                res.json({
                    success: true,
                    thread: {
                        ...thread,
                        tags: JSON.parse(thread.tags || '[]')
                    }
                });

            } catch (error) {
                console.error('Create thread error:', error);
                res.status(500).json({ error: 'Failed to create thread' });
            }
        });

        // Get thread with posts
        this.app.get('/api/threads/:id', async (req, res) => {
            try {
                const threadId = req.params.id;
                
                const [thread, posts] = await Promise.all([
                    this.getQuery(`
                        SELECT t.*, u.name as author_name, u.avatar_initials, p.title as project_title
                        FROM threads t
                        JOIN users u ON t.created_by = u.id
                        JOIN projects p ON t.project_id = p.id
                        WHERE t.id = ?
                    `, [threadId]),
                    
                    this.allQuery(`
                        SELECT p.*, u.name as author_name, u.avatar_initials, u.primary_role
                        FROM posts p
                        JOIN users u ON p.created_by = u.id
                        WHERE p.thread_id = ?
                        ORDER BY p.created_at
                    `, [threadId])
                ]);

                if (!thread) {
                    return res.status(404).json({ error: 'Thread not found' });
                }

                const parsedPosts = posts.map(p => ({
                    ...p,
                    evidence_refs: p.evidence_refs ? JSON.parse(p.evidence_refs) : [],
                    tags: p.tags ? JSON.parse(p.tags) : []
                }));

                res.json({
                    success: true,
                    thread: {
                        ...thread,
                        tags: thread.tags ? JSON.parse(thread.tags) : []
                    },
                    posts: parsedPosts
                });

            } catch (error) {
                console.error('Get thread error:', error);
                res.status(500).json({ error: 'Failed to load thread' });
            }
        });

        // Add post to thread
        this.app.post('/api/threads/:id/posts', async (req, res) => {
            try {
                const threadId = req.params.id;
                const {
                    content,
                    perspective,
                    evidence_refs,
                    tags
                } = req.body;
                
                if (!content) {
                    return res.status(400).json({ error: 'Content is required' });
                }
                
                const postId = `post_${crypto.randomBytes(16).toString('hex')}`;
                const evidenceArray = evidence_refs ? JSON.stringify(evidence_refs) : '[]';
                const tagArray = tags ? JSON.stringify(tags) : '[]';

                await this.runQuery(
                    `INSERT INTO posts (
                        id, thread_id, content, perspective, evidence_refs, tags, created_by
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        postId,
                        threadId,
                        content.trim(),
                        perspective || 'bridge',
                        evidenceArray,
                        tagArray,
                        req.userId
                    ]
                );

                // Update thread timestamp
                await this.runQuery(
                    'UPDATE threads SET updated_at = datetime("now") WHERE id = ?',
                    [threadId]
                );

                const post = await this.getQuery(
                    'SELECT p.*, u.name as author_name, u.avatar_initials FROM posts p JOIN users u ON p.created_by = u.id WHERE p.id = ?',
                    [postId]
                );

                res.json({
                    success: true,
                    post: {
                        ...post,
                        evidence_refs: JSON.parse(post.evidence_refs || '[]'),
                        tags: JSON.parse(post.tags || '[]')
                    }
                });

            } catch (error) {
                console.error('Create post error:', error);
                res.status(500).json({ error: 'Failed to create post' });
            }
        });

        // ===== EVIDENCE LIBRARY =====
        
        // Add evidence
        this.app.post('/api/projects/:id/evidence', async (req, res) => {
            try {
                const projectId = req.params.id;
                const {
                    title,
                    type,
                    source_type,
                    source_id,
                    clinical_relevance,
                    technical_utility,
                    bridge_notes,
                    tags
                } = req.body;
                
                if (!title || !type) {
                    return res.status(400).json({ error: 'Title and type are required' });
                }
                
                const evidenceId = `evid_${crypto.randomBytes(16).toString('hex')}`;
                const tagArray = tags ? JSON.stringify(tags) : '[]';

                await this.runQuery(
                    `INSERT INTO evidence (
                        id, project_id, title, type, source_type, source_id,
                        clinical_relevance, technical_utility, bridge_notes, tags, created_by
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        evidenceId,
                        projectId,
                        title.trim(),
                        type,
                        source_type || 'internal',
                        (source_id || '').trim(),
                        (clinical_relevance || '').trim(),
                        (technical_utility || '').trim(),
                        (bridge_notes || '').trim(),
                        tagArray,
                        req.userId
                    ]
                );

                const evidence = await this.getQuery(
                    'SELECT e.*, u.name as author_name FROM evidence e JOIN users u ON e.created_by = u.id WHERE e.id = ?',
                    [evidenceId]
                );

                res.json({
                    success: true,
                    evidence: {
                        ...evidence,
                        tags: JSON.parse(evidence.tags || '[]')
                    }
                });

            } catch (error) {
                console.error('Add evidence error:', error);
                res.status(500).json({ error: 'Failed to add evidence' });
            }
        });

        // ===== BRIDGE TRANSLATION =====
        
        // Bridge translation endpoint
        this.app.post('/api/bridge/translate', async (req, res) => {
            try {
                const { term, context, project_id } = req.body;
                
                if (!term) {
                    return res.status(400).json({ error: 'Term is required' });
                }
                
                // Check if term already exists in project glossary
                let existingTerm = null;
                if (project_id) {
                    existingTerm = await this.getQuery(
                        'SELECT * FROM bridge_terms WHERE project_id = ? AND LOWER(term) = LOWER(?)',
                        [project_id, term]
                    );
                }
                
                if (existingTerm) {
                    return res.json({
                        success: true,
                        translation: {
                            term: existingTerm.term,
                            clinical_definition: existingTerm.clinical_definition,
                            technical_definition: existingTerm.technical_definition,
                            analogy: existingTerm.analogy,
                            confidence: existingTerm.confidence_score,
                            existing: true
                        }
                    });
                }
                
                // Generate new translation
                const translation = await this.generateBridgeTranslation(term, context);
                
                res.json({
                    success: true,
                    translation: {
                        ...translation,
                        existing: false
                    }
                });

            } catch (error) {
                console.error('Bridge translation error:', error);
                res.status(500).json({ error: 'Translation failed' });
            }
        });

        // Save bridge term
        this.app.post('/api/projects/:id/bridge-terms', async (req, res) => {
            try {
                const projectId = req.params.id;
                const {
                    term,
                    clinical_definition,
                    technical_definition,
                    analogy,
                    usage_examples,
                    confidence_score
                } = req.body;
                
                if (!term || !clinical_definition || !technical_definition) {
                    return res.status(400).json({ error: 'Term and both definitions are required' });
                }
                
                const termId = `term_${crypto.randomBytes(16).toString('hex')}`;

                await this.runQuery(
                    `INSERT INTO bridge_terms (
                        id, project_id, term, clinical_definition, technical_definition,
                        analogy, usage_examples, confidence_score, created_by
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        termId,
                        projectId,
                        term.trim(),
                        clinical_definition.trim(),
                        technical_definition.trim(),
                        (analogy || '').trim(),
                        (usage_examples || '').trim(),
                        confidence_score || 1,
                        req.userId
                    ]
                );

                res.json({
                    success: true,
                    id: termId
                });

            } catch (error) {
                console.error('Save bridge term error:', error);
                res.status(500).json({ error: 'Failed to save term' });
            }
        });

        // ===== DECISIONS =====
        
        // Log decision
        this.app.post('/api/projects/:id/decisions', async (req, res) => {
            try {
                const projectId = req.params.id;
                const {
                    title,
                    description,
                    options,
                    chosen_option,
                    rationale,
                    clinical_impact,
                    technical_impact,
                    evidence_refs,
                    thread_id
                } = req.body;
                
                if (!title || !chosen_option) {
                    return res.status(400).json({ error: 'Title and chosen option are required' });
                }
                
                const decisionId = `dec_${crypto.randomBytes(16).toString('hex')}`;
                const optionsArray = options ? JSON.stringify(options) : '[]';
                const evidenceArray = evidence_refs ? JSON.stringify(evidence_refs) : '[]';

                await this.runQuery(
                    `INSERT INTO decisions (
                        id, project_id, thread_id, title, description, options,
                        chosen_option, rationale, clinical_impact, technical_impact,
                        evidence_refs, created_by
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        decisionId,
                        projectId,
                        thread_id || null,
                        title.trim(),
                        (description || '').trim(),
                        optionsArray,
                        chosen_option.trim(),
                        (rationale || '').trim(),
                        (clinical_impact || '').trim(),
                        (technical_impact || '').trim(),
                        evidenceArray,
                        req.userId
                    ]
                );

                res.json({
                    success: true,
                    id: decisionId
                });

            } catch (error) {
                console.error('Log decision error:', error);
                res.status(500).json({ error: 'Failed to log decision' });
            }
        });

        // ===== MILESTONES =====
        
        // Add milestone
        this.app.post('/api/projects/:id/milestones', async (req, res) => {
            try {
                const projectId = req.params.id;
                const {
                    title,
                    type,
                    description,
                    due_date,
                    clinical_owner,
                    technical_owner,
                    dependencies
                } = req.body;
                
                if (!title || !type) {
                    return res.status(400).json({ error: 'Title and type are required' });
                }
                
                const milestoneId = `milestone_${crypto.randomBytes(16).toString('hex')}`;
                const depsArray = dependencies ? JSON.stringify(dependencies) : '[]';

                await this.runQuery(
                    `INSERT INTO milestones (
                        id, project_id, title, type, description, due_date,
                        clinical_owner, technical_owner, dependencies
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        milestoneId,
                        projectId,
                        title.trim(),
                        type,
                        (description || '').trim(),
                        due_date || null,
                        clinical_owner || null,
                        technical_owner || null,
                        depsArray
                    ]
                );

                res.json({
                    success: true,
                    id: milestoneId
                });

            } catch (error) {
                console.error('Add milestone error:', error);
                res.status(500).json({ error: 'Failed to add milestone' });
            }
        });

        // ===== ENGAGEMENT =====
        
        // Record engagement (upvote, bookmark, etc.)
        this.app.post('/api/engage', async (req, res) => {
            try {
                const {
                    project_id,
                    target_type,
                    target_id,
                    engagement_type
                } = req.body;
                
                if (!project_id || !target_type || !target_id || !engagement_type) {
                    return res.status(400).json({ error: 'All fields are required' });
                }
                
                const engagementId = `eng_${crypto.randomBytes(16).toString('hex')}`;

                await this.runQuery(
                    `INSERT INTO engagements (
                        id, project_id, target_type, target_id, user_id, engagement_type
                    ) VALUES (?, ?, ?, ?, ?, ?)`,
                    [
                        engagementId,
                        projectId,
                        target_type,
                        target_id,
                        req.userId,
                        engagement_type
                    ]
                );

                res.json({
                    success: true,
                    id: engagementId
                });

            } catch (error) {
                console.error('Engagement error:', error);
                res.status(500).json({ error: 'Failed to record engagement' });
            }
        });

        // ===== SEARCH =====
        
        // Enhanced search across project
        this.app.get('/api/projects/:id/search', async (req, res) => {
            try {
                const projectId = req.params.id;
                const { q } = req.query;
                
                if (!q) {
                    return res.json({ success: true, results: [] });
                }

                const searchTerm = `%${q}%`;
                
                const [threads, evidence, decisions, terms] = await Promise.all([
                    this.allQuery(`
                        SELECT 'thread' as type, id, title, 
                               COALESCE(clinical_context, '') || ' ' || COALESCE(technical_context, '') as content,
                               created_at
                        FROM threads 
                        WHERE project_id = ? AND (
                            title LIKE ? OR 
                            clinical_context LIKE ? OR 
                            technical_context LIKE ?
                        )
                    `, [projectId, searchTerm, searchTerm, searchTerm]),
                    
                    this.allQuery(`
                        SELECT 'evidence' as type, id, title,
                               COALESCE(clinical_relevance, '') || ' ' || COALESCE(technical_utility, '') as content,
                               created_at
                        FROM evidence 
                        WHERE project_id = ? AND (
                            title LIKE ? OR 
                            clinical_relevance LIKE ? OR 
                            technical_utility LIKE ?
                        )
                    `, [projectId, searchTerm, searchTerm, searchTerm]),
                    
                    this.allQuery(`
                        SELECT 'decision' as type, id, title, rationale as content, made_at as created_at
                        FROM decisions 
                        WHERE project_id = ? AND (
                            title LIKE ? OR 
                            rationale LIKE ?
                        )
                    `, [projectId, searchTerm, searchTerm]),
                    
                    this.allQuery(`
                        SELECT 'term' as type, id, term as title,
                               COALESCE(clinical_definition, '') || ' ' || COALESCE(technical_definition, '') as content,
                               created_at
                        FROM bridge_terms 
                        WHERE project_id = ? AND (
                            term LIKE ? OR 
                            clinical_definition LIKE ? OR 
                            technical_definition LIKE ?
                        )
                    `, [projectId, searchTerm, searchTerm, searchTerm])
                ]);

                const results = [...threads, ...evidence, ...decisions, ...terms]
                    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

                res.json({
                    success: true,
                    results
                });

            } catch (error) {
                console.error('Search error:', error);
                res.status(500).json({ error: 'Search failed' });
            }
        });

        // ===== FILE UPLOAD =====
        const storage = multer.diskStorage({
            destination: (req, file, cb) => {
                cb(null, this.UPLOAD_PATH);
            },
            filename: (req, file, cb) => {
                const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
                const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${path.extname(safeName)}`;
                cb(null, uniqueName);
            }
        });

        const upload = multer({
            storage,
            limits: { fileSize: 50 * 1024 * 1024 }, // 50MB for evidence files
            fileFilter: (req, file, cb) => {
                const allowed = ['.pdf', '.doc', '.docx', '.txt', '.csv', '.json', '.xlsx', '.zip'];
                const ext = path.extname(file.originalname).toLowerCase();
                cb(null, allowed.includes(ext));
            }
        });

        // Upload evidence file
        this.app.post('/api/projects/:id/upload', upload.single('file'), async (req, res) => {
            try {
                const projectId = req.params.id;
                const file = req.file;
                
                if (!file) {
                    return res.status(400).json({ error: 'No file uploaded' });
                }
                
                // Create evidence record for the file
                const evidenceId = `evid_${crypto.randomBytes(16).toString('hex')}`;
                
                await this.runQuery(
                    `INSERT INTO evidence (
                        id, project_id, title, type, source_type, source_id,
                        uploaded_file, created_by
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        evidenceId,
                        projectId,
                        file.originalname,
                        'internal',
                        'file',
                        file.filename,
                        file.path,
                        req.userId
                    ]
                );

                res.json({
                    success: true,
                    evidence: {
                        id: evidenceId,
                        title: file.originalname,
                        filepath: file.path,
                        filename: file.filename
                    }
                });

            } catch (error) {
                console.error('Upload error:', error);
                res.status(500).json({ error: 'Upload failed' });
            }
        });

        // Serve uploaded files
        this.app.get('/api/files/:filename', (req, res) => {
            const filepath = path.join(this.UPLOAD_PATH, req.params.filename);
            if (fs.existsSync(filepath)) {
                res.download(filepath);
            } else {
                res.status(404).json({ error: 'File not found' });
            }
        });

        // Serve SPA
        this.app.get('*', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        });
    }

    // ========== HELPER METHODS ==========

    async generateBridgeTranslation(term, context) {
        // Enhanced bridge translation logic
        const translations = {
            'sensitivity': {
                clinical: 'Ability to correctly identify true positive cases in clinical screening',
                technical: 'TP / (TP + FN) - True positive rate in classification models',
                analogy: 'Like a highly sensitive smoke detector - rarely misses actual fires but might have false alarms',
                confidence: 4
            },
            'specificity': {
                clinical: 'Ability to correctly identify true negative cases, avoiding false diagnoses',
                technical: 'TN / (TN + FP) - True negative rate, important for ruling out conditions',
                analogy: 'Like a precise key - only fits the correct lock, avoids opening wrong doors',
                confidence: 4
            },
            'cohort': {
                clinical: 'Group of patients sharing characteristics for observational study or trial',
                technical: 'Filtered dataset based on inclusion/exclusion criteria for analysis',
                analogy: 'Like selecting specific ingredients for a recipe - defines what goes into the analysis',
                confidence: 5
            },
            'endpoint': {
                clinical: 'Measurable outcome used to assess treatment efficacy or safety',
                technical: 'Target variable or metric for model optimization and validation',
                analogy: 'Like a finish line in a race - defines what success looks like',
                confidence: 5
            },
            'validation': {
                clinical: 'Process of confirming that diagnostic tools work correctly in target population',
                technical: 'Testing model performance on independent dataset to ensure generalizability',
                analogy: 'Like test-driving a car - making sure it works in real conditions',
                confidence: 4
            }
        };

        const lowerTerm = term.toLowerCase();
        
        if (translations[lowerTerm]) {
            return translations[lowerTerm];
        }

        // Generate based on term patterns
        if (term.includes('score') || term.includes('index')) {
            return {
                clinical: `${term}: Quantitative measure used to assess severity, risk, or progression`,
                technical: `${term}: Numerical feature derived from data for prediction or classification`,
                analogy: 'Like a thermometer reading - converts complex reality into actionable number',
                confidence: 3
            };
        }

        if (term.includes('protocol') || term.includes('guideline')) {
            return {
                clinical: `${term}: Standardized procedure for patient care or research conduct`,
                technical: `${term}: Defined sequence of operations or algorithm implementation`,
                analogy: 'Like a recipe - step-by-step instructions to achieve consistent results',
                confidence: 4
            };
        }

        // Default translation
        return {
            clinical: `${term}: Clinical concept relating to patient care, diagnosis, or treatment`,
            technical: `${term}: Technical implementation involving data, algorithms, or systems`,
            analogy: 'Bridging patient-centered care with data-driven implementation',
            confidence: 2
        };
    }

    async createProjectSummary(projectId, event, userId) {
        try {
            const summaryId = `sum_${crypto.randomBytes(16).toString('hex')}`;
            
            await this.runQuery(
                `INSERT INTO summaries (
                    id, project_id, title, content, created_by
                ) VALUES (?, ?, ?, ?, ?)`,
                [
                    summaryId,
                    projectId,
                    'Project Activity',
                    event,
                    userId
                ]
            );
        } catch (error) {
            console.error('Create summary error:', error);
        }
    }

    // ========== WEBSOCKET FOR REAL-TIME ==========
    setupWebSocket() {
        this.wss.on('connection', (ws) => {
            console.log('WebSocket connected for real-time collaboration');
            
            ws.on('message', async (data) => {
                try {
                    const msg = JSON.parse(data.toString());
                    
                    switch (msg.type) {
                        case 'auth':
                            const session = await this.getQuery(
                                'SELECT * FROM sessions WHERE token = ? AND expires_at > datetime("now")',
                                [msg.token]
                            );
                            
                            if (session) {
                                ws.userId = session.user_id;
                                ws.projectId = msg.projectId;
                                ws.send(JSON.stringify({ type: 'auth_success' }));
                            }
                            break;
                            
                        case 'thread_update':
                            // Broadcast thread updates to all project members
                            this.broadcastToProject(ws.projectId, {
                                type: 'thread_updated',
                                threadId: msg.threadId,
                                timestamp: new Date().toISOString()
                            }, ws);
                            break;
                            
                        case 'new_post':
                            this.broadcastToProject(ws.projectId, {
                                type: 'new_post',
                                threadId: msg.threadId,
                                postId: msg.postId,
                                author: msg.author,
                                timestamp: new Date().toISOString()
                            }, ws);
                            break;
                    }
                } catch (error) {
                    console.error('WebSocket error:', error);
                }
            });
            
            ws.on('close', () => {
                console.log('WebSocket disconnected');
            });
        });
    }

    broadcastToProject(projectId, message, excludeWs = null) {
        this.wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN && 
                client.projectId === projectId && 
                client !== excludeWs) {
                client.send(JSON.stringify(message));
            }
        });
    }

    // ========== INITIALIZE ==========
    async initialize() {
        // Setup middleware and routes first
        this.setupMiddleware();
        this.setupRoutes();
        this.setupWebSocket();
        
        // Initialize database schema
        await this.initializeSchema();
        
        // Start server
        this.startServer();
        
        // Cleanup expired sessions daily
        setInterval(async () => {
            try {
                await this.runQuery('DELETE FROM sessions WHERE expires_at < datetime("now")');
            } catch (error) {
                console.error('Cleanup error:', error);
            }
        }, 24 * 3600000); // Daily
    }

    // ========== START SERVER ==========
    startServer() {
        const PORT = process.env.PORT || 3000;
        const HOST = '0.0.0.0';
        
        this.server.listen(PORT, HOST, () => {
            console.log(`
╔══════════════════════════════════════════════════════╗
║     THORAXLAB PRO - COLLABORATION PLATFORM           ║
╠══════════════════════════════════════════════════════╣
║     Server: http://${HOST}:${PORT}                      ║
║     Health: http://${HOST}:${PORT}/api/health         ║
║     Features:                                        ║
║     • Discussion Threads                            ║
║     • Evidence Library                              ║
║     • Bridge Translation                            ║
║     • Decision Logging                              ║
║     • Milestone Tracking                            ║
║     • Real-time Collaboration                       ║
╚══════════════════════════════════════════════════════╝
            `);
        });
    }
}

// Start server
const server = new ThoraxLabServer();
module.exports = server;
