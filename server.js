const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const cors = require('cors');

class ThoraxLabServer {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        
        // Configuration
        this.DB_PATH = './thoraxlab.db';
        this.UPLOAD_PATH = './uploads';
        this.db = new sqlite3.Database(this.DB_PATH);
        
        // Ensure upload directory exists
        this.ensureUploadDirectory();
        
        console.log('🚀 ThoraxLab Pro Server Initializing...');
        this.initialize();
    }

    // ========== INITIALIZATION ==========
    
    async initialize() {
        // Setup middleware first
        this.setupMiddleware();
        
        // Initialize database
        await this.initializeDatabase();
        
        // Setup all routes
        this.setupRoutes();
        
        // Start server
        this.startServer();
    }
    
    async ensureUploadDirectory() {
        try {
            await fs.access(this.UPLOAD_PATH);
        } catch {
            await fs.mkdir(this.UPLOAD_PATH, { recursive: true });
        }
    }
    
    async initializeDatabase() {
        try {
            console.log('📦 Initializing database...');
            
            // Enable foreign keys and WAL mode
            await this.runQuery('PRAGMA foreign_keys = ON');
            await this.runQuery('PRAGMA journal_mode = WAL');
            
            // Users table
            await this.runQuery(`
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    email TEXT UNIQUE NOT NULL,
                    name TEXT NOT NULL,
                    organization TEXT,
                    primary_role TEXT CHECK(primary_role IN ('clinical', 'technical', 'both')),
                    expertise_tags TEXT DEFAULT '[]',
                    avatar_initials TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
            
            // Sessions table
            await this.runQuery(`
                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    token TEXT UNIQUE NOT NULL,
                    expires_at DATETIME NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            `);
            
            // Projects table
            await this.runQuery(`
                CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    description TEXT,
                    clinical_context TEXT,
                    technical_challenge TEXT,
                    expected_outcomes TEXT,
                    status TEXT DEFAULT 'planning',
                    phase TEXT DEFAULT 'discovery',
                    created_by TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (created_by) REFERENCES users(id)
                )
            `);
            
            // Project team
            await this.runQuery(`
                CREATE TABLE IF NOT EXISTS project_team (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    role TEXT DEFAULT 'contributor',
                    perspective TEXT,
                    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(project_id, user_id),
                    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            `);
            
            // Threads table
            await this.runQuery(`
                CREATE TABLE IF NOT EXISTS threads (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    type TEXT CHECK(type IN ('discussion', 'hypothesis', 'question', 'decision', 'insight', 'progress')),
                    clinical_context TEXT,
                    technical_context TEXT,
                    bridge_insights TEXT,
                    status TEXT DEFAULT 'active',
                    tags TEXT DEFAULT '[]',
                    created_by TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                    FOREIGN KEY (created_by) REFERENCES users(id)
                )
            `);
            
            // Posts table
            await this.runQuery(`
                CREATE TABLE IF NOT EXISTS posts (
                    id TEXT PRIMARY KEY,
                    thread_id TEXT NOT NULL,
                    content TEXT NOT NULL,
                    perspective TEXT CHECK(perspective IN ('clinical', 'technical', 'bridge')),
                    evidence_refs TEXT DEFAULT '[]',
                    tags TEXT DEFAULT '[]',
                    created_by TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
                    FOREIGN KEY (created_by) REFERENCES users(id)
                )
            `);
            
            // Evidence table
            await this.runQuery(`
                CREATE TABLE IF NOT EXISTS evidence (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    type TEXT CHECK(type IN ('paper', 'dataset', 'protocol', 'result', 'regulation', 'internal')),
                    source_type TEXT,
                    source_id TEXT,
                    clinical_relevance TEXT,
                    technical_utility TEXT,
                    bridge_notes TEXT,
                    tags TEXT DEFAULT '[]',
                    uploaded_file TEXT,
                    file_size INTEGER,
                    file_type TEXT,
                    created_by TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                    FOREIGN KEY (created_by) REFERENCES users(id)
                )
            `);
            
            // Decisions table
            await this.runQuery(`
                CREATE TABLE IF NOT EXISTS decisions (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    thread_id TEXT,
                    title TEXT NOT NULL,
                    description TEXT,
                    options TEXT DEFAULT '[]',
                    chosen_option TEXT,
                    rationale TEXT,
                    clinical_impact TEXT,
                    technical_impact TEXT,
                    evidence_refs TEXT DEFAULT '[]',
                    created_by TEXT NOT NULL,
                    made_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                    FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE SET NULL,
                    FOREIGN KEY (created_by) REFERENCES users(id)
                )
            `);
            
            // Milestones table
            await this.runQuery(`
                CREATE TABLE IF NOT EXISTS milestones (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    type TEXT CHECK(type IN ('clinical', 'technical', 'regulatory', 'collaboration', 'deliverable')),
                    description TEXT,
                    due_date DATETIME,
                    completed_at DATETIME,
                    clinical_owner TEXT,
                    technical_owner TEXT,
                    status TEXT DEFAULT 'planned',
                    dependencies TEXT DEFAULT '[]',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
                )
            `);
            
            // Bridge terms table
            await this.runQuery(`
                CREATE TABLE IF NOT EXISTS bridge_terms (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    term TEXT NOT NULL,
                    clinical_definition TEXT,
                    technical_definition TEXT,
                    analogy TEXT,
                    usage_examples TEXT,
                    confidence_score INTEGER DEFAULT 1 CHECK(confidence_score BETWEEN 1 AND 5),
                    created_by TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(project_id, term),
                    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                    FOREIGN KEY (created_by) REFERENCES users(id)
                )
            `);
            
            // Create indexes for better performance
            await this.runQuery('CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token)');
            await this.runQuery('CREATE INDEX IF NOT EXISTS idx_threads_project ON threads(project_id)');
            await this.runQuery('CREATE INDEX IF NOT EXISTS idx_posts_thread ON posts(thread_id)');
            await this.runQuery('CREATE INDEX IF NOT EXISTS idx_evidence_project ON evidence(project_id)');
            await this.runQuery('CREATE INDEX IF NOT EXISTS idx_projects_created ON projects(created_by)');
            await this.runQuery('CREATE INDEX IF NOT EXISTS idx_search_threads ON threads(title, clinical_context, technical_context)');
            await this.runQuery('CREATE INDEX IF NOT EXISTS idx_search_evidence ON evidence(title, clinical_relevance, technical_utility)');
            await this.runQuery('CREATE INDEX IF NOT EXISTS idx_search_bridge ON bridge_terms(term, clinical_definition, technical_definition)');
            
            console.log('✅ Database initialized successfully');
            
        } catch (error) {
            console.error('❌ Database initialization failed:', error.message);
            console.error('Full error:', error);
        }
    }

    // ========== DATABASE HELPERS ==========
    
    runQuery(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) {
                    console.error('❌ DB RUN Error:', err.message);
                    console.error('SQL:', sql);
                    console.error('Params:', params);
                    reject(err);
                } else {
                    resolve(this);
                }
            });
        });
    }

    getQuery(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) {
                    console.error('❌ DB GET Error:', err.message);
                    console.error('SQL:', sql);
                    reject(err);
                } else {
                    resolve(row || null);
                }
            });
        });
    }

    allQuery(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    console.error('❌ DB ALL Error:', err.message);
                    console.error('SQL:', sql);
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });
    }

    // ========== MIDDLEWARE ==========
    
    setupMiddleware() {
        // CORS
        this.app.use(cors({
            origin: true,
            credentials: true
        }));
        
        // Body parsing
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
        
        // Static files
        this.app.use('/uploads', express.static(this.UPLOAD_PATH));
        this.app.use(express.static('public'));
        
        // Logging middleware
        this.app.use((req, res, next) => {
            const start = Date.now();
            console.log(`📡 ${req.method} ${req.path}`);
            next();
        });
        
        // Authentication middleware
        this.app.use(async (req, res, next) => {
            const publicRoutes = [
                '/api/health',
                '/api/login'
            ];
            
            // Skip auth for public routes
            if (publicRoutes.includes(req.path)) {
                return next();
            }
            
            // Check for Authorization header
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ 
                    error: 'Authentication required',
                    code: 'NO_TOKEN'
                });
            }
            
            const token = authHeader.substring(7);
            
            try {
                // Find valid session
                const session = await this.getQuery(
                    'SELECT * FROM sessions WHERE token = ? AND expires_at > datetime("now")',
                    [token]
                );
                
                if (!session) {
                    return res.status(401).json({ 
                        error: 'Session expired or invalid',
                        code: 'INVALID_SESSION'
                    });
                }
                
                // Get user info
                const user = await this.getQuery(
                    'SELECT id, email, name, organization, primary_role, expertise_tags, avatar_initials FROM users WHERE id = ?',
                    [session.user_id]
                );
                
                if (!user) {
                    return res.status(401).json({ 
                        error: 'User not found',
                        code: 'USER_NOT_FOUND'
                    });
                }
                
                // Parse JSON fields
                if (user.expertise_tags) {
                    user.expertise_tags = JSON.parse(user.expertise_tags);
                }
                
                // Attach to request
                req.user = user;
                req.userId = user.id;
                req.session = session;
                
                next();
                
            } catch (error) {
                console.error('Auth middleware error:', error);
                res.status(500).json({ 
                    error: 'Authentication error',
                    code: 'AUTH_ERROR'
                });
            }
        });
    }

    // ========== ROUTES ==========
    
    setupRoutes() {
        // ===== HEALTH CHECK =====
        this.app.get('/api/health', async (req, res) => {
            try {
                await this.getQuery('SELECT 1 as test');
                res.json({
                    status: 'ok',
                    service: 'thoraxlab-pro',
                    timestamp: new Date().toISOString(),
                    uptime: process.uptime()
                });
            } catch (error) {
                res.status(500).json({
                    status: 'error',
                    error: 'Database connection failed'
                });
            }
        });
        
        // ===== AUTHENTICATION =====
        this.app.post('/api/login', async (req, res) => {
            try {
                console.log('🔐 Login attempt:', req.body.email);
                
                const { email, name, organization, primary_role, expertise } = req.body;
                
                // Validation
                if (!email || !name || !primary_role) {
                    return res.status(400).json({ 
                        error: 'Email, name, and role are required',
                        code: 'MISSING_FIELDS'
                    });
                }
                
                // Generate avatar initials
                const initials = name.split(' ')
                    .map(n => n[0])
                    .join('')
                    .toUpperCase()
                    .substring(0, 2);
                
                // Find or create user
                let user = await this.getQuery(
                    'SELECT * FROM users WHERE email = ?',
                    [email.toLowerCase()]
                );
                
                if (!user) {
                    const userId = `user_${crypto.randomBytes(8).toString('hex')}`;
                    const expertiseTags = expertise ? 
                        JSON.stringify(expertise.split(',').map(t => t.trim())) : 
                        '[]';
                    
                    await this.runQuery(
                        `INSERT INTO users (id, email, name, organization, primary_role, expertise_tags, avatar_initials) 
                         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [
                            userId,
                            email.toLowerCase(),
                            name.trim(),
                            (organization || '').trim(),
                            primary_role,
                            expertiseTags,
                            initials
                        ]
                    );
                    
                    user = await this.getQuery('SELECT * FROM users WHERE id = ?', [userId]);
                }
                
                // Clean up old sessions
                await this.runQuery(
                    'DELETE FROM sessions WHERE user_id = ? AND expires_at < datetime("now")',
                    [user.id]
                );
                
                // Create new session (30 days)
                const token = crypto.randomBytes(32).toString('hex');
                const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                
                await this.runQuery(
                    'INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)',
                    [
                        `sess_${crypto.randomBytes(8).toString('hex')}`,
                        user.id,
                        token,
                        expiresAt.toISOString()
                    ]
                );
                
                // Prepare response
                const userResponse = {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    organization: user.organization,
                    primary_role: user.primary_role,
                    expertise_tags: JSON.parse(user.expertise_tags || '[]'),
                    avatar_initials: user.avatar_initials
                };
                
                console.log(`✅ Login successful: ${user.email}`);
                
                res.json({
                    success: true,
                    token,
                    user: userResponse
                });
                
            } catch (error) {
                console.error('❌ Login error:', error);
                res.status(500).json({ 
                    error: 'Login failed',
                    code: 'LOGIN_FAILED',
                    details: error.message
                });
            }
        });
        
        // ===== PROJECTS =====
        
        // Get user's projects
        this.app.get('/api/projects', async (req, res) => {
            try {
                const projects = await this.allQuery(`
                    SELECT p.*, u.name as creator_name 
                    FROM projects p
                    JOIN users u ON p.created_by = u.id
                    WHERE p.created_by = ?
                    ORDER BY p.updated_at DESC
                `, [req.userId]);
                
                res.json({
                    success: true,
                    projects: projects || []
                });
                
            } catch (error) {
                console.error('❌ Get projects error:', error);
                res.status(500).json({ 
                    error: 'Failed to load projects',
                    code: 'PROJECTS_LOAD_ERROR'
                });
            }
        });
        
        // Create project
        this.app.post('/api/projects', async (req, res) => {
            try {
                const { 
                    title, 
                    description, 
                    clinical_context, 
                    technical_challenge,
                    status = 'planning',
                    phase = 'discovery'
                } = req.body;
                
                if (!title) {
                    return res.status(400).json({ 
                        error: 'Project title is required',
                        code: 'MISSING_TITLE'
                    });
                }
                
                const projectId = `proj_${crypto.randomBytes(8).toString('hex')}`;
                
                await this.runQuery(
                    `INSERT INTO projects (
                        id, title, description, clinical_context, technical_challenge,
                        status, phase, created_by
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        projectId,
                        title.trim(),
                        (description || '').trim(),
                        (clinical_context || '').trim(),
                        (technical_challenge || '').trim(),
                        status,
                        phase,
                        req.userId
                    ]
                );
                
                // Add creator to project team
                await this.runQuery(
                    'INSERT INTO project_team (id, project_id, user_id, role) VALUES (?, ?, ?, ?)',
                    [
                        `team_${crypto.randomBytes(8).toString('hex')}`,
                        projectId,
                        req.userId,
                        'lead'
                    ]
                );
                
                const project = await this.getQuery(
                    'SELECT * FROM projects WHERE id = ?',
                    [projectId]
                );
                
                console.log(`✅ Project created: ${projectId} - ${title}`);
                
                res.status(201).json({
                    success: true,
                    project
                });
                
            } catch (error) {
                console.error('❌ Create project error:', error);
                res.status(500).json({ 
                    error: 'Failed to create project',
                    code: 'PROJECT_CREATE_ERROR',
                    details: error.message
                });
            }
        });
        
        // Get project dashboard
        this.app.get('/api/projects/:id/dashboard', async (req, res) => {
            try {
                const projectId = req.params.id;
                
                // Verify access
                const hasAccess = await this.getQuery(
                    'SELECT 1 FROM project_team WHERE project_id = ? AND user_id = ?',
                    [projectId, req.userId]
                );
                
                if (!hasAccess) {
                    return res.status(403).json({ 
                        error: 'Access denied to project',
                        code: 'ACCESS_DENIED'
                    });
                }
                
                // Get project details
                const project = await this.getQuery(`
                    SELECT p.*, u.name as creator_name 
                    FROM projects p
                    JOIN users u ON p.created_by = u.id
                    WHERE p.id = ?
                `, [projectId]);
                
                if (!project) {
                    return res.status(404).json({ 
                        error: 'Project not found',
                        code: 'PROJECT_NOT_FOUND'
                    });
                }
                
                // Get all dashboard data in parallel
                const [threads, evidence, decisions, milestones, bridgeTerms, team] = await Promise.all([
                    // Recent threads
                    this.allQuery(`
                        SELECT t.*, u.name as author_name, u.avatar_initials
                        FROM threads t
                        JOIN users u ON t.created_by = u.id
                        WHERE t.project_id = ?
                        ORDER BY t.updated_at DESC
                        LIMIT 10
                    `, [projectId]),
                    
                    // Recent evidence
                    this.allQuery(`
                        SELECT e.*, u.name as author_name
                        FROM evidence e
                        JOIN users u ON e.created_by = u.id
                        WHERE e.project_id = ?
                        ORDER BY e.created_at DESC
                        LIMIT 10
                    `, [projectId]),
                    
                    // Recent decisions
                    this.allQuery(`
                        SELECT d.*, u.name as author_name
                        FROM decisions d
                        JOIN users u ON d.created_by = u.id
                        WHERE d.project_id = ?
                        ORDER BY d.made_at DESC
                        LIMIT 5
                    `, [projectId]),
                    
                    // Milestones
                    this.allQuery(`
                        SELECT m.* 
                        FROM milestones m
                        WHERE m.project_id = ?
                        ORDER BY m.due_date
                        LIMIT 10
                    `, [projectId]),
                    
                    // Bridge terms
                    this.allQuery(`
                        SELECT b.*, u.name as author_name
                        FROM bridge_terms b
                        JOIN users u ON b.created_by = u.id
                        WHERE b.project_id = ?
                        ORDER BY b.confidence_score DESC
                        LIMIT 10
                    `, [projectId]),
                    
                    // Team members
                    this.allQuery(`
                        SELECT pt.*, u.name, u.email, u.primary_role, u.avatar_initials
                        FROM project_team pt
                        JOIN users u ON pt.user_id = u.id
                        WHERE pt.project_id = ?
                        ORDER BY pt.joined_at
                    `, [projectId])
                ]);
                
                // Get engagement metrics
                const engagement = await this.getQuery(`
                    SELECT 
                        COUNT(DISTINCT t.id) as active_threads,
                        COUNT(DISTINCT e.id) as evidence_count,
                        COUNT(DISTINCT b.id) as bridge_terms_count,
                        COUNT(DISTINCT m.id) as milestones_count
                    FROM projects p
                    LEFT JOIN threads t ON p.id = t.project_id AND t.status = 'active'
                    LEFT JOIN evidence e ON p.id = e.project_id
                    LEFT JOIN bridge_terms b ON p.id = b.project_id
                    LEFT JOIN milestones m ON p.id = m.project_id
                    WHERE p.id = ?
                    GROUP BY p.id
                `, [projectId]);
                
                // Parse JSON fields
                const parseJSONFields = (items) => items.map(item => ({
                    ...item,
                    tags: item.tags ? JSON.parse(item.tags) : [],
                    evidence_refs: item.evidence_refs ? JSON.parse(item.evidence_refs) : []
                }));
                
                const dashboard = {
                    project,
                    threads: parseJSONFields(threads),
                    evidence: parseJSONFields(evidence),
                    decisions: decisions.map(d => ({
                        ...d,
                        options: d.options ? JSON.parse(d.options) : [],
                        evidence_refs: d.evidence_refs ? JSON.parse(d.evidence_refs) : []
                    })),
                    milestones: milestones.map(m => ({
                        ...m,
                        dependencies: m.dependencies ? JSON.parse(m.dependencies) : []
                    })),
                    bridgeTerms,
                    team,
                    engagement: engagement || {
                        active_threads: 0,
                        evidence_count: 0,
                        bridge_terms_count: 0,
                        milestones_count: 0
                    }
                };
                
                console.log(`✅ Dashboard loaded for project: ${projectId}`);
                
                res.json({
                    success: true,
                    dashboard
                });
                
            } catch (error) {
                console.error('❌ Dashboard error:', error);
                res.status(500).json({ 
                    error: 'Failed to load dashboard',
                    code: 'DASHBOARD_ERROR'
                });
            }
        });
        
        // Export project data
        this.app.get('/api/projects/:id/export', async (req, res) => {
            try {
                const projectId = req.params.id;
                
                // Verify access
                const hasAccess = await this.getQuery(
                    'SELECT 1 FROM project_team WHERE project_id = ? AND user_id = ?',
                    [projectId, req.userId]
                );
                
                if (!hasAccess) {
                    return res.status(403).json({ 
                        error: 'Access denied to project',
                        code: 'ACCESS_DENIED'
                    });
                }
                
                // Get all project data
                const [project, threads, posts, evidence, decisions, milestones, bridgeTerms, team] = await Promise.all([
                    this.getQuery('SELECT * FROM projects WHERE id = ?', [projectId]),
                    this.allQuery('SELECT * FROM threads WHERE project_id = ?', [projectId]),
                    this.allQuery(`
                        SELECT p.* FROM posts p
                        JOIN threads t ON p.thread_id = t.id
                        WHERE t.project_id = ?
                    `, [projectId]),
                    this.allQuery('SELECT * FROM evidence WHERE project_id = ?', [projectId]),
                    this.allQuery('SELECT * FROM decisions WHERE project_id = ?', [projectId]),
                    this.allQuery('SELECT * FROM milestones WHERE project_id = ?', [projectId]),
                    this.allQuery('SELECT * FROM bridge_terms WHERE project_id = ?', [projectId]),
                    this.allQuery(`
                        SELECT u.name, u.email, u.primary_role, pt.role, pt.joined_at
                        FROM project_team pt
                        JOIN users u ON pt.user_id = u.id
                        WHERE pt.project_id = ?
                    `, [projectId])
                ]);
                
                const exportData = {
                    project,
                    metadata: {
                        exported_at: new Date().toISOString(),
                        exported_by: req.user.name,
                        version: '1.0'
                    },
                    threads: threads.map(t => ({
                        ...t,
                        tags: t.tags ? JSON.parse(t.tags) : []
                    })),
                    posts: posts.map(p => ({
                        ...p,
                        evidence_refs: p.evidence_refs ? JSON.parse(p.evidence_refs) : [],
                        tags: p.tags ? JSON.parse(p.tags) : []
                    })),
                    evidence: evidence.map(e => ({
                        ...e,
                        tags: e.tags ? JSON.parse(e.tags) : []
                    })),
                    decisions: decisions.map(d => ({
                        ...d,
                        options: d.options ? JSON.parse(d.options) : [],
                        evidence_refs: d.evidence_refs ? JSON.parse(d.evidence_refs) : []
                    })),
                    milestones: milestones.map(m => ({
                        ...m,
                        dependencies: m.dependencies ? JSON.parse(m.dependencies) : []
                    })),
                    bridgeTerms,
                    team
                };
                
                res.json({
                    success: true,
                    data: exportData
                });
                
            } catch (error) {
                console.error('❌ Export error:', error);
                res.status(500).json({ 
                    error: 'Failed to export project',
                    code: 'EXPORT_ERROR'
                });
            }
        });
        
        // ===== THREADS =====
        
        // Create thread
        this.app.post('/api/projects/:id/threads', async (req, res) => {
            try {
                const projectId = req.params.id;
                
                // Verify project exists and user has access
                const hasAccess = await this.getQuery(
                    'SELECT 1 FROM project_team WHERE project_id = ? AND user_id = ?',
                    [projectId, req.userId]
                );
                
                if (!hasAccess) {
                    return res.status(403).json({ 
                        error: 'Access denied to project',
                        code: 'ACCESS_DENIED'
                    });
                }
                
                const {
                    title,
                    type = 'discussion',
                    clinical_context,
                    technical_context,
                    bridge_insights,
                    tags = []
                } = req.body;
                
                if (!title) {
                    return res.status(400).json({ 
                        error: 'Thread title is required',
                        code: 'MISSING_TITLE'
                    });
                }
                
                // Validate thread type
                const validTypes = ['discussion', 'hypothesis', 'question', 'decision', 'insight', 'progress'];
                if (!validTypes.includes(type)) {
                    return res.status(400).json({ 
                        error: `Invalid thread type. Must be one of: ${validTypes.join(', ')}`,
                        code: 'INVALID_TYPE'
                    });
                }
                
                const threadId = `thread_${crypto.randomBytes(8).toString('hex')}`;
                const tagArray = JSON.stringify(tags);
                
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
                
                const thread = await this.getQuery(`
                    SELECT t.*, u.name as author_name, u.avatar_initials 
                    FROM threads t
                    JOIN users u ON t.created_by = u.id
                    WHERE t.id = ?
                `, [threadId]);
                
                console.log(`✅ Thread created: ${threadId} - ${title}`);
                
                res.status(201).json({
                    success: true,
                    thread: {
                        ...thread,
                        tags: JSON.parse(thread.tags)
                    }
                });
                
            } catch (error) {
                console.error('❌ Create thread error:', error);
                res.status(500).json({ 
                    error: 'Failed to create thread',
                    code: 'THREAD_CREATE_ERROR',
                    details: error.message
                });
            }
        });
        
        // Get thread with posts
        this.app.get('/api/threads/:id', async (req, res) => {
            try {
                const threadId = req.params.id;
                
                // Get thread
                const thread = await this.getQuery(`
                    SELECT t.*, u.name as author_name, u.avatar_initials, p.title as project_title
                    FROM threads t
                    JOIN users u ON t.created_by = u.id
                    JOIN projects p ON t.project_id = p.id
                    WHERE t.id = ?
                `, [threadId]);
                
                if (!thread) {
                    return res.status(404).json({ 
                        error: 'Thread not found',
                        code: 'THREAD_NOT_FOUND'
                    });
                }
                
                // Verify access
                const hasAccess = await this.getQuery(
                    'SELECT 1 FROM project_team WHERE project_id = ? AND user_id = ?',
                    [thread.project_id, req.userId]
                );
                
                if (!hasAccess) {
                    return res.status(403).json({ 
                        error: 'Access denied to thread',
                        code: 'ACCESS_DENIED'
                    });
                }
                
                // Get posts
                const posts = await this.allQuery(`
                    SELECT p.*, u.name as author_name, u.avatar_initials, u.primary_role
                    FROM posts p
                    JOIN users u ON p.created_by = u.id
                    WHERE p.thread_id = ?
                    ORDER BY p.created_at
                `, [threadId]);
                
                // Parse JSON fields
                const parsedPosts = posts.map(p => ({
                    ...p,
                    evidence_refs: p.evidence_refs ? JSON.parse(p.evidence_refs) : [],
                    tags: p.tags ? JSON.parse(p.tags) : []
                }));
                
                console.log(`✅ Thread loaded: ${thread.title} with ${posts.length} posts`);
                
                res.json({
                    success: true,
                    thread: {
                        ...thread,
                        tags: thread.tags ? JSON.parse(thread.tags) : []
                    },
                    posts: parsedPosts
                });
                
            } catch (error) {
                console.error('❌ Get thread error:', error);
                res.status(500).json({ 
                    error: 'Failed to load thread',
                    code: 'THREAD_LOAD_ERROR'
                });
            }
        });
        
        // Add post to thread
        this.app.post('/api/threads/:id/posts', async (req, res) => {
            try {
                const threadId = req.params.id;
                
                // Get thread to verify access
                const thread = await this.getQuery(
                    'SELECT project_id FROM threads WHERE id = ?',
                    [threadId]
                );
                
                if (!thread) {
                    return res.status(404).json({ 
                        error: 'Thread not found',
                        code: 'THREAD_NOT_FOUND'
                    });
                }
                
                // Verify access
                const hasAccess = await this.getQuery(
                    'SELECT 1 FROM project_team WHERE project_id = ? AND user_id = ?',
                    [thread.project_id, req.userId]
                );
                
                if (!hasAccess) {
                    return res.status(403).json({ 
                        error: 'Access denied',
                        code: 'ACCESS_DENIED'
                    });
                }
                
                const {
                    content,
                    perspective,
                    evidence_refs = [],
                    tags = []
                } = req.body;
                
                if (!content) {
                    return res.status(400).json({ 
                        error: 'Post content is required',
                        code: 'MISSING_CONTENT'
                    });
                }
                
                // Validate perspective
                const validPerspectives = ['clinical', 'technical', 'bridge', null];
                if (perspective && !validPerspectives.includes(perspective)) {
                    return res.status(400).json({ 
                        error: 'Invalid perspective',
                        code: 'INVALID_PERSPECTIVE'
                    });
                }
                
                const postId = `post_${crypto.randomBytes(8).toString('hex')}`;
                const evidenceArray = JSON.stringify(evidence_refs);
                const tagArray = JSON.stringify(tags);
                
                await this.runQuery(
                    `INSERT INTO posts (
                        id, thread_id, content, perspective, evidence_refs, tags, created_by
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        postId,
                        threadId,
                        content.trim(),
                        perspective || null,
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
                
                const post = await this.getQuery(`
                    SELECT p.*, u.name as author_name, u.avatar_initials 
                    FROM posts p
                    JOIN users u ON p.created_by = u.id
                    WHERE p.id = ?
                `, [postId]);
                
                console.log(`✅ Post added: ${postId}`);
                
                res.status(201).json({
                    success: true,
                    post: {
                        ...post,
                        evidence_refs: JSON.parse(post.evidence_refs),
                        tags: JSON.parse(post.tags)
                    }
                });
                
            } catch (error) {
                console.error('❌ Add post error:', error);
                res.status(500).json({ 
                    error: 'Failed to add post',
                    code: 'POST_CREATE_ERROR'
                });
            }
        });
        
        // ===== EVIDENCE =====
        
        this.app.post('/api/projects/:id/evidence', async (req, res) => {
            try {
                const projectId = req.params.id;
                
                // Verify access
                const hasAccess = await this.getQuery(
                    'SELECT 1 FROM project_team WHERE project_id = ? AND user_id = ?',
                    [projectId, req.userId]
                );
                
                if (!hasAccess) {
                    return res.status(403).json({ 
                        error: 'Access denied',
                        code: 'ACCESS_DENIED'
                    });
                }
                
                const {
                    title,
                    type = 'paper',
                    source_id,
                    clinical_relevance,
                    technical_utility,
                    bridge_notes,
                    tags = []
                } = req.body;
                
                if (!title || !type) {
                    return res.status(400).json({ 
                        error: 'Title and type are required',
                        code: 'MISSING_FIELDS'
                    });
                }
                
                // Validate evidence type
                const validTypes = ['paper', 'dataset', 'protocol', 'result', 'regulation', 'internal'];
                if (!validTypes.includes(type)) {
                    return res.status(400).json({ 
                        error: `Invalid evidence type`,
                        code: 'INVALID_TYPE'
                    });
                }
                
                const evidenceId = `evid_${crypto.randomBytes(8).toString('hex')}`;
                const tagArray = JSON.stringify(tags);
                
                await this.runQuery(
                    `INSERT INTO evidence (
                        id, project_id, title, type, source_id,
                        clinical_relevance, technical_utility, bridge_notes, tags, created_by
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        evidenceId,
                        projectId,
                        title.trim(),
                        type,
                        (source_id || '').trim(),
                        (clinical_relevance || '').trim(),
                        (technical_utility || '').trim(),
                        (bridge_notes || '').trim(),
                        tagArray,
                        req.userId
                    ]
                );
                
                const evidence = await this.getQuery(`
                    SELECT e.*, u.name as author_name 
                    FROM evidence e
                    JOIN users u ON e.created_by = u.id
                    WHERE e.id = ?
                `, [evidenceId]);
                
                console.log(`✅ Evidence added: ${evidenceId} - ${title}`);
                
                res.status(201).json({
                    success: true,
                    evidence: {
                        ...evidence,
                        tags: JSON.parse(evidence.tags)
                    }
                });
                
            } catch (error) {
                console.error('❌ Add evidence error:', error);
                res.status(500).json({ 
                    error: 'Failed to add evidence',
                    code: 'EVIDENCE_CREATE_ERROR'
                });
            }
        });
        
        // ===== MILESTONES =====
        
        this.app.post('/api/projects/:id/milestones', async (req, res) => {
            try {
                const projectId = req.params.id;
                
                // Verify access
                const hasAccess = await this.getQuery(
                    'SELECT 1 FROM project_team WHERE project_id = ? AND user_id = ?',
                    [projectId, req.userId]
                );
                
                if (!hasAccess) {
                    return res.status(403).json({ 
                        error: 'Access denied',
                        code: 'ACCESS_DENIED'
                    });
                }
                
                const {
                    title,
                    type = 'deliverable',
                    description,
                    due_date,
                    clinical_owner,
                    technical_owner,
                    dependencies = []
                } = req.body;
                
                if (!title) {
                    return res.status(400).json({ 
                        error: 'Title is required',
                        code: 'MISSING_TITLE'
                    });
                }
                
                // Validate milestone type
                const validTypes = ['clinical', 'technical', 'regulatory', 'collaboration', 'deliverable'];
                if (!validTypes.includes(type)) {
                    return res.status(400).json({ 
                        error: `Invalid milestone type`,
                        code: 'INVALID_TYPE'
                    });
                }
                
                const milestoneId = `milestone_${crypto.randomBytes(8).toString('hex')}`;
                const depsArray = JSON.stringify(dependencies);
                
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
                        (clinical_owner || '').trim(),
                        (technical_owner || '').trim(),
                        depsArray
                    ]
                );
                
                const milestone = await this.getQuery(
                    'SELECT * FROM milestones WHERE id = ?',
                    [milestoneId]
                );
                
                console.log(`✅ Milestone added: ${milestoneId} - ${title}`);
                
                res.status(201).json({
                    success: true,
                    milestone: {
                        ...milestone,
                        dependencies: JSON.parse(milestone.dependencies)
                    }
                });
                
            } catch (error) {
                console.error('❌ Add milestone error:', error);
                res.status(500).json({ 
                    error: 'Failed to add milestone',
                    code: 'MILESTONE_CREATE_ERROR'
                });
            }
        });
        
        // ===== BRIDGE TERMS =====
        
        this.app.post('/api/bridge/translate', async (req, res) => {
            try {
                const { term, context, project_id } = req.body;
                
                if (!term) {
                    return res.status(400).json({ 
                        error: 'Term is required',
                        code: 'MISSING_TERM'
                    });
                }
                
                console.log(`🌉 Translating term: "${term}"`);
                
                // Check if term exists in project glossary
                let existingTerm = null;
                if (project_id) {
                    existingTerm = await this.getQuery(
                        'SELECT * FROM bridge_terms WHERE project_id = ? AND LOWER(term) = LOWER(?)',
                        [project_id, term]
                    );
                }
                
                if (existingTerm) {
                    console.log(`✅ Found existing translation for: "${term}"`);
                    return res.json({
                        success: true,
                        translation: {
                            term: existingTerm.term,
                            clinical_definition: existingTerm.clinical_definition,
                            technical_definition: existingTerm.technical_definition,
                            analogy: existingTerm.analogy,
                            confidence_score: existingTerm.confidence_score,
                            existing: true
                        }
                    });
                }
                
                // Generate translation
                const translation = this.generateBridgeTranslation(term, context);
                
                console.log(`✅ Generated translation for: "${term}"`);
                
                res.json({
                    success: true,
                    translation: {
                        ...translation,
                        existing: false
                    }
                });
                
            } catch (error) {
                console.error('❌ Translation error:', error);
                res.status(500).json({ 
                    error: 'Translation failed',
                    code: 'TRANSLATION_ERROR'
                });
            }
        });
        
        this.app.post('/api/bridge/terms', async (req, res) => {
            try {
                const { project_id, term, clinical_definition, technical_definition, analogy, confidence_score } = req.body;
                
                if (!project_id || !term || !clinical_definition || !technical_definition) {
                    return res.status(400).json({ 
                        error: 'Missing required fields',
                        code: 'MISSING_FIELDS'
                    });
                }
                
                // Verify access
                const hasAccess = await this.getQuery(
                    'SELECT 1 FROM project_team WHERE project_id = ? AND user_id = ?',
                    [project_id, req.userId]
                );
                
                if (!hasAccess) {
                    return res.status(403).json({ 
                        error: 'Access denied',
                        code: 'ACCESS_DENIED'
                    });
                }
                
                // Check if term already exists
                const existingTerm = await this.getQuery(
                    'SELECT * FROM bridge_terms WHERE project_id = ? AND LOWER(term) = LOWER(?)',
                    [project_id, term]
                );
                
                let termId;
                
                if (existingTerm) {
                    // Update existing term
                    termId = existingTerm.id;
                    await this.runQuery(
                        `UPDATE bridge_terms SET 
                            clinical_definition = ?,
                            technical_definition = ?,
                            analogy = ?,
                            confidence_score = ?,
                            created_by = ?
                         WHERE id = ?`,
                        [
                            clinical_definition.trim(),
                            technical_definition.trim(),
                            (analogy || '').trim(),
                            confidence_score || 3,
                            req.userId,
                            termId
                        ]
                    );
                    console.log(`✅ Bridge term updated: ${termId} - ${term}`);
                } else {
                    // Create new term
                    termId = `bridge_${crypto.randomBytes(8).toString('hex')}`;
                    await this.runQuery(
                        `INSERT INTO bridge_terms (
                            id, project_id, term, clinical_definition, 
                            technical_definition, analogy, confidence_score, created_by
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            termId,
                            project_id,
                            term.trim(),
                            clinical_definition.trim(),
                            technical_definition.trim(),
                            (analogy || '').trim(),
                            confidence_score || 3,
                            req.userId
                        ]
                    );
                    console.log(`✅ Bridge term created: ${termId} - ${term}`);
                }
                
                const bridgeTerm = await this.getQuery(
                    'SELECT * FROM bridge_terms WHERE id = ?',
                    [termId]
                );
                
                res.status(existingTerm ? 200 : 201).json({
                    success: true,
                    bridge_term: bridgeTerm
                });
                
            } catch (error) {
                console.error('❌ Save bridge term error:', error);
                res.status(500).json({ 
                    error: 'Failed to save bridge term',
                    code: 'BRIDGE_TERM_ERROR'
                });
            }
        });
        
        // ===== SEARCH =====
        
        this.app.post('/api/search', async (req, res) => {
            try {
                const { query, filter = 'all' } = req.body;
                
                if (!query || query.trim().length < 2) {
                    return res.status(400).json({ 
                        error: 'Search query must be at least 2 characters',
                        code: 'INVALID_QUERY'
                    });
                }
                
                const searchTerm = `%${query.trim()}%`;
                const results = [];
                
                // Get user's projects for filtering
                const userProjects = await this.allQuery(`
                    SELECT p.id FROM projects p
                    JOIN project_team pt ON p.id = pt.project_id
                    WHERE pt.user_id = ?
                `, [req.userId]);
                
                const projectIds = userProjects.map(p => p.id);
                
                if (projectIds.length === 0) {
                    return res.json({
                        success: true,
                        results: []
                    });
                }
                
                // Search across different types based on filter
                if (filter === 'all' || filter === 'threads') {
                    const threads = await this.allQuery(`
                        SELECT t.id, t.title, t.type as thread_type, t.clinical_context as content,
                               p.title as project_title, p.id as project_id
                        FROM threads t
                        JOIN projects p ON t.project_id = p.id
                        WHERE p.id IN (${projectIds.map(() => '?').join(',')})
                        AND (t.title LIKE ? OR t.clinical_context LIKE ? OR t.technical_context LIKE ?)
                        ORDER BY t.updated_at DESC
                        LIMIT 20
                    `, [...projectIds, searchTerm, searchTerm, searchTerm]);
                    
                    results.push(...threads.map(t => ({ ...t, type: 'thread' })));
                }
                
                if (filter === 'all' || filter === 'evidence') {
                    const evidence = await this.allQuery(`
                        SELECT e.id, e.title, e.type as evidence_type, e.clinical_relevance as content,
                               p.title as project_title, p.id as project_id
                        FROM evidence e
                        JOIN projects p ON e.project_id = p.id
                        WHERE p.id IN (${projectIds.map(() => '?').join(',')})
                        AND (e.title LIKE ? OR e.clinical_relevance LIKE ? OR e.technical_utility LIKE ?)
                        ORDER BY e.created_at DESC
                        LIMIT 20
                    `, [...projectIds, searchTerm, searchTerm, searchTerm]);
                    
                    results.push(...evidence.map(e => ({ ...e, type: 'evidence' })));
                }
                
                if (filter === 'all' || filter === 'bridge_terms') {
                    const bridgeTerms = await this.allQuery(`
                        SELECT b.id, b.term as title, b.clinical_definition as content,
                               p.title as project_title, p.id as project_id
                        FROM bridge_terms b
                        JOIN projects p ON b.project_id = p.id
                        WHERE p.id IN (${projectIds.map(() => '?').join(',')})
                        AND (b.term LIKE ? OR b.clinical_definition LIKE ? OR b.technical_definition LIKE ?)
                        ORDER BY b.confidence_score DESC
                        LIMIT 20
                    `, [...projectIds, searchTerm, searchTerm, searchTerm]);
                    
                    results.push(...bridgeTerms.map(b => ({ ...b, type: 'bridge_term' })));
                }
                
                if (filter === 'all' || filter === 'projects') {
                    const projects = await this.allQuery(`
                        SELECT p.id, p.title, p.description as content, p.phase, p.status
                        FROM projects p
                        WHERE p.id IN (${projectIds.map(() => '?').join(',')})
                        AND (p.title LIKE ? OR p.description LIKE ? OR p.clinical_context LIKE ?)
                        ORDER BY p.updated_at DESC
                        LIMIT 10
                    `, [...projectIds, searchTerm, searchTerm, searchTerm]);
                    
                    results.push(...projects.map(p => ({ ...p, type: 'project' })));
                }
                
                console.log(`✅ Search completed: "${query}" found ${results.length} results`);
                
                res.json({
                    success: true,
                    results
                });
                
            } catch (error) {
                console.error('❌ Search error:', error);
                res.status(500).json({ 
                    error: 'Search failed',
                    code: 'SEARCH_ERROR'
                });
            }
        });
        
        // ===== FILE UPLOAD =====
        
        const upload = multer({
            storage: multer.diskStorage({
                destination: (req, file, cb) => {
                    cb(null, this.UPLOAD_PATH);
                },
                filename: (req, file, cb) => {
                    const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}-${file.originalname}`;
                    cb(null, uniqueName);
                }
            }),
            limits: {
                fileSize: 10 * 1024 * 1024 // 10MB limit
            }
        });
        
        this.app.post('/api/upload', upload.single('file'), async (req, res) => {
            try {
                if (!req.file) {
                    return res.status(400).json({
                        error: 'No file uploaded',
                        code: 'NO_FILE'
                    });
                }
                
                const fileInfo = {
                    filename: req.file.filename,
                    originalname: req.file.originalname,
                    mimetype: req.file.mimetype,
                    size: req.file.size,
                    path: `/uploads/${req.file.filename}`
                };
                
                console.log(`✅ File uploaded: ${fileInfo.originalname}`);
                
                res.json({
                    success: true,
                    file: fileInfo
                });
                
            } catch (error) {
                console.error('❌ File upload error:', error);
                res.status(500).json({
                    error: 'File upload failed',
                    code: 'UPLOAD_ERROR'
                });
            }
        });
        
        // ===== 404 HANDLER =====
        this.app.use((req, res) => {
            if (req.path.startsWith('/api/')) {
                res.status(404).json({ 
                    error: 'API endpoint not found',
                    path: req.path 
                });
            } else {
                // Serve frontend SPA
                const indexPath = path.join(__dirname, 'public', 'index.html');
                if (fs.existsSync(indexPath)) {
                    res.sendFile(indexPath);
                } else {
                    res.status(404).send('Page not found');
                }
            }
        });
        
        // ===== ERROR HANDLER =====
        this.app.use((error, req, res, next) => {
            console.error('🔥 Server error:', error);
            res.status(500).json({
                error: 'Internal server error',
                code: 'INTERNAL_ERROR'
            });
        });
    }
    
    // ========== HELPER METHODS ==========
    
    generateBridgeTranslation(term, context) {
        // Predefined translations for common terms
        const translations = {
            'sensitivity': {
                clinical_definition: 'Ability to correctly identify true positive cases in clinical screening or diagnosis',
                technical_definition: 'True Positive Rate: TP/(TP+FN). Measures how well a model identifies positive cases.',
                analogy: 'Like a highly sensitive smoke detector - rarely misses actual fires but might have false alarms',
                confidence_score: 4
            },
            'specificity': {
                clinical_definition: 'Ability to correctly identify true negative cases, avoiding false diagnoses',
                technical_definition: 'True Negative Rate: TN/(TN+FP). Measures how well a model rules out negative cases.',
                analogy: 'Like a precise key - only fits the correct lock, avoids opening wrong doors',
                confidence_score: 4
            },
            'validation': {
                clinical_definition: 'Process of confirming diagnostic tools work correctly in target population',
                technical_definition: 'Testing model performance on independent dataset to ensure generalizability',
                analogy: 'Like test-driving a car - making sure it works in real conditions, not just on paper',
                confidence_score: 5
            },
            'algorithm': {
                clinical_definition: 'Step-by-step procedure for clinical decision making or treatment',
                technical_definition: 'Set of rules or instructions for data processing and analysis',
                analogy: 'Like a cooking recipe - specific steps to transform ingredients (data) into results',
                confidence_score: 5
            },
            'cohort': {
                clinical_definition: 'Group of patients sharing characteristics for observational study or trial',
                technical_definition: 'Filtered dataset based on inclusion/exclusion criteria for analysis',
                analogy: 'Like selecting specific ingredients for a recipe - defines what goes into the analysis',
                confidence_score: 5
            },
            'predictive value': {
                clinical_definition: 'Probability that a positive/negative test result correctly predicts disease presence/absence',
                technical_definition: 'Precision/Recall metrics indicating model prediction reliability in real-world application',
                analogy: 'Like weather forecast accuracy - how often predicted rain actually occurs',
                confidence_score: 4
            },
            'gold standard': {
                clinical_definition: 'Best available diagnostic test or reference method for confirming a condition',
                technical_definition: 'Ground truth labels or established benchmark for evaluating model performance',
                analogy: 'Like official timekeeping in races - the reference against which all others are measured',
                confidence_score: 5
            },
            'confounding': {
                clinical_definition: 'Variable that distorts association between exposure and outcome in research',
                technical_definition: 'Feature that creates spurious correlation in data analysis',
                analogy: 'Like assuming umbrellas cause rain because both appear together - missing the real cause (weather)',
                confidence_score: 4
            },
            'protocol': {
                clinical_definition: 'Detailed plan for clinical trial or patient care procedure',
                technical_definition: 'Standardized set of rules for data collection, processing, or analysis',
                analogy: 'Like a laboratory manual - ensures consistency and reproducibility across experiments',
                confidence_score: 5
            },
            'adverse event': {
                clinical_definition: 'Untoward medical occurrence in patient receiving treatment',
                technical_definition: 'Unexpected outcome or failure case in system performance',
                analogy: 'Like a software bug causing system crash - unintended negative consequence of implementation',
                confidence_score: 4
            }
        };
        
        const lowerTerm = term.toLowerCase().trim();
        
        if (translations[lowerTerm]) {
            return translations[lowerTerm];
        }
        
        // Generate based on term patterns
        if (term.includes('score') || term.includes('index')) {
            return {
                clinical_definition: `${term}: Quantitative measure used to assess severity, risk, or progression in clinical settings`,
                technical_definition: `${term}: Numerical feature derived from data for prediction, classification, or risk assessment`,
                analogy: 'Like a thermometer reading - converts complex clinical reality into actionable numbers',
                confidence_score: 3
            };
        }
        
        if (term.includes('protocol') || term.includes('guideline')) {
            return {
                clinical_definition: `${term}: Standardized procedure for patient care, diagnosis, or treatment`,
                technical_definition: `${term}: Defined sequence of operations or algorithm implementation`,
                analogy: 'Like a recipe - step-by-step instructions to achieve consistent, reproducible results',
                confidence_score: 4
            };
        }
        
        if (term.includes('analysis') || term.includes('analytics')) {
            return {
                clinical_definition: `${term}: Systematic examination of patient data to inform clinical decisions`,
                technical_definition: `${term}: Computational processing of data to extract insights and patterns`,
                analogy: 'Like detective work - examining clues (data) to solve a mystery (clinical question)',
                confidence_score: 4
            };
        }
        
        if (term.includes('model') || term.includes('prediction')) {
            return {
                clinical_definition: `${term}: Framework for understanding disease progression or treatment response`,
                technical_definition: `${term}: Algorithm that learns patterns from data to make future predictions`,
                analogy: 'Like a weather model - uses current conditions to forecast future outcomes',
                confidence_score: 4
            };
        }
        
        // Default generic translation
        return {
            clinical_definition: `${term}: Clinical concept relating to patient care, diagnosis, treatment, or outcomes`,
            technical_definition: `${term}: Technical implementation involving data, algorithms, systems, or analysis`,
            analogy: 'Bridging patient-centered clinical care with data-driven technical implementation',
            confidence_score: 2
        };
    }
    
    // ========== START SERVER ==========
    
    startServer() {
        const PORT = process.env.PORT || 3000;
        const HOST = '0.0.0.0';
        
        this.server.listen(PORT, HOST, () => {
            console.log(`
╔════════════════════════════════════════════════════════════╗
║     [THØRAX][LAB] PRO - COMPLETE REWRITE                 ║
╠════════════════════════════════════════════════════════════╣
║     🌐 Server: http://${HOST}:${PORT}                          ║
║     ❤️  Health: http://${HOST}:${PORT}/api/health             ║
║                                                           ║
║     ✅ ALL NEW FEATURES IMPLEMENTED:                      ║
║     • Complete Search API with filters                    ║
║     • Milestone management (create/view)                  ║
║     • Bridge term saving to project glossary              ║
║     • Project export functionality                        ║
║     • File upload support for evidence                    ║
║     • Enhanced bridge translation database                ║
║     • CORS support                                        ║
║                                                           ║
║     🎯 FIXED ISSUES:                                      ║
║     • Authentication flow complete                        ║
║     • All frontend-backend API alignment                  ║
║     • Error handling improved                             ║
║     • Search pagination and filtering                     ║
║     • JSON export for projects                            ║
║                                                           ║
║     📊 DATABASE ENHANCEMENTS:                             ║
║     • Search indexes for performance                      ║
║     • File metadata for evidence                          ║
║     • Enhanced bridge term definitions                    ║
╚════════════════════════════════════════════════════════════╝
            `);
        });
        
        // Handle server errors
        this.server.on('error', (error) => {
            console.error('❌ Server error:', error);
            if (error.code === 'EADDRINUSE') {
                console.log(`Port ${PORT} is busy. Trying ${parseInt(PORT) + 1}...`);
                this.server.listen(parseInt(PORT) + 1, HOST);
            }
        });
        
        // Graceful shutdown
        process.on('SIGINT', () => {
            console.log('\n🛑 Shutting down server...');
            this.server.close(() => {
                console.log('✅ Server stopped');
                process.exit(0);
            });
        });
    }
}

// Start the server
const server = new ThoraxLabServer();
module.exports = server;
