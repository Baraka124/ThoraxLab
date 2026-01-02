const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
const cors = require('cors');
const { database } = require('./database.js');

const PORT = process.env.PORT || 3000;
const app = express();
const server = require('http').createServer(app);

// ===== CONFIGURATION =====
const config = {
    cors: {
        origin: true,
        credentials: true
    },
    websocket: {
        clientTimeout: 30000,
        pingInterval: 25000
    },
    authentication: {
        tokenExpiryHours: 24
    }
};

// ===== WEBSOCKET SERVER =====
const wss = new WebSocket.Server({ 
    server,
    clientTracking: true
});

// Data structures for managing connections
const clients = new Map(); // clientId -> { ws, userId, projectId, lastActivity }
const projectConnections = new Map(); // projectId -> Set(clientId)
const userConnections = new Map(); // userId -> Set(clientId)

// Helper function to broadcast to all clients in a project
function broadcastToProject(projectId, message) {
    const projectClients = projectConnections.get(projectId);
    if (!projectClients) return;

    const messageStr = JSON.stringify(message);
    projectClients.forEach(clientId => {
        const client = clients.get(clientId);
        if (client && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(messageStr);
        }
    });
}

// Helper function to broadcast to specific user
function broadcastToUser(userId, message) {
    const userClients = userConnections.get(userId);
    if (!userClients) return;

    const messageStr = JSON.stringify(message);
    userClients.forEach(clientId => {
        const client = clients.get(clientId);
        if (client && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(messageStr);
        }
    });
}

// WebSocket connection handler
wss.on('connection', (ws, req) => {
    const clientId = `client_${uuidv4()}`;
    const clientData = { 
        ws, 
        userId: null, 
        projectId: null, 
        lastActivity: Date.now() 
    };
    
    clients.set(clientId, clientData);

    // Set up ping/pong to detect dead connections
    const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.ping();
        }
    }, config.websocket.pingInterval);

    ws.on('pong', () => {
        const client = clients.get(clientId);
        if (client) {
            client.lastActivity = Date.now();
        }
    });

    ws.on('message', async (data) => {
        try {
            const client = clients.get(clientId);
            if (client) {
                client.lastActivity = Date.now();
            }

            const message = JSON.parse(data.toString());
            
            switch (message.type) {
                case 'authenticate':
                    await handleAuthentication(clientId, message);
                    break;
                    
                case 'join_project':
                    await handleJoinProject(clientId, message);
                    break;
                    
                case 'leave_project':
                    await handleLeaveProject(clientId);
                    break;
                    
                case 'ping':
                    ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
                    break;
                    
                default:
                    console.warn(`Unknown WebSocket message type: ${message.type}`);
            }
        } catch (error) {
            console.error('WebSocket message error:', error.message);
            ws.send(JSON.stringify({ 
                type: 'error', 
                message: 'Invalid message format' 
            }));
        }
    });

    ws.on('close', () => {
        clearInterval(pingInterval);
        cleanupClient(clientId);
    });

    ws.on('error', (error) => {
        console.error(`WebSocket error for client ${clientId}:`, error.message);
        cleanupClient(clientId);
    });

    // Send initial connection confirmation
    ws.send(JSON.stringify({ 
        type: 'connected', 
        clientId,
        timestamp: new Date().toISOString() 
    }));
});

// WebSocket message handlers
async function handleAuthentication(clientId, message) {
    const client = clients.get(clientId);
    if (!client) return;

    try {
        const session = await database.getSessionByToken(message.token);
        if (!session) {
            client.ws.send(JSON.stringify({ 
                type: 'auth_error', 
                message: 'Invalid or expired token' 
            }));
            return;
        }

        client.userId = session.user_id;
        
        // Add to user connections
        if (!userConnections.has(session.user_id)) {
            userConnections.set(session.user_id, new Set());
        }
        userConnections.get(session.user_id).add(clientId);

        client.ws.send(JSON.stringify({ 
            type: 'authenticated', 
            userId: session.user_id,
            timestamp: new Date().toISOString() 
        }));

        // Auto-join project if specified
        if (message.project_id) {
            await handleJoinProject(clientId, { project_id: message.project_id });
        }
    } catch (error) {
        console.error('Authentication error:', error);
        client.ws.send(JSON.stringify({ 
            type: 'auth_error', 
            message: 'Authentication failed' 
        }));
    }
}

async function handleJoinProject(clientId, message) {
    const client = clients.get(clientId);
    if (!client || !client.userId) return;

    try {
        const hasAccess = await database.isUserInProject(message.project_id, client.userId);
        if (!hasAccess) {
            client.ws.send(JSON.stringify({ 
                type: 'project_error', 
                message: 'No access to project' 
            }));
            return;
        }

        // Leave previous project
        await handleLeaveProject(clientId);

        // Join new project
        client.projectId = message.project_id;
        
        if (!projectConnections.has(message.project_id)) {
            projectConnections.set(message.project_id, new Set());
        }
        projectConnections.get(message.project_id).add(clientId);

        client.ws.send(JSON.stringify({ 
            type: 'project_joined', 
            projectId: message.project_id,
            timestamp: new Date().toISOString() 
        }));
    } catch (error) {
        console.error('Join project error:', error);
    }
}

async function handleLeaveProject(clientId) {
    const client = clients.get(clientId);
    if (!client || !client.projectId) return;

    const projectClients = projectConnections.get(client.projectId);
    if (projectClients) {
        projectClients.delete(clientId);
        if (projectClients.size === 0) {
            projectConnections.delete(client.projectId);
        }
    }
    
    client.projectId = null;
}

function cleanupClient(clientId) {
    const client = clients.get(clientId);
    if (!client) return;

    // Remove from project connections
    if (client.projectId) {
        const projectClients = projectConnections.get(client.projectId);
        if (projectClients) {
            projectClients.delete(clientId);
            if (projectClients.size === 0) {
                projectConnections.delete(client.projectId);
            }
        }
    }

    // Remove from user connections
    if (client.userId) {
        const userClients = userConnections.get(client.userId);
        if (userClients) {
            userClients.delete(clientId);
            if (userClients.size === 0) {
                userConnections.delete(client.userId);
            }
        }
    }

    clients.delete(clientId);
}

// Clean up dead connections periodically
setInterval(() => {
    const now = Date.now();
    clients.forEach((client, clientId) => {
        if (now - client.lastActivity > config.websocket.clientTimeout) {
            client.ws.terminate();
            cleanupClient(clientId);
        }
    });
}, 30000);

// ===== EXPRESS SERVER SETUP =====
app.use(cors(config.cors));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ===== MIDDLEWARE =====

// Authentication middleware
async function authenticateToken(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Authentication token required' });
        }

        const token = authHeader.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'Invalid token format' });
        }

        const session = await database.getSessionByToken(token);
        if (!session) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        const user = await database.getUser(session.user_id);
        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }

        // Attach user and session to request
        req.user = user;
        req.session = session;
        req.token = token;
        
        next();
    } catch (error) {
        console.error('Authentication middleware error:', error);
        res.status(500).json({ error: 'Authentication failed' });
    }
}

// Request logging middleware
app.use((req, res, next) => {
    const startTime = Date.now();
    const originalSend = res.send;
    
    res.send = function(data) {
        const duration = Date.now() - startTime;
        console.log(`${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
        return originalSend.call(this, data);
    };
    
    next();
});

// ===== API ROUTES =====

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        service: 'ThoraxLab API',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        websocket: {
            clients: clients.size,
            projects: projectConnections.size
        }
    });
});

// ===== AUTHENTICATION ROUTES =====

// Login/Register
app.post('/api/login', async (req, res) => {
    try {
        const { name, email, organization, role } = req.body;
        
        // Validation
        if (!name || !email) {
            return res.status(400).json({ 
                error: 'Validation failed',
                details: 'Name and email are required' 
            });
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ 
                error: 'Validation failed',
                details: 'Invalid email format' 
            });
        }

        // Find or create user
        let user = await database.findUserByEmail(email);
        if (!user) {
            user = await database.createUser({
                name: name.trim(),
                email: email.toLowerCase().trim(),
                organization: (organization || '').trim(),
                role: (role || 'clinician').trim()
            });
        }

        // Create session
        const token = `tok_${uuidv4()}`;
        await database.createSession(user.id, token, config.authentication.tokenExpiryHours);

        res.json({
            success: true,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                organization: user.organization,
                role: user.role,
                avatar_initials: user.avatar_initials,
                created_at: user.created_at
            },
            token,
            expires_in: `${config.authentication.tokenExpiryHours}h`
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            error: 'Login failed',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Logout
app.post('/api/logout', authenticateToken, async (req, res) => {
    try {
        await database.deleteSession(req.token);
        res.json({ success: true });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Logout failed' });
    }
});

// Get current user
app.get('/api/me', authenticateToken, async (req, res) => {
    try {
        const projects = await database.getProjectsForUser(req.user.id);
        
        res.json({ 
            success: true, 
            user: req.user,
            projects: projects.slice(0, 10),
            session: {
                created_at: req.session.created_at,
                expires_at: req.session.expires_at
            }
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to get user data' });
    }
});

// ===== DASHBOARD ROUTES =====

// Dashboard data
app.get('/api/dashboard', authenticateToken, async (req, res) => {
    try {
        const dashboardData = await database.getDashboardData(req.user.id);
        
        res.json({
            success: true,
            dashboard: {
                user: req.user,
                ...dashboardData
            }
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ error: 'Failed to load dashboard' });
    }
});

// ===== PROJECT ROUTES =====

// List projects
app.get('/api/projects', authenticateToken, async (req, res) => {
    try {
        const projects = await database.getProjectsForUser(req.user.id);
        res.json({ 
            success: true, 
            projects,
            count: projects.length 
        });
    } catch (error) {
        console.error('List projects error:', error);
        res.status(500).json({ error: 'Failed to load projects' });
    }
});

// Create project
app.post('/api/projects', authenticateToken, async (req, res) => {
    try {
        const { title, description, type, objectives } = req.body;
        
        // Validation
        if (!title || !description) {
            return res.status(400).json({ 
                error: 'Validation failed',
                details: 'Title and description are required' 
            });
        }

        if (title.length > 200) {
            return res.status(400).json({ 
                error: 'Validation failed',
                details: 'Title must be less than 200 characters' 
            });
        }

        const project = await database.createProject({
            title: title.trim(),
            description: description.trim(),
            type: (type || 'clinical').trim(),
            objectives
        }, req.user.id);

        // Broadcast to user's other connections
        broadcastToUser(req.user.id, {
            type: 'project_created',
            project,
            timestamp: new Date().toISOString()
        });

        res.status(201).json({ 
            success: true, 
            project,
            message: 'Project created successfully'
        });
    } catch (error) {
        console.error('Create project error:', error);
        res.status(500).json({ error: 'Failed to create project' });
    }
});

// Get single project
app.get('/api/projects/:id', authenticateToken, async (req, res) => {
    try {
        const projectId = req.params.id;
        
        // Check access
        const hasAccess = await database.isUserInProject(projectId, req.user.id);
        if (!hasAccess) {
            return res.status(403).json({ 
                error: 'Access denied',
                details: 'You do not have access to this project' 
            });
        }
        
        // Fetch project data in parallel for better performance
        const [project, team, discussions, decisions, metrics] = await Promise.all([
            database.getProject(projectId),
            database.getProjectTeam(projectId),
            database.getProjectDiscussions(projectId),
            database.getProjectDecisions(projectId),
            database.getProjectMetrics(projectId)
        ]);
        
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        
        res.json({
            success: true,
            project,
            team,
            discussions,
            decisions,
            metrics
        });
    } catch (error) {
        console.error('Get project error:', error);
        res.status(500).json({ error: 'Failed to load project' });
    }
});

// Update project
app.put('/api/projects/:id', authenticateToken, async (req, res) => {
    try {
        const projectId = req.params.id;
        
        // Check access
        const hasAccess = await database.isUserInProject(projectId, req.user.id);
        if (!hasAccess) {
            return res.status(403).json({ error: 'No access to project' });
        }
        
        const project = await database.updateProject(projectId, req.body);
        
        // Broadcast update to all project members
        broadcastToProject(projectId, {
            type: 'project_updated',
            project,
            updated_by: req.user.name,
            timestamp: new Date().toISOString()
        });
        
        res.json({ 
            success: true, 
            project,
            message: 'Project updated successfully' 
        });
    } catch (error) {
        console.error('Update project error:', error);
        res.status(500).json({ error: 'Failed to update project' });
    }
});

// Get project activity
app.get('/api/projects/:id/activity', authenticateToken, async (req, res) => {
    try {
        const projectId = req.params.id;
        
        const hasAccess = await database.isUserInProject(projectId, req.user.id);
        if (!hasAccess) {
            return res.status(403).json({ error: 'No access to project' });
        }
        
        const limit = parseInt(req.query.limit) || 20;
        const activity = await database.getProjectActivity(projectId, limit);
        
        res.json({ 
            success: true, 
            activity,
            count: activity.length 
        });
    } catch (error) {
        console.error('Get activity error:', error);
        res.status(500).json({ error: 'Failed to load activity' });
    }
});

// Get project threads
app.get('/api/projects/:id/threads', authenticateToken, async (req, res) => {
    try {
        const projectId = req.params.id;
        
        const hasAccess = await database.isUserInProject(projectId, req.user.id);
        if (!hasAccess) {
            return res.status(403).json({ error: 'No access to project' });
        }
        
        const threads = await database.getProjectThreads(projectId);
        
        res.json({ 
            success: true, 
            threads,
            count: threads.length 
        });
    } catch (error) {
        console.error('Get threads error:', error);
        res.status(500).json({ error: 'Failed to load threads' });
    }
});

// ===== DISCUSSION ROUTES =====

// Create discussion
app.post('/api/projects/:id/discussions', authenticateToken, async (req, res) => {
    try {
        const projectId = req.params.id;
        const { title, content, type } = req.body;
        
        // Validation
        if (!title || !content || !type) {
            return res.status(400).json({ 
                error: 'Validation failed',
                details: 'Title, content and type are required' 
            });
        }
        
        const hasAccess = await database.isUserInProject(projectId, req.user.id);
        if (!hasAccess) {
            return res.status(403).json({ error: 'No access to project' });
        }
        
        const discussion = await database.createDiscussion({
            projectId,
            title: title.trim(),
            content: content.trim(),
            type: type.trim(),
            authorId: req.user.id
        });
        
        // Broadcast to all project members
        broadcastToProject(projectId, {
            type: 'discussion_created',
            discussion,
            author: req.user.name,
            timestamp: new Date().toISOString()
        });
        
        res.status(201).json({ 
            success: true, 
            discussion,
            message: 'Discussion created successfully' 
        });
    } catch (error) {
        console.error('Create discussion error:', error);
        res.status(500).json({ error: 'Failed to create discussion' });
    }
});

// Vote on discussion
app.post('/api/discussions/:id/vote', authenticateToken, async (req, res) => {
    try {
        const discussionId = req.params.id;
        const { vote_type } = req.body;
        
        if (!vote_type || !['upvote', 'downvote'].includes(vote_type)) {
            return res.status(400).json({ 
                error: 'Validation failed',
                details: 'Valid vote_type (upvote/downvote) is required' 
            });
        }
        
        const discussion = await database.getDiscussion(discussionId);
        if (!discussion) {
            return res.status(404).json({ error: 'Discussion not found' });
        }
        
        const hasAccess = await database.isUserInProject(discussion.project_id, req.user.id);
        if (!hasAccess) {
            return res.status(403).json({ error: 'No access to discussion' });
        }
        
        const vote = await database.addDiscussionVote(discussionId, req.user.id, vote_type);
        
        // Broadcast vote to project
        broadcastToProject(discussion.project_id, {
            type: 'vote_added',
            discussionId,
            vote,
            user: req.user.name,
            timestamp: new Date().toISOString()
        });
        
        res.json({ 
            success: true, 
            vote,
            message: 'Vote recorded successfully' 
        });
    } catch (error) {
        console.error('Vote error:', error);
        res.status(500).json({ error: 'Failed to vote' });
    }
});

// ===== COMMENT ROUTES =====

// Add comment
app.post('/api/comments', authenticateToken, async (req, res) => {
    try {
        const { discussion_id, content } = req.body;
        
        if (!discussion_id || !content) {
            return res.status(400).json({ 
                error: 'Validation failed',
                details: 'Discussion ID and content are required' 
            });
        }
        
        const discussion = await database.getDiscussion(discussion_id);
        if (!discussion) {
            return res.status(404).json({ error: 'Discussion not found' });
        }
        
        const hasAccess = await database.isUserInProject(discussion.project_id, req.user.id);
        if (!hasAccess) {
            return res.status(403).json({ error: 'No access to discussion' });
        }
        
        const comment = await database.createComment({
            discussionId: discussion_id,
            content: content.trim(),
            authorId: req.user.id
        });
        
        // Broadcast comment to project
        broadcastToProject(discussion.project_id, {
            type: 'comment_created',
            comment,
            discussionId: discussion_id,
            author: req.user.name,
            timestamp: new Date().toISOString()
        });
        
        res.status(201).json({ 
            success: true, 
            comment,
            message: 'Comment added successfully' 
        });
    } catch (error) {
        console.error('Create comment error:', error);
        res.status(500).json({ error: 'Failed to create comment' });
    }
});

// ===== DECISION ROUTES =====

// Create decision
app.post('/api/decisions', authenticateToken, async (req, res) => {
    try {
        const { discussion_id, title, description } = req.body;
        
        if (!discussion_id || !title || !description) {
            return res.status(400).json({ 
                error: 'Validation failed',
                details: 'Discussion ID, title and description are required' 
            });
        }
        
        const discussion = await database.getDiscussion(discussion_id);
        if (!discussion) {
            return res.status(404).json({ error: 'Discussion not found' });
        }
        
        const hasAccess = await database.isUserInProject(discussion.project_id, req.user.id);
        if (!hasAccess) {
            return res.status(403).json({ error: 'No access to discussion' });
        }
        
        const decision = await database.createDecision({
            discussionId: discussion_id,
            title: title.trim(),
            description: description.trim(),
            createdBy: req.user.id
        });
        
        // Broadcast decision to project
        broadcastToProject(discussion.project_id, {
            type: 'decision_created',
            decision,
            author: req.user.name,
            timestamp: new Date().toISOString()
        });
        
        res.status(201).json({ 
            success: true, 
            decision,
            message: 'Decision recorded successfully' 
        });
    } catch (error) {
        console.error('Create decision error:', error);
        res.status(500).json({ error: 'Failed to create decision' });
    }
});

// ===== SPA ROUTES =====
app.get('/project', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'project.html'));
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== ERROR HANDLING =====

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not found',
        message: `Cannot ${req.method} ${req.url}`
    });
});

// Global error handler
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
});

// ===== SERVER STARTUP =====
async function startServer() {
    try {
        await database.connect();
        
        server.listen(PORT, () => {
            console.log(`
🚀 ThoraxLab Platform
📍 Port: ${PORT}
📡 API: http://localhost:${PORT}
🔌 WebSocket: ws://localhost:${PORT}
✅ Database: Connected
🕐 ${new Date().toLocaleString()}
            `);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// ===== GRACEFUL SHUTDOWN =====
function gracefulShutdown(signal) {
    return async () => {
        console.log(`\n${signal} received. Starting graceful shutdown...`);
        
        // Close WebSocket connections
        wss.clients.forEach(client => {
            client.terminate();
        });
        wss.close();
        
        // Close database connection
        try {
            await database.close();
            console.log('✅ Database connection closed');
        } catch (error) {
            console.error('Error closing database:', error);
        }
        
        // Close HTTP server
        server.close(() => {
            console.log('✅ HTTP server closed');
            console.log('👋 Graceful shutdown complete');
            process.exit(0);
        });
        
        // Force shutdown after 10 seconds
        setTimeout(() => {
            console.warn('⚠️ Forcing shutdown after timeout');
            process.exit(1);
        }, 10000);
    };
}

process.on('SIGTERM', gracefulShutdown('SIGTERM'));
process.on('SIGINT', gracefulShutdown('SIGINT'));

// ===== START THE SERVER =====
startServer();
