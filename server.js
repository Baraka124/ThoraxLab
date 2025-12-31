const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
const cors = require('cors');

const PORT = process.env.PORT || 3000;
const app = express();
const server = require('http').createServer(app);

// ===== SIMPLE IN-MEMORY DATABASE (Railway Compatible) =====
const db = {
    projects: [],
    comments: [],
    users: [
        {
            id: 'user_1',
            email: 'demo@thoraxlab.com',
            name: 'Dr. Sarah Chen',
            role: 'clinician',
            avatar_color: '#0A4D68',
            status: 'online'
        }
    ]
};

// Add sample project
if (db.projects.length === 0) {
    db.projects.push({
        id: 'proj_sample_1',
        title: 'AI-Powered COPD Detection',
        description: 'Machine learning algorithms for early COPD detection from chest X-rays.',
        type: 'clinical',
        status: 'active',
        created_by: 'user_1',
        pulse_score: 87,
        total_interactions: 0,
        total_comments: 0,
        total_members: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
        creator_name: 'Dr. Sarah Chen',
        creator_color: '#0A4D68'
    });
    
    db.comments.push({
        id: 'comment_1',
        project_id: 'proj_sample_1',
        user_id: 'user_1',
        user_name: 'Dr. Sarah Chen',
        user_role: 'clinician',
        avatar_color: '#0A4D68',
        content: 'Welcome to ThoraxLab! This is a sample project to demonstrate the platform.',
        created_at: new Date().toISOString()
    });
}

// ===== WEB SOCKET SERVER =====
const wss = new WebSocket.Server({ 
    server,
    clientTracking: true,
    perMessageDeflate: false // Disable compression for Railway
});

const activeClients = new Set();

wss.on('connection', (ws, req) => {
    const clientId = uuidv4();
    activeClients.add(ws);
    
    console.log(`🔗 WebSocket connected: ${clientId}`);
    
    // Send welcome message
    ws.send(JSON.stringify({
        type: 'connected',
        clientId,
        timestamp: new Date().toISOString()
    }));
    
    // Send initial platform stats
    ws.send(JSON.stringify({
        type: 'platform_stats',
        active_projects: db.projects.length,
        online_users: activeClients.size,
        total_interactions: 0,
        updated_at: new Date().toISOString(),
        status: 'excellent'
    }));
    
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            console.log(`📨 Message from ${clientId}:`, message.type);
            
            switch (message.type) {
                case 'heartbeat':
                    ws.send(JSON.stringify({ 
                        type: 'heartbeat_ack',
                        timestamp: Date.now() 
                    }));
                    break;
                    
                case 'subscribe_project':
                    // Simple subscription - just acknowledge
                    ws.send(JSON.stringify({
                        type: 'subscribed',
                        projectId: message.projectId,
                        timestamp: new Date().toISOString()
                    }));
                    break;
            }
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    });
    
    ws.on('close', () => {
        activeClients.delete(ws);
        console.log(`🔌 WebSocket disconnected: ${clientId}`);
    });
    
    ws.on('error', (error) => {
        console.error(`WebSocket error for ${clientId}:`, error);
    });
});

// Broadcast to all clients
function broadcast(message) {
    const data = JSON.stringify(message);
    activeClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}

// ===== MIDDLEWARE =====
app.use(cors({
    origin: true, // Allow all origins on Railway
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Static files with proper caching
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1h',
    setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
    }
}));

// ===== API ROUTES =====

// Health check - ALWAYS WORKS
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        environment: process.env.NODE_ENV || 'production',
        platform: 'railway',
        stats: {
            projects: db.projects.length,
            comments: db.comments.length,
            users: db.users.length,
            websocket_clients: activeClients.size
        }
    });
});

// Platform status
app.get('/api/platform/status', (req, res) => {
    res.json({
        health_score: 100,
        active_projects: db.projects.length,
        online_users: activeClients.size,
        total_interactions: 0,
        total_comments: db.comments.length,
        avg_pulse_score: 87,
        total_users: db.users.length,
        updated_at: new Date().toISOString(),
        status: 'excellent'
    });
});

// Get all projects
app.get('/api/projects', (req, res) => {
    console.log('📋 GET /api/projects - Returning', db.projects.length, 'projects');
    res.json(db.projects);
});

// Get single project
app.get('/api/projects/:id', (req, res) => {
    const projectId = req.params.id;
    const project = db.projects.find(p => p.id === projectId);
    
    if (!project) {
        console.log('❌ Project not found:', projectId);
        return res.status(404).json({ error: 'Project not found' });
    }
    
    console.log('📋 GET /api/projects/', projectId);
    res.json(project);
});

// Create project
app.post('/api/projects', (req, res) => {
    console.log('📝 POST /api/projects:', req.body);
    
    const { title, description, type = 'clinical' } = req.body;
    
    if (!title || !description) {
        return res.status(400).json({ 
            error: 'Title and description are required',
            received: { title, description, type }
        });
    }
    
    const projectId = `proj_${uuidv4()}`;
    const now = new Date().toISOString();
    
    const newProject = {
        id: projectId,
        title,
        description,
        type,
        status: 'active',
        created_by: 'user_1',
        pulse_score: 75,
        total_interactions: 0,
        total_comments: 0,
        total_members: 1,
        created_at: now,
        updated_at: now,
        last_activity_at: now,
        creator_name: 'You',
        creator_color: '#0A4D68'
    };
    
    db.projects.unshift(newProject);
    
    console.log('✅ Created project:', projectId);
    
    // Broadcast to all clients
    broadcast({
        type: 'project_created',
        project: newProject,
        timestamp: now
    });
    
    res.status(201).json(newProject);
});

// Get project comments
app.get('/api/projects/:id/comments', (req, res) => {
    const projectId = req.params.id;
    const projectComments = db.comments.filter(c => c.project_id === projectId);
    
    console.log('💬 GET /api/projects/', projectId, '/comments -', projectComments.length, 'comments');
    res.json(projectComments);
});

// Create comment
app.post('/api/comments', (req, res) => {
    console.log('📝 POST /api/comments:', req.body);
    
    const { projectId, content } = req.body;
    
    if (!projectId || !content) {
        return res.status(400).json({ 
            error: 'Project ID and content are required',
            received: { projectId, content }
        });
    }
    
    const commentId = `comment_${uuidv4()}`;
    const now = new Date().toISOString();
    
    const newComment = {
        id: commentId,
        project_id: projectId,
        user_id: 'user_1',
        user_name: 'You',
        user_role: 'clinician',
        avatar_color: '#0A4D68',
        content,
        created_at: now
    };
    
    db.comments.unshift(newComment);
    
    console.log('✅ Created comment:', commentId);
    
    // Update project comment count
    const project = db.projects.find(p => p.id === projectId);
    if (project) {
        project.total_comments = (project.total_comments || 0) + 1;
        project.last_activity_at = now;
    }
    
    // Broadcast to all clients
    broadcast({
        type: 'comment_added',
        comment: newComment,
        timestamp: now
    });
    
    res.status(201).json(newComment);
});

// Get project team
app.get('/api/projects/:id/team', (req, res) => {
    const team = db.users.map(user => ({
        ...user,
        project_role: user.id === 'user_1' ? 'Project Lead' : 'Contributor',
        joined_at: new Date().toISOString()
    }));
    
    res.json(team);
});

// Get project timeline
app.get('/api/projects/:id/timeline', (req, res) => {
    const projectId = req.params.id;
    const project = db.projects.find(p => p.id === projectId);
    
    if (!project) {
        return res.json([]);
    }
    
    const timeline = [
        {
            id: 'event_1',
            project_id: projectId,
            event_type: 'project_created',
            description: `Project "${project.title}" created`,
            user_id: 'user_1',
            user_name: 'System',
            avatar_color: '#0A4D68',
            created_at: project.created_at
        }
    ];
    
    // Add comment events
    const comments = db.comments.filter(c => c.project_id === projectId);
    comments.forEach((comment, index) => {
        timeline.push({
            id: `comment_event_${index + 1}`,
            project_id: projectId,
            event_type: 'comment_added',
            description: 'New comment added',
            user_id: comment.user_id,
            user_name: comment.user_name,
            avatar_color: comment.avatar_color,
            created_at: comment.created_at
        });
    });
    
    // Sort by date
    timeline.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    res.json(timeline.slice(0, 20)); // Return only recent 20
});

// User login
app.post('/api/auth/login', (req, res) => {
    const user = {
        id: 'user_1',
        name: 'Dr. Sarah Chen',
        role: 'clinician',
        avatar_color: '#0A4D68'
    };
    
    res.json({
        user,
        token: 'demo_token_railway',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    });
});

// Test endpoint
app.get('/api/test', (req, res) => {
    res.json({
        success: true,
        message: 'ThoraxLab API is working!',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'production',
        platform: 'railway',
        endpoints: [
            'GET  /api/health',
            'GET  /api/projects',
            'POST /api/projects',
            'GET  /api/projects/:id',
            'GET  /api/projects/:id/comments',
            'POST /api/comments',
            'POST /api/auth/login'
        ]
    });
});

// Debug endpoint
app.get('/api/debug', (req, res) => {
    res.json({
        database: {
            projects_count: db.projects.length,
            comments_count: db.comments.length,
            users_count: db.users.length,
            sample_project: db.projects[0]?.id || 'none'
        },
        websocket: {
            active_clients: activeClients.size
        },
        memory: process.memoryUsage()
    });
});

// Single page app routing
app.get('/project', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'project.html'));
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== START SERVER =====
server.listen(PORT, '0.0.0.0', () => {
    console.log(`
🚀 THORAXLAB PLATFORM v2.0 (RAILWAY EDITION)
📍 Port: ${PORT}
🌐 WebSocket: Active
💾 Database: In-memory (Railway Compatible)
🔗 URL: https://your-app.railway.app
📊 Sample Data: ${db.projects.length} projects, ${db.comments.length} comments

✅ API Endpoints Ready:
  • /api/health          - Health check
  • /api/projects        - List/Create projects
  • /api/projects/:id    - Project details
  • /api/comments        - Post comments
  • /api/auth/login      - User login
  • /api/test           - Test endpoint

✨ Frontend Features:
  • View projects
  • Create projects
  • Post comments
  • Real-time WebSocket updates
  • Project details with timeline
  • Team management
    `);
    
    // Log environment
    console.log('Environment:', {
        NODE_ENV: process.env.NODE_ENV,
        PORT: process.env.PORT,
        RAILWAY_ENVIRONMENT: process.env.RAILWAY_ENVIRONMENT
    });
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('Shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('Shutting down gracefully...');
    process.exit(0);
});
