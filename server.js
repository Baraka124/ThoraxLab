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
const NODE_ENV = process.env.NODE_ENV || 'production';
const isProduction = NODE_ENV === 'production';

const app = express();
const server = createServer(app);

// ==================== ENHANCED DATA STORE ====================
class ThoraxLabDataStore {
    constructor() {
        this.dataPath = path.join(__dirname, 'store.json');
        this.sessionsPath = path.join(__dirname, 'sessions.json');
        this.data = { users: {}, projects: {}, discussions: {}, analytics: { totalLogins: 0 } };
        this.sessions = new Map();
        
        this.initialize().catch(console.error);
    }

    async initialize() {
        await this.loadData();
        await this.loadSessions();
        this.ensureAdminUser();
        this.startAutoSave();
    }

    async loadData() {
        try {
            const fileData = await fs.readFile(this.dataPath, 'utf8');
            this.data = JSON.parse(fileData);
            console.log(`📊 Loaded: ${Object.keys(this.data.users).length} users, ${Object.keys(this.data.projects).length} projects`);
        } catch (error) {
            if (error.code === 'ENOENT') {
                await this.saveData();
                console.log('📁 Created new store.json');
            } else {
                console.error('❌ Failed to load data:', error.message);
            }
        }
    }

    async loadSessions() {
        try {
            const sessionsData = await fs.readFile(this.sessionsPath, 'utf8');
            const sessions = JSON.parse(sessionsData);
            
            // Restore sessions, filter expired ones
            const now = new Date();
            Object.entries(sessions).forEach(([id, session]) => {
                if (new Date(session.expiresAt) > now) {
                    this.sessions.set(id, session);
                }
            });
            console.log(`🔑 Restored ${this.sessions.size} active sessions`);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error('Failed to load sessions:', error.message);
            }
        }
    }

    async saveData() {
        try {
            await fs.writeFile(this.dataPath, JSON.stringify(this.data, null, 2));
        } catch (error) {
            console.error('Failed to save data:', error.message);
        }
    }

    async saveSessions() {
        try {
            const sessionsObj = Object.fromEntries(this.sessions);
            await fs.writeFile(this.sessionsPath, JSON.stringify(sessionsObj, null, 2));
        } catch (error) {
            console.error('Failed to save sessions:', error.message);
        }
    }

    startAutoSave() {
        // Save data every 5 minutes
        setInterval(() => {
            this.saveData();
            this.saveSessions();
        }, 300000);
    }

    ensureAdminUser() {
        const adminEmail = 'admin@thoraxlab.org';
        let admin = Object.values(this.data.users).find(u => u.email === adminEmail);
        
        if (!admin) {
            const adminId = 'admin-' + Date.now();
            admin = {
                id: adminId,
                name: 'Platform Administrator',
                email: adminEmail,
                institution: 'ThoraxLab HQ',
                role: 'administrator',
                specialty: 'platform_management',
                impactScore: 1000,
                isAdmin: true,
                createdAt: new Date().toISOString(),
                lastActivity: new Date().toISOString(),
                projects: [],
                discussions: [],
                preferences: { notifications: true, theme: 'medical-blue' }
            };
            
            this.data.users[adminId] = admin;
            this.saveData();
            console.log('👑 Created default administrator');
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
            specialty: userData.specialty || 'pulmonology',
            impactScore: 100,
            isAdmin: userData.email === 'admin' || userData.email === 'admin@thoraxlab.org',
            createdAt: now,
            lastActivity: now,
            projects: [],
            discussions: [],
            votes: {},
            preferences: { notifications: true, theme: 'medical-blue' }
        };
        
        this.data.users[userId] = user;
        this.data.analytics.totalLogins = (this.data.analytics.totalLogins || 0) + 1;
        this.saveData();
        
        console.log(`👤 Created user: ${user.name} (${user.email})`);
        return user;
    }

    findUserByEmail(email) {
        const normalizedEmail = email.trim().toLowerCase();
        return Object.values(this.data.users).find(user => user.email === normalizedEmail);
    }

    getUser(userId) {
        return this.data.users[userId];
    }

    updateUserActivity(userId) {
        const user = this.getUser(userId);
        if (user) {
            user.lastActivity = new Date().toISOString();
        }
    }

    // ==================== SESSION MANAGEMENT ====================
    createSession(userId) {
        const sessionId = `session-${uuidv4()}`;
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
        
        const session = {
            id: sessionId,
            userId,
            createdAt: now.toISOString(),
            expiresAt: expiresAt.toISOString(),
            lastActivity: now.toISOString(),
            userAgent: 'unknown'
        };
        
        this.sessions.set(sessionId, session);
        this.saveSessions();
        
        console.log(`🔐 Created session for user: ${userId}`);
        return session;
    }

    validateSession(sessionId) {
        if (!sessionId) {
            console.log('❌ No session ID provided');
            return null;
        }
        
        const session = this.sessions.get(sessionId);
        if (!session) {
            console.log(`❌ Session not found: ${sessionId}`);
            return null;
        }
        
        const now = new Date();
        if (new Date(session.expiresAt) < now) {
            console.log(`⌛ Session expired: ${sessionId}`);
            this.sessions.delete(sessionId);
            this.saveSessions();
            return null;
        }
        
        // Update activity
        session.lastActivity = now.toISOString();
        this.sessions.set(sessionId, session);
        
        return session;
    }

    cleanupExpiredSessions() {
        const now = new Date();
        let cleaned = 0;
        
        for (const [id, session] of this.sessions.entries()) {
            if (new Date(session.expiresAt) < now) {
                this.sessions.delete(id);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            this.saveSessions();
            console.log(`🧹 Cleaned ${cleaned} expired sessions`);
        }
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
                joinedAt: now,
                permissions: ['owner', 'edit', 'delete', 'invite']
            }],
            objectives: projectData.objectives || [
                'Define research objectives',
                'Establish methodology',
                'Assemble research team'
            ],
            methodology: projectData.methodology || 'Standard research protocol',
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
                votes: 0,
                lastActivity: now
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
        
        // Update analytics
        this.data.analytics.totalProjects = (this.data.analytics.totalProjects || 0) + 1;
        
        this.saveData();
        
        console.log(`📁 Created project: ${project.title} by ${user.name}`);
        return project;
    }

    getProject(projectId) {
        return this.data.projects[projectId];
    }

    updateProject(projectId, updates) {
        const project = this.data.projects[projectId];
        if (!project) throw new Error('Project not found');
        
        // Update allowed fields
        const allowedUpdates = ['title', 'description', 'status', 'objectives', 'methodology', 'timeline', 'metrics'];
        allowedUpdates.forEach(field => {
            if (updates[field] !== undefined) {
                project[field] = updates[field];
            }
        });
        
        project.updatedAt = new Date().toISOString();
        project.metrics.lastActivity = new Date().toISOString();
        
        this.saveData();
        return project;
    }

    getProjectsForUser(userId) {
        return Object.values(this.data.projects)
            .filter(project => project.team.some(member => member.id === userId))
            .map(p => ({
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
            }))
            .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)); // Most recent first
    }

    // ==================== DISCUSSION MANAGEMENT ====================
    createDiscussion(projectId, discussionData, userId) {
        const discussionId = `discussion-${uuidv4()}`;
        const now = new Date().toISOString();
        const user = this.getUser(userId);
        
        if (!user) throw new Error('User not found');
        
        const discussion = {
            id: discussionId,
            projectId,
            title: discussionData.title.trim(),
            content: discussionData.content.trim(),
            tags: discussionData.tags || [],
            author: {
                id: userId,
                name: user.name,
                email: user.email
            },
            metrics: {
                upvotes: 0,
                downvotes: 0,
                consensus: 0,
                voteCount: 0
            },
            comments: [],
            voters: {}, // Track who voted what
            createdAt: now,
            updatedAt: now
        };
        
        // Initialize discussions map if needed
        if (!this.data.discussions[projectId]) {
            this.data.discussions[projectId] = {};
        }
        
        this.data.discussions[projectId][discussionId] = discussion;
        
        // Update project metrics
        const project = this.getProject(projectId);
        if (project) {
            project.metrics.discussions = (project.metrics.discussions || 0) + 1;
            project.metrics.lastActivity = now;
            project.updatedAt = now;
        }
        
        // Update user activity
        user.discussions.push(discussionId);
        
        this.saveData();
        
        console.log(`💬 Created discussion: ${discussion.title} in project ${projectId}`);
        return discussion;
    }

    getDiscussions(projectId) {
        if (!this.data.discussions[projectId]) {
            return [];
        }
        
        return Object.values(this.data.discussions[projectId])
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // Newest first
    }

    // ==================== ANALYTICS ====================
    getPlatformStats() {
        const totalProjects = Object.keys(this.data.projects).length;
        const activeProjects = Object.values(this.data.projects)
            .filter(p => p.status === 'active').length;
        const totalUsers = Object.keys(this.data.users).length;
        
        // Calculate average consensus across all projects
        const projects = Object.values(this.data.projects);
        const avgConsensus = projects.length > 0 
            ? Math.round(projects.reduce((sum, p) => sum + (p.metrics.consensus || 0), 0) / projects.length)
            : 0;
        
        return {
            totalProjects,
            activeProjects,
            totalUsers,
            totalLogins: this.data.analytics.totalLogins || 0,
            consensusScore: avgConsensus,
            engagementRate: Math.min(100, Math.floor((totalUsers * 10) / (totalProjects || 1))),
            lastUpdated: new Date().toISOString()
        };
    }

    getProjectAnalytics(projectId) {
        const project = this.getProject(projectId);
        if (!project) return null;
        
        const discussions = this.getDiscussions(projectId);
        const totalComments = discussions.reduce((sum, d) => sum + d.comments.length, 0);
        const totalVotes = discussions.reduce((sum, d) => sum + d.metrics.voteCount, 0);
        
        return {
            projectMetrics: project.metrics,
            discussionStats: {
                total: discussions.length,
                active: discussions.filter(d => 
                    new Date(d.updatedAt) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
                ).length,
                comments: totalComments,
                votes: totalVotes
            },
            teamActivity: project.team.map(member => ({
                id: member.id,
                name: member.name,
                role: member.role,
                joinedAt: member.joinedAt
            })),
            timeline: project.timeline
        };
    }
}

// ==================== INITIALIZE DATA STORE ====================
const dataStore = new ThoraxLabDataStore();

// Cleanup expired sessions every hour
setInterval(() => dataStore.cleanupExpiredSessions(), 3600000);

// ==================== MIDDLEWARE CONFIGURATION ====================
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.socket.io"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "data:", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "ws:", "wss:"],
            frameSrc: ["'self'"],
            objectSrc: ["'none'"]
        }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(cors({
    origin: function(origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin && NODE_ENV === 'development') return callback(null, true);
        
        const allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:5173',
            'https://thoraxlab.up.railway.app',
            /\.railway\.app$/  // All Railway subdomains
        ];
        
        if (!origin || allowedOrigins.some(allowed => {
            if (typeof allowed === 'string') return origin === allowed;
            if (allowed instanceof RegExp) return allowed.test(origin);
            return false;
        })) {
            callback(null, true);
        } else {
            console.log('❌ CORS blocked origin:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files with cache control
app.use(express.static('public', {
    maxAge: isProduction ? '1y' : '0',
    setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
    }
}));

// Request logging middleware
app.use((req, res, next) => {
    const start = Date.now();
    const timestamp = new Date().toISOString();
    
    res.on('finish', () => {
        const duration = Date.now() - start;
        const method = req.method.padEnd(7);
        const status = res.statusCode;
        const statusColor = status >= 500 ? '31' : status >= 400 ? '33' : status >= 300 ? '36' : '32';
        
        console.log(
            `\x1b[90m${timestamp}\x1b[0m ${method} \x1b[34m${req.url}\x1b[0m ` +
            `\x1b[${statusColor}m${status}\x1b[0m ${duration}ms`
        );
    });
    
    next();
});

// ==================== AUTHENTICATION MIDDLEWARE ====================
const authenticate = (req, res, next) => {
    try {
        // Get session ID from cookie or Authorization header
        let sessionId = req.cookies?.sessionId || 
                       req.headers.authorization?.replace('Bearer ', '');
        
        console.log('🔐 Auth check:', {
            url: req.url,
            hasCookie: !!req.cookies?.sessionId,
            hasAuthHeader: !!req.headers.authorization,
            sessionId: sessionId ? `${sessionId.substring(0, 10)}...` : 'none'
        });
        
        if (!sessionId) {
            console.log('❌ No session ID provided');
            return res.status(401).json({ 
                success: false, 
                error: 'Authentication required',
                code: 'NO_SESSION'
            });
        }
        
        const session = dataStore.validateSession(sessionId);
        if (!session) {
            console.log(`❌ Invalid session: ${sessionId.substring(0, 10)}...`);
            res.clearCookie('sessionId');
            return res.status(401).json({ 
                success: false, 
                error: 'Invalid or expired session',
                code: 'INVALID_SESSION'
            });
        }
        
        const user = dataStore.getUser(session.userId);
        if (!user) {
            console.log(`❌ User not found for session: ${session.userId}`);
            dataStore.sessions.delete(sessionId);
            res.clearCookie('sessionId');
            return res.status(401).json({ 
                success: false, 
                error: 'User account not found',
                code: 'USER_NOT_FOUND'
            });
        }
        
        // Update user activity
        dataStore.updateUserActivity(user.id);
        
        // Attach to request
        req.user = user;
        req.session = session;
        
        console.log(`✅ Authenticated: ${user.name} (${user.email})`);
        next();
        
    } catch (error) {
        console.error('🔥 Auth middleware error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Authentication failed',
            details: error.message 
        });
    }
};

// ==================== SOCKET.IO SETUP ====================
const io = new Server(server, {
    cors: {
        origin: function(origin, callback) {
            // Same CORS logic as Express
            if (!origin && NODE_ENV === 'development') return callback(null, true);
            
            const allowedOrigins = [
                'http://localhost:3000',
                'http://localhost:5173',
                'https://thoraxlab.up.railway.app',
                /\.railway\.app$/
            ];
            
            if (!origin || allowedOrigins.some(allowed => {
                if (typeof allowed === 'string') return origin === allowed;
                if (allowed instanceof RegExp) return allowed.test(origin);
                return false;
            })) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        },
        credentials: true
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000
});

// Socket authentication middleware
io.use((socket, next) => {
    const sessionId = socket.handshake.auth.sessionId || 
                     socket.handshake.headers.cookie?.match(/sessionId=([^;]+)/)?.[1];
    
    if (!sessionId) {
        console.log('❌ Socket connection rejected: No session ID');
        return next(new Error('Authentication required'));
    }
    
    const session = dataStore.validateSession(sessionId);
    if (!session) {
        console.log('❌ Socket connection rejected: Invalid session');
        return next(new Error('Invalid session'));
    }
    
    const user = dataStore.getUser(session.userId);
    if (!user) {
        console.log('❌ Socket connection rejected: User not found');
        return next(new Error('User not found'));
    }
    
    socket.user = user;
    socket.session = session;
    next();
});

io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id} (${socket.user.name})`);
    
    // Join project rooms
    socket.on('join:project', (projectId) => {
        socket.join(`project:${projectId}`);
        console.log(`📁 ${socket.user.name} joined project ${projectId}`);
        
        // Notify others in the project
        socket.to(`project:${projectId}`).emit('user:joined', {
            userId: socket.user.id,
            userName: socket.user.name,
            timestamp: new Date().toISOString()
        });
    });
    
    // Create discussion
    socket.on('discussion:create', (data) => {
        const { projectId, title, content, tags } = data;
        
        try {
            const discussion = dataStore.createDiscussion(projectId, {
                title, content, tags
            }, socket.user.id);
            
            // Broadcast to project room
            io.to(`project:${projectId}`).emit('discussion:created', {
                ...discussion,
                realtime: true
            });
            
            console.log(`💬 ${socket.user.name} created discussion: ${title}`);
            
        } catch (error) {
            socket.emit('error', { message: 'Failed to create discussion', error: error.message });
        }
    });
    
    // Vote on discussion
    socket.on('discussion:vote', (data) => {
        const { discussionId, projectId, type } = data; // type: 'upvote' or 'downvote'
        
        // In a real implementation, you'd update the vote count
        // For now, just broadcast the vote
        io.to(`project:${projectId}`).emit('discussion:voted', {
            discussionId,
            userId: socket.user.id,
            userName: socket.user.name,
            type,
            timestamp: new Date().toISOString()
        });
        
        console.log(`🗳️ ${socket.user.name} voted ${type} on discussion ${discussionId}`);
    });
    
    // Add comment
    socket.on('comment:add', (data) => {
        const { discussionId, projectId, content } = data;
        
        io.to(`project:${projectId}`).emit('comment:added', {
            discussionId,
            comment: {
                id: `comment-${Date.now()}`,
                content,
                author: {
                    id: socket.user.id,
                    name: socket.user.name
                },
                createdAt: new Date().toISOString()
            },
            timestamp: new Date().toISOString()
        });
        
        console.log(`💭 ${socket.user.name} commented on discussion ${discussionId}`);
    });
    
    socket.on('disconnect', () => {
        console.log(`🔌 Socket disconnected: ${socket.id} (${socket.user.name})`);
    });
});

// ==================== API ROUTES ====================

// Health endpoint for Railway
app.get('/health', (req, res) => {
    res.json({
        success: true,
        service: 'ThoraxLab Research Platform',
        version: '4.1.0',
        environment: NODE_ENV,
        timestamp: new Date().toISOString(),
        status: 'operational',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        platform: {
            users: Object.keys(dataStore.data.users).length,
            projects: Object.keys(dataStore.data.projects).length,
            sessions: dataStore.sessions.size,
            storeSize: JSON.stringify(dataStore.data).length
        }
    });
});

// Public status endpoint
app.get('/api/status', (req, res) => {
    const stats = dataStore.getPlatformStats();
    res.json({
        success: true,
        status: 'online',
        platform: 'ThoraxLab',
        version: '4.1.0',
        timestamp: new Date().toISOString(),
        stats: {
            ...stats,
            environment: NODE_ENV,
            nodeVersion: process.version
        }
    });
});

// Login endpoint
app.post('/api/login', async (req, res) => {
    try {
        const { name, email, institution } = req.body;
        
        console.log('🔐 Login attempt:', { name, email, institution });
        
        if (!name || !email) {
            return res.status(400).json({
                success: false,
                error: 'Name and email are required',
                code: 'MISSING_FIELDS'
            });
        }
        
        // Find existing user or create new
        let user = dataStore.findUserByEmail(email);
        const isNewUser = !user;
        
        if (!user) {
            user = dataStore.createUser({ name, email, institution });
            console.log(`👤 New user created: ${user.name}`);
        } else {
            console.log(`👤 Existing user: ${user.name}`);
        }
        
        // Create session
        const session = dataStore.createSession(user.id);
        
        // Set cookie with Railway-optimized settings
        res.cookie('sessionId', session.id, {
            httpOnly: true,
            secure: isProduction, // HTTPS only in production
            sameSite: isProduction ? 'none' : 'lax', // 'none' for Railway cross-origin
            path: '/',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            domain: isProduction ? '.railway.app' : undefined // For Railway subdomains
        });
        
        console.log(`✅ Login successful: ${user.name} (${isNewUser ? 'new' : 'existing'} user)`);
        
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
                projectCount: user.projects.length,
                isNewUser
            },
            session: {
                id: session.id,
                expiresAt: session.expiresAt,
                socketToken: session.id // For Socket.io auth
            }
        });
        
    } catch (error) {
        console.error('🔥 Login error:', error);
        res.status(500).json({
            success: false,
            error: 'Login failed',
            details: error.message,
            code: 'LOGIN_FAILED'
        });
    }
});

// Logout endpoint
app.post('/api/logout', authenticate, (req, res) => {
    try {
        const sessionId = req.cookies?.sessionId || 
                         req.headers.authorization?.replace('Bearer ', '');
        
        if (sessionId) {
            dataStore.sessions.delete(sessionId);
            dataStore.saveSessions();
            console.log(`👋 ${req.user.name} logged out`);
        }
        
        res.clearCookie('sessionId', {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? 'none' : 'lax',
            path: '/'
        });
        
        res.json({
            success: true,
            message: 'Logged out successfully'
        });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            success: false,
            error: 'Logout failed'
        });
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
                specialty: user.specialty,
                impactScore: user.impactScore,
                isAdmin: user.isAdmin,
                projectCount: user.projects.length,
                createdAt: user.createdAt,
                lastActivity: user.lastActivity,
                preferences: user.preferences
            }
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get user info'
        });
    }
});

// Get all projects for user
app.get('/api/projects', authenticate, (req, res) => {
    try {
        const user = req.user;
        const projects = dataStore.getProjectsForUser(user.id);
        
        res.json({
            success: true,
            projects,
            count: projects.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Get projects error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load projects'
        });
    }
});

// Create new project
app.post('/api/projects', authenticate, (req, res) => {
    try {
        const { title, description } = req.body;
        const user = req.user;
        
        if (!title || !description) {
            return res.status(400).json({
                success: false,
                error: 'Title and description are required'
            });
        }
        
        const project = dataStore.createProject({
            title,
            description,
            status: 'planning'
        }, user.id);
        
        // Emit real-time event
        io.emit('project:created', {
            projectId: project.id,
            userId: user.id,
            userName: user.name,
            title: project.title,
            timestamp: new Date().toISOString()
        });
        
        res.status(201).json({
            success: true,
            project,
            message: 'Project created successfully'
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
app.get('/api/projects/:id', authenticate, (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;
        
        const project = dataStore.getProject(id);
        if (!project) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }
        
        // Check access
        const hasAccess = project.team.some(member => member.id === user.id) || user.isAdmin;
        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }
        
        // Get discussions for this project
        const discussions = dataStore.getDiscussions(id);
        
        res.json({
            success: true,
            project: {
                ...project,
                discussions // Include discussions in response
            }
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
app.put('/api/projects/:id', authenticate, (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const user = req.user;
        
        const project = dataStore.getProject(id);
        if (!project) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }
        
        // Check permissions
        const isLead = project.lead.id === user.id;
        const isAdmin = user.isAdmin;
        const isTeamMember = project.team.some(member => member.id === user.id);
        
        if (!isLead && !isAdmin) {
            return res.status(403).json({
                success: false,
                error: 'Insufficient permissions'
            });
        }
        
        // Regular members can only update certain fields
        if (!isLead && !isAdmin && isTeamMember) {
            const allowedFields = ['objectives', 'methodology'];
            Object.keys(updates).forEach(key => {
                if (!allowedFields.includes(key)) {
                    delete updates[key];
                }
            });
        }
        
        const updatedProject = dataStore.updateProject(id, updates);
        
        // Broadcast update
        io.to(`project:${id}`).emit('project:updated', {
            projectId: id,
            updates: Object.keys(updates),
            updatedBy: user.name,
            timestamp: new Date().toISOString()
        });
        
        res.json({
            success: true,
            project: updatedProject,
            message: 'Project updated successfully'
        });
    } catch (error) {
        console.error('Update project error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update project',
            details: error.message
        });
    }
});

// Get project team
app.get('/api/projects/:id/team', authenticate, (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;
        
        const project = dataStore.getProject(id);
        if (!project) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }
        
        // Check access
        const hasAccess = project.team.some(member => member.id === user.id) || user.isAdmin;
        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }
        
        // Enhance team data with user details
        const enhancedTeam = project.team.map(member => {
            const userData = dataStore.getUser(member.id);
            return {
                ...member,
                name: userData?.name || member.name,
                email: userData?.email || member.email,
                specialty: userData?.specialty,
                impactScore: userData?.impactScore,
                lastActivity: userData?.lastActivity,
                isOnline: false // Would need active sockets tracking
            };
        });
        
        res.json({
            success: true,
            team: enhancedTeam,
            count: enhancedTeam.length
        });
    } catch (error) {
        console.error('Get team error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load team'
        });
    }
});

// Create discussion
app.post('/api/projects/:id/discussions', authenticate, (req, res) => {
    try {
        const { id } = req.params;
        const { title, content, tags = [] } = req.body;
        const user = req.user;
        
        if (!title || !content) {
            return res.status(400).json({
                success: false,
                error: 'Title and content are required'
            });
        }
        
        const project = dataStore.getProject(id);
        if (!project) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }
        
        // Check access
        const hasAccess = project.team.some(member => member.id === user.id) || user.isAdmin;
        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }
        
        const discussion = dataStore.createDiscussion(id, {
            title,
            content,
            tags: Array.isArray(tags) ? tags : [tags]
        }, user.id);
        
        res.status(201).json({
            success: true,
            discussion,
            message: 'Discussion created successfully'
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

// Get project discussions
app.get('/api/projects/:id/discussions', authenticate, (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;
        
        const project = dataStore.getProject(id);
        if (!project) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }
        
        // Check access
        const hasAccess = project.team.some(member => member.id === user.id) || user.isAdmin;
        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }
        
        const discussions = dataStore.getDiscussions(id);
        
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
                    specialty: user.specialty,
                    isAdmin: user.isAdmin,
                    joinDate: user.createdAt,
                    lastActivity: user.lastActivity
                },
                platform: platformStats,
                userProjects: userProjects.map(p => ({
                    id: p.id,
                    title: p.title,
                    status: p.status,
                    teamSize: p.teamCount,
                    lastUpdated: p.updatedAt
                }))
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

// Get project-specific analytics
app.get('/api/analytics/projects/:id', authenticate, (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;
        
        const project = dataStore.getProject(id);
        if (!project) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }
        
        // Check access
        const hasAccess = project.team.some(member => member.id === user.id) || user.isAdmin;
        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }
        
        const analytics = dataStore.getProjectAnalytics(id);
        
        res.json({
            success: true,
            analytics
        });
    } catch (error) {
        console.error('Get project analytics error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load project analytics'
        });
    }
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'API endpoint not found',
        path: req.originalUrl
    });
});

// SPA fallback - must be last route
app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({
            success: false,
            error: 'API endpoint not found'
        });
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('🔥 Server error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: NODE_ENV === 'development' ? err.message : undefined,
        timestamp: new Date().toISOString()
    });
});

// ==================== START SERVER ====================
server.listen(PORT, '0.0.0.0', () => {
    console.log(`
🚀 THORAXLAB PLATFORM v4.1.0
===============================
📡 Server running on port ${PORT}
🌐 Environment: ${NODE_ENV}
🔒 Production: ${isProduction}
🔗 Health: http://localhost:${PORT}/health
📊 Status: http://localhost:${PORT}/api/status

📊 INITIAL STATS:
   • Users: ${Object.keys(dataStore.data.users).length}
   • Projects: ${Object.keys(dataStore.data.projects).length}
   • Active Sessions: ${dataStore.sessions.size}
   • Storage: store.json + sessions.json

👤 TEST CREDENTIALS:
   • Admin: Name="Admin", Email="admin@thoraxlab.org"
   • Any name/email works for new users

🔧 FEATURES:
   ✅ Railway-optimized cookies/sessions
   ✅ Persistent sessions across restarts
   ✅ Real-time collaboration
   ✅ Enhanced error logging
   ✅ Auto-admin creation
   ✅ Discussion system

💡 Ready for research collaboration!
`);
});

// Graceful shutdown
const gracefulShutdown = () => {
    console.log('\n🔻 Shutdown signal received...');
    
    // Save all data
    dataStore.saveData();
    dataStore.saveSessions();
    console.log('💾 Data saved');
    
    // Close server
    server.close(() => {
        console.log('📴 Server closed gracefully');
        process.exit(0);
    });
    
    // Force shutdown after 10 seconds
    setTimeout(() => {
        console.log('⏰ Forcing shutdown...');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
