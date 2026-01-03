const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Pool } = require('pg');  // PostgreSQL instead of sqlite3
const multer = require('multer');
const rateLimit = require('express-rate-limit');

class ThoraxLabServer {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.wss = new WebSocket.Server({ server: this.server });
        
        // PostgreSQL connection for Railway
        this.pool = new Pool({
            connectionString: process.env.DATABASE_URL || 
                             'postgresql://localhost:5432/thoraxlab',
            ssl: process.env.NODE_ENV === 'production' ? { 
                rejectUnauthorized: false 
            } : false,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000
        });
        
        this.activeConnections = new Map();
        
        // No need for DB_PATH or UPLOAD_PATH setup for Railway
        // Railway provides DATABASE_URL automatically when PostgreSQL plugin is added
        
        this.initialize();
    }

    async initialize() {
        await this.setupDatabase();
        this.setupMiddleware();
        this.setupRoutes();
        this.setupWebSocket();
        this.setupErrorHandling();
        this.setupSessionCleanup();
        this.startServer();
    }

    // ========== DATABASE SETUP ==========
    async setupDatabase() {
        try {
            // Test connection
            await this.pool.query('SELECT NOW()');
            console.log('✅ PostgreSQL connected via DATABASE_URL');
            
            await this.initializeSchema();
        } catch (error) {
            console.error('❌ Database connection failed:', error.message);
            console.log('💡 Make sure to add PostgreSQL plugin in Railway dashboard');
            console.log('💡 Railway will automatically set DATABASE_URL environment variable');
            process.exit(1);
        }
    }

    async initializeSchema() {
        const tables = [
            // Enable UUID extension
            `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`,
            
            // Users table
            `CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                email TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                organization TEXT,
                role TEXT NOT NULL,
                avatar_initials TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // Sessions table
            `CREATE TABLE IF NOT EXISTS sessions (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token TEXT UNIQUE NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // Projects table
            `CREATE TABLE IF NOT EXISTS projects (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                type TEXT NOT NULL,
                lead_id UUID NOT NULL REFERENCES users(id),
                status TEXT DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // Project team table
            `CREATE TABLE IF NOT EXISTS project_team (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                role TEXT NOT NULL,
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(project_id, user_id)
            )`,
            
            // Documents table - STORE FILES IN DATABASE FOR RAILWAY
            `CREATE TABLE IF NOT EXISTS documents (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                description TEXT,
                filename TEXT,
                file_content TEXT, -- Store as base64 for Railway persistence
                filetype TEXT,
                filesize INTEGER,
                tags JSONB DEFAULT '[]'::jsonb,
                audience TEXT DEFAULT 'both',
                author_id UUID NOT NULL REFERENCES users(id),
                version INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // Document tags table
            `CREATE TABLE IF NOT EXISTS document_tags (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                tag TEXT NOT NULL,
                category TEXT NOT NULL,
                UNIQUE(document_id, tag)
            )`,
            
            // Comments table
            `CREATE TABLE IF NOT EXISTS comments (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
                project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
                content TEXT NOT NULL,
                author_id UUID NOT NULL REFERENCES users(id),
                parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // Glossary table
            `CREATE TABLE IF NOT EXISTS glossary (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                term TEXT NOT NULL,
                clinical_definition TEXT,
                technical_definition TEXT,
                created_by UUID NOT NULL REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // Translations table
            `CREATE TABLE IF NOT EXISTS translations (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                clinical_term TEXT NOT NULL,
                technical_explanation TEXT NOT NULL,
                analogy TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // Activity log table
            `CREATE TABLE IF NOT EXISTS activity_log (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
                user_id UUID NOT NULL REFERENCES users(id),
                action TEXT NOT NULL,
                target_type TEXT,
                target_id UUID,
                details TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`
        ];

        for (const sql of tables) {
            try {
                await this.pool.query(sql);
            } catch (error) {
                console.error('Schema creation error:', error.message);
            }
        }
        
        // Create indexes for performance
        await this.createIndexes();
        
        console.log('✅ Database schema ready');
    }

    async createIndexes() {
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_projects_lead ON projects(lead_id)',
            'CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id)',
            'CREATE INDEX IF NOT EXISTS idx_documents_author ON documents(author_id)',
            'CREATE INDEX IF NOT EXISTS idx_activity_project ON activity_log(project_id)',
            'CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_log(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token)',
            'CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)',
            'CREATE INDEX IF NOT EXISTS idx_project_team_user ON project_team(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_project_team_project ON project_team(project_id)',
            'CREATE INDEX IF NOT EXISTS idx_comments_document ON comments(document_id)',
            'CREATE INDEX IF NOT EXISTS idx_comments_project ON comments(project_id)',
            'CREATE INDEX IF NOT EXISTS idx_glossary_project ON glossary(project_id)',
            'CREATE INDEX IF NOT EXISTS idx_translations_project ON translations(project_id)'
        ];

        for (const sql of indexes) {
            try {
                await this.pool.query(sql);
            } catch (error) {
                console.error('Index creation error:', error.message);
            }
        }
    }

    // ========== DATABASE HELPERS ==========
    async runQuery(sql, params = []) {
        try {
            const result = await this.pool.query(sql, params);
            return result;
        } catch (error) {
            console.error('Query error:', error.message, '\nSQL:', sql);
            throw error;
        }
    }

    async getQuery(sql, params = []) {
        const result = await this.runQuery(sql, params);
        return result.rows[0] || null;
    }

    async allQuery(sql, params = []) {
        const result = await this.runQuery(sql, params);
        return result.rows;
    }

    // ========== MIDDLEWARE ==========
    setupMiddleware() {
        // Static files from public folder
        this.app.use(express.static('public'));
        
        // JSON parsing
        this.app.use(express.json({ limit: '10mb' })); // Increased for file uploads
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
        
        // Rate limiting
        const limiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 100, // limit each IP to 100 requests per windowMs
            message: 'Too many requests, please try again later.',
            standardHeaders: true,
            legacyHeaders: false
        });
        
        // CORS for Railway
        this.app.use((req, res, next) => {
            const allowedOrigins = [
                'http://localhost:3000',
                'https://thoraxlab-production.up.railway.app',
                'https://thoraxlab.railway.app',
                /\.railway\.app$/ // Allow all Railway subdomains
            ];
            
            const origin = req.headers.origin;
            if (origin) {
                const isAllowed = allowedOrigins.some(allowed => {
                    if (typeof allowed === 'string') return origin === allowed;
                    if (allowed instanceof RegExp) return allowed.test(origin);
                    return false;
                });
                
                if (isAllowed) {
                    res.header('Access-Control-Allow-Origin', origin);
                }
            }
            
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
            res.header('Access-Control-Allow-Credentials', 'true');
            
            if (req.method === 'OPTIONS') {
                return res.status(200).end();
            }
            
            next();
        });
        
        // Apply rate limiting to auth routes
        this.app.use('/api/login', limiter);
        
        // Authentication middleware
        this.app.use(async (req, res, next) => {
            const publicRoutes = ['/api/login', '/api/health'];
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
        this.app.get('/api/health', async (req, res) => {
            try {
                await this.pool.query('SELECT NOW()');
                res.json({
                    status: 'ok',
                    timestamp: new Date().toISOString(),
                    database: 'connected',
                    uptime: process.uptime(),
                    environment: process.env.NODE_ENV || 'development'
                });
            } catch (error) {
                res.status(503).json({
                    status: 'error',
                    timestamp: new Date().toISOString(),
                    database: 'disconnected',
                    error: error.message
                });
            }
        });

        // Authentication (unchanged mostly)
        this.app.post('/api/login', async (req, res) => {
            try {
                const { email, name, organization, role } = req.body;
                
                if (!email || !name) {
                    return res.status(400).json({ error: 'Email and name required' });
                }

                // Find or create user
                let user = await this.getQuery(
                    'SELECT * FROM users WHERE email = $1',
                    [email.toLowerCase()]
                );

                if (!user) {
                    const initials = name.split(' ')
                        .map(n => n[0])
                        .join('')
                        .toUpperCase()
                        .substring(0, 2);

                    const result = await this.runQuery(
                        'INSERT INTO users (email, name, organization, role, avatar_initials) VALUES ($1, $2, $3, $4, $5) RETURNING *',
                        [email.toLowerCase(), name, organization || '', role || 'clinician', initials]
                    );

                    user = result.rows[0];
                }

                // Create session
                const token = crypto.randomBytes(32).toString('hex');
                const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

                await this.runQuery(
                    'INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)',
                    [user.id, token, expiresAt.toISOString()]
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

        // Dashboard (updated for PostgreSQL)
        this.app.get('/api/dashboard', async (req, res) => {
            try {
                const userId = req.userId;
                
                // Get projects
                const projects = await this.allQuery(`
                    SELECT p.*, pt.role as user_role 
                    FROM projects p 
                    JOIN project_team pt ON p.id = pt.project_id 
                    WHERE pt.user_id = $1 
                    ORDER BY p.updated_at DESC
                `, [userId]);

                // Get metrics
                const [projectCount, documentCount, teamCount, activityCount] = await Promise.all([
                    this.getQuery('SELECT COUNT(*) as count FROM projects WHERE lead_id = $1', [userId]),
                    this.getQuery(`
                        SELECT COUNT(*) as count FROM documents 
                        WHERE project_id IN (SELECT project_id FROM project_team WHERE user_id = $1)
                    `, [userId]),
                    this.getQuery(`
                        SELECT COUNT(DISTINCT pt2.user_id) as count 
                        FROM project_team pt1 
                        JOIN project_team pt2 ON pt1.project_id = pt2.project_id 
                        WHERE pt1.user_id = $1 AND pt2.user_id != $2
                    `, [userId, userId]),
                    this.getQuery('SELECT COUNT(*) as count FROM activity_log WHERE user_id = $1', [userId])
                ]);

                // Recent activity
                const recentActivity = await this.allQuery(`
                    SELECT al.*, p.title as project_title, u.name as user_name
                    FROM activity_log al
                    LEFT JOIN projects p ON al.project_id = p.id
                    JOIN users u ON al.user_id = u.id
                    WHERE al.project_id IN (SELECT project_id FROM project_team WHERE user_id = $1)
                    ORDER BY al.created_at DESC
                    LIMIT 10
                `, [userId]);

                res.json({
                    success: true,
                    dashboard: {
                        metrics: {
                            projects: parseInt(projectCount?.count || 0),
                            documents: parseInt(documentCount?.count || 0),
                            teamMembers: parseInt(teamCount?.count || 0),
                            activities: parseInt(activityCount?.count || 0)
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

        // Projects (updated for PostgreSQL)
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
                    WHERE pt.user_id = $1
                    ORDER BY p.updated_at DESC
                `, [req.userId]);

                res.json({
                    success: true,
                    projects
                });

            } catch (error) {
                console.error('Projects error:', error);
                res.status(500).json({ error: 'Failed to load projects' });
            }
        });

        this.app.post('/api/projects', async (req, res) => {
            try {
                const { title, description, type } = req.body;
                
                if (!title || !type) {
                    return res.status(400).json({ error: 'Title and type are required' });
                }

                const result = await this.runQuery(
                    'INSERT INTO projects (title, description, type, lead_id) VALUES ($1, $2, $3, $4) RETURNING *',
                    [title, description || '', type || 'clinical', req.userId]
                );

                const project = result.rows[0];

                await this.runQuery(
                    'INSERT INTO project_team (project_id, user_id, role) VALUES ($1, $2, $3)',
                    [project.id, req.userId, 'lead']
                );

                // Log activity
                await this.logActivity(req.userId, project.id, 'create_project', 'project', project.id, `Created project: ${title}`);

                const projectWithLead = await this.getQuery(`
                    SELECT p.*, u.name as lead_name 
                    FROM projects p 
                    JOIN users u ON p.lead_id = u.id 
                    WHERE p.id = $1
                `, [project.id]);

                res.json({
                    success: true,
                    project: projectWithLead
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
                    'SELECT 1 FROM project_team WHERE project_id = $1 AND user_id = $2',
                    [projectId, req.userId]
                );
                
                if (!hasAccess) {
                    return res.status(403).json({ error: 'Access denied' });
                }

                const [project, team, documents, glossary, translations, activity] = await Promise.all([
                    this.getQuery('SELECT * FROM projects WHERE id = $1', [projectId]),
                    this.allQuery(`
                        SELECT pt.*, u.name, u.email, u.role as user_role, u.avatar_initials
                        FROM project_team pt
                        JOIN users u ON pt.user_id = u.id
                        WHERE pt.project_id = $1
                        ORDER BY pt.joined_at
                    `, [projectId]),
                    this.allQuery(`
                        SELECT d.*, u.name as author_name, u.avatar_initials
                        FROM documents d
                        JOIN users u ON d.author_id = u.id
                        WHERE d.project_id = $1
                        ORDER BY d.created_at DESC
                    `, [projectId]),
                    this.allQuery('SELECT * FROM glossary WHERE project_id = $1 ORDER BY term', [projectId]),
                    this.allQuery('SELECT * FROM translations WHERE project_id = $1 ORDER BY created_at DESC', [projectId]),
                    this.allQuery(`
                        SELECT al.*, u.name as user_name, u.avatar_initials
                        FROM activity_log al
                        JOIN users u ON al.user_id = u.id
                        WHERE al.project_id = $1
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
                    tags: doc.tags || []
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

        // Documents - STORE IN DATABASE FOR RAILWAY
        const storage = multer.memoryStorage(); // Store in memory for database
        const upload = multer({
            storage,
            limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
            fileFilter: (req, file, cb) => {
                const allowedTypes = ['.pdf', '.doc', '.docx', '.txt', '.csv', '.json', '.xlsx', '.jpg', '.png'];
                const ext = path.extname(file.originalname).toLowerCase();
                
                const allowedMimes = [
                    'application/pdf',
                    'application/msword',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'text/plain',
                    'text/csv',
                    'application/json',
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    'image/jpeg',
                    'image/png'
                ];
                
                if (allowedTypes.includes(ext) && allowedMimes.includes(file.mimetype)) {
                    cb(null, true);
                } else {
                    cb(new Error(`File type not allowed. Allowed types: ${allowedTypes.join(', ')}`));
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

                if (!file && !req.body.content) {
                    return res.status(400).json({ error: 'No file or content provided' });
                }

                const tagArray = tags ? tags.split(',').map(t => t.trim()).filter(t => t) : [];
                let fileContent = null;

                if (file) {
                    // Convert file to base64 for database storage
                    fileContent = file.buffer.toString('base64');
                }

                const result = await this.runQuery(
                    `INSERT INTO documents (project_id, title, description, filename, file_content, 
                     filetype, filesize, tags, audience, author_id) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
                    [
                        projectId,
                        title,
                        description || '',
                        file ? file.originalname : 'untitled.txt',
                        fileContent,
                        file ? file.mimetype : 'text/plain',
                        file ? file.size : 0,
                        JSON.stringify(tagArray),
                        audience || 'both',
                        req.userId
                    ]
                );

                const document = result.rows[0];

                // Add tags to document_tags table
                for (const tag of tagArray) {
                    const [category, value] = tag.includes(':') ? tag.split(':') : ['custom', tag];
                    await this.runQuery(
                        'INSERT INTO document_tags (document_id, tag, category) VALUES ($1, $2, $3)',
                        [document.id, tag, category]
                    );
                }

                // Log activity
                await this.logActivity(req.userId, projectId, 'upload_document', 'document', document.id, `Uploaded: ${title}`);

                res.json({
                    success: true,
                    document: {
                        id: document.id,
                        title,
                        filename: file ? file.originalname : null,
                        created_at: document.created_at
                    }
                });

            } catch (error) {
                console.error('Upload error:', error);
                
                if (error instanceof multer.MulterError) {
                    if (error.code === 'LIMIT_FILE_SIZE') {
                        return res.status(413).json({ error: 'File too large. Maximum size is 10MB' });
                    }
                    return res.status(400).json({ error: 'File upload error' });
                }
                
                res.status(500).json({ error: 'Failed to upload document' });
            }
        });

        // Download endpoint
        this.app.get('/api/documents/:id/download', async (req, res) => {
            try {
                const doc = await this.getQuery(
                    'SELECT * FROM documents WHERE id = $1',
                    [req.params.id]
                );
                
                if (!doc) {
                    return res.status(404).json({ error: 'Document not found' });
                }
                
                if (!doc.file_content) {
                    return res.status(404).json({ error: 'No file content available' });
                }
                
                // Convert base64 back to buffer
                const buffer = Buffer.from(doc.file_content, 'base64');
                
                res.setHeader('Content-Type', doc.filetype || 'application/octet-stream');
                res.setHeader('Content-Length', buffer.length);
                res.setHeader('Content-Disposition', `attachment; filename="${doc.filename}"`);
                
                res.send(buffer);
                
            } catch (error) {
                console.error('Download error:', error);
                res.status(500).json({ error: 'Download failed' });
            }
        });

        // Glossary (updated for PostgreSQL)
        this.app.post('/api/projects/:id/glossary', async (req, res) => {
            try {
                const { term, clinical_definition, technical_definition } = req.body;
                
                if (!term) {
                    return res.status(400).json({ error: 'Term is required' });
                }

                const result = await this.runQuery(
                    'INSERT INTO glossary (project_id, term, clinical_definition, technical_definition, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id',
                    [req.params.id, term, clinical_definition || '', technical_definition || '', req.userId]
                );

                const glossaryId = result.rows[0].id;

                await this.logActivity(req.userId, req.params.id, 'add_glossary', 'glossary', glossaryId, `Added term: ${term}`);

                res.json({ success: true, id: glossaryId });

            } catch (error) {
                console.error('Glossary error:', error);
                res.status(500).json({ error: 'Failed to add glossary term' });
            }
        });

        // Translations (updated for PostgreSQL)
        this.app.post('/api/projects/:id/translations', async (req, res) => {
            try {
                const { clinical_term, technical_explanation, analogy } = req.body;
                
                if (!clinical_term || !technical_explanation) {
                    return res.status(400).json({ error: 'Both terms are required' });
                }

                const result = await this.runQuery(
                    'INSERT INTO translations (project_id, clinical_term, technical_explanation, analogy) VALUES ($1, $2, $3, $4) RETURNING id',
                    [req.params.id, clinical_term, technical_explanation, analogy || '']
                );

                const translationId = result.rows[0].id;

                await this.logActivity(req.userId, req.params.id, 'add_translation', 'translation', translationId, `Added translation: ${clinical_term}`);

                res.json({ success: true, id: translationId });

            } catch (error) {
                console.error('Translation error:', error);
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

                const result = await this.runQuery(
                    'INSERT INTO comments (document_id, project_id, content, author_id, parent_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
                    [document_id || null, project_id || null, content, req.userId, parent_id || null]
                );

                const commentId = result.rows[0].id;

                const targetId = document_id || project_id;
                const targetType = document_id ? 'document' : 'project';
                await this.logActivity(req.userId, project_id, 'add_comment', targetType, targetId, `Added comment`);

                res.json({ success: true, id: commentId });

            } catch (error) {
                console.error('Comment error:', error);
                res.status(500).json({ error: 'Failed to add comment' });
            }
        });

        // Search (updated for PostgreSQL)
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
                        WHERE project_id = $1 AND (title ILIKE $2 OR description ILIKE $2)
                        UNION
                        SELECT 'glossary' as type, id, term as title, clinical_definition as description, created_at 
                        FROM glossary 
                        WHERE project_id = $1 AND (term ILIKE $2 OR clinical_definition ILIKE $2 OR technical_definition ILIKE $2)
                        ORDER BY created_at DESC
                    `;
                    params = [project_id, searchTerm];
                } else {
                    query = `
                        SELECT 'project' as type, id, title, description, created_at 
                        FROM projects 
                        WHERE id IN (SELECT project_id FROM project_team WHERE user_id = $1) 
                        AND (title ILIKE $2 OR description ILIKE $2)
                        ORDER BY created_at DESC
                    `;
                    params = [req.userId, searchTerm];
                }

                const results = await this.allQuery(query, params);
                res.json({ success: true, results });

            } catch (error) {
                console.error('Search error:', error);
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
        this.wss = new WebSocket.Server({ 
            server: this.server,
            verifyClient: (info, callback) => {
                const allowedOrigins = [
                    'http://localhost:3000',
                    'https://thoraxlab-production.up.railway.app',
                    'https://thoraxlab.railway.app',
                    /\.railway\.app$/
                ];
                
                if (!info.origin) {
                    callback(true);
                    return;
                }
                
                const isAllowed = allowedOrigins.some(allowed => {
                    if (typeof allowed === 'string') return info.origin === allowed;
                    if (allowed instanceof RegExp) return allowed.test(info.origin);
                    return false;
                });
                
                if (isAllowed) {
                    callback(true);
                } else {
                    console.log('WebSocket connection rejected from origin:', info.origin);
                    callback(false, 401, 'Unauthorized origin');
                }
            }
        });

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
                this.activeConnections.delete(ws.userId);
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
            'SELECT * FROM sessions WHERE token = $1 AND expires_at > $2',
            [token, new Date().toISOString()]
        );
        return session;
    }

    async logActivity(userId, projectId, action, targetType, targetId, details) {
        await this.runQuery(
            'INSERT INTO activity_log (project_id, user_id, action, target_type, target_id, details) VALUES ($1, $2, $3, $4, $5, $6)',
            [projectId, userId, action, targetType, targetId, details]
        );
    }

    setupSessionCleanup() {
        // Clean up expired sessions every hour
        setInterval(async () => {
            try {
                const result = await this.runQuery(
                    'DELETE FROM sessions WHERE expires_at < $1',
                    [new Date().toISOString()]
                );
                if (result.rowCount > 0) {
                    console.log(`Cleaned up ${result.rowCount} expired sessions`);
                }
            } catch (error) {
                console.error('Session cleanup error:', error);
            }
        }, 3600000); // Run every hour
    }

    // ========== ERROR HANDLING ==========
    setupErrorHandling() {
        this.app.use((err, req, res, next) => {
            console.error('Server error:', err);
            
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(413).json({ error: 'File too large. Maximum size is 10MB' });
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
        const HOST = '0.0.0.0'; // Critical for Railway
        
        this.server.listen(PORT, HOST, () => {
            console.log(`
╔══════════════════════════════════════════════════════╗
║     THORAXLAB SERVER STARTED (PostgreSQL)            ║
╠══════════════════════════════════════════════════════╣
║     Server: http://${HOST}:${PORT}                      ║
║     API:    http://${HOST}:${PORT}/api/*              ║
║     WebSocket: ws://${HOST}:${PORT}                   ║
║     Database: PostgreSQL (Railway)                   ║
║     Environment: ${process.env.NODE_ENV || 'development'}         ║
╚══════════════════════════════════════════════════════╝
            `);
            
            console.log('💡 Railway Deployment Notes:');
            console.log('1. Add PostgreSQL plugin in Railway dashboard');
            console.log('2. Railway will automatically set DATABASE_URL');
            console.log('3. Files are stored IN DATABASE for persistence');
        });
    }
}

// Start server
const server = new ThoraxLabServer();
module.exports = server;
