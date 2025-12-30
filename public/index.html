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
const NODE_ENV = process.env.NODE_ENV || 'production';
const isProduction = NODE_ENV === 'production';

const app = express();
const server = createServer(app);

// ==================== INNOVATION PLATFORM DATA STORE ====================
class InnovationPlatform {
    constructor() {
        this.dataPath = path.join(__dirname, 'innovation_data.json');
        this.data = {
            projects: {},
            discussions: {},
            comments: {},
            activities: []
        };
        this.initializeData();
    }

    async initializeData() {
        try {
            const fileData = await fs.readFile(this.dataPath, 'utf8');
            this.data = JSON.parse(fileData);
            console.log(`📊 Loaded ${Object.keys(this.data.projects).length} innovation projects`);
        } catch (error) {
            if (error.code === 'ENOENT') {
                await this.createSampleInnovationData();
                console.log('🚀 Created innovation platform with sample data');
            } else {
                console.error('Data initialization error:', error);
            }
        }
        // Auto-save every 5 minutes
        setInterval(() => this.saveData(), 300000);
    }

    async createSampleInnovationData() {
        // Create real, multi-stakeholder innovation projects
        const project1 = this.createProject({
            title: "AI-Powered Early Lung Cancer Detection",
            description: "Developing an AI algorithm that can detect early-stage lung cancer from CT scans with higher accuracy than current methods.",
            stage: "validation",
            problem: "Late-stage diagnosis of lung cancer leads to poor survival rates. Current screening misses 20% of early cases.",
            stakeholders: [
                { id: 'clinician_1', name: 'Dr. Sarah Chen', type: 'clinician', role: 'Thoracic Surgeon', organization: 'Mass General' },
                { id: 'researcher_1', name: 'Dr. Michael Park', type: 'researcher', role: 'AI Researcher', organization: 'MIT CSAIL' },
                { id: 'industry_1', name: 'MedTech AI', type: 'industry', role: 'Product Lead', organization: 'MedTech Solutions' }
            ],
            tags: ['AI/ML', 'Diagnostics', 'Oncology', 'Medical Imaging']
        });

        const project2 = this.createProject({
            title: "Smart Post-Op Monitoring Platform",
            description: "IoT-based wearable system for continuous monitoring of thoracic surgery patients post-discharge.",
            stage: "development",
            problem: "30% of post-thoracotomy patients experience complications after discharge, often detected too late.",
            stakeholders: [
                { id: 'clinician_2', name: 'Dr. James Wilson', type: 'clinician', role: 'Pulmonologist', organization: 'Cleveland Clinic' },
                { id: 'industry_2', name: 'IoT Health', type: 'industry', role: 'CTO', organization: 'IoT Health Tech' },
                { id: 'patient_1', name: 'Robert Kim', type: 'patient', role: 'Patient Advocate', organization: 'Lung Health Alliance' }
            ],
            tags: ['IoT', 'Remote Monitoring', 'Patient Safety', 'Wearables']
        });

        const project3 = this.createProject({
            title: "Minimally Invasive Stapler Enhancement",
            description: "Redesigning surgical stapler mechanism for better tissue handling in VATS procedures.",
            stage: "ideation",
            problem: "Current staplers cause tissue damage in 15% of VATS lobectomies, leading to complications.",
            stakeholders: [
                { id: 'clinician_3', name: 'Dr. Elena Rodriguez', type: 'clinician', role: 'Thoracic Surgeon', organization: 'Mayo Clinic' },
                { id: 'industry_3', name: 'Surgical Innovations', type: 'industry', role: 'Engineer', organization: 'Precision Surgical' },
                { id: 'investor_1', name: 'HealthTech Ventures', type: 'investor', role: 'Partner', organization: 'HealthTech Capital' }
            ],
            tags: ['Medical Devices', 'Surgical Tools', 'Minimally Invasive']
        });

        // Create real discussions
        this.createDiscussion(project1.id, {
            title: "Clinical Validation Study Design",
            content: "We need to design a multi-center trial for validating the AI algorithm. Should we focus on retrospective data first or go straight to prospective?",
            author: { id: 'clinician_1', name: 'Dr. Sarah Chen', type: 'clinician' },
            tags: ['Clinical Trials', 'Validation', 'Study Design']
        });

        this.createDiscussion(project2.id, {
            title: "FDA Regulatory Pathway",
            content: "Discussing whether to pursue 510(k) clearance or De Novo classification for the monitoring platform.",
            author: { id: 'industry_2', name: 'IoT Health', type: 'industry' },
            tags: ['Regulatory', 'FDA', 'Compliance']
        });

        await this.saveData();
    }

    createProject(data) {
        const projectId = `project_${uuidv4()}`;
        const now = new Date().toISOString();
        
        const project = {
            id: projectId,
            title: data.title.trim(),
            description: data.description.trim(),
            problem: data.problem.trim(),
            stage: data.stage || 'ideation',
            tags: data.tags || [],
            stakeholders: data.stakeholders || [],
            metrics: {
                discussions: 0,
                comments: 0,
                files: 0,
                activityScore: 0
            },
            timeline: {
                created: now,
                updated: now,
                milestones: []
            },
            createdAt: now,
            updatedAt: now
        };

        this.data.projects[projectId] = project;
        this.addActivity({
            type: 'project_created',
            projectId,
            title: project.title,
            timestamp: now,
            author: data.stakeholders?.[0] || { name: 'Anonymous', type: 'anonymous' }
        });

        return project;
    }

    createDiscussion(projectId, data) {
        const discussionId = `disc_${uuidv4()}`;
        const now = new Date().toISOString();
        
        const discussion = {
            id: discussionId,
            projectId,
            title: data.title.trim(),
            content: data.content.trim(),
            author: data.author,
            tags: data.tags || [],
            comments: [],
            metrics: {
                likes: 0,
                views: 0
            },
            createdAt: now,
            updatedAt: now
        };

        this.data.discussions[discussionId] = discussion;
        
        // Update project metrics
        if (this.data.projects[projectId]) {
            this.data.projects[projectId].metrics.discussions++;
            this.data.projects[projectId].updatedAt = now;
        }

        this.addActivity({
            type: 'discussion_created',
            projectId,
            discussionId,
            title: discussion.title,
            timestamp: now,
            author: data.author
        });

        return discussion;
    }

    addComment(discussionId, data) {
        const commentId = `comment_${uuidv4()}`;
        const now = new Date().toISOString();
        
        const comment = {
            id: commentId,
            discussionId,
            content: data.content.trim(),
            author: data.author,
            createdAt: now
        };

        this.data.comments[commentId] = comment;
        
        // Add to discussion
        if (this.data.discussions[discussionId]) {
            this.data.discussions[discussionId].comments.push(commentId);
            this.data.discussions[discussionId].updatedAt = now;
            
            // Update project metrics
            const projectId = this.data.discussions[discussionId].projectId;
            if (projectId && this.data.projects[projectId]) {
                this.data.projects[projectId].metrics.comments++;
                this.data.projects[projectId].updatedAt = now;
            }
        }

        this.addActivity({
            type: 'comment_added',
            discussionId,
            commentId,
            timestamp: now,
            author: data.author
        });

        return comment;
    }

    addActivity(activity) {
        this.data.activities.unshift(activity);
        // Keep only last 100 activities
        if (this.data.activities.length > 100) {
            this.data.activities = this.data.activities.slice(0, 100);
        }
    }

    async saveData() {
        try {
            await fs.writeFile(this.dataPath, JSON.stringify(this.data, null, 2));
        } catch (error) {
            console.error('Save data error:', error);
        }
    }

    // Query methods
    getAllProjects() {
        return Object.values(this.data.projects).sort((a, b) => 
            new Date(b.updatedAt) - new Date(a.updatedAt)
        );
    }

    getProject(id) {
        const project = this.data.projects[id];
        if (!project) return null;

        // Get project discussions
        const projectDiscussions = Object.values(this.data.discussions)
            .filter(d => d.projectId === id)
            .map(discussion => ({
                ...discussion,
                fullComments: discussion.comments.map(commentId => 
                    this.data.comments[commentId]
                ).filter(Boolean)
            }));

        return {
            ...project,
            discussions: projectDiscussions,
            recentActivity: this.data.activities
                .filter(a => a.projectId === id)
                .slice(0, 10)
        };
    }

    getRecentActivity(limit = 20) {
        return this.data.activities.slice(0, limit);
    }
}

// ==================== INITIALIZE PLATFORM ====================
const innovationPlatform = new InnovationPlatform();

// ==================== EXPRESS SETUP ====================
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
    }
}));

app.use(cors({
    origin: function(origin, callback) {
        // Allow all origins for development
        if (NODE_ENV === 'development') return callback(null, true);
        
        const allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:5173',
            'https://thoraxlab.up.railway.app',
            /\.railway\.app$/,
            /\.healthcare-innovation\.org$/
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
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use(express.static('public', {
    maxAge: isProduction ? '1y' : '0',
    setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
    }
}));

// ==================== SOCKET.IO FOR REAL-TIME COLLABORATION ====================
const io = new Server(server, {
    cors: {
        origin: NODE_ENV === 'development' ? '*' : [
            'https://thoraxlab.up.railway.app',
            /\.railway\.app$/,
            /\.healthcare-innovation\.org$/
        ],
        credentials: true
    },
    transports: ['websocket', 'polling']
});

// Track active users per project
const activeUsers = new Map();

io.on('connection', (socket) => {
    console.log(`🔌 Real-time connection: ${socket.id}`);

    socket.on('join:project', (projectId) => {
        socket.join(`project:${projectId}`);
        
        // Track active user
        if (!activeUsers.has(projectId)) {
            activeUsers.set(projectId, new Set());
        }
        activeUsers.get(projectId).add(socket.id);
        
        // Notify others
        socket.to(`project:${projectId}`).emit('user:joined', {
            userId: socket.id,
            timestamp: new Date().toISOString(),
            activeUsers: activeUsers.get(projectId).size
        });

        console.log(`💡 User joined project: ${projectId} (${activeUsers.get(projectId).size} active)`);
    });

    socket.on('project:update', (data) => {
        const { projectId, updateType, data: updateData } = data;
        
        // Broadcast to all in project room
        socket.to(`project:${projectId}`).emit('project:updated', {
            projectId,
            updateType,
            data: updateData,
            timestamp: new Date().toISOString()
        });
    });

    socket.on('discussion:create', async (data) => {
        const { projectId, title, content, author, tags } = data;
        
        const discussion = innovationPlatform.createDiscussion(projectId, {
            title,
            content,
            author,
            tags
        });

        // Broadcast new discussion
        io.to(`project:${projectId}`).emit('discussion:created', discussion);
    });

    socket.on('comment:add', async (data) => {
        const { discussionId, content, author } = data;
        
        const comment = innovationPlatform.addComment(discussionId, {
            content,
            author
        });

        // Get discussion for projectId
        const discussion = innovationPlatform.data.discussions[discussionId];
        if (discussion) {
            io.to(`project:${discussion.projectId}`).emit('comment:added', {
                discussionId,
                comment
            });
        }
    });

    socket.on('disconnect', () => {
        // Remove from active users
        activeUsers.forEach((users, projectId) => {
            if (users.has(socket.id)) {
                users.delete(socket.id);
                io.to(`project:${projectId}`).emit('user:left', {
                    userId: socket.id,
                    timestamp: new Date().toISOString(),
                    activeUsers: users.size
                });
            }
        });
        console.log(`🔌 Socket disconnected: ${socket.id}`);
    });
});

// ==================== API ENDPOINTS ====================

// Health check for Railway
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        platform: 'ThoraxLab Innovation Platform',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        stats: {
            projects: Object.keys(innovationPlatform.data.projects).length,
            discussions: Object.keys(innovationPlatform.data.discussions).length,
            comments: Object.keys(innovationPlatform.data.comments).length
        }
    });
});

// Get all innovation projects
app.get('/api/projects', (req, res) => {
    try {
        const projects = innovationPlatform.getAllProjects();
        res.json({
            success: true,
            data: projects,
            count: projects.length
        });
    } catch (error) {
        console.error('Get projects error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load innovation projects'
        });
    }
});

// Get single project with discussions
app.get('/api/projects/:id', (req, res) => {
    try {
        const projectId = req.params.id;
        const project = innovationPlatform.getProject(projectId);
        
        if (!project) {
            return res.status(404).json({
                success: false,
                error: 'Innovation project not found'
            });
        }

        res.json({
            success: true,
            data: project
        });
    } catch (error) {
        console.error('Get project error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load project'
        });
    }
});

// Create new innovation project
app.post('/api/projects', (req, res) => {
    try {
        const { title, description, problem, stage, tags, stakeholder } = req.body;
        
        if (!title || !description || !problem) {
            return res.status(400).json({
                success: false,
                error: 'Title, description, and problem are required'
            });
        }

        const project = innovationPlatform.createProject({
            title,
            description,
            problem,
            stage: stage || 'ideation',
            tags: tags || [],
            stakeholders: stakeholder ? [{
                id: `temp_${uuidv4()}`,
                name: stakeholder.name || 'Anonymous',
                type: stakeholder.type || 'anonymous',
                role: stakeholder.role || 'Contributor',
                organization: stakeholder.organization || 'Independent'
            }] : []
        });

        res.status(201).json({
            success: true,
            data: project,
            message: 'Innovation project created successfully'
        });
    } catch (error) {
        console.error('Create project error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create innovation project'
        });
    }
});

// Create discussion
app.post('/api/discussions', (req, res) => {
    try {
        const { projectId, title, content, author, tags } = req.body;
        
        if (!projectId || !title || !content || !author) {
            return res.status(400).json({
                success: false,
                error: 'Project ID, title, content, and author are required'
            });
        }

        const discussion = innovationPlatform.createDiscussion(projectId, {
            title,
            content,
            author,
            tags: tags || []
        });

        res.status(201).json({
            success: true,
            data: discussion,
            message: 'Discussion created successfully'
        });
    } catch (error) {
        console.error('Create discussion error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create discussion'
        });
    }
});

// Add comment
app.post('/api/comments', (req, res) => {
    try {
        const { discussionId, content, author } = req.body;
        
        if (!discussionId || !content || !author) {
            return res.status(400).json({
                success: false,
                error: 'Discussion ID, content, and author are required'
            });
        }

        const comment = innovationPlatform.addComment(discussionId, {
            content,
            author
        });

        res.status(201).json({
            success: true,
            data: comment,
            message: 'Comment added successfully'
        });
    } catch (error) {
        console.error('Add comment error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to add comment'
        });
    }
});

// Get recent activity
app.get('/api/activity', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const activity = innovationPlatform.getRecentActivity(limit);
        
        res.json({
            success: true,
            data: activity,
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

// Quick join - create anonymous contributor
app.post('/api/quick-join', (req, res) => {
    try {
        const { name, type, role, organization } = req.body;
        
        const contributor = {
            id: `contrib_${uuidv4()}`,
            name: name || 'Anonymous Contributor',
            type: type || 'anonymous',
            role: role || 'Collaborator',
            organization: organization || 'Independent',
            joinedAt: new Date().toISOString()
        };

        res.json({
            success: true,
            data: contributor,
            message: 'Welcome to the innovation platform!'
        });
    } catch (error) {
        console.error('Quick join error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to join platform'
        });
    }
});

// SPA fallback
app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({
            success: false,
            error: 'API endpoint not found',
            path: req.originalUrl
        });
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
    console.error('🔥 Innovation platform error:', err);
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
🚀 THORAXLAB INNOVATION PLATFORM
===================================
📡 Server running on port ${PORT}
🌐 Environment: ${NODE_ENV}
🔒 Production: ${isProduction}
💡 Mission: Multi-stakeholder innovation collaboration

📊 PLATFORM STATUS:
   • Innovation Projects: ${Object.keys(innovationPlatform.data.projects).length}
   • Active Discussions: ${Object.keys(innovationPlatform.data.discussions).length}
   • Comments: ${Object.keys(innovationPlatform.data.comments).length}

🎯 STAKEHOLDER ACCESS:
   • No login required
   • Immediate project creation
   • Real-time collaboration
   • Role-based contributions

🔗 CRITICAL ENDPOINTS:
   • Health: http://localhost:${PORT}/health
   • Projects: http://localhost:${PORT}/api/projects
   • Quick Join: POST /api/quick-join

🌟 Ready for innovation collaboration!
`);
});

// Graceful shutdown
const gracefulShutdown = () => {
    console.log('\n🔻 Innovation platform shutting down...');
    innovationPlatform.saveData();
    console.log('💾 Platform data saved');
    
    server.close(() => {
        console.log('📴 Server closed gracefully');
        process.exit(0);
    });
    
    setTimeout(() => {
        console.log('⏰ Forcing shutdown...');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
