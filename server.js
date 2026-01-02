const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
const cors = require('cors');
const { database } = require('./database.js');

const PORT = process.env.PORT || 3000;
const app = express();
const server = require('http').createServer(app);

// ===== WebSocket Server =====
const wss = new WebSocket.Server({ server });
const clients = new Map();

wss.on('connection', (ws) => {
    const clientId = `client_${uuidv4()}`;
    clients.set(clientId, { ws, userId: null });

    ws.on('message', async (data) => {
        try {
            const message = JSON.parse(data.toString());
            
            if (message.type === 'authenticate' && message.token) {
                const session = await database.getSessionByToken(message.token);
                if (session) {
                    const client = clients.get(clientId);
                    client.userId = session.user_id;
                    ws.send(JSON.stringify({ type: 'authenticated', userId: session.user_id }));
                }
            }
        } catch (error) {
            console.error('WebSocket error:', error.message);
        }
    });

    ws.on('close', () => {
        clients.delete(clientId);
    });
});

function broadcastToUser(userId, message) {
    clients.forEach((client) => {
        if (client.userId === userId && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify(message));
        }
    });
}

// ===== Express Setup =====
// Disable CSP for inline scripts - Railway requirement
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ===== Authentication Middleware =====
async function authenticateToken(req, res, next) {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ error: 'Token required' });
        }
        
        const session = await database.getSessionByToken(token);
        if (!session) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        
        const user = await database.getUser(session.user_id);
        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }
        
        req.user = user;
        req.session = session;
        next();
    } catch (error) {
        res.status(500).json({ error: 'Authentication failed' });
    }
}

// ===== API Routes =====

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        service: 'ThoraxLab', 
        timestamp: new Date().toISOString() 
    });
});

// Login/Register
app.post('/api/login', async (req, res) => {
    try {
        const { name, email, organization, role } = req.body;
        
        if (!name || !email) {
            return res.status(400).json({ error: 'Name and email required' });
        }
        
        // Find or create user
        let user = await database.findUserByEmail(email);
        if (!user) {
            user = await database.createUser({
                name,
                email,
                organization: organization || '',
                role: role || 'clinician'
            });
        }
        
        // Create session
        const token = `tok_${uuidv4()}`;
        const session = await database.createSession(user.id, token);
        
        res.json({
            success: true,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                organization: user.organization,
                role: user.role,
                avatar_initials: user.avatar_initials
            },
            token
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Logout
app.post('/api/logout', authenticateToken, async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (token) {
            await database.deleteSession(token);
        }
        res.json({ success: true });
    } catch (error) {
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
            projects: projects.slice(0, 10)
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get user data' });
    }
});

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
        res.status(500).json({ error: 'Failed to load dashboard' });
    }
});

// ===== Project Routes =====

// List projects
app.get('/api/projects', authenticateToken, async (req, res) => {
    try {
        const projects = await database.getProjectsForUser(req.user.id);
        res.json({ success: true, projects });
    } catch (error) {
        res.status(500).json({ error: 'Failed to load projects' });
    }
});

// Create project
app.post('/api/projects', authenticateToken, async (req, res) => {
    try {
        const { title, description, type, objectives } = req.body;
        
        if (!title || !description) {
            return res.status(400).json({ error: 'Title and description required' });
        }
        
        const project = await database.createProject({
            title,
            description,
            type: type || 'clinical',
            objectives
        }, req.user.id);
        
        // Notify user via WebSocket
        broadcastToUser(req.user.id, {
            type: 'project_created',
            project,
            timestamp: new Date().toISOString()
        });
        
        res.status(201).json({ success: true, project });
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
            return res.status(403).json({ error: 'No access to project' });
        }
        
        const project = await database.getProject(projectId);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        
        const team = await database.getProjectTeam(projectId);
        const discussions = await database.getProjectDiscussions(projectId);
        const decisions = await database.getProjectDecisions(projectId);
        
        res.json({
            success: true,
            project,
            team,
            discussions,
            decisions
        });
    } catch (error) {
        console.error('Get project error:', error);
        res.status(500).json({ error: 'Failed to load project' });
    }
});

// ===== Discussion Routes =====

// Create discussion
app.post('/api/projects/:id/discussions', authenticateToken, async (req, res) => {
    try {
        const projectId = req.params.id;
        const { title, content, type } = req.body;
        
        if (!title || !content || !type) {
            return res.status(400).json({ error: 'Title, content and type required' });
        }
        
        // Check access
        const hasAccess = await database.isUserInProject(projectId, req.user.id);
        if (!hasAccess) {
            return res.status(403).json({ error: 'No access to project' });
        }
        
        const discussion = await database.createDiscussion({
            projectId,
            title,
            content,
            type,
            authorId: req.user.id
        });
        
        // Notify team via WebSocket
        const team = await database.getProjectTeam(projectId);
        team.forEach(member => {
            broadcastToUser(member.user_id, {
                type: 'discussion_created',
                discussion,
                timestamp: new Date().toISOString()
            });
        });
        
        res.status(201).json({ success: true, discussion });
    } catch (error) {
        console.error('Create discussion error:', error);
        res.status(500).json({ error: 'Failed to create discussion' });
    }
});

// Vote on discussion
app.post('/api/discussions/:id/vote', authenticateToken, async (req, res) => {
    try {
        const discussionId = req.params.id;
        const { voteType } = req.body;
        
        if (!voteType) {
            return res.status(400).json({ error: 'Vote type required' });
        }
        
        const discussion = await database.getDiscussion(discussionId);
        if (!discussion) {
            return res.status(404).json({ error: 'Discussion not found' });
        }
        
        // Check access to project
        const hasAccess = await database.isUserInProject(discussion.project_id, req.user.id);
        if (!hasAccess) {
            return res.status(403).json({ error: 'No access to discussion' });
        }
        
        const vote = await database.addDiscussionVote(discussionId, req.user.id, voteType);
        
        // Notify via WebSocket
        const team = await database.getProjectTeam(discussion.project_id);
        team.forEach(member => {
            broadcastToUser(member.user_id, {
                type: 'vote_added',
                discussionId,
                vote,
                timestamp: new Date().toISOString()
            });
        });
        
        res.json({ success: true, vote });
    } catch (error) {
        console.error('Vote error:', error);
        res.status(500).json({ error: 'Failed to vote' });
    }
});

// ===== Comment Routes =====

// Add comment
app.post('/api/comments', authenticateToken, async (req, res) => {
    try {
        const { discussionId, content } = req.body;
        
        if (!discussionId || !content) {
            return res.status(400).json({ error: 'Discussion ID and content required' });
        }
        
        const discussion = await database.getDiscussion(discussionId);
        if (!discussion) {
            return res.status(404).json({ error: 'Discussion not found' });
        }
        
        // Check access
        const hasAccess = await database.isUserInProject(discussion.project_id, req.user.id);
        if (!hasAccess) {
            return res.status(403).json({ error: 'No access to discussion' });
        }
        
        const comment = await database.createComment({
            discussionId,
            content,
            authorId: req.user.id
        });
        
        // Notify via WebSocket
        const team = await database.getProjectTeam(discussion.project_id);
        team.forEach(member => {
            broadcastToUser(member.user_id, {
                type: 'comment_added',
                comment,
                timestamp: new Date().toISOString()
            });
        });
        
        res.status(201).json({ success: true, comment });
    } catch (error) {
        console.error('Create comment error:', error);
        res.status(500).json({ error: 'Failed to create comment' });
    }
});

// ===== Decision Routes =====

// Create decision
app.post('/api/decisions', authenticateToken, async (req, res) => {
    try {
        const { discussionId, title, description } = req.body;
        
        if (!discussionId || !title || !description) {
            return res.status(400).json({ error: 'Discussion ID, title and description required' });
        }
        
        const discussion = await database.getDiscussion(discussionId);
        if (!discussion) {
            return res.status(404).json({ error: 'Discussion not found' });
        }
        
        // Check access
        const hasAccess = await database.isUserInProject(discussion.project_id, req.user.id);
        if (!hasAccess) {
            return res.status(403).json({ error: 'No access to discussion' });
        }
        
        const decision = await database.createDecision({
            discussionId,
            title,
            description,
            createdBy: req.user.id
        });
        
        // Notify team
        const team = await database.getProjectTeam(discussion.project_id);
        team.forEach(member => {
            broadcastToUser(member.user_id, {
                type: 'decision_created',
                decision,
                timestamp: new Date().toISOString()
            });
        });
        
        res.status(201).json({ success: true, decision });
    } catch (error) {
        console.error('Create decision error:', error);
        res.status(500).json({ error: 'Failed to create decision' });
    }
});

// ===== SPA Routes =====
app.get('/project', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'project.html'));
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== Start Server =====
async function startServer() {
    try {
        await database.connect();
        
        server.listen(PORT, () => {
            console.log(`
🚀 ThoraxLab Platform
📍 Port: ${PORT}
✅ Database: Connected
🔌 WebSocket: Ready
📡 API: All endpoints available
            `);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
    await database.close();
    process.exit(0);
});

process.on('SIGINT', async () => {
    await database.close();
    process.exit(0);
});

startServer();
