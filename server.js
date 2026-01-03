const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const session = require('express-session');

class ThoraxLabServer {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.wss = new WebSocket.Server({ server: this.server });
        this.db = null;
        this.connected = false;
        this.DB_PATH = path.join(__dirname, 'data', 'thoraxlab.db');
        this.UPLOAD_PATH = path.join(__dirname, 'uploads');
        this.activeConnections = new Map();
        
        this.ensureDirectories();
        this.initialize();
    }

    ensureDirectories() {
        [path.dirname(this.DB_PATH), this.UPLOAD_PATH].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }

    async initialize() {
        await this.setupDatabase();
        this.setupMiddleware();
        this.setupRoutes();
        this.setupWebSocket();
        this.setupErrorHandling();
        this.startServer();
    }

    // ========== DATABASE SETUP ==========
    async setupDatabase() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.DB_PATH, (err) => {
                if (err) {
                    console.error('Database connection failed:', err.message);
                    reject(err);
                } else {
                    this.connected = true;
                    console.log('Database connected:', this.DB_PATH);
                    this.initializeSchema().then(resolve).catch(reject);
                }
            });
        });
    }

    async initializeSchema() {
        await this.runQuery('PRAGMA foreign_keys = ON');
        
        const tables = [
            `CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                organization TEXT NOT NULL,
                role TEXT NOT NULL,
                avatar_initials TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            
            `CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                token TEXT UNIQUE NOT NULL,
                expires_at DATETIME NOT NULL,
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
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
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
                version INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (author_id) REFERENCES users(id)
            )`,
            
            `CREATE TABLE IF NOT EXISTS document_tags (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL,
                tag TEXT NOT NULL,
                category TEXT NOT NULL,
                FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
                UNIQUE(document_id, tag)
            )`,
            
            `CREATE TABLE IF NOT EXISTS comments (
                id TEXT PRIMARY KEY,
                document_id TEXT,
                project_id TEXT,
                content TEXT NOT NULL,
                author_id TEXT NOT NULL,
                parent_id TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
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
        console.log('Database schema ready');
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
                err ? reject(err) : resolve(rows);
            });
        });
    }

    // ========== MIDDLEWARE ==========
    setupMiddleware() {
        // Static files
        this.app.use(express.static('public'));
        
        // JSON parsing
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
        
        // CORS
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
            next();
        });
        
        // Authentication middleware
        this.app.use(async (req, res, next) => {
            const publicRoutes = ['/api/login', '/api/register', '/api/health'];
            if (publicRoutes.some(route => req.path.startsWith(route))) {
                return next();
            }
            
            const token = req.headers.authorization?.replace('Bearer ', '');
            if (!token) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            
            const session = await this.getSession(token);
            if (!session) {
                return res.status(401).json({ error: 'Invalid or expired session' });
            }
            
            req.userId = session.user_id;
            next();
        });
    }

    // ========== ROUTES ==========
    setupRoutes() {
        // Health check
        this.app.get('/api/health', (req, res) => {
            res.json({
                status: 'ok',
                timestamp: new Date().toISOString(),
                database: this.connected ? 'connected' : 'disconnected'
            });
        });

        // Authentication
        this.app.post('/api/login', async (req, res) => {
            try {
                const { email, name, organization, role } = req.body;
                
                if (!email || !name) {
                    return res.status(400).json({ error: 'Email and name required' });
                }

                // Find or create user
                let user = await this.getQuery(
                    'SELECT * FROM users WHERE email = ?',
                    [email.toLowerCase()]
                );

                if (!user) {
                    const userId = `user_${crypto.randomUUID()}`;
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
                const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

                await this.runQuery(
                    'INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)',
                    [`sess_${crypto.randomUUID()}`, user.id, token, expiresAt.toISOString()]
                );

                // Log activity
                await this.logActivity(user.id, null, 'user_login', 'user', user.id, `User logged in`);

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
                
                // Get projects
                const projects = await this.allQuery(`
                    SELECT p.*, pt.role as user_role 
                    FROM projects p 
                    JOIN project_team pt ON p.id = pt.project_id 
                    WHERE pt.user_id = ? 
                    ORDER BY p.updated_at DESC
                `, [userId]);

                // Get metrics
                const [projectCount, documentCount, teamCount, activityCount] = await Promise.all([
                    this.getQuery('SELECT COUNT(*) as count FROM projects WHERE lead_id = ?', [userId]),
                    this.getQuery(`
                        SELECT COUNT(*) as count FROM documents 
                        WHERE project_id IN (SELECT project_id FROM project_team WHERE user_id = ?)
                    `, [userId]),
                    this.getQuery(`
                        SELECT COUNT(DISTINCT pt2.user_id) as count 
                        FROM project_team pt1 
                        JOIN project_team pt2 ON pt1.project_id = pt2.project_id 
                        WHERE pt1.user_id = ? AND pt2.user_id != ?
                    `, [userId, userId]),
                    this.getQuery('SELECT COUNT(*) as count FROM activity_log WHERE user_id = ?', [userId])
                ]);

                // Recent activity
                const recentActivity = await this.allQuery(`
                    SELECT al.*, p.title as project_title, u.name as user_name
                    FROM activity_log al
                    LEFT JOIN projects p ON al.project_id = p.id
                    JOIN users u ON al.user_id = u.id
                    WHERE al.project_id IN (SELECT project_id FROM project_team WHERE user_id = ?)
                    ORDER BY al.created_at DESC
                    LIMIT 10
                `, [userId]);

                res.json({
                    success: true,
                    dashboard: {
                        metrics: {
                            projects: projectCount?.count || 0,
                            documents: documentCount?.count || 0,
                            teamMembers: teamCount?.count || 0,
                            activities: activityCount?.count || 0
                        },
                        projects: projects.slice(0, 5),
                        recentActivity
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
                    SELECT p.*, 
                           (SELECT COUNT(*) FROM project_team WHERE project_id = p.id) as team_count,
                           (SELECT COUNT(*) FROM documents WHERE project_id = p.id) as document_count,
                           u.name as lead_name
                    FROM projects p
                    JOIN project_team pt ON p.id = pt.project_id
                    JOIN users u ON p.lead_id = u.id
                    WHERE pt.user_id = ?
                    ORDER BY p.updated_at DESC
                `, [req.userId]);

                res.json({
                    success: true,
                    projects
                });

            } catch (error) {
                res.status(500).json({ error: 'Failed to load projects' });
            }
        });

        this.app.post('/api/projects', async (req, res) => {
            try {
                const { title, description, type } = req.body;
                const projectId = `project_${crypto.randomUUID()}`;

                await this.runQuery(
                    'INSERT INTO projects (id, title, description, type, lead_id) VALUES (?, ?, ?, ?, ?)',
                    [projectId, title, description || '', type || 'clinical', req.userId]
                );

                await this.runQuery(
                    'INSERT INTO project_team (id, project_id, user_id, role) VALUES (?, ?, ?, ?)',
                    [`team_${crypto.randomUUID()}`, projectId, req.userId, 'lead']
                );

                // Log activity
                await this.logActivity(req.userId, projectId, 'create_project', 'project', projectId, `Created project: ${title}`);

                const project = await this.getQuery(`
                    SELECT p.*, u.name as lead_name 
                    FROM projects p 
                    JOIN users u ON p.lead_id = u.id 
                    WHERE p.id = ?
                `, [projectId]);

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
                
                // Verify access
                const hasAccess = await this.getQuery(
                    'SELECT 1 FROM project_team WHERE project_id = ? AND user_id = ?',
                    [projectId, req.userId]
                );
                
                if (!hasAccess) {
                    return res.status(403).json({ error: 'Access denied' });
                }

                const [project, team, documents, glossary, translations, activity] = await Promise.all([
                    this.getQuery('SELECT * FROM projects WHERE id = ?', [projectId]),
                    this.allQuery(`
                        SELECT pt.*, u.name, u.email, u.role as user_role, u.avatar_initials
                        FROM project_team pt
                        JOIN users u ON pt.user_id = u.id
                        WHERE pt.project_id = ?
                        ORDER BY pt.joined_at
                    `, [projectId]),
                    this.allQuery(`
                        SELECT d.*, u.name as author_name, u.avatar_initials
                        FROM documents d
                        JOIN users u ON d.author_id = u.id
                        WHERE d.project_id = ?
                        ORDER BY d.created_at DESC
                    `, [projectId]),
                    this.allQuery('SELECT * FROM glossary WHERE project_id = ? ORDER BY term', [projectId]),
                    this.allQuery('SELECT * FROM translations WHERE project_id = ? ORDER BY created_at DESC', [projectId]),
                    this.allQuery(`
                        SELECT al.*, u.name as user_name, u.avatar_initials
                        FROM activity_log al
                        JOIN users u ON al.user_id = u.id
                        WHERE al.project_id = ?
                        ORDER BY al.created_at DESC
                        LIMIT 20
                    `, [projectId])
                ]);

                if (!project) {
                    return res.status(404).json({ error: 'Project not found' });
                }

                // Parse JSON fields
                const parsedDocuments = documents.map(doc => ({
                    ...doc,
                    tags: doc.tags ? JSON.parse(doc.tags) : []
                }));

                res.json({
                    success: true,
                    project,
                    team,
                    documents: parsedDocuments,
                    glossary,
                    translations,
                    activity
                });

            } catch (error) {
                console.error('Get project error:', error);
                res.status(500).json({ error: 'Failed to load project' });
            }
        });

        // Documents
        const storage = multer.diskStorage({
            destination: (req, file, cb) => {
                cb(null, this.UPLOAD_PATH);
            },
            filename: (req, file, cb) => {
                const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2)}${path.extname(file.originalname)}`;
                cb(null, uniqueName);
            }
        });

        const upload = multer({
            storage,
            limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
            fileFilter: (req, file, cb) => {
                const allowedTypes = ['.pdf', '.doc', '.docx', '.txt', '.csv', '.json', '.xlsx', '.jpg', '.png'];
                const ext = path.extname(file.originalname).toLowerCase();
                if (allowedTypes.includes(ext)) {
                    cb(null, true);
                } else {
                    cb(new Error('File type not allowed'));
                }
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

                const documentId = `doc_${crypto.randomUUID()}`;
                const tagArray = tags ? tags.split(',').map(t => t.trim()).filter(t => t) : [];

                await this.runQuery(
                    `INSERT INTO documents (id, project_id, title, description, filename, filepath, 
                     filetype, filesize, tags, audience, author_id) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        documentId,
                        projectId,
                        title,
                        description || '',
                        file ? file.originalname : 'untitled.txt',
                        file ? file.path : '',
                        file ? file.mimetype : 'text/plain',
                        file ? file.size : 0,
                        JSON.stringify(tagArray),
                        audience || 'both',
                        req.userId
                    ]
                );

                // Add tags to document_tags table
                for (const tag of tagArray) {
                    const [category, value] = tag.includes(':') ? tag.split(':') : ['custom', tag];
                    await this.runQuery(
                        'INSERT INTO document_tags (id, document_id, tag, category) VALUES (?, ?, ?, ?)',
                        [`tag_${crypto.randomUUID()}`, documentId, tag, category]
                    );
                }

                // Log activity
                await this.logActivity(req.userId, projectId, 'upload_document', 'document', documentId, `Uploaded: ${title}`);

                res.json({
                    success: true,
                    document: {
                        id: documentId,
                        title,
                        filename: file ? file.originalname : null,
                        created_at: new Date().toISOString()
                    }
                });

            } catch (error) {
                console.error('Upload error:', error);
                res.status(500).json({ error: 'Failed to upload document' });
            }
        });

        // Glossary
        this.app.post('/api/projects/:id/glossary', async (req, res) => {
            try {
                const { term, clinical_definition, technical_definition } = req.body;
                
                if (!term) {
                    return res.status(400).json({ error: 'Term is required' });
                }

                const glossaryId = `gloss_${crypto.randomUUID()}`;
                
                await this.runQuery(
                    'INSERT INTO glossary (id, project_id, term, clinical_definition, technical_definition, created_by) VALUES (?, ?, ?, ?, ?, ?)',
                    [glossaryId, req.params.id, term, clinical_definition || '', technical_definition || '', req.userId]
                );

                await this.logActivity(req.userId, req.params.id, 'add_glossary', 'glossary', glossaryId, `Added term: ${term}`);

                res.json({ success: true, id: glossaryId });

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

                const translationId = `trans_${crypto.randomUUID()}`;
                
                await this.runQuery(
                    'INSERT INTO translations (id, project_id, clinical_term, technical_explanation, analogy) VALUES (?, ?, ?, ?, ?)',
                    [translationId, req.params.id, clinical_term, technical_explanation, analogy || '']
                );

                await this.logActivity(req.userId, req.params.id, 'add_translation', 'translation', translationId, `Added translation: ${clinical_term}`);

                res.json({ success: true, id: translationId });

            } catch (error) {
                res.status(500).json({ error: 'Failed to add translation' });
            }
        });

        // Comments
        this.app.post('/api/comments', async (req, res) => {
            try {
                const { document_id, project_id, content, parent_id } = req.body;
                
                if (!content) {
                    return res.status(400).json({ error: 'Comment content required' });
                }

                const commentId = `comment_${crypto.randomUUID()}`;
                
                await this.runQuery(
                    'INSERT INTO comments (id, document_id, project_id, content, author_id, parent_id) VALUES (?, ?, ?, ?, ?, ?)',
                    [commentId, document_id || null, project_id || null, content, req.userId, parent_id || null]
                );

                const targetId = document_id || project_id;
                const targetType = document_id ? 'document' : 'project';
                await this.logActivity(req.userId, project_id, 'add_comment', targetType, targetId, `Added comment`);

                res.json({ success: true, id: commentId });

            } catch (error) {
                res.status(500).json({ error: 'Failed to add comment' });
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
                        WHERE project_id = ? AND (term LIKE ? OR clinical_definition LIKE ? OR technical_definition LIKE ?)
                        ORDER BY created_at DESC
                    `;
                    params = [project_id, searchTerm, searchTerm, project_id, searchTerm, searchTerm, searchTerm];
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

    // ========== WEBSOCKET ==========
    setupWebSocket() {
        this.wss.on('connection', (ws, req) => {
            console.log('New WebSocket connection');

            ws.on('message', async (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    
                    switch (message.type) {
                        case 'auth':
                            const session = await this.getSession(message.token);
                            if (session) {
                                ws.userId = session.user_id;
                                ws.send(JSON.stringify({ type: 'auth_success' }));
                            } else {
                                ws.send(JSON.stringify({ type: 'auth_failed' }));
                            }
                            break;
                            
                        case 'join_project':
                            if (ws.userId) {
                                ws.projectId = message.projectId;
                                // Notify others in project
                                this.broadcastToProject(message.projectId, {
                                    type: 'user_joined',
                                    userId: ws.userId
                                }, ws);
                            }
                            break;
                            
                        case 'typing':
                            if (ws.userId && ws.projectId) {
                                this.broadcastToProject(ws.projectId, {
                                    type: 'user_typing',
                                    userId: ws.userId,
                                    documentId: message.documentId
                                }, ws);
                            }
                            break;
                            
                        case 'comment':
                            if (ws.userId && ws.projectId) {
                                this.broadcastToProject(ws.projectId, {
                                    type: 'new_comment',
                                    comment: message.comment,
                                    userId: ws.userId,
                                    timestamp: new Date().toISOString()
                                }, ws);
                            }
                            break;
                    }
                } catch (error) {
                    console.error('WebSocket error:', error);
                }
            });

            ws.on('close', () => {
                if (ws.projectId && ws.userId) {
                    this.broadcastToProject(ws.projectId, {
                        type: 'user_left',
                        userId: ws.userId
                    });
                }
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

    // ========== HELPER METHODS ==========
    async getSession(token) {
        const session = await this.getQuery(
            'SELECT * FROM sessions WHERE token = ? AND expires_at > ?',
            [token, new Date().toISOString()]
        );
        return session;
    }

    async logActivity(userId, projectId, action, targetType, targetId, details) {
        const activityId = `act_${crypto.randomUUID()}`;
        await this.runQuery(
            'INSERT INTO activity_log (id, project_id, user_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [activityId, projectId, userId, action, targetType, targetId, details]
        );
    }

    // ========== ERROR HANDLING ==========
    setupErrorHandling() {
        this.app.use((err, req, res, next) => {
            console.error('Server error:', err);
            
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({ error: 'File too large. Maximum size is 10MB' });
                }
                return res.status(400).json({ error: 'File upload error' });
            }
            
            res.status(500).json({ 
                error: 'Internal server error',
                message: process.env.NODE_ENV === 'development' ? err.message : undefined
            });
        });
    }

    // ========== SERVER START ==========
    startServer() {
        const PORT = process.env.PORT || 3000;
        this.server.listen(PORT, () => {
            console.log(`
╔══════════════════════════════════════════════════════╗
║     THORAXLAB SERVER STARTED                         ║
╠══════════════════════════════════════════════════════╣
║     Server: http://localhost:${PORT}                      ║
║     API:    http://localhost:${PORT}/api/*              ║
║     WebSocket: ws://localhost:${PORT}                   ║
║     Database: ${this.connected ? 'Connected' : 'Failed'}                ║
╚══════════════════════════════════════════════════════╝
            `);
        });
    }
}

// Start server
const server = new ThoraxLabServer();
module.exports = server;
