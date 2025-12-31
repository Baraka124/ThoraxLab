const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const app = express();
const server = require('http').createServer(app);

// ===== ADVANCED DATABASE STRUCTURE =====
class ThoraxLabDatabase {
    constructor() {
        this.users = new Map();          // userId -> User
        this.projects = new Map();       // projectId -> Project
        this.discussions = new Map();    // discussionId -> Discussion
        this.comments = new Map();       // commentId -> Comment
        this.decisions = new Map();      // decisionId -> Decision
        this.organizations = new Map();  // orgId -> Organization
        
        this.initializeData();
    }
    
    initializeData() {
        // Create admin user
        const adminId = 'admin';
        this.users.set(adminId, {
            id: adminId,
            name: 'Platform Administrator',
            email: 'admin@thoraxlab.org',
            organization: 'ThoraxLab',
            role: 'admin',
            specialty: 'platform_management',
            impactScore: 100,
            isAdmin: true,
            createdAt: new Date().toISOString(),
            lastActivity: new Date().toISOString()
        });
        
        // Create welcome project
        const projectId = 'welcome_project';
        this.projects.set(projectId, {
            id: projectId,
            title: 'Welcome to ThoraxLab',
            description: 'This is a demonstration project showing clinical-industry collaboration capabilities.',
            status: 'active',
            type: 'collaborative',
            lead: {
                id: adminId,
                name: 'Platform Administrator',
                email: 'admin@thoraxlab.org'
            },
            team: [{
                id: adminId,
                name: 'Platform Administrator',
                email: 'admin@thoraxlab.org',
                role: 'lead',
                organization: 'ThoraxLab',
                joinedAt: new Date().toISOString()
            }],
            objectives: [
                'Explore platform features',
                'Understand collaboration workflow',
                'Learn decision-making process',
                'Practice evidence-based discussions'
            ],
            methodology: 'Mixed-methods approach combining clinical insight with technical innovation.',
            timeline: {
                startDate: new Date().toISOString(),
                estimatedDuration: 'Ongoing',
                progress: 25
            },
            metrics: {
                consensus: 85,
                engagement: 42,
                discussions: 3,
                comments: 12,
                velocity: 3.2
            },
            settings: {
                isPublic: true,
                allowComments: true,
                allowVoting: true
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
        
        // Create initial discussion
        const discussionId = 'welcome_discussion';
        this.discussions.set(discussionId, {
            id: discussionId,
            projectId: projectId,
            title: 'Welcome Discussion',
            content: 'This is where clinical and industry teams collaborate. Start by introducing yourself and your expertise.',
            type: 'joint',
            author: {
                id: adminId,
                name: 'Platform Administrator',
                role: 'admin',
                organization: 'ThoraxLab'
            },
            tags: ['welcome', 'introduction', 'collaboration'],
            metrics: {
                upvotes: 0,
                downvotes: 0,
                commentCount: 0,
                consensus: 0
            },
            evidenceCount: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
    }
    
    // User methods
    createUser(userData) {
        const userId = `user_${uuidv4()}`;
        const now = new Date().toISOString();
        
        const user = {
            id: userId,
            name: userData.name.trim(),
            email: userData.email.trim().toLowerCase(),
            organization: userData.organization || 'Medical Center',
            role: userData.role || 'clinician',
            specialty: userData.specialty || 'pulmonology',
            impactScore: 100,
            isAdmin: userData.email === 'admin' || userData.email.includes('admin@'),
            createdAt: now,
            lastActivity: now,
            projects: [],
            preferences: {
                notifications: true,
                theme: 'medical-blue'
            }
        };
        
        this.users.set(userId, user);
        return user;
    }
    
    findUserByEmail(email) {
        const normalizedEmail = email.trim().toLowerCase();
        for (const user of this.users.values()) {
            if (user.email === normalizedEmail) {
                return user;
            }
        }
        return null;
    }
    
    getUser(userId) {
        return this.users.get(userId);
    }
    
    // Project methods
    createProject(projectData, userId) {
        const projectId = `project_${uuidv4()}`;
        const now = new Date().toISOString();
        const user = this.users.get(userId);
        
        if (!user) throw new Error('User not found');
        
        const project = {
            id: projectId,
            title: projectData.title.trim(),
            description: projectData.description.trim(),
            status: projectData.status || 'planning',
            type: projectData.type || 'clinical',
            lead: {
                id: userId,
                name: user.name,
                email: user.email
            },
            team: [{
                id: userId,
                name: user.name,
                email: user.email,
                role: 'lead',
                organization: user.organization,
                joinedAt: now
            }],
            objectives: projectData.objectives || [],
            methodology: projectData.methodology || '',
            timeline: {
                startDate: now,
                estimatedDuration: '6 months',
                progress: 0
            },
            metrics: {
                consensus: 0,
                engagement: 0,
                discussions: 0,
                comments: 0,
                velocity: 0
            },
            settings: {
                isPublic: false,
                allowComments: true,
                allowVoting: true
            },
            createdAt: now,
            updatedAt: now
        };
        
        this.projects.set(projectId, project);
        user.projects.push(projectId);
        
        return project;
    }
    
    getProject(projectId) {
        return this.projects.get(projectId);
    }
    
    getProjectsForUser(userId) {
        const userProjects = [];
        for (const project of this.projects.values()) {
            if (project.team.some(member => member.id === userId)) {
                userProjects.push(project);
            }
        }
        return userProjects;
    }
    
    getAllProjects() {
        return Array.from(this.projects.values());
    }
    
    updateProject(projectId, updates) {
        const project = this.projects.get(projectId);
        if (!project) throw new Error('Project not found');
        
        // Apply updates
        Object.keys(updates).forEach(key => {
            if (key === 'metrics' && updates.metrics) {
                project.metrics = { ...project.metrics, ...updates.metrics };
            } else if (updates[key] !== undefined) {
                project[key] = updates[key];
            }
        });
        
        project.updatedAt = new Date().toISOString();
        return project;
    }
    
    // Discussion methods
    createDiscussion(discussionData) {
        const discussionId = `disc_${uuidv4()}`;
        const now = new Date().toISOString();
        
        const discussion = {
            id: discussionId,
            projectId: discussionData.projectId,
            title: discussionData.title.trim(),
            content: discussionData.content.trim(),
            type: discussionData.type || 'clinical',
            author: discussionData.author,
            tags: discussionData.tags || [],
            metrics: {
                upvotes: 0,
                downvotes: 0,
                commentCount: 0,
                consensus: 0
            },
            evidenceCount: 0,
            createdAt: now,
            updatedAt: now
        };
        
        this.discussions.set(discussionId, discussion);
        
        // Update project metrics
        const project = this.projects.get(discussionData.projectId);
        if (project) {
            project.metrics.discussions = (project.metrics.discussions || 0) + 1;
            project.updatedAt = now;
        }
        
        return discussion;
    }
    
    getProjectDiscussions(projectId) {
        return Array.from(this.discussions.values())
            .filter(d => d.projectId === projectId)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    
    // Comment methods
    createComment(commentData) {
        const commentId = `comment_${uuidv4()}`;
        const now = new Date().toISOString();
        
        const comment = {
            id: commentId,
            discussionId: commentData.discussionId,
            projectId: commentData.projectId,
            content: commentData.content.trim(),
            author: commentData.author,
            createdAt: now
        };
        
        this.comments.set(commentId, comment);
        
        // Update discussion metrics
        const discussion = this.discussions.get(commentData.discussionId);
        if (discussion) {
            discussion.metrics.commentCount = (discussion.metrics.commentCount || 0) + 1;
            discussion.updatedAt = now;
        }
        
        // Update project metrics
        const project = this.projects.get(commentData.projectId);
        if (project) {
            project.metrics.comments = (project.metrics.comments || 0) + 1;
            project.updatedAt = now;
        }
        
        return comment;
    }
    
    getDiscussionComments(discussionId) {
        return Array.from(this.comments.values())
            .filter(c => c.discussionId === discussionId)
            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    }
    
    // Team methods
    addTeamMember(projectId, memberData) {
        const project = this.projects.get(projectId);
        if (!project) throw new Error('Project not found');
        
        const now = new Date().toISOString();
        const member = {
            id: memberData.id || `member_${uuidv4()}`,
            name: memberData.name,
            email: memberData.email,
            role: memberData.role || 'contributor',
            organization: memberData.organization,
            joinedAt: now
        };
        
        project.team.push(member);
        project.updatedAt = now;
        
        return member;
    }
    
    getProjectTeam(projectId) {
        const project = this.projects.get(projectId);
        return project ? project.team : [];
    }
    
    // Analytics methods
    getPlatformStats() {
        const totalProjects = this.projects.size;
        const activeProjects = Array.from(this.projects.values())
            .filter(p => p.status === 'active').length;
        const totalUsers = this.users.size;
        
        let totalEngagement = 0;
        let totalConsensus = 0;
        
        for (const project of this.projects.values()) {
            totalEngagement += project.metrics.engagement || 0;
            totalConsensus += project.metrics.consensus || 0;
        }
        
        const avgEngagement = totalProjects > 0 ? Math.round(totalEngagement / totalProjects) : 0;
        const avgConsensus = totalProjects > 0 ? Math.round(totalConsensus / totalProjects) : 0;
        
        return {
            totalProjects,
            activeProjects,
            totalUsers,
            avgEngagement,
            avgConsensus,
            totalDiscussions: this.discussions.size,
            totalComments: this.comments.size,
            updatedAt: new Date().toISOString()
        };
    }
    
    getDashboardData(userId) {
        const user = this.users.get(userId);
        if (!user) return null;
        
        const userProjects = this.getProjectsForUser(userId);
        
        // Calculate user-specific metrics
        let clinicalActivity = 0;
        let industryActivity = 0;
        let pendingDecisions = 0;
        
        for (const project of userProjects) {
            // Simplified metric calculation
            clinicalActivity += project.metrics.comments || 0;
            industryActivity += project.metrics.discussions || 0;
        }
        
        return {
            user: {
                name: user.name,
                organization: user.organization,
                role: user.role,
                projectCount: userProjects.length,
                impactScore: user.impactScore
            },
            metrics: {
                clinicalActivity,
                industryActivity,
                crossPollination: Math.round((clinicalActivity + industryActivity) / 2),
                decisionVelocity: 3.2 // Example value
            },
            activeProjects: userProjects.slice(0, 5),
            recentActivity: this.getRecentActivity(userId)
        };
    }
    
    getRecentActivity(userId) {
        const activities = [];
        const now = new Date();
        
        // Get recent discussions
        for (const discussion of this.discussions.values()) {
            if (new Date(discussion.createdAt) > new Date(now - 24 * 60 * 60 * 1000)) {
                activities.push({
                    type: 'discussion',
                    text: `New discussion: ${discussion.title}`,
                    timestamp: discussion.createdAt
                });
            }
        }
        
        // Get recent comments
        for (const comment of this.comments.values()) {
            if (new Date(comment.createdAt) > new Date(now - 24 * 60 * 60 * 1000)) {
                activities.push({
                    type: 'comment',
                    text: `New comment on discussion`,
                    timestamp: comment.createdAt
                });
            }
        }
        
        return activities.sort((a, b) => 
            new Date(b.timestamp) - new Date(a.timestamp)
        ).slice(0, 10);
    }
}

// ===== INITIALIZE DATABASE =====
const db = new ThoraxLabDatabase();

// ===== WEB SOCKET SERVER =====
const wss = new WebSocket.Server({ server });
const clients = new Map();

wss.on('connection', (ws, req) => {
    const clientId = uuidv4();
    clients.set(clientId, { ws, userId: null });
    
    ws.on('message', async (data) => {
        try {
            const message = JSON.parse(data);
            
            switch (message.type) {
                case 'authenticate':
                    const user = db.getUser(message.userId);
                    if (user) {
                        clients.set(clientId, { ws, userId: message.userId });
                        ws.send(JSON.stringify({
                            type: 'authenticated',
                            user: {
                                id: user.id,
                                name: user.name
                            }
                        }));
                    }
                    break;
                    
                case 'join_project':
                    // Subscribe to project updates
                    ws.send(JSON.stringify({
                        type: 'joined_project',
                        projectId: message.projectId
                    }));
                    break;
                    
                case 'new_discussion':
                    const discussion = db.createDiscussion(message.data);
                    
                    // Broadcast to all clients in the project
                    broadcastToProject(message.data.projectId, {
                        type: 'discussion_created',
                        discussion
                    });
                    break;
                    
                case 'new_comment':
                    const comment = db.createComment(message.data);
                    
                    broadcastToProject(message.data.projectId, {
                        type: 'comment_created',
                        comment
                    });
                    break;
            }
        } catch (error) {
            console.error('WebSocket error:', error);
        }
    });
    
    ws.on('close', () => {
        clients.delete(clientId);
    });
    
    // Send initial platform stats
    const stats = db.getPlatformStats();
    ws.send(JSON.stringify({
        type: 'platform_stats',
        stats
    }));
});

function broadcastToProject(projectId, message) {
    const data = JSON.stringify(message);
    
    for (const client of clients.values()) {
        if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(data);
        }
    }
}

// ===== EXPRESS MIDDLEWARE =====
app.use(express.json());
app.use(express.static('public'));

// ===== API ROUTES =====

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'ThoraxLab Platform',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        stats: db.getPlatformStats()
    });
});

// Login
app.post('/api/login', (req, res) => {
    const { name, email, institution } = req.body;
    
    if (!name || !email) {
        return res.status(400).json({
            success: false,
            error: 'Name and email are required'
        });
    }
    
    // Find or create user
    let user = db.findUserByEmail(email);
    if (!user) {
        user = db.createUser({
            name,
            email,
            organization: institution || 'Medical Center',
            role: email.includes('@thoraxlab.org') ? 'admin' : 'clinician'
        });
    }
    
    res.json({
        success: true,
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            organization: user.organization,
            role: user.role,
            isAdmin: user.isAdmin
        }
    });
});

// Get current user
app.get('/api/me', (req, res) => {
    // Simplified: return first user (in real app, use session/token)
    const user = Array.from(db.users.values())[0];
    
    res.json({
        success: true,
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            organization: user.organization,
            role: user.role,
            isAdmin: user.isAdmin
        }
    });
});

// Get all projects
app.get('/api/projects', (req, res) => {
    // In real app, filter by user access
    const projects = db.getAllProjects().map(p => ({
        id: p.id,
        title: p.title,
        description: p.description,
        status: p.status,
        type: p.type,
        lead: p.lead.name,
        teamCount: p.team.length,
        metrics: p.metrics,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt
    }));
    
    res.json({
        success: true,
        projects,
        count: projects.length
    });
});

// Create project
app.post('/api/projects', (req, res) => {
    const { title, description, type } = req.body;
    
    if (!title || !description) {
        return res.status(400).json({
            success: false,
            error: 'Title and description are required'
        });
    }
    
    // Get user (simplified - in real app, from auth)
    const user = Array.from(db.users.values())[0];
    
    const project = db.createProject({
        title,
        description,
        type: type || 'clinical',
        status: 'planning'
    }, user.id);
    
    res.status(201).json({
        success: true,
        project
    });
});

// Get single project
app.get('/api/projects/:id', (req, res) => {
    const project = db.getProject(req.params.id);
    
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
});

// Update project
app.put('/api/projects/:id', (req, res) => {
    try {
        const updatedProject = db.updateProject(req.params.id, req.body);
        
        res.json({
            success: true,
            project: updatedProject
        });
    } catch (error) {
        res.status(404).json({
            success: false,
            error: error.message
        });
    }
});

// Get project discussions
app.get('/api/projects/:id/discussions', (req, res) => {
    const discussions = db.getProjectDiscussions(req.params.id);
    
    res.json({
        success: true,
        discussions,
        count: discussions.length
    });
});

// Create discussion
app.post('/api/projects/:id/discussions', (req, res) => {
    const { title, content, type, tags } = req.body;
    
    if (!title || !content) {
        return res.status(400).json({
            success: false,
            error: 'Title and content are required'
        });
    }
    
    // Get user (simplified)
    const user = Array.from(db.users.values())[0];
    
    const discussion = db.createDiscussion({
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
    
    res.status(201).json({
        success: true,
        discussion
    });
});

// Get discussion comments
app.get('/api/discussions/:id/comments', (req, res) => {
    const comments = db.getDiscussionComments(req.params.id);
    
    res.json({
        success: true,
        comments,
        count: comments.length
    });
});

// Create comment
app.post('/api/comments', (req, res) => {
    const { discussionId, projectId, content } = req.body;
    
    if (!discussionId || !content) {
        return res.status(400).json({
            success: false,
            error: 'Discussion ID and content are required'
        });
    }
    
    // Get user (simplified)
    const user = Array.from(db.users.values())[0];
    
    const comment = db.createComment({
        discussionId,
        projectId,
        content,
        author: {
            id: user.id,
            name: user.name,
            role: user.role,
            organization: user.organization
        }
    });
    
    res.status(201).json({
        success: true,
        comment
    });
});

// Get project team
app.get('/api/projects/:id/team', (req, res) => {
    const team = db.getProjectTeam(req.params.id);
    
    res.json({
        success: true,
        team,
        count: team.length
    });
});

// Add team member
app.post('/api/projects/:id/team', (req, res) => {
    const { name, email, role, organization } = req.body;
    
    if (!name || !email) {
        return res.status(400).json({
            success: false,
            error: 'Name and email are required'
        });
    }
    
    try {
        const member = db.addTeamMember(req.params.id, {
            name,
            email,
            role: role || 'contributor',
            organization: organization || 'Unknown'
        });
        
        res.status(201).json({
            success: true,
            member
        });
    } catch (error) {
        res.status(404).json({
            success: false,
            error: error.message
        });
    }
});

// Get platform analytics
app.get('/api/analytics', (req, res) => {
    const stats = db.getPlatformStats();
    
    res.json({
        success: true,
        analytics: {
            platform: stats,
            user: {
                // Simplified user stats
                projectCount: 1,
                impactScore: 100
            }
        }
    });
});

// Get dashboard data
app.get('/api/dashboard', (req, res) => {
    // Get user (simplified)
    const user = Array.from(db.users.values())[0];
    
    const dashboardData = db.getDashboardData(user.id);
    
    res.json({
        success: true,
        dashboard: dashboardData
    });
});

// Get recent activity
app.get('/api/activity', (req, res) => {
    // Get user (simplified)
    const user = Array.from(db.users.values())[0];
    
    const activity = db.getRecentActivity(user.id);
    
    res.json({
        success: true,
        activity,
        count: activity.length
    });
});

// Serve frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== START SERVER =====
server.listen(PORT, '0.0.0.0', () => {
    console.log(`
🚀 THORAXLAB ADVANCED PLATFORM
📍 Port: ${PORT}
🌐 WebSocket: Ready
💾 Database: Advanced In-Memory
👥 Users: ${db.users.size}
📊 Projects: ${db.projects.size}
💬 Discussions: ${db.discussions.size}

✅ API ENDPOINTS:
  • POST /api/login           - User authentication
  • GET  /api/me             - Current user
  • GET  /api/projects       - List projects
  • POST /api/projects       - Create project
  • GET  /api/projects/:id   - Project details
  • PUT  /api/projects/:id   - Update project
  • GET  /api/analytics      - Platform analytics
  • GET  /api/dashboard      - Dashboard data
  • GET  /api/activity       - Recent activity

✨ FEATURES:
  • User management with roles
  • Project creation with teams
  • Evidence-based discussions
  • Real-time collaboration
  • Platform analytics
  • Decision tracking support
    `);
});
