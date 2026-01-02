const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { database } = require('./database.js');

const PORT = process.env.PORT || 3000;
const app = express();
const server = require('http').createServer(app);

// WebSocket server
const wss = new WebSocket.Server({ server });
const clients = new Map();

// Security middleware
app.use(helmet());
app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? false : true,
    credentials: true
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: { success: false, error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// WebSocket handling
wss.on('connection', (ws, req) => {
    const clientId = `client_${uuidv4()}`;
    clients.set(clientId, { ws, userId: null, projectSubscriptions: new Set() });

    ws.on('message', async (data) => {
        try {
            const message = JSON.parse(data.toString());
            
            switch (message.type) {
                case 'authenticate':
                    const session = await database.getSessionByToken(message.token);
                    if (session) {
                        const client = clients.get(clientId);
                        client.userId = session.user_id;
                        
                        const projects = await database.getProjectsForUser(session.user_id);
                        projects.forEach(project => {
                            client.projectSubscriptions.add(project.id);
                        });
                        
                        ws.send(JSON.stringify({
                            type: 'authenticated',
                            userId: session.user_id
                        }));
                    }
                    break;
                    
                case 'join_project':
                    const joinClient = clients.get(clientId);
                    if (joinClient && joinClient.userId) {
                        joinClient.projectSubscriptions.add(message.projectId);
                    }
                    break;
                    
                case 'leave_project':
                    const leaveClient = clients.get(clientId);
                    if (leaveClient) {
                        leaveClient.projectSubscriptions.delete(message.projectId);
                    }
                    break;
                    
                case 'presence':
                    const presenceClient = clients.get(clientId);
                    if (presenceClient && presenceClient.userId) {
                        // Broadcast presence to all subscribed projects
                        presenceClient.projectSubscriptions.forEach(projectId => {
                            broadcastToProject(projectId, {
                                type: 'presence_updated',
                                userId: presenceClient.userId,
                                status: message.status,
                                timestamp: new Date().toISOString()
                            });
                        });
                    }
                    break;
            }
        } catch (error) {
            console.error('WebSocket error:', error);
        }
    });

    ws.on('close', () => {
        clients.delete(clientId);
    });
});

function broadcastToProject(projectId, message) {
    const data = JSON.stringify(message);
    clients.forEach((client) => {
        if (client.ws.readyState === WebSocket.OPEN && 
            client.projectSubscriptions.has(projectId)) {
            client.ws.send(data);
        }
    });
}

// Authentication middleware
async function authenticateToken(req, res, next) {
    try {
        const token = req.headers['authorization']?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ 
                success: false, 
                error: 'Authentication token required' 
            });
        }
        
        const session = await database.getSessionByToken(token);
        if (!session) {
            return res.status(401).json({ 
                success: false, 
                error: 'Invalid or expired session' 
            });
        }
        
        const user = await database.getUser(session.user_id);
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                error: 'User not found' 
            });
        }
        
        req.user = user;
        req.session = session;
        await database.updateUserActivity(user.id);
        next();
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Authentication failed' 
        });
    }
}

// Role validation middleware
function requireRole(allowedRoles) {
    return (req, res, next) => {
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ 
                success: false, 
                error: `Role ${req.user.role} not allowed for this action` 
            });
        }
        next();
    };
}

// ===== API ROUTES =====

// Health check
app.get('/api/health', async (req, res) => {
    try {
        const dbConnected = await database.checkConnection();
        res.json({
            success: true,
            status: 'healthy',
            service: 'ThoraxLab Platform',
            version: '4.0.0',
            timestamp: new Date().toISOString(),
            database: dbConnected ? 'connected' : 'disconnected',
            websocket_clients: wss.clients.size
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            status: 'unhealthy', 
            error: error.message 
        });
    }
});

// Login/Register
app.post('/api/login', async (req, res) => {
    try {
        const { name, email, organization, role } = req.body;
        
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
                organization: organization || 'Not specified',
                role: role || 'clinician'
            });
        }
        
        const token = `tok_${uuidv4()}`;
        const session = await database.createSession(user.id, token, 24);
        
        res.json({
            success: true,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                organization: user.organization,
                role: user.role,
                avatar_color: user.avatar_color,
                avatar_initials: user.avatar_initials
            },
            token,
            expires_at: session.expires_at
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Login failed' 
        });
    }
});

// Logout
app.post('/api/logout', authenticateToken, async (req, res) => {
    try {
        const token = req.headers['authorization']?.split(' ')[1];
        if (token) {
            await database.deleteSession(token);
        }
        res.json({ 
            success: true, 
            message: 'Logged out successfully' 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Logout failed' 
        });
    }
});

// Get current user
app.get('/api/me', authenticateToken, async (req, res) => {
    try {
        const projects = await database.getProjectsForUser(req.user.id);
        const notifications = await database.getUserNotifications(req.user.id, true);
        
        res.json({ 
            success: true, 
            user: req.user,
            projects: projects.slice(0, 10),
            unread_notifications: notifications.length
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get user data' 
        });
    }
});

// Update user profile
app.put('/api/me', authenticateToken, async (req, res) => {
    try {
        const { name, organization, specialty, avatar_color } = req.body;
        
        const user = await database.updateUser(req.user.id, {
            name,
            organization,
            specialty,
            avatar_color
        });
        
        res.json({ 
            success: true, 
            user 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Failed to update profile' 
        });
    }
});

// Search users
app.get('/api/users/search', authenticateToken, async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.length < 2) {
            return res.json({ success: true, users: [] });
        }
        
        const users = await database.searchUsers(q, req.user.id);
        res.json({ 
            success: true, 
            users 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Failed to search users' 
        });
    }
});

// ===== DASHBOARD =====

// Get dashboard data
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
        res.status(500).json({ 
            success: false, 
            error: 'Failed to load dashboard' 
        });
    }
});

// Get recent activity
app.get('/api/activity', authenticateToken, async (req, res) => {
    try {
        const { limit } = req.query;
        const activity = await database.getRecentActivity(req.user.id, parseInt(limit) || 20);
        res.json({ 
            success: true, 
            activity 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Failed to load activity' 
        });
    }
});

// ===== NOTIFICATIONS =====

// Get notifications
app.get('/api/notifications', authenticateToken, async (req, res) => {
    try {
        const { unread } = req.query;
        const notifications = await database.getUserNotifications(req.user.id, unread === 'true');
        res.json({ 
            success: true, 
            notifications 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Failed to load notifications' 
        });
    }
});

// Mark notification as read
app.post('/api/notifications/:id/read', authenticateToken, async (req, res) => {
    try {
        await database.markNotificationRead(req.params.id);
        res.json({ 
            success: true, 
            message: 'Notification marked as read' 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Failed to mark notification' 
        });
    }
});

// Mark all notifications as read
app.post('/api/notifications/read-all', authenticateToken, async (req, res) => {
    try {
        await database.markAllNotificationsRead(req.user.id);
        res.json({ 
            success: true, 
            message: 'All notifications marked as read' 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Failed to mark notifications' 
        });
    }
});

// ===== PROJECTS =====

// Get all projects
app.get('/api/projects', authenticateToken, async (req, res) => {
    try {
        const projects = await database.getProjectsForUser(req.user.id);
        res.json({ 
            success: true, 
            projects 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Failed to load projects' 
        });
    }
});

// Search projects
app.get('/api/projects/search', authenticateToken, async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.length < 2) {
            const projects = await database.getProjectsForUser(req.user.id);
            return res.json({ success: true, projects });
        }
        
        const projects = await database.searchProjects(req.user.id, q);
        res.json({ 
            success: true, 
            projects 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Failed to search projects' 
        });
    }
});

// Create project
app.post('/api/projects', authenticateToken, async (req, res) => {
    try {
        const { title, description, type, objectives, methodology } = req.body;
        
        if (!title || !description) {
            return res.status(400).json({ 
                success: false, 
                error: 'Title and description are required' 
            });
        }
        
        const project = await database.createProject({
            title,
            description,
            type: type || 'clinical',
            objectives,
            methodology
        }, req.user.id);
        
        // Broadcast via WebSocket
        broadcastToProject(project.id, {
            type: 'project_created',
            project,
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
            error: 'Failed to create project' 
        });
    }
});

// Get single project
app.get('/api/projects/:id', authenticateToken, async (req, res) => {
    try {
        const project = await database.getProject(req.params.id);
        if (!project) {
            return res.status(404).json({ 
                success: false, 
                error: 'Project not found' 
            });
        }
        
        const team = await database.getProjectTeam(req.params.id);
        const discussions = await database.getProjectDiscussions(req.params.id);
        const decisions = await database.getProjectDecisions(req.params.id);
        
        const isTeamMember = await database.isUserInProject(req.params.id, req.user.id);
        if (!isTeamMember) {
            return res.status(403).json({ 
                success: false, 
                error: 'Access denied: Not a team member' 
            });
        }
        
        res.json({
            success: true,
            project,
            team,
            discussions,
            decisions,
            user_role: team.find(m => m.user_id === req.user.id)?.role || 'viewer'
        });
    } catch (error) {
        console.error('Get project error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to load project' 
        });
    }
});

// Update project
app.put('/api/projects/:id', authenticateToken, async (req, res) => {
    try {
        const { title, description, type, status, methodology, cover_color } = req.body;
        
        const isTeamMember = await database.isUserInProject(req.params.id, req.user.id);
        if (!isTeamMember) {
            return res.status(403).json({ 
                success: false, 
                error: 'Access denied: Not a team member' 
            });
        }
        
        const project = await database.updateProject(req.params.id, {
            title,
            description,
            type,
            status,
            methodology,
            cover_color
        });
        
        // Broadcast via WebSocket
        broadcastToProject(req.params.id, {
            type: 'project_updated',
            project,
            timestamp: new Date().toISOString()
        });
        
        res.json({ 
            success: true, 
            project 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Failed to update project' 
        });
    }
});

// Update project objectives
app.put('/api/projects/:id/objectives', authenticateToken, async (req, res) => {
    try {
        const { clinical, industry, shared } = req.body;
        
        const isTeamMember = await database.isUserInProject(req.params.id, req.user.id);
        if (!isTeamMember) {
            return res.status(403).json({ 
                success: false, 
                error: 'Access denied: Not a team member' 
            });
        }
        
        const project = await database.updateProjectObjectives(req.params.id, {
            clinical: clinical || [],
            industry: industry || [],
            shared: shared || []
        });
        
        // Broadcast via WebSocket
        broadcastToProject(req.params.id, {
            type: 'objectives_updated',
            objectives: project.objectives,
            timestamp: new Date().toISOString()
        });
        
        res.json({ 
            success: true, 
            project 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Failed to update objectives' 
        });
    }
});

// Archive project
app.delete('/api/projects/:id', authenticateToken, async (req, res) => {
    try {
        const project = await database.getProject(req.params.id);
        if (!project) {
            return res.status(404).json({ 
                success: false, 
                error: 'Project not found' 
            });
        }
        
        // Only project lead can archive
        if (project.lead_id !== req.user.id) {
            return res.status(403).json({ 
                success: false, 
                error: 'Only project lead can archive project' 
            });
        }
        
        await database.archiveProject(req.params.id);
        
        res.json({ 
            success: true, 
            message: 'Project archived successfully' 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Failed to archive project' 
        });
    }
});

// ===== PROJECT TEAM =====

// Get project team
app.get('/api/projects/:id/team', authenticateToken, async (req, res) => {
    try {
        const isTeamMember = await database.isUserInProject(req.params.id, req.user.id);
        if (!isTeamMember) {
            return res.status(403).json({ 
                success: false, 
                error: 'Access denied: Not a team member' 
            });
        }
        
        const team = await database.getProjectTeam(req.params.id);
        res.json({ 
            success: true, 
            team 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Failed to load team' 
        });
    }
});

// Add team member
app.post('/api/projects/:id/team', authenticateToken, async (req, res) => {
    try {
        const { userId, role, organization } = req.body;
        
        if (!userId || !role) {
            return res.status(400).json({ 
                success: false, 
                error: 'User ID and role are required' 
            });
        }
        
        const project = await database.getProject(req.params.id);
        if (!project) {
            return res.status(404).json({ 
                success: false, 
                error: 'Project not found' 
            });
        }
        
        // Only project lead can add team members
        if (project.lead_id !== req.user.id) {
            return res.status(403).json({ 
                success: false, 
                error: 'Only project lead can add team members' 
            });
        }
        
        const member = await database.addTeamMember(req.params.id, userId, role, organization);
        
        // Create notification for new team member
        await database.createNotification({
            userId,
            type: 'team_invite',
            title: 'Added to project team',
            message: `You've been added to the project team for "${project.title}" as ${role}`,
            metadata: { projectId: req.params.id, role }
        });
        
        // Broadcast via WebSocket
        broadcastToProject(req.params.id, {
            type: 'team_member_added',
            member: {
                ...member,
                userId
            },
            timestamp: new Date().toISOString()
        });
        
        res.status(201).json({ 
            success: true, 
            member 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Failed to add team member' 
        });
    }
});

// Remove team member
app.delete('/api/projects/:id/team/:userId', authenticateToken, async (req, res) => {
    try {
        const project = await database.getProject(req.params.id);
        if (!project) {
            return res.status(404).json({ 
                success: false, 
                error: 'Project not found' 
            });
        }
        
        // Only project lead can remove team members
        if (project.lead_id !== req.user.id) {
            return res.status(403).json({ 
                success: false, 
                error: 'Only project lead can remove team members' 
            });
        }
        
        // Cannot remove yourself
        if (req.params.userId === req.user.id) {
            return res.status(400).json({ 
                success: false, 
                error: 'Cannot remove yourself from project' 
            });
        }
        
        await database.removeTeamMember(req.params.id, req.params.userId);
        
        // Broadcast via WebSocket
        broadcastToProject(req.params.id, {
            type: 'team_member_removed',
            userId: req.params.userId,
            timestamp: new Date().toISOString()
        });
        
        res.json({ 
            success: true, 
            message: 'Team member removed successfully' 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Failed to remove team member' 
        });
    }
});

// ===== DISCUSSIONS =====

// Get project discussions
app.get('/api/projects/:id/discussions', authenticateToken, async (req, res) => {
    try {
        const { type, search, limit } = req.query;
        
        const isTeamMember = await database.isUserInProject(req.params.id, req.user.id);
        if (!isTeamMember) {
            return res.status(403).json({ 
                success: false, 
                error: 'Access denied: Not a team member' 
            });
        }
        
        const discussions = await database.getProjectDiscussions(req.params.id, {
            type,
            search,
            limit: parseInt(limit) || null
        });
        
        res.json({ 
            success: true, 
            discussions 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Failed to load discussions' 
        });
    }
});

// Create discussion
app.post('/api/projects/:id/discussions', authenticateToken, async (req, res) => {
    try {
        const { title, content, type, evidenceLinks } = req.body;
        
        if (!title || !content || !type) {
            return res.status(400).json({ 
                success: false, 
                error: 'Title, content and type are required' 
            });
        }
        
        const isTeamMember = await database.isUserInProject(req.params.id, req.user.id);
        if (!isTeamMember) {
            return res.status(403).json({ 
                success: false, 
                error: 'Access denied: Not a team member' 
            });
        }
        
        const discussion = await database.createDiscussion({
            projectId: req.params.id,
            title,
            content,
            type,
            evidenceLinks: evidenceLinks || [],
            authorId: req.user.id
        });
        
        // Create notifications for team members
        const team = await database.getProjectTeam(req.params.id);
        for (const member of team) {
            if (member.user_id !== req.user.id) {
                await database.createNotification({
                    userId: member.user_id,
                    type: 'new_discussion',
                    title: 'New discussion started',
                    message: `${req.user.name} started a new discussion: "${title}"`,
                    metadata: { 
                        projectId: req.params.id, 
                        discussionId: discussion.id,
                        discussionType: type 
                    }
                });
            }
        }
        
        // Broadcast via WebSocket
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
            error: 'Failed to create discussion' 
        });
    }
});

// Get single discussion
app.get('/api/discussions/:id', authenticateToken, async (req, res) => {
    try {
        const discussion = await database.getDiscussion(req.params.id);
        if (!discussion) {
            return res.status(404).json({ 
                success: false, 
                error: 'Discussion not found' 
            });
        }
        
        const isTeamMember = await database.isUserInProject(discussion.project_id, req.user.id);
        if (!isTeamMember) {
            return res.status(403).json({ 
                success: false, 
                error: 'Access denied: Not a team member' 
            });
        }
        
        const comments = await database.getDiscussionComments(req.params.id);
        const consensus = await database.calculateConsensus(req.params.id);
        
        res.json({
            success: true,
            discussion: {
                ...discussion,
                consensus
            },
            comments
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Failed to load discussion' 
        });
    }
});

// Update discussion
app.put('/api/discussions/:id', authenticateToken, async (req, res) => {
    try {
        const { title, content } = req.body;
        
        const discussion = await database.getDiscussion(req.params.id);
        if (!discussion) {
            return res.status(404).json({ 
                success: false, 
                error: 'Discussion not found' 
            });
        }
        
        // Only author can update
        if (discussion.author_id !== req.user.id) {
            return res.status(403).json({ 
                success: false, 
                error: 'Only discussion author can update' 
            });
        }
        
        const updatedDiscussion = await database.updateDiscussion(req.params.id, {
            title,
            content
        });
        
        res.json({ 
            success: true, 
            discussion: updatedDiscussion 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Failed to update discussion' 
        });
    }
});

// Add vote to discussion
app.post('/api/discussions/:id/vote', authenticateToken, async (req, res) => {
    try {
        const { voteType } = req.body;
        
        if (!voteType) {
            return res.status(400).json({ 
                success: false, 
                error: 'Vote type is required' 
            });
        }
        
        const discussion = await database.getDiscussion(req.params.id);
        if (!discussion) {
            return res.status(404).json({ 
                success: false, 
                error: 'Discussion not found' 
            });
        }
        
        const isTeamMember = await database.isUserInProject(discussion.project_id, req.user.id);
        if (!isTeamMember) {
            return res.status(403).json({ 
                success: false, 
                error: 'Access denied: Not a team member' 
            });
        }
        
        const vote = await database.addDiscussionVote(
            req.params.id, 
            req.user.id, 
            voteType, 
            req.user.role
        );
        
        const consensus = await database.calculateConsensus(req.params.id);
        
        // Update discussion consensus status
        await database.updateDiscussion(req.params.id, {
            consensus_status: consensus.status
        });
        
        // Broadcast via WebSocket
        broadcastToProject(discussion.project_id, {
            type: 'vote_added',
            discussionId: req.params.id,
            consensus,
            timestamp: new Date().toISOString()
        });
        
        res.json({ 
            success: true, 
            vote, 
            consensus 
        });
    } catch (error) {
        console.error('Vote error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to add vote' 
        });
    }
});

// Add evidence to discussion
app.post('/api/discussions/:id/evidence', authenticateToken, async (req, res) => {
    try {
        const { evidenceType, sourceId, title, url } = req.body;
        
        if (!evidenceType || !sourceId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Evidence type and source ID are required' 
            });
        }
        
        const discussion = await database.getDiscussion(req.params.id);
        if (!discussion) {
            return res.status(404).json({ 
                success: false, 
                error: 'Discussion not found' 
            });
        }
        
        // Only team members can add evidence
        const isTeamMember = await database.isUserInProject(discussion.project_id, req.user.id);
        if (!isTeamMember) {
            return res.status(403).json({ 
                success: false, 
                error: 'Access denied: Not a team member' 
            });
        }
        
        const evidence = await database.addEvidence({
            discussionId: req.params.id,
            evidenceType,
            sourceId,
            title,
            url,
            addedBy: req.user.id
        });
        
        res.status(201).json({ 
            success: true, 
            evidence 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Failed to add evidence' 
        });
    }
});

// ===== COMMENTS =====

// Get discussion comments
app.get('/api/discussions/:id/comments', authenticateToken, async (req, res) => {
    try {
        const discussion = await database.getDiscussion(req.params.id);
        if (!discussion) {
            return res.status(404).json({ 
                success: false, 
                error: 'Discussion not found' 
            });
        }
        
        const isTeamMember = await database.isUserInProject(discussion.project_id, req.user.id);
        if (!isTeamMember) {
            return res.status(403).json({ 
                success: false, 
                error: 'Access denied: Not a team member' 
            });
        }
        
        const comments = await database.getDiscussionComments(req.params.id);
        res.json({ 
            success: true, 
            comments 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Failed to load comments' 
        });
    }
});

// Create comment
app.post('/api/comments', authenticateToken, async (req, res) => {
    try {
        const { discussionId, projectId, content } = req.body;
        
        if (!discussionId || !content || !projectId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Discussion ID, project ID and content are required' 
            });
        }
        
        const isTeamMember = await database.isUserInProject(projectId, req.user.id);
        if (!isTeamMember) {
            return res.status(403).json({ 
                success: false, 
                error: 'Access denied: Not a team member' 
            });
        }
        
        const comment = await database.createComment({
            discussionId,
            projectId,
            content,
            authorId: req.user.id
        });
        
        // Create notification for discussion author
        const discussion = await database.getDiscussion(discussionId);
        if (discussion && discussion.author_id !== req.user.id) {
            await database.createNotification({
                userId: discussion.author_id,
                type: 'new_comment',
                title: 'New comment on your discussion',
                message: `${req.user.name} commented on your discussion: "${discussion.title}"`,
                metadata: { 
                    projectId, 
                    discussionId,
                    commentId: comment.id 
                }
            });
        }
        
        // Broadcast via WebSocket
        broadcastToProject(projectId, {
            type: 'comment_added',
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
            error: 'Failed to create comment' 
        });
    }
});

// ===== DECISIONS =====

// Get project decisions
app.get('/api/projects/:id/decisions', authenticateToken, async (req, res) => {
    try {
        const isTeamMember = await database.isUserInProject(req.params.id, req.user.id);
        if (!isTeamMember) {
            return res.status(403).json({ 
                success: false, 
                error: 'Access denied: Not a team member' 
            });
        }
        
        const decisions = await database.getProjectDecisions(req.params.id);
        res.json({ 
            success: true, 
            decisions 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Failed to load decisions' 
        });
    }
});

// Create decision from discussion
app.post('/api/discussions/:id/decide', authenticateToken, async (req, res) => {
    try {
        const { title, description, decisionType, priority, impactScore } = req.body;
        
        const discussion = await database.getDiscussion(req.params.id);
        if (!discussion) {
            return res.status(404).json({ 
                success: false, 
                error: 'Discussion not found' 
            });
        }
        
        const consensus = await database.calculateConsensus(req.params.id);
        
        // Check consensus thresholds
        if (consensus.clinicalAgreement < 70 || consensus.technicalFeasibility < 70) {
            return res.status(400).json({ 
                success: false, 
                error: 'Consensus thresholds not met (70% clinical agreement, 70% technical feasibility required)' 
            });
        }
        
        const decision = await database.createDecision({
            discussionId: req.params.id,
            projectId: discussion.project_id,
            title: title || `Decision: ${discussion.title.substring(0, 50)}...`,
            description: description || `Based on discussion "${discussion.title}". Consensus reached with ${consensus.clinicalAgreement}% clinical agreement and ${consensus.technicalFeasibility}% technical feasibility.`,
            decisionType: decisionType || 'joint',
            priority: priority || 'medium',
            impactScore: impactScore || 0,
            consensusData: consensus,
            createdBy: req.user.id
        });
        
        // Create notifications for team members
        const team = await database.getProjectTeam(discussion.project_id);
        for (const member of team) {
            if (member.user_id !== req.user.id) {
                await database.createNotification({
                    userId: member.user_id,
                    type: 'decision_reached',
                    title: 'Decision reached',
                    message: `A decision has been reached on discussion: "${discussion.title}"`,
                    metadata: { 
                        projectId: discussion.project_id, 
                        discussionId: req.params.id,
                        decisionId: decision.id
                    }
                });
            }
        }
        
        // Broadcast via WebSocket
        broadcastToProject(discussion.project_id, {
            type: 'decision_reached',
            decision,
            discussionId: req.params.id,
            timestamp: new Date().toISOString()
        });
        
        res.status(201).json({ 
            success: true, 
            decision 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Failed to create decision' 
        });
    }
});

// Update decision
app.put('/api/decisions/:id', authenticateToken, async (req, res) => {
    try {
        const { status, priority, impactScore } = req.body;
        
        const decision = await database.get('SELECT * FROM decisions WHERE id = ?', [req.params.id]);
        if (!decision) {
            return res.status(404).json({ 
                success: false, 
                error: 'Decision not found' 
            });
        }
        
        const isTeamMember = await database.isUserInProject(decision.project_id, req.user.id);
        if (!isTeamMember) {
            return res.status(403).json({ 
                success: false, 
                error: 'Access denied: Not a team member' 
            });
        }
        
        const updatedDecision = await database.updateDecision(req.params.id, {
            status,
            priority,
            impactScore
        });
        
        res.json({ 
            success: true, 
            decision: updatedDecision 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Failed to update decision' 
        });
    }
});

// ===== ERROR HANDLING =====

// 404 handler
app.use('/api/*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'API endpoint not found'
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Server error:', {
        message: err.message,
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString()
    });
    
    const response = {
        success: false,
        error: 'Internal server error'
    };
    
    if (process.env.NODE_ENV === 'development') {
        response.details = err.message;
    }
    
    res.status(err.status || 500).json(response);
});

// SPA routes
app.get('/project', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'project.html'));
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
async function startServer() {
    try {
        await database.connect();
        
        server.listen(PORT, () => {
            console.log(`
🚀 THORAXLAB PLATFORM v4.0 (COMPLETE)
📍 Server: http://localhost:${PORT}
📊 Database: Connected and ready
🔌 WebSocket: Active for real-time updates
📝 API: All endpoints available
🔐 Authentication: Complete with sessions
👥 Team Management: Full CRUD operations
💬 Discussions: With voting and consensus
📋 Decisions: From consensus thresholds
🔔 Notifications: Real-time alerts
📈 Dashboard: Complete metrics
            `);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

process.on('SIGTERM', async () => {
    await database.close();
    process.exit(0);
});

process.on('SIGINT', async () => {
    await database.close();
    process.exit(0);
});

startServer();
