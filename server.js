const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
const cors = require('cors');

// Import the fixed database
const { database } = require('./database.js');

const PORT = process.env.PORT || 3000;
const app = express();
const server = require('http').createServer(app);

// ===== WEB SOCKET SERVER =====
const wss = new WebSocket.Server({ server });
const clients = new Map();

wss.on('connection', (ws, req) => {
    const clientId = uuidv4();
    clients.set(clientId, {
        ws,
        userId: null,
        projectSubscriptions: new Set()
    });
    
    console.log(`🔗 WebSocket connected: ${clientId}`);
    
    ws.send(JSON.stringify({
        type: 'connected',
        clientId,
        timestamp: new Date().toISOString()
    }));
    
    // Send platform stats
    database.getPlatformStats().then(stats => {
        ws.send(JSON.stringify({
            type: 'platform_stats',
            stats,
            timestamp: new Date().toISOString()
        }));
    });
    
    ws.on('message', async (data) => {
        try {
            const message = JSON.parse(data.toString());
            
            switch (message.type) {
                case 'authenticate':
                    const user = await database.getUser(message.userId);
                    if (user) {
                        const client = clients.get(clientId);
                        client.userId = message.userId;
                        
                        await database.updateUserActivity(message.userId);
                        
                        ws.send(JSON.stringify({
                            type: 'authenticated',
                            user: {
                                id: user.id,
                                name: user.name,
                                role: user.role,
                                organization: user.organization
                            },
                            timestamp: new Date().toISOString()
                        }));
                    }
                    break;
                    
                case 'join_project':
                    const client = clients.get(clientId);
                    if (client) {
                        client.projectSubscriptions.add(message.projectId);
                        
                        ws.send(JSON.stringify({
                            type: 'project_joined',
                            projectId: message.projectId,
                            timestamp: new Date().toISOString()
                        }));
                    }
                    break;
                    
                case 'leave_project':
                    const clientLeave = clients.get(clientId);
                    if (clientLeave) {
                        clientLeave.projectSubscriptions.delete(message.projectId);
                    }
                    break;
                    
                case 'heartbeat':
                    ws.send(JSON.stringify({
                        type: 'heartbeat_ack',
                        timestamp: Date.now()
                    }));
                    break;
            }
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    });
    
    ws.on('close', () => {
        clients.delete(clientId);
        console.log(`🔌 WebSocket disconnected: ${clientId}`);
    });
    
    ws.on('error', (error) => {
        console.error(`WebSocket error for ${clientId}:`, error);
    });
});

// Helper functions
function broadcastToProject(projectId, message) {
    const data = JSON.stringify(message);
    
    for (const [clientId, client] of clients.entries()) {
        if (client.ws.readyState === WebSocket.OPEN && 
            client.projectSubscriptions.has(projectId)) {
            client.ws.send(data);
        }
    }
}

// ===== MIDDLEWARE =====
app.use(cors({
    origin: true,
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(express.static(path.join(__dirname, 'public')));

// ===== API ROUTES =====

// Health check
app.get('/api/health', async (req, res) => {
    try {
        const dbConnected = await database.checkConnection();
        const stats = await database.getPlatformStats();
        
        res.json({
            status: 'healthy',
            service: 'ThoraxLab Platform',
            version: '3.0.0',
            timestamp: new Date().toISOString(),
            database: dbConnected ? 'connected' : 'disconnected',
            stats,
            websocket: {
                active_clients: clients.size
            }
        });
    } catch (error) {
        res.status(500).json({
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Login/Register
app.post('/api/login', async (req, res) => {
    try {
        const { name, email, institution } = req.body;
        
        if (!name || !email) {
            return res.status(400).json({
                success: false,
                error: 'Name and email are required'
            });
        }
        
        let user = await database.findUserByEmail(email);
        if (!user) {
            user = await database.createUser({
                name,
                email,
                organization: institution || 'Medical Center',
                role: email.includes('admin') ? 'admin' : 'clinician'
            });
        }
        
        await database.updateUserActivity(user.id);
        
        res.json({
            success: true,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                organization: user.organization,
                role: user.role,
                specialty: user.specialty || 'pulmonology',
                avatar_color: user.avatar_color || '#1A5F7A',
                is_admin: user.is_admin === 1
            }
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            error: 'Login failed',
            details: error.message
        });
    }
});

// Get current user
app.get('/api/me', async (req, res) => {
    try {
        const users = await database.getAllUsers();
        const user = users[0];
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        
        await database.updateUserActivity(user.id);
        
        res.json({
            success: true,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                organization: user.organization,
                role: user.role,
                specialty: user.specialty || 'pulmonology',
                avatar_color: user.avatar_color || '#1A5F7A',
                is_admin: user.is_admin === 1
            }
        });
        
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get user'
        });
    }
});

// Get all projects
app.get('/api/projects', async (req, res) => {
    try {
        const projects = await database.getAllProjects();
        
        res.json({
            success: true,
            projects: projects.map(p => ({
                id: p.id,
                title: p.title,
                description: p.description,
                status: p.status,
                type: p.type,
                lead: {
                    id: p.lead_id,
                    name: p.lead_name
                },
                team_count: p.team_count || 0,
                discussion_count: p.discussion_count || 0,
                metrics: {
                    consensus: p.consensus_score || 0,
                    engagement: p.engagement_score || 0
                },
                created_at: p.created_at,
                updated_at: p.updated_at
            })),
            count: projects.length
        });
        
    } catch (error) {
        console.error('Get projects error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load projects'
        });
    }
});

// Create project
app.post('/api/projects', async (req, res) => {
    try {
        const { title, description, type } = req.body;
        
        if (!title || !description) {
            return res.status(400).json({
                success: false,
                error: 'Title and description are required'
            });
        }
        
        const users = await database.getAllUsers();
        const user = users[0];
        
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'User not found'
            });
        }
        
        const project = await database.createProject({
            title,
            description,
            type: type || 'clinical',
            status: 'planning'
        }, user.id);
        
        broadcastToProject(project.id, {
            type: 'project_created',
            project: {
                id: project.id,
                title: project.title,
                description: project.description,
                type: project.type,
                lead: {
                    name: user.name,
                    organization: user.organization
                }
            },
            timestamp: new Date().toISOString()
        });
        
        res.status(201).json({
            success: true,
            project
        });
        
    } catch (error) {
        console.error('Create project error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create project',
            details: error.message
        });
    }
});

// Get single project
app.get('/api/projects/:id', async (req, res) => {
    try {
        const project = await database.getProject(req.params.id);
        
        if (!project) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }
        
        res.json({
            success: true,
            project
        });
        
    } catch (error) {
        console.error('Get project error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load project'
        });
    }
});

// Get project team
app.get('/api/projects/:id/team', async (req, res) => {
    try {
        const team = await database.getProjectTeam(req.params.id);
        
        res.json({
            success: true,
            team,
            count: team.length
        });
        
    } catch (error) {
        console.error('Get project team error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load team'
        });
    }
});

// Add team member
app.post('/api/projects/:id/team', async (req, res) => {
    try {
        const { name, email, role, organization } = req.body;
        
        if (!name || !email) {
            return res.status(400).json({
                success: false,
                error: 'Name and email are required'
            });
        }
        
        let user = await database.findUserByEmail(email);
        if (!user) {
            user = await database.createUser({
                name,
                email,
                organization: organization || 'Medical Center',
                role: role || 'contributor'
            });
        }
        
        const member = await database.addTeamMember(
            req.params.id, 
            user.id, 
            role || 'contributor',
            organization || user.organization
        );
        
        broadcastToProject(req.params.id, {
            type: 'team_member_added',
            projectId: req.params.id,
            member: {
                id: user.id,
                name: user.name,
                role: role || 'contributor',
                organization: organization || user.organization
            },
            timestamp: new Date().toISOString()
        });
        
        res.status(201).json({
            success: true,
            member
        });
        
    } catch (error) {
        console.error('Add team member error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to add team member',
            details: error.message
        });
    }
});

// Get project discussions
app.get('/api/projects/:id/discussions', async (req, res) => {
    try {
        const discussions = await database.getProjectDiscussions(req.params.id);
        
        res.json({
            success: true,
            discussions,
            count: discussions.length
        });
        
    } catch (error) {
        console.error('Get discussions error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load discussions'
        });
    }
});

// Create discussion
app.post('/api/projects/:id/discussions', async (req, res) => {
    try {
        const { title, content, type, tags } = req.body;
        
        if (!title || !content) {
            return res.status(400).json({
                success: false,
                error: 'Title and content are required'
            });
        }
        
        const users = await database.getAllUsers();
        const user = users[0];
        
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'User not found'
            });
        }
        
        const discussion = await database.createDiscussion({
            projectId: req.params.id,
            title,
            content,
            type: type || 'clinical',
            tags: tags || [],
            author: {
                id: user.id,
                name: user.name,
                role: user.role,
                organization: user.organization
            }
        });
        
        broadcastToProject(req.params.id, {
            type: 'discussion_created',
            discussion,
            timestamp: new Date().toISOString()
        });
        
        res.status(201).json({
            success: true,
            discussion
        });
        
    } catch (error) {
        console.error('Create discussion error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create discussion',
            details: error.message
        });
    }
});

// Get discussion comments
app.get('/api/discussions/:id/comments', async (req, res) => {
    try {
        const comments = await database.getDiscussionComments(req.params.id);
        
        res.json({
            success: true,
            comments,
            count: comments.length
        });
        
    } catch (error) {
        console.error('Get comments error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load comments'
        });
    }
});

// Create comment
app.post('/api/comments', async (req, res) => {
    try {
        const { discussionId, projectId, content, commentType, evidenceLinks } = req.body;
        
        if (!discussionId || !content) {
            return res.status(400).json({
                success: false,
                error: 'Discussion ID and content are required'
            });
        }
        
        const users = await database.getAllUsers();
        const user = users[0];
        
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'User not found'
            });
        }
        
        const comment = await database.createComment({
            discussionId,
            projectId,
            content,
            commentType: commentType || 'general',
            evidenceLinks: evidenceLinks || [],
            author: {
                id: user.id,
                name: user.name,
                role: user.role,
                organization: user.organization
            }
        });
        
        broadcastToProject(projectId, {
            type: 'comment_created',
            comment,
            timestamp: new Date().toISOString()
        });
        
        res.status(201).json({
            success: true,
            comment
        });
        
    } catch (error) {
        console.error('Create comment error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create comment',
            details: error.message
        });
    }
});

// Get platform analytics
app.get('/api/analytics', async (req, res) => {
    try {
        const stats = await database.getPlatformStats();
        
        res.json({
            success: true,
            analytics: {
                platform: stats,
                updated_at: new Date().toISOString()
            }
        });
        
    } catch (error) {
        console.error('Get analytics error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load analytics'
        });
    }
});

// Get dashboard data
app.get('/api/dashboard', async (req, res) => {
    try {
        const users = await database.getAllUsers();
        const user = users[0];
        
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'User not found'
            });
        }
        
        // Simplified dashboard data
        const projects = await database.getProjectsForUser(user.id);
        const stats = await database.getPlatformStats();
        
        res.json({
            success: true,
            dashboard: {
                user: {
                    id: user.id,
                    name: user.name,
                    organization: user.organization,
                    role: user.role,
                    projectCount: projects.length,
                    impactScore: user.impact_score || 100
                },
                metrics: {
                    clinicalActivity: Math.floor(Math.random() * 50),
                    industryActivity: Math.floor(Math.random() * 30),
                    crossPollination: Math.floor(Math.random() * 40),
                    totalVotes: Math.floor(Math.random() * 100),
                    pendingDecisions: Math.floor(Math.random() * 5),
                    decisionVelocity: 3.2
                },
                activeProjects: projects.slice(0, 5).map(p => ({
                    id: p.id,
                    title: p.title,
                    type: p.type,
                    progress: p.progress || 0
                })),
                platformStats: stats
            }
        });
        
    } catch (error) {
        console.error('Get dashboard error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load dashboard'
        });
    }
});

// Get recent activity
app.get('/api/activity', async (req, res) => {
    try {
        const users = await database.getAllUsers();
        const user = users[0];
        
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'User not found'
            });
        }
        
        const activity = await database.getRecentActivity(user.id);
        
        res.json({
            success: true,
            activity,
            count: activity.length
        });
        
    } catch (error) {
        console.error('Get activity error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load activity'
        });
    }
});

// Get platform status
app.get('/api/platform/status', async (req, res) => {
    try {
        const stats = await database.getPlatformStats();
        
        res.json({
            success: true,
            ...stats
        });
        
    } catch (error) {
        console.error('Get platform status error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load platform status'
        });
    }
});

// Test endpoint
app.get('/api/test', (req, res) => {
    res.json({
        success: true,
        message: 'ThoraxLab API is working!',
        version: '3.0.0',
        timestamp: new Date().toISOString()
    });
});

// SPA routing
app.get('/project', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'project.html'));
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== START SERVER =====
async function startServer() {
    try {
        await database.connect();
        
        server.listen(PORT, '0.0.0.0', () => {
            console.log(`
🚀 THORAXLAB ADVANCED PLATFORM v3.0
📍 Port: ${PORT}
🌐 WebSocket: Ready
💾 Database: SQLite
📊 API: Complete REST + WebSocket
            `);
        });
        
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

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
