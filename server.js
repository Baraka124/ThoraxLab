const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();

class ThoraxLabServer {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        
        // Always create public directory
        if (!fs.existsSync('public')) {
            fs.mkdirSync('public', { recursive: true });
        }
        
        // Database path
        this.DB_PATH = './thoraxlab.db';
        this.db = new sqlite3.Database(this.DB_PATH);
        
        console.log('🚀 ThoraxLab Server Starting...');
        this.initialize();
    }

    // ========== DATABASE SETUP ==========
    
    async initialize() {
        // Setup middleware FIRST
        this.setupMiddleware();
        
        // Initialize database
        await this.initializeDatabase();
        
        // Setup routes
        this.setupRoutes();
        
        // Start server
        this.startServer();
    }
    
    async initializeDatabase() {
        try {
            // Simple health check table
            await this.runQuery('CREATE TABLE IF NOT EXISTS health (id INTEGER PRIMARY KEY)');
            
            // Users table
            await this.runQuery(`
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    email TEXT UNIQUE NOT NULL,
                    name TEXT NOT NULL,
                    organization TEXT,
                    primary_role TEXT,
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
                    status TEXT DEFAULT 'planning',
                    created_by TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (created_by) REFERENCES users(id)
                )
            `);
            
            // Threads table
            await this.runQuery(`
                CREATE TABLE IF NOT EXISTS threads (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    type TEXT DEFAULT 'discussion',
                    clinical_context TEXT,
                    technical_context TEXT,
                    bridge_insights TEXT,
                    status TEXT DEFAULT 'active',
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
                    perspective TEXT,
                    evidence_refs TEXT DEFAULT '[]',
                    tags TEXT DEFAULT '[]',
                    created_by TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
                    FOREIGN KEY (created_by) REFERENCES users(id)
                )
            `);
            
            console.log('✅ Database initialized successfully');
            
        } catch (error) {
            console.error('❌ Database initialization failed:', error.message);
            // Don't exit - continue with limited functionality
        }
    }

    // ========== DATABASE HELPERS ==========
    
    runQuery(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) {
                    console.error('DB Error:', err.message, 'SQL:', sql);
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
                    console.error('DB Error:', err.message, 'SQL:', sql);
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
                    console.error('DB Error:', err.message, 'SQL:', sql);
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });
    }

    // ========== MIDDLEWARE ==========
    
    setupMiddleware() {
        // CORS - Allow all origins in development
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
            
            if (req.method === 'OPTIONS') {
                return res.status(200).end();
            }
            next();
        });
        
        // JSON parsing
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
        
        // Static files
        this.app.use(express.static('public'));
        
        // Request logging
        this.app.use((req, res, next) => {
            console.log(`${req.method} ${req.path}`);
            next();
        });
        
        // Authentication middleware
        this.app.use(async (req, res, next) => {
            const publicRoutes = [
                '/api/health',
                '/api/login',
                '/api/register',
                '/'
            ];
            
            // Skip auth for public routes
            if (publicRoutes.includes(req.path)) {
                return next();
            }
            
            const token = req.headers.authorization?.replace('Bearer ', '');
            
            if (!token) {
                console.log('❌ No token provided for:', req.path);
                return res.status(401).json({ 
                    error: 'No authentication token provided',
                    code: 'NO_TOKEN'
                });
            }
            
            try {
                // Check if token exists and is valid
                const session = await this.getQuery(
                    'SELECT * FROM sessions WHERE token = ? AND expires_at > datetime("now")',
                    [token]
                );
                
                if (!session) {
                    console.log('❌ Invalid/expired token:', token.substring(0, 20) + '...');
                    return res.status(401).json({ 
                        error: 'Session expired or invalid. Please login again.',
                        code: 'INVALID_SESSION'
                    });
                }
                
                // Get user info
                const user = await this.getQuery(
                    'SELECT id, email, name, organization, primary_role, avatar_initials FROM users WHERE id = ?',
                    [session.user_id]
                );
                
                if (!user) {
                    return res.status(401).json({ 
                        error: 'User not found',
                        code: 'USER_NOT_FOUND'
                    });
                }
                
                // Attach to request
                req.user = user;
                req.userId = user.id;
                req.session = session;
                
                console.log(`✅ Authenticated: ${user.name} (${user.email})`);
                next();
                
            } catch (error) {
                console.error('Auth error:', error);
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
                // Test database
                await this.getQuery('SELECT 1 as test');
                
                res.json({
                    status: 'ok',
                    service: 'thoraxlab',
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
        
        // ===== LOGIN/REGISTER =====
        this.app.post('/api/login', async (req, res) => {
            try {
                console.log('Login attempt:', req.body.email);
                
                const { email, name, organization, primary_role } = req.body;
                
                if (!email || !name) {
                    return res.status(400).json({ 
                        error: 'Email and name are required',
                        code: 'MISSING_FIELDS'
                    });
                }
                
                // Find or create user
                let user = await this.getQuery(
                    'SELECT * FROM users WHERE email = ?',
                    [email.toLowerCase()]
                );
                
                if (!user) {
                    const userId = `user_${crypto.randomBytes(8).toString('hex')}`;
                    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
                    
                    await this.runQuery(
                        `INSERT INTO users (id, email, name, organization, primary_role, avatar_initials) 
                         VALUES (?, ?, ?, ?, ?, ?)`,
                        [
                            userId,
                            email.toLowerCase(),
                            name.trim(),
                            organization || '',
                            primary_role || 'clinical',
                            initials
                        ]
                    );
                    
                    user = await this.getQuery('SELECT * FROM users WHERE id = ?', [userId]);
                }
                
                // Create session (30 days)
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
                
                // Remove old sessions
                await this.runQuery(
                    'DELETE FROM sessions WHERE user_id = ? AND expires_at < datetime("now")',
                    [user.id]
                );
                
                // Prepare response
                const userResponse = {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    organization: user.organization,
                    primary_role: user.primary_role,
                    avatar_initials: user.avatar_initials
                };
                
                console.log(`✅ Login successful: ${user.email}`);
                
                res.json({
                    success: true,
                    token,
                    user: userResponse
                });
                
            } catch (error) {
                console.error('Login error:', error);
                res.status(500).json({ 
                    error: 'Login failed',
                    code: 'LOGIN_FAILED',
                    details: error.message
                });
            }
        });
        
        // ===== PROJECTS =====
        this.app.get('/api/projects', async (req, res) => {
            try {
                console.log('Getting projects for user:', req.userId);
                
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
                console.error('Get projects error:', error);
                res.status(500).json({ 
                    error: 'Failed to load projects',
                    code: 'PROJECTS_LOAD_ERROR'
                });
            }
        });
        
        this.app.post('/api/projects', async (req, res) => {
            try {
                const { title, description, clinical_context, technical_challenge } = req.body;
                
                if (!title) {
                    return res.status(400).json({ 
                        error: 'Project title is required',
                        code: 'MISSING_TITLE'
                    });
                }
                
                const projectId = `proj_${crypto.randomBytes(8).toString('hex')}`;
                
                await this.runQuery(
                    `INSERT INTO projects (id, title, description, clinical_context, technical_challenge, created_by) 
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [
                        projectId,
                        title.trim(),
                        (description || '').trim(),
                        (clinical_context || '').trim(),
                        (technical_challenge || '').trim(),
                        req.userId
                    ]
                );
                
                const project = await this.getQuery(
                    'SELECT * FROM projects WHERE id = ?',
                    [projectId]
                );
                
                console.log(`✅ Project created: ${projectId} by ${req.user.email}`);
                
                res.status(201).json({
                    success: true,
                    project
                });
                
            } catch (error) {
                console.error('Create project error:', error);
                res.status(500).json({ 
                    error: 'Failed to create project',
                    code: 'PROJECT_CREATE_ERROR',
                    details: error.message
                });
            }
        });
        
        // ===== THREADS (FIXING THE 500 ERROR) =====
        this.app.post('/api/projects/:id/threads', async (req, res) => {
            try {
                const projectId = req.params.id;
                console.log('Creating thread for project:', projectId, 'by user:', req.userId);
                
                // Verify project exists and user has access
                const project = await this.getQuery(
                    'SELECT * FROM projects WHERE id = ? AND created_by = ?',
                    [projectId, req.userId]
                );
                
                if (!project) {
                    return res.status(404).json({ 
                        error: 'Project not found or access denied',
                        code: 'PROJECT_NOT_FOUND'
                    });
                }
                
                const { title, type, clinical_context, technical_context } = req.body;
                
                if (!title || !type) {
                    return res.status(400).json({ 
                        error: 'Thread title and type are required',
                        code: 'MISSING_FIELDS'
                    });
                }
                
                const threadId = `thread_${crypto.randomBytes(8).toString('hex')}`;
                
                await this.runQuery(
                    `INSERT INTO threads (id, project_id, title, type, clinical_context, technical_context, created_by) 
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        threadId,
                        projectId,
                        title.trim(),
                        type,
                        (clinical_context || '').trim(),
                        (technical_context || '').trim(),
                        req.userId
                    ]
                );
                
                const thread = await this.getQuery(
                    'SELECT t.*, u.name as author_name FROM threads t JOIN users u ON t.created_by = u.id WHERE t.id = ?',
                    [threadId]
                );
                
                console.log(`✅ Thread created: ${threadId} in project ${projectId}`);
                
                res.status(201).json({
                    success: true,
                    thread
                });
                
            } catch (error) {
                console.error('Create thread error:', error.message);
                console.error('Error details:', error);
                res.status(500).json({ 
                    error: 'Failed to create thread',
                    code: 'THREAD_CREATE_ERROR',
                    details: error.message
                });
            }
        });
        
        this.app.get('/api/threads/:id', async (req, res) => {
            try {
                const threadId = req.params.id;
                
                const thread = await this.getQuery(`
                    SELECT t.*, u.name as author_name, p.title as project_title
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
                
                const posts = await this.allQuery(`
                    SELECT p.*, u.name as author_name
                    FROM posts p
                    JOIN users u ON p.created_by = u.id
                    WHERE p.thread_id = ?
                    ORDER BY p.created_at
                `, [threadId]);
                
                res.json({
                    success: true,
                    thread,
                    posts: posts || []
                });
                
            } catch (error) {
                console.error('Get thread error:', error);
                res.status(500).json({ 
                    error: 'Failed to load thread',
                    code: 'THREAD_LOAD_ERROR'
                });
            }
        });
        
        this.app.post('/api/threads/:id/posts', async (req, res) => {
            try {
                const threadId = req.params.id;
                const { content, perspective } = req.body;
                
                if (!content) {
                    return res.status(400).json({ 
                        error: 'Post content is required',
                        code: 'MISSING_CONTENT'
                    });
                }
                
                // Verify thread exists
                const thread = await this.getQuery(
                    'SELECT * FROM threads WHERE id = ?',
                    [threadId]
                );
                
                if (!thread) {
                    return res.status(404).json({ 
                        error: 'Thread not found',
                        code: 'THREAD_NOT_FOUND'
                    });
                }
                
                const postId = `post_${crypto.randomBytes(8).toString('hex')}`;
                
                await this.runQuery(
                    'INSERT INTO posts (id, thread_id, content, perspective, created_by) VALUES (?, ?, ?, ?, ?)',
                    [postId, threadId, content.trim(), perspective || 'bridge', req.userId]
                );
                
                // Update thread timestamp
                await this.runQuery(
                    'UPDATE threads SET updated_at = datetime("now") WHERE id = ?',
                    [threadId]
                );
                
                const post = await this.getQuery(
                    'SELECT p.*, u.name as author_name FROM posts p JOIN users u ON p.created_by = u.id WHERE p.id = ?',
                    [postId]
                );
                
                res.status(201).json({
                    success: true,
                    post
                });
                
            } catch (error) {
                console.error('Create post error:', error);
                res.status(500).json({ 
                    error: 'Failed to create post',
                    code: 'POST_CREATE_ERROR'
                });
            }
        });
        
        // ===== FALLBACK ROUTE =====
        this.app.get('*', (req, res) => {
            // Serve SPA or 404
            if (req.path.startsWith('/api/')) {
                res.status(404).json({ 
                    error: 'API endpoint not found',
                    path: req.path 
                });
            } else {
                // Try to serve from public, otherwise send simple HTML
                const filePath = path.join(__dirname, 'public', req.path);
                if (fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory()) {
                    res.sendFile(filePath);
                } else {
                    res.send(`
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <title>ThoraxLab Pro</title>
                            <style>
                                body { font-family: Arial, sans-serif; margin: 40px; }
                                .container { max-width: 800px; margin: 0 auto; }
                                .status { background: #f0f0f0; padding: 20px; border-radius: 5px; }
                            </style>
                        </head>
                        <body>
                            <div class="container">
                                <h1>ThoraxLab Pro Server</h1>
                                <div class="status">
                                    <p>Server is running. API endpoints:</p>
                                    <ul>
                                        <li><a href="/api/health">/api/health</a> - Health check</li>
                                        <li>POST /api/login - User login</li>
                                        <li>GET /api/projects - List projects</li>
                                    </ul>
                                </div>
                            </div>
                        </body>
                        </html>
                    `);
                }
            }
        });
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
║                                                     ║
║     FIXES APPLIED:                                  ║
║     • Fixed 401 authentication errors               ║
║     • Fixed 500 thread creation errors              ║
║     • Fixed session expiration issues               ║
║     • Fixed JSON parse errors                       ║
║     • Added detailed error logging                  ║
╚══════════════════════════════════════════════════════╝
            `);
            
            // Auto-cleanup expired sessions every hour
            setInterval(async () => {
                try {
                    const result = await this.runQuery(
                        'DELETE FROM sessions WHERE expires_at < datetime("now")'
                    );
                    console.log(`🧹 Cleaned up expired sessions`);
                } catch (error) {
                    console.error('Cleanup error:', error.message);
                }
            }, 3600000);
        });
        
        // Handle server errors
        this.server.on('error', (error) => {
            console.error('❌ Server error:', error);
            if (error.code === 'EADDRINUSE') {
                console.log(`Port ${PORT} is already in use. Trying ${parseInt(PORT) + 1}...`);
                this.server.listen(parseInt(PORT) + 1, HOST);
            }
        });
    }
}

// Start the server
const server = new ThoraxLabServer();
module.exports = server;
