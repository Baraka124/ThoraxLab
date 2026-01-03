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
                service: 'thoraxlab',
                uptime: process.uptime()
            });
        });
        
        // Setup database paths
        const DB_DIR = process.env.NODE_ENV === 'production' ? '/tmp' : __dirname;
        this.DB_PATH = path.join(DB_DIR, 'thoraxlab.db');
        this.UPLOAD_PATH = path.join(DB_DIR, 'uploads');
        
        // Ensure directories exist
        [DB_DIR, this.UPLOAD_PATH].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
        
        this.db = new sqlite3.Database(this.DB_PATH);
        this.activeConnections = new Map();
        
        console.log('🚀 ThoraxLab Server Initializing...');
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

    // ========== DATABASE SETUP ==========
    async initializeSchema() {
        try {
            await this.runQuery('PRAGMA foreign_keys = ON');
            
            const tables = [
                `CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    email TEXT UNIQUE NOT NULL,
                    name TEXT NOT NULL,
                    organization TEXT,
                    role TEXT NOT NULL,
                    avatar_initials TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`,
                
                `CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    token TEXT UNIQUE NOT NULL,
                    expires_at DATETIME NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )`,
                
                `CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    description TEXT NOT NULL,
                    type TEXT NOT NULL,
                    lead_id TEXT NOT NULL,
                    status TEXT DEFAULT 'active',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (lead_id) REFERENCES users(id)
                )`,
                
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
                
                `CREATE TABLE IF NOT EXISTS documents (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    description TEXT,
                    filename TEXT,
                    filepath TEXT,
                    filetype TEXT,
                    filesize INTEGER,
                    tags TEXT DEFAULT '[]',
                    audience TEXT DEFAULT 'both',
                    author_id TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                    FOREIGN KEY (author_id) REFERENCES users(id)
                )`,
                
                `CREATE TABLE IF NOT EXISTS glossary (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    term TEXT NOT NULL,
                    clinical_definition TEXT,
                    technical_definition TEXT,
                    created_by TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                    FOREIGN KEY (created_by) REFERENCES users(id)
                )`,
                
                `CREATE TABLE IF NOT EXISTS translations (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    clinical_term TEXT NOT NULL,
                    technical_explanation TEXT NOT NULL,
                    analogy TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
                )`,
                
                `CREATE TABLE IF NOT EXISTS activity_log (
                    id TEXT PRIMARY KEY,
                    project_id TEXT,
                    user_id TEXT NOT NULL,
                    action TEXT NOT NULL,
                    target_type TEXT,
                    target_id TEXT,
                    details TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )`
            ];

            for (const sql of tables) {
                await this.runQuery(sql);
            }
            
            console.log('✅ Database schema ready');
            
        } catch (error) {
            console.error('Schema error (running anyway):', error.message);
        }
    }

    // ========== MIDDLEWARE ==========
    setupMiddleware() {
        // Static files
        this.app.use(express.static('public'));
        
        // JSON parsing
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
        
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
            max: 100,
            message: { error: 'Too many requests' }
        });
        
        // Authentication middleware
        this.app.use(async (req, res, next) => {
            const publicRoutes = ['/api/login', '/api/health', '/api/register'];
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

    // ========== ROUTES ==========
    setupRoutes() {
        // Login
        this.app.post('/api/login', async (req, res) => {
            try {
                const { email, name, organization, role } = req.body;
                
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

                    await this.runQuery(
                        'INSERT INTO users (id, email, name, organization, role, avatar_initials) VALUES (?, ?, ?, ?, ?, ?)',
                        [userId, email.toLowerCase(), name, organization || '', role || 'clinician', initials]
                    );

                    user = await this.getQuery('SELECT * FROM users WHERE id = ?', [userId]);
                }

                // Create session
                const token = crypto.randomBytes(32).toString('hex');
                const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

                await this.runQuery(
                    'INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)',
                    [`sess_${crypto.randomBytes(16).toString('hex')}`, user.id, token, expiresAt.toISOString()]
                );

                await this.logActivity(user.id, null, 'user_login', null, null, `User logged in`);

                res.json({
                    success: true,
                    token,
                    user: {
                        id: user.id,
                        email: user.email,
                        name: user.name,
                        organization: user.organization,
                        role: user.role,
                        avatar_initials: user.avatar_initials
                    }
                });

            } catch (error) {
                console.error('Login error:', error);
                res.status(500).json({ error: 'Login failed' });
            }
        });

        // Logout
        this.app.post('/api/logout', async (req, res) => {
            try {
                const token = req.headers.authorization?.replace('Bearer ', '');
                if (token) {
                    await this.runQuery('DELETE FROM sessions WHERE token = ?', [token]);
                }
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ error: 'Logout failed' });
            }
        });

        // Dashboard
        this.app.get('/api/dashboard', async (req, res) => {
            try {
                const userId = req.userId;
                
                const [projects, projectCount, docCount, activity] = await Promise.all([
                    this.allQuery(`
                        SELECT p.*, pt.role as user_role 
                        FROM projects p 
                        JOIN project_team pt ON p.id = pt.project_id 
                        WHERE pt.user_id = ? 
                        ORDER BY p.created_at DESC LIMIT 5
                    `, [userId]),
                    this.getQuery('SELECT COUNT(*) as count FROM projects WHERE lead_id = ?', [userId]),
                    this.getQuery('SELECT COUNT(*) as count FROM documents WHERE author_id = ?', [userId]),
                    this.allQuery(`
                        SELECT al.*, u.name as user_name 
                        FROM activity_log al 
                        JOIN users u ON al.user_id = u.id 
                        WHERE al.user_id = ? 
                        ORDER BY al.created_at DESC LIMIT 10
                    `, [userId])
                ]);

                res.json({
                    success: true,
                    dashboard: {
                        metrics: {
                            projects: projectCount?.count || 0,
                            documents: docCount?.count || 0,
                            teamMembers: 0,
                            activities: activity.length
                        },
                        projects,
                        recentActivity: activity
                    }
                });

            } catch (error) {
                console.error('Dashboard error:', error);
                res.status(500).json({ error: 'Failed to load dashboard' });
            }
        });

        // Projects
        this.app.get('/api/projects', async (req, res) => {
            try {
                const projects = await this.allQuery(`
                    SELECT p.*, u.name as lead_name 
                    FROM projects p 
                    JOIN project_team pt ON p.id = pt.project_id 
                    JOIN users u ON p.lead_id = u.id 
                    WHERE pt.user_id = ? 
                    ORDER BY p.created_at DESC
                `, [req.userId]);

                res.json({
                    success: true,
                    projects: projects || []
                });

            } catch (error) {
                res.status(500).json({ error: 'Failed to load projects' });
            }
        });

        this.app.post('/api/projects', async (req, res) => {
            try {
                const { title, description, type } = req.body;
                
                if (!title || !type) {
                    return res.status(400).json({ error: 'Title and type are required' });
                }
                
                const projectId = `proj_${crypto.randomBytes(16).toString('hex')}`;

                await this.runQuery(
                    'INSERT INTO projects (id, title, description, type, lead_id) VALUES (?, ?, ?, ?, ?)',
                    [projectId, title.trim(), (description || '').trim(), type, req.userId]
                );

                await this.runQuery(
                    'INSERT INTO project_team (id, project_id, user_id, role) VALUES (?, ?, ?, ?)',
                    [`team_${crypto.randomBytes(16).toString('hex')}`, projectId, req.userId, 'lead']
                );

                await this.logActivity(req.userId, projectId, 'create_project', 'project', projectId, `Created project: ${title}`);

                const project = await this.getQuery(
                    'SELECT p.*, u.name as lead_name FROM projects p JOIN users u ON p.lead_id = u.id WHERE p.id = ?',
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

        this.app.get('/api/projects/:id', async (req, res) => {
            try {
                const projectId = req.params.id;
                
                const [project, documents, glossary, translations, team, activity] = await Promise.all([
                    this.getQuery('SELECT * FROM projects WHERE id = ?', [projectId]),
                    this.allQuery(`
                        SELECT d.*, u.name as author_name 
                        FROM documents d 
                        JOIN users u ON d.author_id = u.id 
                        WHERE d.project_id = ? 
                        ORDER BY d.created_at DESC
                    `, [projectId]),
                    this.allQuery('SELECT * FROM glossary WHERE project_id = ? ORDER BY term', [projectId]),
                    this.allQuery('SELECT * FROM translations WHERE project_id = ? ORDER BY created_at DESC', [projectId]),
                    this.allQuery(`
                        SELECT pt.*, u.name, u.email, u.role as user_role, u.avatar_initials 
                        FROM project_team pt 
                        JOIN users u ON pt.user_id = u.id 
                        WHERE pt.project_id = ?
                    `, [projectId]),
                    this.allQuery(`
                        SELECT al.*, u.name as user_name 
                        FROM activity_log al 
                        JOIN users u ON al.user_id = u.id 
                        WHERE al.project_id = ? 
                        ORDER BY al.created_at DESC LIMIT 20
                    `, [projectId])
                ]);

                if (!project) {
                    return res.status(404).json({ error: 'Project not found' });
                }

                const parsedDocs = documents.map(doc => ({
                    ...doc,
                    tags: doc.tags ? JSON.parse(doc.tags) : []
                }));

                res.json({
                    success: true,
                    project,
                    documents: parsedDocs,
                    glossary,
                    translations,
                    team,
                    activity
                });

            } catch (error) {
                console.error('Get project error:', error);
                res.status(500).json({ error: 'Failed to load project' });
            }
        });

        // Document upload
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
            limits: { fileSize: 10 * 1024 * 1024 },
            fileFilter: (req, file, cb) => {
                const allowed = ['.pdf', '.doc', '.docx', '.txt', '.csv', '.json'];
                const ext = path.extname(file.originalname).toLowerCase();
                cb(null, allowed.includes(ext));
            }
        });

        this.app.post('/api/projects/:id/documents', upload.single('file'), async (req, res) => {
            try {
                const { title, description, tags, audience } = req.body;
                const file = req.file;
                const projectId = req.params.id;

                if (!title) {
                    return res.status(400).json({ error: 'Title is required' });
                }

                const docId = `doc_${crypto.randomBytes(16).toString('hex')}`;
                const tagArray = tags ? tags.split(',').map(t => t.trim()).filter(t => t) : [];

                await this.runQuery(
                    `INSERT INTO documents (id, project_id, title, description, filename, filepath, 
                     filetype, filesize, tags, audience, author_id) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        docId,
                        projectId,
                        title.trim(),
                        (description || '').trim(),
                        file ? file.originalname : 'untitled.txt',
                        file ? file.path : '',
                        file ? file.mimetype : 'text/plain',
                        file ? file.size : 0,
                        JSON.stringify(tagArray),
                        audience || 'both',
                        req.userId
                    ]
                );

                await this.logActivity(req.userId, projectId, 'upload_document', 'document', docId, `Uploaded: ${title}`);

                res.json({
                    success: true,
                    document: {
                        id: docId,
                        title: title.trim()
                    }
                });

            } catch (error) {
                console.error('Upload error:', error);
                res.status(500).json({ error: 'Failed to upload document' });
            }
        });

        // File download
        this.app.get('/api/documents/:id/download', async (req, res) => {
            try {
                const doc = await this.getQuery(
                    'SELECT * FROM documents WHERE id = ?',
                    [req.params.id]
                );
                
                if (!doc || !doc.filepath || !fs.existsSync(doc.filepath)) {
                    return res.status(404).json({ error: 'File not found' });
                }
                
                res.download(doc.filepath, doc.filename);
            } catch (error) {
                res.status(500).json({ error: 'Download failed' });
            }
        });

        // Glossary
        this.app.post('/api/projects/:id/glossary', async (req, res) => {
            try {
                const { term, clinical_definition, technical_definition } = req.body;
                
                if (!term) {
                    return res.status(400).json({ error: 'Term is required' });
                }

                const glossId = `gloss_${crypto.randomBytes(16).toString('hex')}`;
                
                await this.runQuery(
                    'INSERT INTO glossary (id, project_id, term, clinical_definition, technical_definition, created_by) VALUES (?, ?, ?, ?, ?, ?)',
                    [glossId, req.params.id, term.trim(), (clinical_definition || '').trim(), (technical_definition || '').trim(), req.userId]
                );

                await this.logActivity(req.userId, req.params.id, 'add_glossary', 'glossary', glossId, `Added term: ${term}`);

                res.json({ success: true, id: glossId });

            } catch (error) {
                res.status(500).json({ error: 'Failed to add glossary term' });
            }
        });

        // Translations
        this.app.post('/api/projects/:id/translations', async (req, res) => {
            try {
                const { clinical_term, technical_explanation, analogy } = req.body;
                
                if (!clinical_term || !technical_explanation) {
                    return res.status(400).json({ error: 'Both terms are required' });
                }

                const transId = `trans_${crypto.randomBytes(16).toString('hex')}`;
                
                await this.runQuery(
                    'INSERT INTO translations (id, project_id, clinical_term, technical_explanation, analogy) VALUES (?, ?, ?, ?, ?)',
                    [transId, req.params.id, clinical_term.trim(), technical_explanation.trim(), (analogy || '').trim()]
                );

                await this.logActivity(req.userId, req.params.id, 'add_translation', 'translation', transId, `Added translation: ${clinical_term}`);

                res.json({ success: true, id: transId });

            } catch (error) {
                res.status(500).json({ error: 'Failed to add translation' });
            }
        });

        // Search
        this.app.get('/api/search', async (req, res) => {
            try {
                const { q, project_id } = req.query;
                
                if (!q) {
                    return res.json({ success: true, results: [] });
                }

                const searchTerm = `%${q}%`;
                let query = '';
                let params = [];

                if (project_id) {
                    query = `
                        SELECT 'document' as type, id, title, description, created_at 
                        FROM documents 
                        WHERE project_id = ? AND (title LIKE ? OR description LIKE ?)
                        UNION
                        SELECT 'glossary' as type, id, term as title, clinical_definition as description, created_at 
                        FROM glossary 
                        WHERE project_id = ? AND term LIKE ?
                        ORDER BY created_at DESC
                    `;
                    params = [project_id, searchTerm, searchTerm, project_id, searchTerm];
                } else {
                    query = `
                        SELECT 'project' as type, id, title, description, created_at 
                        FROM projects 
                        WHERE id IN (SELECT project_id FROM project_team WHERE user_id = ?) 
                        AND (title LIKE ? OR description LIKE ?)
                        ORDER BY created_at DESC
                    `;
                    params = [req.userId, searchTerm, searchTerm];
                }

                const results = await this.allQuery(query, params);
                res.json({ success: true, results });

            } catch (error) {
                res.status(500).json({ error: 'Search failed' });
            }
        });

        // Serve SPA
        this.app.get('*', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        });
    }

    // ========== HELPER METHODS ==========
    async logActivity(userId, projectId, action, targetType, targetId, details) {
        try {
            const actId = `act_${crypto.randomBytes(16).toString('hex')}`;
            await this.runQuery(
                'INSERT INTO activity_log (id, project_id, user_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [actId, projectId, userId, action, targetType, targetId, details]
            );
        } catch (error) {
            console.error('Log activity error:', error);
        }
    }

    // ========== WEBSOCKET ==========
    setupWebSocket() {
        this.wss.on('connection', (ws) => {
            console.log('WebSocket connected');
            
            ws.on('message', async (data) => {
                try {
                    const msg = JSON.parse(data.toString());
                    
                    if (msg.type === 'auth') {
                        const session = await this.getQuery(
                            'SELECT * FROM sessions WHERE token = ? AND expires_at > datetime("now")',
                            [msg.token]
                        );
                        
                        if (session) {
                            ws.userId = session.user_id;
                            ws.send(JSON.stringify({ type: 'auth_success' }));
                        }
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

    // ========== INITIALIZE ==========
    async initialize() {
        // Setup middleware and routes first
        this.setupMiddleware();
        this.setupRoutes();
        this.setupWebSocket();
        
        // Initialize database schema (non-blocking)
        this.initializeSchema().then(() => {
            console.log('✅ Database initialized');
        }).catch(err => {
            console.error('❌ Database init failed (continuing):', err.message);
        });
        
        // Start server
        this.startServer();
        
        // Cleanup expired sessions every hour
        setInterval(async () => {
            try {
                await this.runQuery('DELETE FROM sessions WHERE expires_at < datetime("now")');
            } catch (error) {
                console.error('Cleanup error:', error);
            }
        }, 3600000);
    }

    // ========== START SERVER ==========
    startServer() {
        const PORT = process.env.PORT || 3000;
        const HOST = '0.0.0.0';
        
        this.server.listen(PORT, HOST, () => {
            console.log(`
╔══════════════════════════════════════════════════════╗
║     THORAXLAB SERVER STARTED                         ║
╠══════════════════════════════════════════════════════╣
║     Server: http://${HOST}:${PORT}                      ║
║     Health: http://${HOST}:${PORT}/api/health         ║
║     Environment: ${process.env.NODE_ENV || 'development'}         ║
╚══════════════════════════════════════════════════════╝
            `);
        });
    }
}

// Start server
const server = new ThoraxLabServer();
module.exports = server;
