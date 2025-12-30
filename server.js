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
import cookieParser from 'cookie-parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

const app = express();
const server = createServer(app);

// ==================== SIMPLE DATA STORE ====================
const dataStore = {
    users: {},
    projects: {},
    sessions: {},
    
    init() {
        this.loadData();
        setInterval(() => this.saveData(), 300000); // Auto-save every 5 min
    },
    
    async loadData() {
        try {
            const data = await fs.readFile('store.json', 'utf8');
            const parsed = JSON.parse(data);
            this.users = parsed.users || {};
            this.projects = parsed.projects || {};
            this.sessions = parsed.sessions || {};
            console.log(`✅ Loaded ${Object.keys(this.users).length} users, ${Object.keys(this.projects).length} projects`);
        } catch {
            this.saveData();
            console.log('📁 Created new store.json');
        }
    },
    
    async saveData() {
        try {
            const data = {
                users: this.users,
                projects: this.projects,
                sessions: this.sessions,
                updatedAt: new Date().toISOString()
            };
            await fs.writeFile('store.json', JSON.stringify(data, null, 2));
        } catch (err) {
            console.error('Save error:', err.message);
        }
    },
    
    // User methods
    createUser(userData) {
        const userId = `user-${uuidv4()}`;
        const user = {
            id: userId,
            name: userData.name.trim(),
            email: userData.email.trim().toLowerCase(),
            institution: userData.institution || 'Medical Center',
            role: 'clinician',
            isAdmin: userData.email === 'admin',
            createdAt: new Date().toISOString(),
            projects: []
        };
        this.users[userId] = user;
        this.saveData();
        return user;
    },
    
    findUserByEmail(email) {
        return Object.values(this.users).find(u => u.email === email.trim().toLowerCase());
    },
    
    // Session methods
    createSession(userId) {
        const sessionId = `session-${uuidv4()}`;
        const session = {
            id: sessionId,
            userId,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        };
        this.sessions[sessionId] = session;
        this.saveData();
        return session;
    },
    
    validateSession(sessionId) {
        if (!sessionId || !this.sessions[sessionId]) return null;
        
        const session = this.sessions[sessionId];
        if (new Date(session.expiresAt) < new Date()) {
            delete this.sessions[sessionId];
            return null;
        }
        return session;
    },
    
    // Project methods
    createProject(projectData, userId) {
        const projectId = `project-${uuidv4()}`;
        const user = this.users[userId];
        
        const project = {
            id: projectId,
            title: projectData.title,
            description: projectData.description,
            status: 'planning',
            lead: { id: userId, name: user.name },
            team: [{ id: userId, name: user.name, role: 'lead' }],
            createdAt: new Date().toISOString()
        };
        
        this.projects[projectId] = project;
        user.projects.push(projectId);
        this.saveData();
        return project;
    },
    
    getProject(projectId) {
        return this.projects[projectId];
    },
    
    getProjectsForUser(userId) {
        return Object.values(this.projects)
            .filter(p => p.team.some(m => m.id === userId))
            .map(p => ({
                id: p.id,
                title: p.title,
                description: p.description,
                status: p.status,
                lead: p.lead.name,
                teamCount: p.team.length,
                createdAt: p.createdAt
            }));
    }
};

dataStore.init();

// ==================== MIDDLEWARE ====================
app.use(helmet({
    contentSecurityPolicy: false // Simpler for now
}));

app.use(cors({
    origin: true, // Allow all origins for testing
    credentials: true
}));

app.use(compression());
app.use(cookieParser());
app.use(express.json());
app.use(express.static('public'));

// Request logger
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
    next();
});

// ==================== AUTH MIDDLEWARE ====================
const auth = (req, res, next) => {
    const sessionId = req.cookies?.sessionId;
    console.log('🔐 Auth check - Cookie:', sessionId ? 'Present' : 'Missing');
    
    if (!sessionId) {
        return res.status(401).json({ error: 'No session' });
    }
    
    const session = dataStore.validateSession(sessionId);
    if (!session) {
        res.clearCookie('sessionId');
        return res.status(401).json({ error: 'Invalid session' });
    }
    
    const user = dataStore.users[session.userId];
    if (!user) {
        delete dataStore.sessions[sessionId];
        res.clearCookie('sessionId');
        return res.status(401).json({ error: 'User not found' });
    }
    
    req.user = user;
    req.session = session;
    next();
};

// ==================== API ROUTES ====================

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

// Login - SIMPLIFIED
app.post('/api/login', (req, res) => {
    try {
        const { name, email } = req.body;
        
        if (!name || !email) {
            return res.status(400).json({ error: 'Name and email required' });
        }
        
        let user = dataStore.findUserByEmail(email);
        if (!user) {
            user = dataStore.createUser({ name, email });
        }
        
        const session = dataStore.createSession(user.id);
        
        // SIMPLE COOKIE - Railway friendly
        res.cookie('sessionId', session.id, {
            httpOnly: true,
            secure: isProduction,
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: '/'
        });
        
        console.log(`✅ Login: ${user.name} (${user.email})`);
        
        res.json({
            success: true,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                isAdmin: user.isAdmin,
                projectCount: user.projects.length
            }
        });
        
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Get current user - SIMPLIFIED
app.get('/api/me', auth, (req, res) => {
    res.json({
        success: true,
        user: {
            id: req.user.id,
            name: req.user.name,
            email: req.user.email,
            projectCount: req.user.projects.length
        }
    });
});

// Logout
app.post('/api/logout', auth, (req, res) => {
    delete dataStore.sessions[req.session.id];
    res.clearCookie('sessionId');
    res.json({ success: true });
});

// Get projects
app.get('/api/projects', auth, (req, res) => {
    const projects = dataStore.getProjectsForUser(req.user.id);
    res.json({ success: true, projects });
});

// Create project
app.post('/api/projects', auth, (req, res) => {
    const { title, description } = req.body;
    if (!title || !description) {
        return res.status(400).json({ error: 'Title and description required' });
    }
    
    const project = dataStore.createProject(
        { title, description },
        req.user.id
    );
    
    res.json({ success: true, project });
});

// Get single project
app.get('/api/projects/:id', auth, (req, res) => {
    const project = dataStore.getProject(req.params.id);
    if (!project) {
        return res.status(404).json({ error: 'Project not found' });
    }
    
    // Check access
    const hasAccess = project.team.some(m => m.id === req.user.id) || req.user.isAdmin;
    if (!hasAccess) {
        return res.status(403).json({ error: 'No access' });
    }
    
    res.json({ success: true, project });
});

// Analytics
app.get('/api/analytics', auth, (req, res) => {
    const stats = {
        user: { projectCount: req.user.projects.length },
        platform: {
            totalProjects: Object.keys(dataStore.projects).length,
            totalUsers: Object.keys(dataStore.users).length,
            consensusScore: 78
        }
    };
    res.json({ success: true, analytics: stats });
});

// SPA fallback
app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Not found' });
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== START SERVER ====================
server.listen(PORT, () => {
    console.log(`
🚀 THORAXLAB v4.2.0
===================
📡 Port: ${PORT}
🌐 URL: http://localhost:${PORT}
🔗 Health: /health
👤 Test: Name="Admin", Email="admin"

💡 Simple & Stable Version
`);
});
