import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const app = express();
const server = createServer(app);

// ==================== DATA STORE CLASS ====================
class ThoraxLabDataStore {
    constructor() {
        this.dataPath = path.join(__dirname, 'store.json');
        this.data = { users: {}, projects: {}, discussions: {}, analytics: {} };
        this.sessions = new Map();
        this.loadData();
    }

    async loadData() {
        try {
            const fileData = await fs.readFile(this.dataPath, 'utf8');
            this.data = JSON.parse(fileData);
            console.log(`✅ Loaded ${Object.keys(this.data.users).length} users, ${Object.keys(this.data.projects).length} projects`);
        } catch (error) {
            if (error.code === 'ENOENT') {
                await this.saveData();
                console.log('📁 Created new store.json');
            } else {
                console.error('Failed to load data:', error);
            }
        }
    }

    async saveData() {
        try {
            await fs.writeFile(this.dataPath, JSON.stringify(this.data, null, 2));
        } catch (error) {
            console.error('Failed to save data:', error);
        }
    }

    // ==================== USER MANAGEMENT ====================
    createUser(userData) {
        const userId = `user-${uuidv4()}`;
        const now = new Date().toISOString();
        
        const user = {
            id: userId,
            name: userData.name.trim(),
            email: userData.email.trim().toLowerCase(),
            institution: userData.institution || 'Medical Center',
            role: 'clinician',
            specialty: 'pulmonology',
            impactScore: 100,
            isAdmin: userData.email === 'admin' || userData.email.includes('@thoraxlab.org'),
            createdAt: now,
            lastActivity: now,
            projects: [],
            discussions: [],
            preferences: {
                notifications: true,
                theme: 'medical-blue'
            }
        };
        
        this.data.users[userId] = user;
        this.saveData();
        return user;
    }

    findUserByEmail(email) {
        const normalizedEmail = email.trim().toLowerCase();
        return Object.values(this.data.users).find(user => user.email === normalizedEmail);
    }

    getUser(userId) {
        return this.data.users[userId];
    }

    // ==================== SESSION MANAGEMENT ====================
    createSession(userId) {
        const sessionId = `session-${uuidv4()}`;
        const session = {
            id: sessionId,
            userId,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            lastActivity: new Date().toISOString()
        };
        
        this.sessions.set(sessionId, session);
        return session;
    }

    validateSession(sessionId) {
        if (!sessionId) return null;
        
        const session = this.sessions.get(sessionId);
        if (!session) return null;
        
        if (new Date(session.expiresAt) < new Date()) {
            this.sessions.delete(sessionId);
            return null;
        }
        
        session.lastActivity = new Date().toISOString();
        this.sessions.set(sessionId, session);
        
        return session;
    }

    // ==================== PROJECT MANAGEMENT ====================
    createProject(projectData, userId) {
        const projectId = `project-${uuidv4()}`;
        const now = new Date().toISOString();
        const user = this.getUser(userId);
        
        if (!user) throw new Error('User not found');
        
        const project = {
            id: projectId,
            title: projectData.title.trim(),
            description: projectData.description.trim(),
            status: projectData.status || 'planning',
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
                joinedAt: now
            }],
            objectives: projectData.objectives || [
                'Define research objectives',
                'Establish methodology',
                'Assemble research team',
                'Collect and analyze data'
            ],
            methodology: projectData.methodology || 'To be determined based on research goals',
            timeline: {
                startDate: now,
                estimatedDuration: '6 months',
                milestones: [],
                progress: 0
            },
            metrics: {
                consensus: 0,
                engagement: 0,
                discussions: 0,
                comments: 0,
                votes: 0
            },
            settings: {
                isPublic: false,
                allowComments: true,
                allowVoting: true,
                requireApproval: false
            },
            createdAt: now,
            updatedAt: now
        };
        
        this.data.projects[projectId] = project;
        user.projects.push(projectId);
        this.saveData();
        return project;
    }

    getProject(projectId) {
        return this.data.projects[projectId];
    }

    updateProject(projectId, updates) {
        const project = this.data.projects[projectId];
        if (!project) throw new Error('Project not found');
        
        if (updates.title !== undefined) project.title = updates.title.trim();
        if (updates.description !== undefined) project.description = updates.description.trim();
        if (updates.status !== undefined) project.status = updates.status;
        if (updates.objectives !== undefined) project.objectives = updates.objectives;
        if (updates.methodology !== undefined) project.methodology = updates.methodology;
        
        project.updatedAt = new Date().toISOString();
        this.saveData();
        return project;
    }

    getProjectsForUser(userId) {
        return Object.values(this.data.projects).filter(project => 
            project.team.some(member => member.id === userId)
        );
    }

    // ==================== ANALYTICS ====================
    getPlatformStats() {
        const totalProjects = Object.keys(this.data.projects).length;
        const activeProjects = Object.values(this.data.projects).filter(p => p.status === 'active').length;
        const totalUsers = Object.keys(this.data.users).length;
        
        return {
            totalProjects,
            activeProjects,
            totalUsers,
            consensusScore: 78,
            engagementRate: 45
        };
    }
}

// ==================== INITIALIZE ====================
const dataStore = new ThoraxLabDataStore();

// ==================== MIDDLEWARE ====================
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "data:", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "ws://localhost:3000", "wss://localhost:3000"]
        }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

app.use(compression());
app.use(express.json());
app.use(express.static('public'));

// ==================== AUTHENTICATION MIDDLEWARE ====================
const authenticate = (req, res, next) => {
    try {
        let sessionId = req.cookies?.sessionId || req.headers.authorization?.replace('Bearer ', '');
        
        if (!sessionId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }
        
        const session = dataStore.validateSession(sessionId);
        if (!session) {
            res.clearCookie('sessionId');
            return res.status(401).json({ success: false, error: 'Invalid or expired session' });
        }
        
        const user = dataStore.getUser(session.userId);
        if (!user) {
            dataStore.sessions.delete(sessionId);
            res.clearCookie('sessionId');
            return res.status(401).json({ success: false, error: 'User not found' });
        }
        
        user.lastActivity = new Date().toISOString();
        req.user = user;
        req.session = session;
        next();
        
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(500).json({ success: false, error: 'Authentication failed' });
    }
};

// ==================== SOCKET.IO ====================
const io = new Server(server, {
    cors: {
        origin: true,
        credentials: true
    }
});

io.on('connection', (socket) => {
    console.log('🔌 Socket connected:', socket.id);
    
    socket.on('join:project', (projectId) => {
        socket.join(`project:${projectId}`);
        console.log(`Socket ${socket.id} joined project ${projectId}`);
    });
    
    socket.on('disconnect', () => {
        console.log('🔌 Socket disconnected:', socket.id);
    });
});

// ==================== API ROUTES ====================

// Health check
app.get('/health', (req, res) => {
    res.json({
        success: true,
        service: 'ThoraxLab Platform',
        version: '4.0.0',
        timestamp: new Date().toISOString(),
        status: 'operational'
    });
});

// Status
app.get('/api/status', (req, res) => {
    res.json({ success: true, status: 'online', timestamp: new Date().toISOString() });
});

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { name, email, institution } = req.body;
        
        if (!name || !email) {
            return res.status(400).json({ success: false, error: 'Name and email are required' });
        }
        
        let user = dataStore.findUserByEmail(email);
        if (!user) {
            user = dataStore.createUser({ name, email, institution });
        }
        
        const session = dataStore.createSession(user.id);
        
        res.cookie('sessionId', session.id, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: '/'
        });
        
        res.json({
            success: true,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                institution: user.institution,
                role: user.role,
                impactScore: user.impactScore,
                isAdmin: user.isAdmin,
                projectCount: user.projects?.length || 0
            },
            session: {
                id: session.id,
                expiresAt: session.expiresAt
            }
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, error: 'Login failed' });
    }
});

// Logout
app.post('/api/logout', (req, res) => {
    try {
        const sessionId = req.cookies?.sessionId || req.headers.authorization?.replace('Bearer ', '');
        
        if (sessionId) {
            dataStore.sessions.delete(sessionId);
        }
        
        res.clearCookie('sessionId');
        res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ success: false, error: 'Logout failed' });
    }
});

// Get current user
app.get('/api/me', authenticate, (req, res) => {
    try {
        const user = req.user;
        
        res.json({
            success: true,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                institution: user.institution,
                role: user.role,
                impactScore: user.impactScore,
                isAdmin: user.isAdmin,
                projectCount: user.projects?.length || 0
            }
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ success: false, error: 'Failed to get user info' });
    }
});

// Get all projects for user
app.get('/api/projects', authenticate, (req, res) => {
    try {
        const user = req.user;
        const projects = dataStore.getProjectsForUser(user.id);
        
        res.json({
            success: true,
            projects: projects.map(p => ({
                id: p.id,
                title: p.title,
                description: p.description,
                status: p.status,
                lead: p.lead.name,
                leadId: p.lead.id,
                teamCount: p.team.length,
                metrics: p.metrics,
                createdAt: p.createdAt,
                updatedAt: p.updatedAt
            })),
            count: projects.length
        });
    } catch (error) {
        console.error('Get projects error:', error);
        res.status(500).json({ success: false, error: 'Failed to load projects' });
    }
});

// Create new project
app.post('/api/projects', authenticate, (req, res) => {
    try {
        const { title, description } = req.body;
        const user = req.user;
        
        if (!title || !description) {
            return res.status(400).json({ success: false, error: 'Title and description are required' });
        }
        
        const project = dataStore.createProject({
            title,
            description,
            status: 'planning'
        }, user.id);
        
        io.emit('project:created', {
            projectId: project.id,
            userId: user.id,
            title: project.title
        });
        
        res.status(201).json({
            success: true,
            project,
            message: 'Project created successfully'
        });
    } catch (error) {
        console.error('Create project error:', error);
        res.status(500).json({ success: false, error: 'Failed to create project' });
    }
});

// Get single project
app.get('/api/projects/:id', authenticate, (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;
        
        const project = dataStore.getProject(id);
        if (!project) {
            return res.status(404).json({ success: false, error: 'Project not found' });
        }
        
        const hasAccess = project.team.some(member => member.id === user.id) || user.isAdmin;
        if (!hasAccess) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }
        
        res.json({ success: true, project });
    } catch (error) {
        console.error('Get project error:', error);
        res.status(500).json({ success: false, error: 'Failed to load project' });
    }
});

// Update project
app.put('/api/projects/:id', authenticate, (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const user = req.user;
        
        const project = dataStore.getProject(id);
        if (!project) {
            return res.status(404).json({ success: false, error: 'Project not found' });
        }
        
        const isLead = project.lead.id === user.id;
        const isAdmin = user.isAdmin;
        
        if (!isLead && !isAdmin) {
            return res.status(403).json({ success: false, error: 'Insufficient permissions' });
        }
        
        const updatedProject = dataStore.updateProject(id, updates);
        
        io.to(`project:${id}`).emit('project:updated', {
            projectId: id,
            updates: Object.keys(updates)
        });
        
        res.json({
            success: true,
            project: updatedProject,
            message: 'Project updated successfully'
        });
    } catch (error) {
        console.error('Update project error:', error);
        res.status(500).json({ success: false, error: 'Failed to update project' });
    }
});

// Get project team
app.get('/api/projects/:id/team', authenticate, (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;
        
        const project = dataStore.getProject(id);
        if (!project) {
            return res.status(404).json({ success: false, error: 'Project not found' });
        }
        
        const hasAccess = project.team.some(member => member.id === user.id) || user.isAdmin;
        if (!hasAccess) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }
        
        const enhancedTeam = project.team.map(member => {
            const userData = dataStore.getUser(member.id);
            return {
                ...member,
                specialty: userData?.specialty,
                impactScore: userData?.impactScore,
                lastActivity: userData?.lastActivity
            };
        });
        
        res.json({
            success: true,
            team: enhancedTeam,
            count: enhancedTeam.length
        });
    } catch (error) {
        console.error('Get team error:', error);
        res.status(500).json({ success: false, error: 'Failed to load team' });
    }
});

// Get analytics
app.get('/api/analytics', authenticate, (req, res) => {
    try {
        const user = req.user;
        const userProjects = dataStore.getProjectsForUser(user.id);
        const platformStats = dataStore.getPlatformStats();
        
        res.json({
            success: true,
            analytics: {
                user: {
                    projectCount: userProjects.length,
                    impactScore: user.impactScore,
                    role: user.role,
                    isAdmin: user.isAdmin
                },
                platform: platformStats
            }
        });
    } catch (error) {
        console.error('Get analytics error:', error);
        res.status(500).json({ success: false, error: 'Failed to load analytics' });
    }
});

// SPA fallback
app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ success: false, error: 'API endpoint not found' });
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== START SERVER ====================
server.listen(PORT, () => {
    console.log(`
🚀 THORAXLAB PLATFORM v4.0.0
===============================
📡 Server running on port ${PORT}
🌐 Dashboard: http://localhost:${PORT}
🔗 Health: http://localhost:${PORT}/health
👤 Test: Name="Admin", Email="admin"

📊 Platform Stats:
   • Users: ${Object.keys(dataStore.data.users).length}
   • Projects: ${Object.keys(dataStore.data.projects).length}
   • Storage: ./store.json

💡 Ready for collaboration!
`);
});
