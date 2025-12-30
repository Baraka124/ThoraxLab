const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
const helmet = require('helmet');
const compression = require('compression');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

// ===== CONFIGURATION =====
const PORT = process.env.PORT || 3000;
const DB_PATH = './thoraxlab.db';
const PUBLIC_DIR = path.join(__dirname, 'public');

// ===== EXPRESS SERVER =====
const app = express();
const server = require('http').createServer(app);

// ===== WEB SOCKET SERVER =====
const wss = new WebSocket.Server({ server });
const connectedClients = new Map();

// ===== DATABASE =====
let db = null;

// ===== INITIALIZATION =====
async function initialize() {
    console.log(`
    🚀 THORAXLAB CLINICAL-INDUSTRY INNOVATION PLATFORM
    ════════════════════════════════════════════════════
    Initializing...
    `);
    
    await initializeDatabase();
    setupMiddleware();
    setupRoutes();
    setupWebSocket();
    startServer();
}

// ===== DATABASE FUNCTIONS =====
async function getDatabase() {
    if (!db) {
        console.log('📊 Connecting to database...');
        db = await open({
            filename: DB_PATH,
            driver: sqlite3.Database
        });
        await setupDatabase();
    }
    return db;
}

async function setupDatabase() {
    console.log('🛠️  Setting up database schema...');
    
    await db.exec('PRAGMA journal_mode = WAL');
    await db.exec('PRAGMA foreign_keys = ON');
    
    // Users table
    await db.exec(`
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
            last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);
    
    // Projects table
    await db.exec(`
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
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (created_by) REFERENCES users(id)
        );
    `);
    
    // Project members
    await db.exec(`
        CREATE TABLE IF NOT EXISTS project_members (
            project_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            role TEXT DEFAULT 'contributor',
            joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (project_id, user_id),
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    `);
    
    // Comments
    await db.exec(`
        CREATE TABLE IF NOT EXISTS comments (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            content TEXT NOT NULL,
            likes INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
    `);
    
    // Comment reactions
    await db.exec(`
        CREATE TABLE IF NOT EXISTS comment_reactions (
            comment_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            reaction TEXT CHECK(reaction IN ('like')) DEFAULT 'like',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (comment_id, user_id),
            FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
    `);
    
    // Decisions
    await db.exec(`
        CREATE TABLE IF NOT EXISTS decisions (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            status TEXT CHECK(status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
            created_by TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            resolved_at TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES users(id)
        );
    `);
    
    // Timeline events
    await db.exec(`
        CREATE TABLE IF NOT EXISTS timeline_events (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            description TEXT NOT NULL,
            user_id TEXT,
            metadata TEXT DEFAULT '{}',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
    `);
    
    // Interactions
    await db.exec(`
        CREATE TABLE IF NOT EXISTS interactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            interaction_type TEXT CHECK(interaction_type IN ('view', 'comment', 'like', 'decision', 'join')) NOT NULL,
            metadata TEXT DEFAULT '{}',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
    `);
    
    // Create indexes
    await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
        CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at);
        CREATE INDEX IF NOT EXISTS idx_comments_project ON comments(project_id);
        CREATE INDEX IF NOT EXISTS idx_decisions_project_status ON decisions(project_id, status);
        CREATE INDEX IF NOT EXISTS idx_timeline_project ON timeline_events(project_id);
        CREATE INDEX IF NOT EXISTS idx_interactions_project ON interactions(project_id);
    `);
    
    // Create default admin user
    const adminExists = await db.get("SELECT id FROM users WHERE email = 'admin@thoraxlab.local'");
    if (!adminExists) {
        await db.run(
            `INSERT INTO users (id, email, name, role, avatar_color, institution, specialty) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [uuidv4(), 'admin@thoraxlab.local', 'System Admin', 'clinician', '#1A365D', 'ThoraxLab', 'Platform Administration']
        );
        console.log('👑 Created default admin user');
    }
    
    // Create sample data if empty
    const projectCount = await db.get('SELECT COUNT(*) as count FROM projects');
    if (projectCount.count === 0) {
        await createSampleData();
    }
    
    console.log('✅ Database setup complete');
}

async function createSampleData() {
    console.log('📝 Creating sample data...');
    
    // Create sample users
    const users = [
        { id: uuidv4(), email: 'dr.chen@hospital.edu', name: 'Dr. Sarah Chen', role: 'clinician', avatar_color: '#0C7C59', institution: 'University Medical Center', specialty: 'Pulmonology' },
        { id: uuidv4(), email: 'm.wang@medtech.com', name: 'Michael Wang', role: 'industry', avatar_color: '#D35400', institution: 'MedTech Solutions', specialty: 'AI Engineering' },
        { id: uuidv4(), email: 'rajesh@research.org', name: 'Dr. Rajesh Kumar', role: 'clinician', avatar_color: '#7B68EE', institution: 'Research Institute', specialty: 'Data Science' },
        { id: uuidv4(), email: 'lisa@patient.org', name: 'Lisa Williams', role: 'public', avatar_color: '#8B5CF6', institution: 'Patient Advocacy', specialty: 'Patient Experience' }
    ];
    
    for (const user of users) {
        await db.run(
            `INSERT INTO users (id, email, name, role, avatar_color, institution, specialty, last_seen) 
             VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '-1 hour'))`,
            [user.id, user.email, user.name, user.role, user.avatar_color, user.institution, user.specialty]
        );
    }
    
    // Create sample project
    const projectId = `proj_${uuidv4()}`;
    const now = new Date().toISOString();
    
    await db.run(
        `INSERT INTO projects (id, title, description, type, created_by, pulse_score, velocity, total_interactions, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [projectId, 'AI-Powered COPD Early Detection', 
         'Developing machine learning algorithms to detect COPD patterns from chest X-rays 6-12 months earlier than current methods.', 
         'clinical', users[0].id, 84, 85, 156, now, now]
    );
    
    // Add project members
    for (const user of users) {
        await db.run(
            `INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)`,
            [projectId, user.id, user.id === users[0].id ? 'admin' : 'contributor']
        );
    }
    
    // Create sample comments
    const comments = [
        { id: `comment_${uuidv4()}`, project_id: projectId, user_id: users[0].id, content: 'Latest algorithm shows 94% accuracy on test set. False positives reduced by 32%.', likes: 12 },
        { id: `comment_${uuidv4()}`, project_id: projectId, user_id: users[1].id, content: 'Great progress! Should discuss deployment timeline for Q2 pilot.', likes: 8 },
        { id: `comment_${uuidv4()}`, project_id: projectId, user_id: users[2].id, content: 'Uploaded latest dataset with 5,000 additional annotated scans. Training completes Friday.', likes: 15 }
    ];
    
    for (const comment of comments) {
        await db.run(
            `INSERT INTO comments (id, project_id, user_id, content, likes, created_at) 
             VALUES (?, ?, ?, ?, ?, datetime('now', '-${Math.floor(Math.random() * 3)} days'))`,
            [comment.id, comment.project_id, comment.user_id, comment.content, comment.likes]
        );
    }
    
    // Create sample decisions
    const decisions = [
        { id: `decision_${uuidv4()}`, project_id: projectId, title: 'Finalize patient inclusion criteria', description: 'Need final criteria for clinical validation study.', created_by: users[0].id },
        { id: `decision_${uuidv4()}`, project_id: projectId, title: 'Approve prototype budget', description: 'Budget approval for prototype development.', created_by: users[1].id }
    ];
    
    for (const decision of decisions) {
        await db.run(
            `INSERT INTO decisions (id, project_id, title, description, created_by, created_at) 
             VALUES (?, ?, ?, ?, ?, datetime('now', '-${Math.floor(Math.random() * 2)} days'))`,
            [decision.id, decision.project_id, decision.title, decision.description, decision.created_by]
        );
    }
    
    console.log('✅ Sample data created');
}

async function calculatePulseScore(projectId) {
    try {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        
        const stats = await db.get(`
            SELECT 
                COUNT(DISTINCT i.id) as interactions_7d,
                COUNT(DISTINCT i.user_id) as unique_users_7d,
                COUNT(DISTINCT c.id) as comments_7d,
                COUNT(DISTINCT d.id) as decisions_7d,
                MAX(i.created_at) as last_interaction_at
            FROM projects p
            LEFT JOIN interactions i ON p.id = i.project_id AND i.created_at > datetime(?)
            LEFT JOIN comments c ON p.id = c.project_id AND c.created_at > datetime(?)
            LEFT JOIN decisions d ON p.id = d.project_id AND d.created_at > datetime(?)
            WHERE p.id = ?
            GROUP BY p.id
        `, [weekAgo.toISOString(), weekAgo.toISOString(), weekAgo.toISOString(), projectId]);
        
        if (!stats) return 50;
        
        let score = 50;
        score += Math.min((stats.interactions_7d || 0) * 1.5, 20);
        score += Math.min((stats.comments_7d || 0) * 3, 15);
        score += Math.min((stats.decisions_7d || 0) * 4, 15);
        score += Math.min((stats.unique_users_7d || 0) * 5, 10);
        
        if (stats.last_interaction_at) {
            const lastInteraction = new Date(stats.last_interaction_at);
            const hoursSince = (new Date() - lastInteraction) / (1000 * 60 * 60);
            if (hoursSince < 1) score += 10;
            else if (hoursSince < 24) score += 8;
            else if (hoursSince < 72) score += 5;
            else if (hoursSince < 168) score += 2;
        }
        
        return Math.max(0, Math.min(100, Math.round(score)));
    } catch (error) {
        console.error('Pulse calculation error:', error);
        return 50;
    }
}

async function recordInteraction(projectId, userId, interactionType, metadata = {}) {
    try {
        await db.run(
            `INSERT INTO interactions (project_id, user_id, interaction_type, metadata) 
             VALUES (?, ?, ?, ?)`,
            [projectId, userId, interactionType, JSON.stringify(metadata)]
        );
        
        await db.run(
            `UPDATE projects SET total_interactions = total_interactions + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [projectId]
        );
        
        const newPulse = await calculatePulseScore(projectId);
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

async function addTimelineEvent(projectId, eventType, description, userId = null, metadata = {}) {
    try {
        await db.run(
            `INSERT INTO timeline_events (id, project_id, event_type, description, user_id, metadata) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [uuidv4(), projectId, eventType, description, userId, JSON.stringify(metadata)]
        );
    } catch (error) {
        console.error('Timeline event error:', error);
    }
}

// ===== MIDDLEWARE =====
function setupMiddleware() {
    // Security
    app.use(helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false
    }));
    
    // Compression
    app.use(compression());
    
    // Body parsing
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    
    // Static files from public folder
    app.use(express.static(PUBLIC_DIR, {
        maxAge: '1h',
        setHeaders: (res, filePath) => {
            if (path.extname(filePath) === '.html') {
                res.setHeader('Cache-Control', 'no-cache');
            }
        }
    }));
    
    console.log('✅ Middleware setup complete');
}

// ===== WEB SOCKET =====
function setupWebSocket() {
    wss.on('connection', (ws, req) => {
        const clientId = uuidv4();
        const clientInfo = {
            id: clientId,
            ws: ws,
            userId: null,
            projectSubscriptions: new Set()
        };
        
        connectedClients.set(clientId, clientInfo);
        
        ws.on('message', async (data) => {
            try {
                const message = JSON.parse(data.toString());
                await handleWebSocketMessage(clientId, message);
            } catch (error) {
                console.error('WebSocket message error:', error);
            }
        });
        
        ws.on('close', () => {
            connectedClients.delete(clientId);
        });
        
        ws.send(JSON.stringify({
            type: 'connected',
            clientId: clientId,
            timestamp: new Date().toISOString()
        }));
    });
    
    console.log('✅ WebSocket server ready');
}

async function handleWebSocketMessage(clientId, message) {
    const client = connectedClients.get(clientId);
    if (!client) return;
    
    switch (message.type) {
        case 'authenticate':
            client.userId = message.userId;
            break;
            
        case 'subscribe_project':
            if (message.projectId) {
                client.projectSubscriptions.add(message.projectId);
            }
            break;
            
        case 'unsubscribe_project':
            if (message.projectId) {
                client.projectSubscriptions.delete(message.projectId);
            }
            break;
            
        case 'comment_added':
            broadcastToProject(message.projectId, {
                type: 'comment_added',
                comment: message.comment,
                timestamp: new Date().toISOString()
            });
            break;
            
        case 'project_updated':
            broadcastToProject(message.projectId, {
                type: 'project_updated',
                project: message.project,
                timestamp: new Date().toISOString()
            });
            break;
            
        case 'heartbeat':
            client.ws.send(JSON.stringify({
                type: 'heartbeat_ack',
                timestamp: Date.now()
            }));
            break;
    }
}

function broadcastToProject(projectId, message) {
    connectedClients.forEach(client => {
        if (client.ws.readyState === WebSocket.OPEN && 
            client.projectSubscriptions.has(projectId)) {
            client.ws.send(JSON.stringify(message));
        }
    });
}

// ===== API ROUTES =====
function setupRoutes() {
    // Health check
    app.get('/api/health', (req, res) => {
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: '2.0.0',
            clients: connectedClients.size,
            uptime: process.uptime()
        });
    });
    
    // Get all projects
    app.get('/api/projects', async (req, res) => {
        try {
            const database = await getDatabase();
            const projects = await database.all(`
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
                WHERE p.status = 'active'
                GROUP BY p.id
                ORDER BY p.updated_at DESC
                LIMIT 100
            `);
            
            res.json(projects);
        } catch (error) {
            console.error('Projects fetch error:', error);
            res.status(500).json({ error: 'Failed to fetch projects' });
        }
    });
    
    // Get single project
    app.get('/api/projects/:id', async (req, res) => {
        try {
            const database = await getDatabase();
            const projectId = req.params.id;
            
            const project = await database.get(`
                SELECT 
                    p.*,
                    u.name as creator_name,
                    u.avatar_color as creator_color,
                    u.institution as creator_institution
                FROM projects p
                LEFT JOIN users u ON p.created_by = u.id
                WHERE p.id = ?
            `, [projectId]);
            
            if (!project) {
                return res.status(404).json({ error: 'Project not found' });
            }
            
            const userId = req.headers['x-user-id'] || 'anonymous';
            await recordInteraction(projectId, userId, 'view', { source: 'api' });
            
            res.json(project);
        } catch (error) {
            console.error('Project fetch error:', error);
            res.status(500).json({ error: 'Failed to fetch project' });
        }
    });
    
    // Create project
    app.post('/api/projects', async (req, res) => {
        try {
            const { title, description, type = 'clinical', createdBy } = req.body;
            
            if (!title || !description || !createdBy) {
                return res.status(400).json({ error: 'Missing required fields' });
            }
            
            const database = await getDatabase();
            const projectId = `proj_${uuidv4()}`;
            const now = new Date().toISOString();
            
            await database.run(
                `INSERT INTO projects (id, title, description, type, created_by, created_at, updated_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [projectId, title, description, type, createdBy, now, now]
            );
            
            await database.run(
                `INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)`,
                [projectId, createdBy, 'admin']
            );
            
            await recordInteraction(projectId, createdBy, 'join', { role: 'admin' });
            
            await addTimelineEvent(projectId, 'project_created', `Project "${title}" created`, createdBy);
            
            const project = await database.get(`
                SELECT p.*, u.name as creator_name, u.avatar_color as creator_color
                FROM projects p
                LEFT JOIN users u ON p.created_by = u.id
                WHERE p.id = ?
            `, [projectId]);
            
            broadcastToProject(projectId, {
                type: 'project_created',
                project: project,
                timestamp: now
            });
            
            res.json(project);
        } catch (error) {
            console.error('Project creation error:', error);
            res.status(500).json({ error: 'Failed to create project' });
        }
    });
    
    // Update project
    app.put('/api/projects/:id', async (req, res) => {
        try {
            const projectId = req.params.id;
            const updates = req.body;
            
            if (!updates || Object.keys(updates).length === 0) {
                return res.status(400).json({ error: 'No updates provided' });
            }
            
            const database = await getDatabase();
            const updateFields = [];
            const updateValues = [];
            
            Object.keys(updates).forEach(key => {
                if (['title', 'description', 'type', 'status'].includes(key)) {
                    updateFields.push(`${key} = ?`);
                    updateValues.push(updates[key]);
                }
            });
            
            if (updateFields.length === 0) {
                return res.status(400).json({ error: 'No valid fields to update' });
            }
            
            updateValues.push(projectId);
            
            await database.run(
                `UPDATE projects SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                updateValues
            );
            
            const project = await database.get(`
                SELECT p.*, u.name as creator_name, u.avatar_color as creator_color
                FROM projects p
                LEFT JOIN users u ON p.created_by = u.id
                WHERE p.id = ?
            `, [projectId]);
            
            const userId = req.headers['x-user-id'] || 'system';
            await addTimelineEvent(projectId, 'project_updated', 'Project details updated', userId);
            
            broadcastToProject(projectId, {
                type: 'project_updated',
                project: project,
                timestamp: new Date().toISOString()
            });
            
            res.json(project);
        } catch (error) {
            console.error('Project update error:', error);
            res.status(500).json({ error: 'Failed to update project' });
        }
    });
    
    // Get project comments
    app.get('/api/projects/:id/comments', async (req, res) => {
        try {
            const database = await getDatabase();
            const projectId = req.params.id;
            
            const comments = await database.all(`
                SELECT 
                    c.*,
                    u.name as user_name,
                    u.role as user_role,
                    u.avatar_color,
                    (SELECT COUNT(*) FROM comment_reactions cr WHERE cr.comment_id = c.id) as likes,
                    (SELECT COUNT(*) FROM comment_reactions cr WHERE cr.comment_id = c.id AND cr.user_id = ?) as user_reacted
                FROM comments c
                LEFT JOIN users u ON c.user_id = u.id
                WHERE c.project_id = ?
                ORDER BY c.created_at DESC
                LIMIT 100
            `, [req.headers['x-user-id'] || '', projectId]);
            
            res.json(comments);
        } catch (error) {
            console.error('Comments fetch error:', error);
            res.status(500).json({ error: 'Failed to fetch comments' });
        }
    });
    
    // Add comment
    app.post('/api/comments', async (req, res) => {
        try {
            const { projectId, content, userId } = req.body;
            
            if (!projectId || !content || !userId) {
                return res.status(400).json({ error: 'Missing required fields' });
            }
            
            const database = await getDatabase();
            const commentId = `comment_${uuidv4()}`;
            const now = new Date().toISOString();
            
            await database.run(
                `INSERT INTO comments (id, project_id, user_id, content, created_at, updated_at) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [commentId, projectId, userId, content, now, now]
            );
            
            await recordInteraction(projectId, userId, 'comment', { commentId });
            
            const user = await database.get('SELECT name FROM users WHERE id = ?', [userId]);
            await addTimelineEvent(projectId, 'comment_added', `${user?.name || 'User'} commented`, userId);
            
            const comment = await database.get(`
                SELECT 
                    c.*,
                    u.name as user_name,
                    u.role as user_role,
                    u.avatar_color,
                    0 as likes,
                    0 as user_reacted
                FROM comments c
                LEFT JOIN users u ON c.user_id = u.id
                WHERE c.id = ?
            `, [commentId]);
            
            broadcastToProject(projectId, {
                type: 'comment_added',
                comment: comment,
                timestamp: now
            });
            
            res.json(comment);
        } catch (error) {
            console.error('Comment creation error:', error);
            res.status(500).json({ error: 'Failed to create comment' });
        }
    });
    
    // React to comment
    app.post('/api/comments/:id/react', async (req, res) => {
        try {
            const commentId = req.params.id;
            const { userId, reaction = 'like' } = req.body;
            
            if (!userId) {
                return res.status(400).json({ error: 'User ID required' });
            }
            
            const database = await getDatabase();
            
            const existingReaction = await database.get(
                'SELECT * FROM comment_reactions WHERE comment_id = ? AND user_id = ?',
                [commentId, userId]
            );
            
            if (existingReaction) {
                await database.run(
                    'DELETE FROM comment_reactions WHERE comment_id = ? AND user_id = ?',
                    [commentId, userId]
                );
                
                await database.run(
                    'UPDATE comments SET likes = likes - 1 WHERE id = ?',
                    [commentId]
                );
            } else {
                await database.run(
                    `INSERT INTO comment_reactions (comment_id, user_id, reaction) VALUES (?, ?, ?)`,
                    [commentId, userId, reaction]
                );
                
                await database.run(
                    'UPDATE comments SET likes = likes + 1 WHERE id = ?',
                    [commentId]
                );
                
                const comment = await database.get('SELECT project_id FROM comments WHERE id = ?', [commentId]);
                if (comment) {
                    await recordInteraction(comment.project_id, userId, 'like', { commentId });
                }
            }
            
            const updatedComment = await database.get(`
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
            
            if (commentId) {
                broadcastToProject(commentId, {
                    type: 'comment_updated',
                    comment: updatedComment,
                    timestamp: new Date().toISOString()
                });
            }
            
            res.json(updatedComment);
        } catch (error) {
            console.error('Comment reaction error:', error);
            res.status(500).json({ error: 'Failed to update reaction' });
        }
    });
    
    // Get project team
    app.get('/api/projects/:id/team', async (req, res) => {
        try {
            const database = await getDatabase();
            const projectId = req.params.id;
            
            const team = await database.all(`
                SELECT 
                    u.id,
                    u.name,
                    u.role,
                    u.avatar_color,
                    u.institution,
                    u.specialty,
                    pm.role as project_role,
                    pm.joined_at,
                    CASE 
                        WHEN u.last_seen > datetime('now', '-5 minutes') THEN 'online'
                        WHEN u.last_seen > datetime('now', '-1 hour') THEN 'away'
                        ELSE 'offline'
                    END as status
                FROM project_members pm
                LEFT JOIN users u ON pm.user_id = u.id
                WHERE pm.project_id = ?
                ORDER BY pm.joined_at
            `, [projectId]);
            
            res.json(team);
        } catch (error) {
            console.error('Team fetch error:', error);
            res.status(500).json({ error: 'Failed to fetch team' });
        }
    });
    
    // Join project
    app.post('/api/projects/:id/join', async (req, res) => {
        try {
            const projectId = req.params.id;
            const { userId, role = 'contributor' } = req.body;
            
            if (!userId) {
                return res.status(400).json({ error: 'User ID required' });
            }
            
            const database = await getDatabase();
            
            const existingMember = await database.get(
                'SELECT * FROM project_members WHERE project_id = ? AND user_id = ?',
                [projectId, userId]
            );
            
            if (existingMember) {
                return res.status(400).json({ error: 'Already a member' });
            }
            
            await database.run(
                `INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)`,
                [projectId, userId, role]
            );
            
            await recordInteraction(projectId, userId, 'join', { role });
            
            const user = await database.get('SELECT name FROM users WHERE id = ?', [userId]);
            const project = await database.get('SELECT title FROM projects WHERE id = ?', [projectId]);
            await addTimelineEvent(projectId, 'member_joined', `${user?.name || 'User'} joined`, userId);
            
            const team = await database.all(`
                SELECT 
                    u.id,
                    u.name,
                    u.role,
                    u.avatar_color,
                    u.institution,
                    pm.role as project_role,
                    'online' as status
                FROM project_members pm
                LEFT JOIN users u ON pm.user_id = u.id
                WHERE pm.project_id = ?
                ORDER BY pm.joined_at
            `, [projectId]);
            
            broadcastToProject(projectId, {
                type: 'team_updated',
                team: team,
                timestamp: new Date().toISOString()
            });
            
            res.json({ 
                success: true, 
                message: `Joined ${project?.title || 'project'}`,
                team: team 
            });
        } catch (error) {
            console.error('Join project error:', error);
            res.status(500).json({ error: 'Failed to join project' });
        }
    });
    
    // Get project timeline
    app.get('/api/projects/:id/timeline', async (req, res) => {
        try {
            const database = await getDatabase();
            const projectId = req.params.id;
            
            const timeline = await database.all(`
                SELECT 
                    te.*,
                    u.name as user_name,
                    u.avatar_color
                FROM timeline_events te
                LEFT JOIN users u ON te.user_id = u.id
                WHERE te.project_id = ?
                ORDER BY te.created_at DESC
                LIMIT 50
            `, [projectId]);
            
            res.json(timeline);
        } catch (error) {
            console.error('Timeline fetch error:', error);
            res.status(500).json({ error: 'Failed to fetch timeline' });
        }
    });
    
    // Get project decisions
    app.get('/api/projects/:id/decisions', async (req, res) => {
        try {
            const database = await getDatabase();
            const projectId = req.params.id;
            
            const decisions = await database.all(`
                SELECT 
                    d.*,
                    u.name as creator_name,
                    u.avatar_color as creator_color
                FROM decisions d
                LEFT JOIN users u ON d.created_by = u.id
                WHERE d.project_id = ?
                ORDER BY 
                    CASE d.status 
                        WHEN 'pending' THEN 1
                        WHEN 'approved' THEN 2
                        WHEN 'rejected' THEN 3
                    END,
                    d.created_at DESC
            `, [projectId]);
            
            res.json(decisions);
        } catch (error) {
            console.error('Decisions fetch error:', error);
            res.status(500).json({ error: 'Failed to fetch decisions' });
        }
    });
    
    // Get velocity
    app.get('/api/velocity', async (req, res) => {
        try {
            const database = await getDatabase();
            
            const overallVelocity = await database.get(`
                SELECT 
                    ROUND(AVG(pulse_score), 1) as avg_pulse,
                    COUNT(*) as total_projects,
                    SUM(total_interactions) as total_interactions,
                    COUNT(DISTINCT (SELECT user_id FROM project_members WHERE project_id = p.id)) as total_users
                FROM projects p
                WHERE p.status = 'active'
            `);
            
            res.json({
                score: overallVelocity.avg_pulse || 75,
                metrics: overallVelocity
            });
        } catch (error) {
            console.error('Velocity fetch error:', error);
            res.status(500).json({ error: 'Failed to fetch velocity' });
        }
    });
    
    // Get contributors
    app.get('/api/contributors', async (req, res) => {
        try {
            const database = await getDatabase();
            
            const contributors = await database.all(`
                SELECT 
                    u.id,
                    u.name,
                    u.role,
                    u.avatar_color,
                    u.institution,
                    COUNT(DISTINCT pm.project_id) as project_count,
                    COUNT(DISTINCT c.id) as comment_count,
                    u.last_seen,
                    CASE 
                        WHEN u.last_seen > datetime('now', '-5 minutes') THEN 'online'
                        WHEN u.last_seen > datetime('now', '-1 hour') THEN 'away'
                        ELSE 'offline'
                    END as status
                FROM users u
                LEFT JOIN project_members pm ON u.id = pm.user_id
                LEFT JOIN comments c ON u.id = c.user_id AND c.created_at > datetime('now', '-7 days')
                WHERE u.last_seen > datetime('now', '-1 day')
                GROUP BY u.id
                ORDER BY u.last_seen DESC
                LIMIT 12
            `);
            
            res.json(contributors.map(c => ({
                initials: c.name.split(' ').map(n => n[0]).join('').toUpperCase(),
                name: c.name,
                role: c.role,
                status: c.status
            })));
        } catch (error) {
            console.error('Contributors fetch error:', error);
            res.status(500).json({ error: 'Failed to fetch contributors' });
        }
    });
    
    // Get activities
    app.get('/api/activities', async (req, res) => {
        try {
            const database = await getDatabase();
            
            const activities = await database.all(`
                SELECT 
                    'PROJECT' as type,
                    'New project: ' || p.title as content,
                    p.created_at as timestamp
                FROM projects p
                WHERE p.created_at > datetime('now', '-7 days')
                
                UNION ALL
                
                SELECT 
                    'COMMENT' as type,
                    'New comment by ' || u.name as content,
                    c.created_at as timestamp
                FROM comments c
                LEFT JOIN users u ON c.user_id = u.id
                WHERE c.created_at > datetime('now', '-2 days')
                
                UNION ALL
                
                SELECT 
                    'DECISION' as type,
                    'Decision: ' || d.title as content,
                    d.created_at as timestamp
                FROM decisions d
                WHERE d.status = 'pending' AND d.created_at > datetime('now', '-3 days')
                
                ORDER BY timestamp DESC
                LIMIT 10
            `);
            
            res.json(activities);
        } catch (error) {
            console.error('Activities fetch error:', error);
            res.status(500).json({ error: 'Failed to fetch activities' });
        }
    });
    
    // User login
    app.post('/api/auth/login', async (req, res) => {
        try {
            const { email, name, role = 'clinician' } = req.body;
            
            if (!email || !name) {
                return res.status(400).json({ error: 'Email and name required' });
            }
            
            const database = await getDatabase();
            
            let user = await database.get('SELECT * FROM users WHERE email = ?', [email]);
            
            if (!user) {
                const userId = `user_${uuidv4()}`;
                const avatarColors = ['#0C7C59', '#D35400', '#7B68EE', '#1A365D', '#8B5CF6'];
                const randomColor = avatarColors[Math.floor(Math.random() * avatarColors.length)];
                
                await database.run(
                    `INSERT INTO users (id, email, name, role, avatar_color, last_seen) 
                     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                    [userId, email, name, role, randomColor]
                );
                
                user = await database.get('SELECT * FROM users WHERE id = ?', [userId]);
            } else {
                await database.run(
                    'UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = ?',
                    [user.id]
                );
            }
            
            const { ...userData } = user;
            
            res.json({
                user: userData,
                token: `demo_token_${user.id}`
            });
        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({ error: 'Failed to authenticate' });
        }
    });
    
    // Serve frontend routes
    app.get('/project', (req, res) => {
        res.sendFile(path.join(PUBLIC_DIR, 'project.html'));
    });
    
    app.get('*', (req, res) => {
        res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
    });
    
    console.log('✅ API routes setup complete');
}

// ===== START SERVER =====
async function startServer() {
    server.listen(PORT, () => {
        console.log(`
        ════════════════════════════════════════════════════
        🚀 THORAXLAB PLATFORM READY
        📍 Port: ${PORT}
        🌐 WebSocket: Active
        💾 Database: Connected
        📁 Public Folder: ${PUBLIC_DIR}
        🔗 URL: http://localhost:${PORT}
        ════════════════════════════════════════════════════
        `);
    });
    
    // Periodic maintenance
    setInterval(async () => {
        try {
            const database = await getDatabase();
            
            // Update user status
            await database.run(
                `UPDATE users SET status = 
                    CASE 
                        WHEN last_seen > datetime('now', '-5 minutes') THEN 'online'
                        WHEN last_seen > datetime('now', '-1 hour') THEN 'away'
                        ELSE 'offline'
                    END`
            );
            
            // Recalculate pulse scores
            const activeProjects = await database.all(
                'SELECT id FROM projects WHERE status = "active" AND updated_at > datetime("now", "-1 day")'
            );
            
            for (const project of activeProjects) {
                const newPulse = await calculatePulseScore(project.id);
                await database.run(
                    'UPDATE projects SET pulse_score = ? WHERE id = ?',
                    [newPulse, project.id]
                );
            }
            
        } catch (error) {
            console.error('Maintenance error:', error);
        }
    }, 300000); // Every 5 minutes
}

// ===== INITIALIZE DATABASE =====
async function initializeDatabase() {
    await getDatabase();
}

// ===== GRACEFUL SHUTDOWN =====
process.on('SIGTERM', async () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    
    connectedClients.forEach(client => {
        if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.close();
        }
    });
    
    if (db) {
        await db.close();
    }
    
    server.close(() => {
        console.log('Server shutdown complete');
        process.exit(0);
    });
});

// ===== START THE APPLICATION =====
initialize().catch(console.error);
