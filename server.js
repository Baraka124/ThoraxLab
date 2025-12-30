import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const app = express();
const server = createServer(app);

// ==================== SIMPLE DATA STORE ====================
class DataStore {
    constructor() {
        this.projects = {};
        this.discussions = {};
        this.comments = {};
        this.activities = [];
    }

    createProject(data) {
        const projectId = `project_${uuidv4()}`;
        const project = {
            id: projectId,
            title: data.title.trim(),
            description: data.description.trim(),
            problem: data.problem.trim(),
            stage: data.stage || 'ideation',
            tags: data.tags || [],
            stakeholders: data.stakeholder ? [data.stakeholder] : [],
            metrics: { discussions: 0, comments: 0 },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        this.projects[projectId] = project;
        this.addActivity('project_created', { projectId, title: project.title });
        return project;
    }

    createDiscussion(data) {
        const discussionId = `disc_${uuidv4()}`;
        const discussion = {
            id: discussionId,
            projectId: data.projectId,
            title: data.title.trim(),
            content: data.content.trim(),
            author: data.author,
            tags: data.tags || [],
            comments: [],
            createdAt: new Date().toISOString()
        };
        
        this.discussions[discussionId] = discussion;
        
        if (this.projects[data.projectId]) {
            this.projects[data.projectId].metrics.discussions++;
            this.projects[data.projectId].updatedAt = new Date().toISOString();
        }
        
        this.addActivity('discussion_created', { discussionId, title: discussion.title });
        return discussion;
    }

    addComment(data) {
        const commentId = `comment_${uuidv4()}`;
        const comment = {
            id: commentId,
            discussionId: data.discussionId,
            content: data.content.trim(),
            author: data.author,
            createdAt: new Date().toISOString()
        };
        
        this.comments[commentId] = comment;
        
        if (this.discussions[data.discussionId]) {
            this.discussions[data.discussionId].comments.push(commentId);
            
            const projectId = this.discussions[data.discussionId].projectId;
            if (projectId && this.projects[projectId]) {
                this.projects[projectId].metrics.comments++;
                this.projects[projectId].updatedAt = new Date().toISOString();
            }
        }
        
        this.addActivity('comment_added', { commentId });
        return comment;
    }

    addActivity(type, data) {
        this.activities.unshift({ type, data, timestamp: new Date().toISOString() });
        if (this.activities.length > 50) this.activities = this.activities.slice(0, 50);
    }

    getAllProjects() {
        return Object.values(this.projects).sort((a, b) => 
            new Date(b.updatedAt) - new Date(a.updatedAt)
        );
    }

    getProject(id) {
        const project = this.projects[id];
        if (!project) return null;
        
        const projectDiscussions = Object.values(this.discussions)
            .filter(d => d.projectId === id)
            .map(d => ({
                ...d,
                fullComments: d.comments.map(cid => this.comments[cid]).filter(Boolean)
            }));
        
        return { ...project, discussions: projectDiscussions };
    }
}

// ==================== INITIALIZE ====================
const dataStore = new DataStore();

// Create one sample project for demo
dataStore.createProject({
    title: "Sample Innovation Project",
    description: "This is a sample project to demonstrate the platform",
    problem: "Demonstrating how healthcare innovation collaboration works",
    stage: "ideation",
    tags: ["sample", "demo"],
    stakeholder: {
        id: 'demo_user',
        name: 'Demo User',
        type: 'clinician',
        role: 'Demo Contributor'
    }
});

// ==================== MIDDLEWARE ====================
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "https://cdn.socket.io", "'unsafe-inline'"],
            styleSrc: ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:"],
            connectSrc: ["'self'", "ws:", "wss:", "https://cdn.socket.io"],
            frameSrc: ["'self'"]
        }
    }
}));

app.use(cors());
app.use(compression());
app.use(express.json());
app.use(express.static('public'));

// ==================== SOCKET.IO ====================
const io = new Server(server, {
    cors: { origin: "*" },
    transports: ['websocket', 'polling']
});

io.on('connection', (socket) => {
    socket.on('join:project', (projectId) => {
        socket.join(`project:${projectId}`);
    });

    socket.on('project:update', (data) => {
        socket.to(`project:${data.projectId}`).emit('project:updated', data);
    });
});

// ==================== API ENDPOINTS ====================
app.get('/health', (req, res) => {
    res.json({ status: 'ok', projects: Object.keys(dataStore.projects).length });
});

app.get('/api/projects', (req, res) => {
    res.json({ success: true, data: dataStore.getAllProjects() });
});

app.get('/api/projects/:id', (req, res) => {
    const project = dataStore.getProject(req.params.id);
    if (!project) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: project });
});

app.post('/api/projects', (req, res) => {
    const { title, description, problem, stage, tags, stakeholder } = req.body;
    
    if (!title || !description || !problem) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    
    const project = dataStore.createProject({ title, description, problem, stage, tags, stakeholder });
    res.json({ success: true, data: project });
});

app.post('/api/discussions', (req, res) => {
    const { projectId, title, content, author, tags } = req.body;
    
    if (!projectId || !title || !content || !author) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    
    const discussion = dataStore.createDiscussion({ projectId, title, content, author, tags });
    io.to(`project:${projectId}`).emit('discussion:created', discussion);
    res.json({ success: true, data: discussion });
});

app.post('/api/comments', (req, res) => {
    const { discussionId, content, author } = req.body;
    
    if (!discussionId || !content || !author) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    
    const comment = dataStore.addComment({ discussionId, content, author });
    
    const discussion = dataStore.discussions[discussionId];
    if (discussion) {
        io.to(`project:${discussion.projectId}`).emit('comment:added', { discussionId, comment });
    }
    
    res.json({ success: true, data: comment });
});

// ==================== START SERVER ====================
server.listen(PORT, () => {
    console.log(`🚀 Innovation Platform running on port ${PORT}`);
});
