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
        const status = await database.getPlatformStatus();
        res.json(status);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get platform status' });
    }
});

// Get all projects
app.get('/api/projects', async (req, res) => {
    try {
        const { status = 'active', limit = 50, offset = 0 } = req.query;
        const projects = await database.getAllProjects(status, parseInt(limit), parseInt(offset));
        res.json(projects);
    } catch (error) {
        console.error('Projects fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch projects' });
    }
});

// Get single project
app.get('/api/projects/:id', async (req, res) => {
    try {
        const projectId = req.params.id;
        const userId = req.headers['x-user-id'] || 'anonymous';
        
        const project = await database.getProject(projectId);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        await database.recordInteraction(projectId, userId, 'project_view');
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

        if (title.length > 200) {
            return res.status(400).json({ error: 'Title too long (max 200 characters)' });
        }

        const project = await database.createProject({ title, description, type, createdBy });
        
        // Add timeline event
        await database.addTimelineEvent(
            project.id,
            'project_created',
            `Project "${title}" created`,
            createdBy
        );

        // Broadcast to WebSocket clients
        broadcastToProject(project.id, {
            type: 'project_created',
            project,
            timestamp: new Date().toISOString()
        });

        // Update platform metrics
        await database.updatePlatformMetrics();

        res.status(201).json(project);

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
        const userId = req.headers['x-user-id'];

        if (!updates || Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'No updates provided' });
        }

        const isMember = await database.isProjectMember(projectId, userId);
        if (!isMember && userId !== 'system') {
            return res.status(403).json({ error: 'Not authorized' });
        }

        const project = await database.updateProject(projectId, updates);
        
        await database.addTimelineEvent(
            projectId,
            'project_updated',
            'Project details updated',
            userId
        );

        broadcastToProject(projectId, {
            type: 'project_updated',
            project,
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
        const projectId = req.params.id;
        const { limit = 100, offset = 0, parent_id = null } = req.query;
        const userId = req.headers['x-user-id'] || '';
        
        const comments = await database.getProjectComments(
            projectId, 
            parseInt(limit), 
            parseInt(offset),
            parent_id,
            userId
        );
        res.json(comments);

    } catch (error) {
        console.error('Comments fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch comments' });
    }
});

// Create comment
app.post('/api/comments', async (req, res) => {
    try {
        const { projectId, content, userId } = req.body;
        
        if (!projectId || !content || !userId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const comment = await database.createComment({ projectId, userId, content });
        
        await database.recordInteraction(projectId, userId, 'comment_create');
        await database.incrementProjectCounter(projectId, 'total_comments');
        
        await database.addTimelineEvent(
            projectId,
            'comment_added',
            'New comment added',
            userId
        );

        broadcastToProject(projectId, {
            type: 'comment_added',
            comment,
            timestamp: new Date().toISOString()
        });

        res.status(201).json(comment);

    } catch (error) {
        console.error('Comment creation error:', error);
        res.status(500).json({ error: 'Failed to create comment' });
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

        const result = await database.addProjectMember(projectId, userId, role);
        
        await database.addTimelineEvent(
            projectId,
            'member_joined',
            'New member joined',
            userId
        );

        const team = await database.getProjectTeam(projectId);
        
        broadcastToProject(projectId, {
            type: 'team_updated',
            team,
            timestamp: new Date().toISOString()
        });

        res.json({ success: true, team });

    } catch (error) {
        console.error('Join project error:', error);
        res.status(500).json({ error: 'Failed to join project' });
    }
});

// Get project timeline
app.get('/api/projects/:id/timeline', async (req, res) => {
    try {
        const projectId = req.params.id;
        const { limit = 50, offset = 0 } = req.query;
        
        const timeline = await database.getProjectTimeline(
            projectId, 
            parseInt(limit), 
            parseInt(offset)
        );
        res.json(timeline);
    } catch (error) {
        console.error('Timeline fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch timeline' });
    }
});

// Get online users
app.get('/api/users/online', async (req, res) => {
    try {
        const users = await database.getOnlineUsers();
        res.json(users);
    } catch (error) {
        console.error('Online users fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch online users' });
    }
});

// User login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, name, role = 'clinician' } = req.body;
        
        if (!email || !name) {
            return res.status(400).json({ error: 'Email and name required' });
        }

        let user = await database.getUserByEmail(email);
        
        if (!user) {
            user = await database.createUser(email, name, role);
        }

        await database.updateUserStatus(user.id, 'online');
        
        const userResponse = { ...user };
        delete userResponse.password;

        res.json({
            user: userResponse,
            token: `demo_${user.id}`,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Failed to authenticate' });
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
        
        // Start HTTP server
        server.listen(PORT, () => {
            console.log(`
🚀 THORAXLAB PLATFORM v2.0
📍 Port: ${PORT}
🌐 WebSocket: Active
💾 Database: Connected
🔗 URL: http://localhost:${PORT}
            `);
        });

        // Broadcast platform stats every 30 seconds
        setInterval(async () => {
            try {
                const status = await database.getPlatformStatus();
                const message = { type: 'platform_stats', ...status };
                
                activeClients.forEach(client => {
                    if (client.ws.readyState === WebSocket.OPEN) {
                        client.ws.send(JSON.stringify(message));
                    }
                });
            } catch (error) {
                console.error('Platform stats broadcast error:', error);
            }
        }, 30000);

        // Maintenance every hour
        setInterval(async () => {
            try {
                await database.performMaintenance();
            } catch (error) {
                console.error('Maintenance error:', error);
            }
        }, 3600000);

    } catch (error) {
        console.error('Failed to start server:', error);
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
