const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { database } = require('./database');

// ===== CONFIGURATION =====
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const NODE_ENV = process.env.NODE_ENV || 'development';

// ===== EXPRESS SERVER =====
const app = express();
const server = require('http').createServer(app);

// ===== WEB SOCKET SERVER =====
const wss = new WebSocket.Server({ 
    server,
    perMessageDeflate: {
        zlibDeflateOptions: {
            chunkSize: 1024,
            memLevel: 7,
            level: 3
        },
        zlibInflateOptions: {
            chunkSize: 10 * 1024
        },
        clientNoContextTakeover: true,
        serverNoContextTakeover: true,
        serverMaxWindowBits: 10,
        concurrencyLimit: 10,
        threshold: 1024
    }
});

// ===== CLIENT MANAGEMENT =====
class ClientManager {
    constructor() {
        this.clients = new Map();
        this.projectSubscriptions = new Map();
        this.userSessions = new Map();
    }

    addClient(ws, clientId) {
        this.clients.set(clientId, {
            id: clientId,
            ws,
            userId: null,
            projects: new Set(),
            lastPing: Date.now(),
            isAlive: true
        });
        
        // Setup heartbeat
        ws.on('pong', () => {
            const client = this.clients.get(clientId);
            if (client) {
                client.lastPing = Date.now();
                client.isAlive = true;
            }
        });
        
        return clientId;
    }

    removeClient(clientId) {
        const client = this.clients.get(clientId);
        if (client && client.userId) {
            this.removeUserFromProjects(client.userId, client.projects);
        }
        this.clients.delete(clientId);
        
        // Clean up project subscriptions
        this.projectSubscriptions.forEach((users, projectId) => {
            users.delete(clientId);
            if (users.size === 0) {
                this.projectSubscriptions.delete(projectId);
            }
        });
    }

    authenticateClient(clientId, userId) {
        const client = this.clients.get(clientId);
        if (client) {
            client.userId = userId;
            this.userSessions.set(userId, clientId);
            
            // Update user status in database
            database.recordInteraction('system', userId, 'user_login', null, null, {
                clientId,
                timestamp: new Date().toISOString()
            }).catch(console.error);
        }
    }

    subscribeToProject(clientId, projectId) {
        const client = this.clients.get(clientId);
        if (client) {
            client.projects.add(projectId);
            
            if (!this.projectSubscriptions.has(projectId)) {
                this.projectSubscriptions.set(projectId, new Set());
            }
            this.projectSubscriptions.get(projectId).add(clientId);
            
            // Record subscription
            database.recordInteraction(projectId, client.userId, 'project_subscribe')
                .catch(console.error);
        }
    }

    unsubscribeFromProject(clientId, projectId) {
        const client = this.clients.get(clientId);
        if (client) {
            client.projects.delete(projectId);
            
            const projectSubs = this.projectSubscriptions.get(projectId);
            if (projectSubs) {
                projectSubs.delete(clientId);
                if (projectSubs.size === 0) {
                    this.projectSubscriptions.delete(projectId);
                }
            }
        }
    }

    getProjectSubscribers(projectId) {
        return Array.from(this.projectSubscriptions.get(projectId) || []);
    }

    broadcastToProject(projectId, message, excludeClientId = null) {
        const subscribers = this.getProjectSubscribers(projectId);
        
        subscribers.forEach(clientId => {
            if (clientId !== excludeClientId) {
                this.sendToClient(clientId, message);
            }
        });
    }

    sendToClient(clientId, message) {
        const client = this.clients.get(clientId);
        if (client && client.ws.readyState === WebSocket.OPEN) {
            try {
                client.ws.send(JSON.stringify(message));
            } catch (error) {
                console.error(`Error sending to client ${clientId}:`, error);
            }
        }
    }

    sendToUser(userId, message) {
        const clientId = this.userSessions.get(userId);
        if (clientId) {
            this.sendToClient(clientId, message);
        }
    }

    removeUserFromProjects(userId, projects) {
        projects.forEach(projectId => {
            const projectSubs = this.projectSubscriptions.get(projectId);
            if (projectSubs) {
                // Find client IDs for this user in this project
                for (const clientId of projectSubs) {
                    const client = this.clients.get(clientId);
                    if (client && client.userId === userId) {
                        projectSubs.delete(clientId);
                    }
                }
                if (projectSubs.size === 0) {
                    this.projectSubscriptions.delete(projectId);
                }
            }
        });
    }

    checkHeartbeats() {
        const now = Date.now();
        const TIMEOUT = 30000; // 30 seconds
        
        for (const [clientId, client] of this.clients.entries()) {
            if (now - client.lastPing > TIMEOUT) {
                console.log(`Client ${clientId} heartbeat timeout`);
                client.ws.terminate();
                this.removeClient(clientId);
            } else if (!client.isAlive) {
                client.isAlive = false;
                client.ws.ping();
            }
        }
    }

    getStats() {
        return {
            totalClients: this.clients.size,
            authenticatedClients: Array.from(this.clients.values()).filter(c => c.userId).length,
            projectSubscriptions: this.projectSubscriptions.size,
            userSessions: this.userSessions.size
        };
    }
}

const clientManager = new ClientManager();

// ===== MIDDLEWARE =====
function setupMiddleware() {
    // Security headers
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
                scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
                fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
                connectSrc: ["'self'", "ws:", "wss:"],
                imgSrc: ["'self'", "data:", "https:"]
            }
        },
        crossOriginEmbedderPolicy: false,
        crossOriginResourcePolicy: { policy: "cross-origin" }
    }));
    
    // Compression
    app.use(compression({
        level: 6,
        threshold: 1024
    }));
    
    // CORS
    app.use(cors({
        origin: NODE_ENV === 'development' ? true : [/\.thoraxlab\.com$/, 'http://localhost:3000'],
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-User-ID', 'X-Session-ID']
    }));
    
    // Rate limiting
    const apiLimiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // Limit each IP to 100 requests per windowMs
        standardHeaders: true,
        legacyHeaders: false,
        message: 'Too many requests from this IP, please try again later.'
    });
    
    // Apply rate limiting to API routes
    app.use('/api/', apiLimiter);
    
    // Body parsing
    app.use(express.json({ 
        limit: '10mb',
        verify: (req, res, buf) => {
            req.rawBody = buf;
        }
    }));
    
    app.use(express.urlencoded({ 
        extended: true, 
        limit: '10mb',
        parameterLimit: 100
    }));
    
    // Static files
    app.use(express.static(PUBLIC_DIR, {
        maxAge: NODE_ENV === 'production' ? '1h' : '0',
        setHeaders: (res, filePath) => {
            if (path.extname(filePath) === '.html') {
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Expires', '0');
            }
        }
    }));
    
    // Request logging
    app.use((req, res, next) => {
        const start = Date.now();
        res.on('finish', () => {
            const duration = Date.now() - start;
            console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
        });
        next();
    });
    
    // Error handling middleware
    app.use((err, req, res, next) => {
        console.error('Server error:', err.stack);
        res.status(err.status || 500).json({
            error: NODE_ENV === 'production' ? 'Internal server error' : err.message,
            timestamp: new Date().toISOString()
        });
    });
}

// ===== WEB SOCKET HANDLING =====
function setupWebSocket() {
    wss.on('connection', (ws, req) => {
        const clientId = uuidv4();
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        
        console.log(`🔗 New WebSocket connection: ${clientId} from ${ip}`);
        
        clientManager.addClient(ws, clientId);
        
        // Send welcome message
        ws.send(JSON.stringify({
            type: 'connected',
            clientId,
            timestamp: new Date().toISOString(),
            platform: 'ThoraxLab 2.0'
        }));
        
        // Handle incoming messages
        ws.on('message', async (data) => {
            try {
                const message = JSON.parse(data.toString());
                await handleWebSocketMessage(clientId, message);
            } catch (error) {
                console.error(`WebSocket message error from ${clientId}:`, error);
                ws.send(JSON.stringify({
                    type: 'error',
                    error: 'Invalid message format',
                    timestamp: new Date().toISOString()
                }));
            }
        });
        
        // Handle client disconnect
        ws.on('close', (code, reason) => {
            console.log(`🔌 WebSocket disconnected: ${clientId} (${code}) ${reason}`);
            clientManager.removeClient(clientId);
        });
        
        // Handle errors
        ws.on('error', (error) => {
            console.error(`WebSocket error for ${clientId}:`, error);
            clientManager.removeClient(clientId);
        });
    });
    
    // Heartbeat interval
    setInterval(() => {
        clientManager.checkHeartbeats();
    }, 10000);
    
    // Broadcast platform status updates
    setInterval(async () => {
        try {
            const platformStatus = await database.getPlatformStatus();
            broadcastPlatformStatus(platformStatus);
        } catch (error) {
            console.error('Platform status broadcast error:', error);
        }
    }, 30000); // Every 30 seconds
    
    console.log('✅ WebSocket server ready');
}

async function handleWebSocketMessage(clientId, message) {
    const client = clientManager.clients.get(clientId);
    if (!client) return;
    
    try {
        switch (message.type) {
            case 'authenticate':
                if (message.userId && message.token) {
                    clientManager.authenticateClient(clientId, message.userId);
                    
                    clientManager.sendToClient(clientId, {
                        type: 'authenticated',
                        userId: message.userId,
                        timestamp: new Date().toISOString()
                    });
                    
                    // Send current platform status
                    const platformStatus = await database.getPlatformStatus();
                    clientManager.sendToClient(clientId, {
                        type: 'platform_status',
                        ...platformStatus
                    });
                }
                break;
                
            case 'subscribe_project':
                if (message.projectId && client.userId) {
                    clientManager.subscribeToProject(clientId, message.projectId);
                    
                    clientManager.sendToClient(clientId, {
                        type: 'subscribed',
                        projectId: message.projectId,
                        timestamp: new Date().toISOString()
                    });
                }
                break;
                
            case 'unsubscribe_project':
                if (message.projectId) {
                    clientManager.unsubscribeFromProject(clientId, message.projectId);
                }
                break;
                
            case 'heartbeat':
                client.lastPing = Date.now();
                client.isAlive = true;
                clientManager.sendToClient(clientId, {
                    type: 'heartbeat_ack',
                    timestamp: Date.now()
                });
                break;
                
            case 'cursor_move':
                if (message.projectId && client.userId) {
                    clientManager.broadcastToProject(message.projectId, {
                        type: 'user_cursor',
                        userId: client.userId,
                        projectId: message.projectId,
                        position: message.position,
                        timestamp: Date.now()
                    }, clientId);
                }
                break;
                
            case 'typing_indicator':
                if (message.projectId && client.userId) {
                    clientManager.broadcastToProject(message.projectId, {
                        type: 'user_typing',
                        userId: client.userId,
                        projectId: message.projectId,
                        isTyping: message.isTyping,
                        timestamp: Date.now()
                    }, clientId);
                }
                break;
                
            case 'comment_added':
                if (message.comment && message.comment.projectId) {
                    // Forward to other subscribers
                    clientManager.broadcastToProject(message.comment.projectId, {
                        type: 'comment_added',
                        comment: message.comment,
                        timestamp: new Date().toISOString()
                    }, clientId);
                    
                    // Record interaction
                    await database.recordInteraction(
                        message.comment.projectId,
                        client.userId,
                        'comment_create',
                        'comment',
                        message.comment.id
                    );
                }
                break;
                
            case 'comment_updated':
                if (message.comment && message.comment.projectId) {
                    clientManager.broadcastToProject(message.comment.projectId, {
                        type: 'comment_updated',
                        comment: message.comment,
                        timestamp: new Date().toISOString()
                    });
                }
                break;
                
            case 'decision_updated':
                if (message.decision && message.decision.projectId) {
                    clientManager.broadcastToProject(message.decision.projectId, {
                        type: 'decision_updated',
                        decision: message.decision,
                        timestamp: new Date().toISOString()
                    });
                }
                break;
                
            case 'project_updated':
                if (message.project && message.project.id) {
                    clientManager.broadcastToProject(message.project.id, {
                        type: 'project_updated',
                        project: message.project,
                        timestamp: new Date().toISOString()
                    });
                }
                break;
                
            case 'user_status':
                if (message.userId && message.status) {
                    // Broadcast to all projects this user is subscribed to
                    client.projects.forEach(projectId => {
                        clientManager.broadcastToProject(projectId, {
                            type: 'user_status_changed',
                            userId: message.userId,
                            status: message.status,
                            timestamp: new Date().toISOString()
                        });
                    });
                }
                break;
                
            default:
                console.log(`Unknown message type from ${clientId}:`, message.type);
        }
    } catch (error) {
        console.error(`Error handling message from ${clientId}:`, error);
        clientManager.sendToClient(clientId, {
            type: 'error',
            error: 'Failed to process message',
            timestamp: new Date().toISOString()
        });
    }
}

function broadcastPlatformStatus(status) {
    const message = {
        type: 'platform_status',
        ...status,
        timestamp: new Date().toISOString()
    };
    
    // Send to all authenticated clients
    for (const [clientId, client] of clientManager.clients.entries()) {
        if (client.userId) {
            clientManager.sendToClient(clientId, message);
        }
    }
}

// ===== API ROUTES =====
function setupRoutes() {
    // Health check endpoint
    app.get('/api/health', (req, res) => {
        const dbStatus = database.connected ? 'connected' : 'disconnected';
        
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: '2.0.0',
            environment: NODE_ENV,
            database: dbStatus,
            websocket: {
                clients: clientManager.getStats().totalClients,
                authenticated: clientManager.getStats().authenticatedClients
            },
            uptime: process.uptime(),
            memory: process.memoryUsage()
        });
    });
    
    // Get platform status
    app.get('/api/platform/status', async (req, res) => {
        try {
            const status = await database.getPlatformStatus();
            res.json(status);
        } catch (error) {
            console.error('Platform status error:', error);
            res.status(500).json({ 
                error: 'Failed to get platform status',
                timestamp: new Date().toISOString()
            });
        }
    });
    
    // Get all projects
    app.get('/api/projects', async (req, res) => {
        try {
            const { status = 'active', limit = 50, offset = 0 } = req.query;
            const userId = req.headers['x-user-id'];
            
            let projects;
            if (userId) {
                projects = await database.getUserProjects(userId);
            } else {
                const db = await database.connect();
                projects = await db.all(`
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
            }
            
            res.json(projects);
        } catch (error) {
            console.error('Projects fetch error:', error);
            res.status(500).json({ 
                error: 'Failed to fetch projects',
                timestamp: new Date().toISOString()
            });
        }
    });
    
    // Get single project
    app.get('/api/projects/:id', async (req, res) => {
        try {
            const projectId = req.params.id;
            const userId = req.headers['x-user-id'] || 'anonymous';
            
            const project = await database.getProjectAnalytics(projectId);
            
            if (!project) {
                return res.status(404).json({ 
                    error: 'Project not found',
                    timestamp: new Date().toISOString()
                });
            }
            
            // Record view interaction
            await database.recordInteraction(
                projectId, 
                userId, 
                'project_view',
                'project',
                projectId,
                { source: 'api' }
            );
            
            // Add timeline event for view (if authenticated user)
            if (userId !== 'anonymous') {
                await database.addTimelineEvent(
                    projectId,
                    'project_viewed',
                    `Project viewed by user`,
                    userId,
                    'project',
                    projectId
                );
            }
            
            res.json(project);
        } catch (error) {
            console.error('Project fetch error:', error);
            res.status(500).json({ 
                error: 'Failed to fetch project',
                timestamp: new Date().toISOString()
            });
        }
    });
    
    // Create project
    app.post('/api/projects', async (req, res) => {
        try {
            const { title, description, type = 'clinical', createdBy } = req.body;
            
            if (!title || !description || !createdBy) {
                return res.status(400).json({ 
                    error: 'Missing required fields: title, description, createdBy',
                    timestamp: new Date().toISOString()
                });
            }
            
            if (title.length > 200) {
                return res.status(400).json({ 
                    error: 'Title too long (max 200 characters)',
                    timestamp: new Date().toISOString()
                });
            }
            
            if (description.length > 5000) {
                return res.status(400).json({ 
                    error: 'Description too long (max 5000 characters)',
                    timestamp: new Date().toISOString()
                });
            }
            
            const db = await database.connect();
            const projectId = `proj_${uuidv4()}`;
            const now = new Date().toISOString();
            
            await db.run(
                `INSERT INTO projects (id, title, description, type, created_by, created_at, updated_at, last_activity_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [projectId, title, description, type, createdBy, now, now, now]
            );
            
            await db.run(
                `INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)`,
                [projectId, createdBy, 'owner']
            );
            
            await database.recordInteraction(
                projectId, 
                createdBy, 
                'project_create',
                'project',
                projectId,
                { role: 'owner' }
            );
            
            await database.addTimelineEvent(
                projectId,
                'project_created',
                `Project "${title}" created`,
                createdBy,
                'project',
                projectId
            );
            
            const project = await db.get(`
                SELECT p.*, u.name as creator_name, u.avatar_color as creator_color
                FROM projects p
                LEFT JOIN users u ON p.created_by = u.id
                WHERE p.id = ?
            `, [projectId]);
            
            // Broadcast project creation
            clientManager.broadcastToProject(projectId, {
                type: 'project_created',
                project: project,
                timestamp: now
            });
            
            // Update platform metrics
            await database.updatePlatformMetrics();
            
            res.status(201).json(project);
        } catch (error) {
            console.error('Project creation error:', error);
            res.status(500).json({ 
                error: 'Failed to create project',
                timestamp: new Date().toISOString()
            });
        }
    });
    
    // Update project
    app.put('/api/projects/:id', async (req, res) => {
        try {
            const projectId = req.params.id;
            const updates = req.body;
            const userId = req.headers['x-user-id'];
            
            if (!updates || Object.keys(updates).length === 0) {
                return res.status(400).json({ 
                    error: 'No updates provided',
                    timestamp: new Date().toISOString()
                });
            }
            
            const db = await database.connect();
            
            // Check if user is project member
            const isMember = await db.get(
                'SELECT role FROM project_members WHERE project_id = ? AND user_id = ?',
                [projectId, userId]
            );
            
            if (!isMember && userId !== 'system') {
                return res.status(403).json({ 
                    error: 'Not authorized to update project',
                    timestamp: new Date().toISOString()
                });
            }
            
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
                return res.status(400).json({ 
                    error: 'No valid fields to update',
                    timestamp: new Date().toISOString()
                });
            }
            
            updateValues.push(projectId);
            
            await db.run(
                `UPDATE projects SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                updateValues
            );
            
            const project = await db.get(`
                SELECT p.*, u.name as creator_name, u.avatar_color as creator_color
                FROM projects p
                LEFT JOIN users u ON p.created_by = u.id
                WHERE p.id = ?
            `, [projectId]);
            
            await database.addTimelineEvent(
                projectId,
                'project_updated',
                'Project details updated',
                userId,
                'project',
                projectId,
                { updates: Object.keys(updates) }
            );
            
            await database.recordInteraction(
                projectId,
                userId,
                'project_update',
                'project',
                projectId,
                { fields: updateFields }
            );
            
            clientManager.broadcastToProject(projectId, {
                type: 'project_updated',
                project: project,
                timestamp: new Date().toISOString()
            });
            
            res.json(project);
        } catch (error) {
            console.error('Project update error:', error);
            res.status(500).json({ 
                error: 'Failed to update project',
                timestamp: new Date().toISOString()
            });
        }
    });
    
    // Get project comments
    app.get('/api/projects/:id/comments', async (req, res) => {
        try {
            const projectId = req.params.id;
            const { limit = 100, offset = 0, parent_id = null } = req.query;
            const userId = req.headers['x-user-id'] || '';
            
            const db = await database.connect();
            
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
                WHERE c.project_id = ? AND c.parent_id IS NULL
                ORDER BY c.is_pinned DESC, c.created_at DESC
                LIMIT ? OFFSET ?
            `, [userId, projectId, parseInt(limit), parseInt(offset)]);
            
            res.json(comments);
        } catch (error) {
            console.error('Comments fetch error:', error);
            res.status(500).json({ 
                error: 'Failed to fetch comments',
                timestamp: new Date().toISOString()
            });
        }
    });
    
    // Add comment
    app.post('/api/comments', async (req, res) => {
        try {
            const { projectId, content, userId, parentId = null } = req.body;
            
            if (!projectId || !content || !userId) {
                return res.status(400).json({ 
                    error: 'Missing required fields: projectId, content, userId',
                    timestamp: new Date().toISOString()
                });
            }
            
            if (content.length > 10000) {
                return res.status(400).json({ 
                    error: 'Comment too long (max 10000 characters)',
                    timestamp: new Date().toISOString()
                });
            }
            
            const db = await database.connect();
            const commentId = `comment_${uuidv4()}`;
            const now = new Date().toISOString();
            
            await db.run(
                `INSERT INTO comments (id, project_id, user_id, parent_id, content, created_at, updated_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [commentId, projectId, userId, parentId, content, now, now]
            );
            
            await database.recordInteraction(
                projectId, 
                userId, 
                'comment_create',
                'comment',
                commentId,
                { parentId, contentLength: content.length }
            );
            
            const user = await db.get('SELECT name FROM users WHERE id = ?', [userId]);
            await database.addTimelineEvent(
                projectId,
                'comment_added',
                `${user?.name || 'User'} commented`,
                userId,
                'comment',
                commentId
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
            
            // Update project comment count
            await db.run(
                `UPDATE projects SET total_comments = total_comments + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [projectId]
            );
            
            clientManager.broadcastToProject(projectId, {
                type: 'comment_added',
                comment: comment,
                timestamp: now
            });
            
            res.status(201).json(comment);
        } catch (error) {
            console.error('Comment creation error:', error);
            res.status(500).json({ 
                error: 'Failed to create comment',
                timestamp: new Date().toISOString()
            });
        }
    });
    
    // React to comment
    app.post('/api/comments/:id/react', async (req, res) => {
        try {
            const commentId = req.params.id;
            const { userId, reaction = 'like' } = req.body;
            
            if (!userId) {
                return res.status(400).json({ 
                    error: 'User ID required',
                    timestamp: new Date().toISOString()
                });
            }
            
            const db = await database.connect();
            
            // Get comment details
            const comment = await db.get(
                'SELECT project_id, user_id FROM comments WHERE id = ?',
                [commentId]
            );
            
            if (!comment) {
                return res.status(404).json({ 
                    error: 'Comment not found',
                    timestamp: new Date().toISOString()
                });
            }
            
            const existingReaction = await db.get(
                'SELECT * FROM comment_reactions WHERE comment_id = ? AND user_id = ? AND reaction = ?',
                [commentId, userId, reaction]
            );
            
            if (existingReaction) {
                // Remove reaction
                await db.run(
                    'DELETE FROM comment_reactions WHERE comment_id = ? AND user_id = ? AND reaction = ?',
                    [commentId, userId, reaction]
                );
                
                await db.run(
                    'UPDATE comments SET likes = likes - 1 WHERE id = ?',
                    [commentId]
                );
            } else {
                // Add reaction
                await db.run(
                    `INSERT INTO comment_reactions (comment_id, user_id, reaction) VALUES (?, ?, ?)`,
                    [commentId, userId, reaction]
                );
                
                await db.run(
                    'UPDATE comments SET likes = likes + 1 WHERE id = ?',
                    [commentId]
                );
                
                await database.recordInteraction(
                    comment.project_id,
                    userId,
                    'comment_like',
                    'comment',
                    commentId,
                    { reaction }
                );
                
                // Add timeline event for reaction
                if (comment.user_id !== userId) {
                    const reactingUser = await db.get('SELECT name FROM users WHERE id = ?', [userId]);
                    await database.addTimelineEvent(
                        comment.project_id,
                        'comment_reacted',
                        `${reactingUser?.name || 'User'} reacted to a comment`,
                        userId,
                        'comment',
                        commentId,
                        { reaction }
                    );
                }
            }
            
            const updatedComment = await db.get(`
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
            
            clientManager.broadcastToProject(comment.project_id, {
                type: 'comment_updated',
                comment: updatedComment,
                timestamp: new Date().toISOString()
            });
            
            res.json(updatedComment);
        } catch (error) {
            console.error('Comment reaction error:', error);
            res.status(500).json({ 
                error: 'Failed to update reaction',
                timestamp: new Date().toISOString()
            });
        }
    });
    
    // Get project team
    app.get('/api/projects/:id/team', async (req, res) => {
        try {
            const projectId = req.params.id;
            
            const team = await database.getProjectAnalytics(projectId).then(async (project) => {
                if (!project) return [];
                
                const db = await database.connect();
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
                            WHEN u.last_active > datetime('now', '-1 hour') THEN 'away'
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
            });
            
            res.json(team);
        } catch (error) {
            console.error('Team fetch error:', error);
            res.status(500).json({ 
                error: 'Failed to fetch team',
                timestamp: new Date().toISOString()
            });
        }
    });
    
    // Join project
    app.post('/api/projects/:id/join', async (req, res) => {
        try {
            const projectId = req.params.id;
            const { userId, role = 'contributor' } = req.body;
            
            if (!userId) {
                return res.status(400).json({ 
                    error: 'User ID required',
                    timestamp: new Date().toISOString()
                });
            }
            
            const db = await database.connect();
            
            const existingMember = await db.get(
                'SELECT * FROM project_members WHERE project_id = ? AND user_id = ?',
                [projectId, userId]
            );
            
            if (existingMember) {
                return res.status(400).json({ 
                    error: 'Already a member',
                    timestamp: new Date().toISOString()
                });
            }
            
            await db.run(
                `INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)`,
                [projectId, userId, role]
            );
            
            await database.recordInteraction(
                projectId, 
                userId, 
                'project_join',
                'project',
                projectId,
                { role }
            );
            
            // Update project member count
            await db.run(
                `UPDATE projects SET total_members = total_members + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [projectId]
            );
            
            const user = await db.get('SELECT name FROM users WHERE id = ?', [userId]);
            const project = await db.get('SELECT title FROM projects WHERE id = ?', [projectId]);
            
            await database.addTimelineEvent(
                projectId,
                'member_joined',
                `${user?.name || 'User'} joined the project`,
                userId,
                'user',
                userId
            );
            
            const team = await db.all(`
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
            
            clientManager.broadcastToProject(projectId, {
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
            res.status(500).json({ 
                error: 'Failed to join project',
                timestamp: new Date().toISOString()
            });
        }
    });
    
    // Get project timeline
    app.get('/api/projects/:id/timeline', async (req, res) => {
        try {
            const projectId = req.params.id;
            const { limit = 50, offset = 0 } = req.query;
            
            const db = await database.connect();
            
            const timeline = await db.all(`
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
            
            res.json(timeline);
        } catch (error) {
            console.error('Timeline fetch error:', error);
            res.status(500).json({ 
                error: 'Failed to fetch timeline',
                timestamp: new Date().toISOString()
            });
        }
    });
    
    // Get project decisions
    app.get('/api/projects/:id/decisions', async (req, res) => {
        try {
            const projectId = req.params.id;
            const { status, limit = 100, offset = 0 } = req.query;
            
            const db = await database.connect();
            
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
            
            const decisions = await db.all(query, params);
            
            res.json(decisions);
        } catch (error) {
            console.error('Decisions fetch error:', error);
            res.status(500).json({ 
                error: 'Failed to fetch decisions',
                timestamp: new Date().toISOString()
            });
        }
    });
    
    // Get online users
    app.get('/api/users/online', async (req, res) => {
        try {
            const users = await database.getOnlineUsers();
            res.json(users);
        } catch (error) {
            console.error('Online users fetch error:', error);
            res.status(500).json({ 
                error: 'Failed to fetch online users',
                timestamp: new Date().toISOString()
            });
        }
    });
    
    // Get recent activity
    app.get('/api/activity/recent', async (req, res) => {
        try {
            const { limit = 20 } = req.query;
            const activity = await database.getRecentActivity(parseInt(limit));
            res.json(activity);
        } catch (error) {
            console.error('Recent activity fetch error:', error);
            res.status(500).json({ 
                error: 'Failed to fetch recent activity',
                timestamp: new Date().toISOString()
            });
        }
    });
    
    // User login/registration
    app.post('/api/auth/login', async (req, res) => {
        try {
            const { email, name, role = 'clinician' } = req.body;
            
            if (!email || !name) {
                return res.status(400).json({ 
                    error: 'Email and name required',
                    timestamp: new Date().toISOString()
                });
            }
            
            const db = await database.connect();
            
            let user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
            
            if (!user) {
                const userId = `user_${uuidv4()}`;
                const avatarColors = ['#0C7C59', '#D35400', '#7B68EE', '#1A365D', '#8B5CF6', '#2D9CDB', '#27AE60'];
                const randomColor = avatarColors[Math.floor(Math.random() * avatarColors.length)];
                
                await db.run(
                    `INSERT INTO users (id, email, name, role, avatar_color, last_active) 
                     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                    [userId, email, name, role, randomColor]
                );
                
                user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
                
                // Add timeline event for new user
                await database.addTimelineEvent(
                    'system',
                    'user_registered',
                    `New user registered: ${name} (${role})`,
                    userId,
                    'user',
                    userId
                );
            } else {
                await db.run(
                    'UPDATE users SET last_active = CURRENT_TIMESTAMP, status = "online" WHERE id = ?',
                    [user.id]
                );
            }
            
            // Remove sensitive data
            const { ...userData } = user;
            
            // Record login
            await database.recordInteraction(
                'system',
                user.id,
                'user_login',
                'user',
                user.id,
                { method: 'email', timestamp: new Date().toISOString() }
            );
            
            res.json({
                user: userData,
                token: `demo_token_${user.id}_${Date.now()}`,
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
            });
        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({ 
                error: 'Failed to authenticate',
                timestamp: new Date().toISOString()
            });
        }
    });
    
    // User profile
    app.get('/api/users/:id', async (req, res) => {
        try {
            const userId = req.params.id;
            
            const db = await database.connect();
            
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
            
            if (!user) {
                return res.status(404).json({ 
                    error: 'User not found',
                    timestamp: new Date().toISOString()
                });
            }
            
            // Remove sensitive data
            const { ...userData } = user;
            
            res.json(userData);
        } catch (error) {
            console.error('User fetch error:', error);
            res.status(500).json({ 
                error: 'Failed to fetch user',
                timestamp: new Date().toISOString()
            });
        }
    });
    
    // Serve frontend routes
    app.get('/project', (req, res) => {
        res.sendFile(path.join(PUBLIC_DIR, 'project.html'));
    });
    
    // Catch-all route for SPA
    app.get('*', (req, res) => {
        res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
    });
    
    console.log('✅ API routes setup complete');
}

// ===== STARTUP =====
async function initialize() {
    console.log(`
    🚀 THORAXLAB CLINICAL-INDUSTRY INNOVATION PLATFORM v2.0
    ═══════════════════════════════════════════════════════════
    Initializing...
    Environment: ${NODE_ENV}
    Port: ${PORT}
    Public Directory: ${PUBLIC_DIR}
    `);
    
    try {
        // Connect to database
        await database.connect();
        
        // Setup middleware
        setupMiddleware();
        
        // Setup routes
        setupRoutes();
        
        // Setup WebSocket
        setupWebSocket();
        
        // Start server
        startServer();
        
        // Schedule maintenance
        scheduleMaintenance();
        
    } catch (error) {
        console.error('❌ Initialization failed:', error);
        process.exit(1);
    }
}

function startServer() {
    server.listen(PORT, () => {
        console.log(`
        ═══════════════════════════════════════════════════════════
        🎉 THORAXLAB PLATFORM READY
        📍 Port: ${PORT}
        🌐 WebSocket: Active (${wss.options.port})
        💾 Database: Connected
        📁 Public Folder: ${PUBLIC_DIR}
        🔗 URL: http://localhost:${PORT}
        🏷️  Version: 2.0.0
        ═══════════════════════════════════════════════════════════
        `);
    });
    
    // Handle server errors
    server.on('error', (error) => {
        console.error('❌ Server error:', error);
        if (error.code === 'EADDRINUSE') {
            console.log(`Port ${PORT} is already in use. Trying ${parseInt(PORT) + 1}...`);
            server.listen(parseInt(PORT) + 1);
        }
    });
}

function scheduleMaintenance() {
    // Run maintenance every hour
    setInterval(async () => {
        try {
            await database.performMaintenance();
        } catch (error) {
            console.error('Scheduled maintenance error:', error);
        }
    }, 60 * 60 * 1000); // 1 hour
    
    // Initial maintenance after 5 minutes
    setTimeout(async () => {
        try {
            await database.performMaintenance();
        } catch (error) {
            console.error('Initial maintenance error:', error);
        }
    }, 5 * 60 * 1000);
}

// ===== GRACEFUL SHUTDOWN =====
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

async function gracefulShutdown() {
    console.log('🚦 Received shutdown signal. Shutting down gracefully...');
    
    try {
        // Close all WebSocket connections
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.close(1001, 'Server shutting down');
            }
        });
        
        // Close database connection
        await database.close();
        
        // Close HTTP server
        server.close(() => {
            console.log('✅ Server shutdown complete');
            process.exit(0);
        });
        
        // Force exit after 10 seconds
        setTimeout(() => {
            console.warn('⚠️  Forcing shutdown after timeout');
            process.exit(1);
        }, 10000);
        
    } catch (error) {
        console.error('Shutdown error:', error);
        process.exit(1);
    }
}

// ===== START APPLICATION =====
initialize().catch((error) => {
    console.error('Fatal initialization error:', error);
    process.exit(1);
});

module.exports = { app, server, wss, clientManager, database };
