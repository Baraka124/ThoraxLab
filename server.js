const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
const cors = require('cors');
const { database } = require('./database');

const PORT = process.env.PORT || 3000;
const app = express();
const server = require('http').createServer(app);

// WebSocket Server
const wss = new WebSocket.Server({ server });
const activeClients = new Map();
const projectSubscriptions = new Map();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ===== WEB SOCKET HANDLING =====
wss.on('connection', (ws, req) => {
    const clientId = uuidv4();
    const client = { ws, id: clientId, userId: null, projects: new Set() };
    activeClients.set(clientId, client);

    ws.on('message', async (data) => {
        try {
            const message = JSON.parse(data.toString());
            await handleWebSocketMessage(clientId, message);
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    });

    ws.on('close', () => {
        const client = activeClients.get(clientId);
        if (client) {
            client.projects.forEach(projectId => {
                const subscribers = projectSubscriptions.get(projectId);
                if (subscribers) {
                    subscribers.delete(clientId);
                    if (subscribers.size === 0) {
                        projectSubscriptions.delete(projectId);
                    }
                }
            });
            activeClients.delete(clientId);
        }
    });

    ws.send(JSON.stringify({ type: 'connected', clientId }));
});

async function handleWebSocketMessage(clientId, message) {
    const client = activeClients.get(clientId);
    if (!client) return;

    switch (message.type) {
        case 'authenticate':
            client.userId = message.userId;
            client.userData = message.userData;
            break;

        case 'subscribe_project':
            if (message.projectId) {
                client.projects.add(message.projectId);
                if (!projectSubscriptions.has(message.projectId)) {
                    projectSubscriptions.set(message.projectId, new Set());
                }
                projectSubscriptions.get(message.projectId).add(clientId);
            }
            break;

        case 'heartbeat':
            client.ws.send(JSON.stringify({ type: 'heartbeat_ack' }));
            break;
    }
}

function broadcastToProject(projectId, message, excludeClientId = null) {
    const subscribers = projectSubscriptions.get(projectId);
    if (!subscribers) return;

    subscribers.forEach(clientId => {
        if (clientId !== excludeClientId) {
            const client = activeClients.get(clientId);
            if (client?.ws.readyState === WebSocket.OPEN) {
                client.ws.send(JSON.stringify(message));
            }
        }
    });
}

// ===== API ROUTES =====

// Health check
app.get('/api/health', async (req, res) => {
    try {
        const dbConnected = await database.checkConnection();
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            database: dbConnected ? 'connected' : 'disconnected',
            websocket: { clients: activeClients.size, subscriptions: projectSubscriptions.size }
        });
    } catch (error) {
        res.status(500).json({ status: 'unhealthy', error: error.message });
    }
});

// Platform status
app.get('/api/platform/status', async (req, res) => {
    try {
        const stats = await database.getPlatformStats();
        res.json(stats);
    } catch (error) {
        console.error('Platform status error:', error);
        res.status(500).json({ 
            error: 'Failed to get platform status',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Get all projects
app.get('/api/projects', async (req, res) => {
    try {
        const projects = await database.getAllProjects();
        res.json(projects);
    } catch (error) {
        console.error('Projects fetch error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch projects',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Get single project
app.get('/api/projects/:id', async (req, res) => {
    try {
        const projectId = req.params.id;
        const project = await database.getProject(projectId);
        
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        res.json(project);

    } catch (error) {
        console.error('Project fetch error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch project',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Create project
app.post('/api/projects', async (req, res) => {
    try {
        const { title, description, type = 'clinical' } = req.body;
        
        console.log('Creating project:', { title, description, type });
        
        if (!title || !description) {
            return res.status(400).json({ 
                error: 'Missing required fields: title and description are required' 
            });
        }

        // Create or get user
        const userId = `user_${uuidv4()}`;
        const userEmail = `user_${userId}@thoraxlab.local`;
        
        // Ensure user exists
        await database.ensureUserExists(userId, 'Demo User', 'clinician', userEmail);

        const project = await database.createProject({ 
            title, 
            description, 
            type, 
            createdBy: userId 
        });
        
        console.log('Project created successfully:', project.id);
        
        // Add timeline event
        await database.addTimelineEvent(
            project.id,
            'project_created',
            `Project "${title}" created`,
            userId
        );

        // Broadcast to WebSocket clients
        broadcastToProject(project.id, {
            type: 'project_created',
            project,
            timestamp: new Date().toISOString()
        });

        res.status(201).json(project);

    } catch (error) {
        console.error('Project creation error:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({ 
            error: 'Failed to create project',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Get project comments
app.get('/api/projects/:id/comments', async (req, res) => {
    try {
        const projectId = req.params.id;
        const comments = await database.getProjectComments(projectId);
        res.json(comments);
    } catch (error) {
        console.error('Comments fetch error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch comments',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Create comment
app.post('/api/comments', async (req, res) => {
    try {
        const { projectId, content } = req.body;
        
        if (!projectId || !content) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Create demo user for comment
        const userId = `comment_user_${uuidv4()}`;
        await database.ensureUserExists(userId, 'Comment User', 'clinician', `${userId}@thoraxlab.local`);

        const comment = await database.createComment({ 
            projectId, 
            userId, 
            content 
        });
        
        // Update comment count
        await database.incrementProjectCounter(projectId, 'total_comments');
        
        // Add timeline event
        await database.addTimelineEvent(
            projectId,
            'comment_added',
            'New comment added',
            userId
        );

        // Broadcast to WebSocket clients
        broadcastToProject(projectId, {
            type: 'comment_added',
            comment,
            timestamp: new Date().toISOString()
        });

        res.status(201).json(comment);

    } catch (error) {
        console.error('Comment creation error:', error);
        res.status(500).json({ 
            error: 'Failed to create comment',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Get project team
app.get('/api/projects/:id/team', async (req, res) => {
    try {
        const projectId = req.params.id;
        const team = await database.getProjectTeam(projectId);
        res.json(team);
    } catch (error) {
        console.error('Team fetch error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch team',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Get project timeline
app.get('/api/projects/:id/timeline', async (req, res) => {
    try {
        const projectId = req.params.id;
        const timeline = await database.getProjectTimeline(projectId);
        res.json(timeline);
    } catch (error) {
        console.error('Timeline fetch error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch timeline',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// User login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email = 'demo@thoraxlab.com', name = 'Demo User', role = 'clinician' } = req.body;
        
        // Create or get user
        const userId = `user_${uuidv4()}`;
        await database.ensureUserExists(userId, name, role, email);
        
        const user = await database.getUser(userId);
        
        res.json({
            user: {
                id: user.id,
                name: user.name,
                role: user.role,
                avatar_color: user.avatar_color
            },
            token: `demo_${user.id}`,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            error: 'Failed to authenticate',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Test endpoint
app.get('/api/test-db', async (req, res) => {
    try {
        const db = await database.getDB();
        const result = await db.get('SELECT 1 as test');
        res.json({ 
            success: true, 
            message: 'Database connection successful',
            result 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message,
            stack: error.stack 
        });
    }
});

// Single page app routing
app.get('/project', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'project.html'));
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== START SERVER =====
async function startServer() {
    try {
        // Connect to database
        await database.connect();
        
        console.log('✅ Database connected successfully');
        
        // Start HTTP server
        server.listen(PORT, () => {
            console.log(`
🚀 THORAXLAB PLATFORM v2.0
📍 Port: ${PORT}
🌐 WebSocket: Active
💾 Database: Connected
🔗 URL: http://localhost:${PORT}
📁 Data directory: ${path.join(__dirname, 'data')}
            `);
        });

        // Broadcast platform stats every 30 seconds
        setInterval(async () => {
            try {
                const stats = await database.getPlatformStats();
                const message = { 
                    type: 'platform_stats', 
                    ...stats,
                    timestamp: new Date().toISOString()
                };
                
                activeClients.forEach(client => {
                    if (client.ws.readyState === WebSocket.OPEN) {
                        client.ws.send(JSON.stringify(message));
                    }
                });
            } catch (error) {
                console.error('Platform stats broadcast error:', error);
            }
        }, 30000);

        // Initial broadcast
        setTimeout(async () => {
            try {
                const stats = await database.getPlatformStats();
                console.log('📊 Initial platform stats:', stats);
            } catch (error) {
                console.error('Initial stats error:', error);
            }
        }, 2000);

    } catch (error) {
        console.error('❌ Failed to start server:', error);
        console.error('Error stack:', error.stack);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Shutting down gracefully...');
    await database.close();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('Shutting down gracefully...');
    await database.close();
    process.exit(0);
});

startServer();
