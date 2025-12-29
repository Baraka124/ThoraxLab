import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Initialize Express and HTTP server
const app = express();
const server = createServer(app);

// Socket.IO setup (must be before routes that might interfere)
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// ==================== MIDDLEWARE ====================
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting for API
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use('/api/', apiLimiter);

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// ==================== DATA MANAGEMENT ====================
let researchData = {
  projects: {},
  discussions: {},
  users: {},
  analytics: {
    totalProjects: 0,
    totalUsers: 0,
    totalDiscussions: 0,
    consensusRate: 75
  }
};

let sessionsData = {};

async function loadData() {
  try {
    const researchFile = await fs.readFile(path.join(__dirname, 'research.json'), 'utf8');
    researchData = JSON.parse(researchFile);
    console.log('✅ Research data loaded');
  } catch (error) {
    console.log('📝 Creating new research data...');
    await saveResearch();
  }

  try {
    const sessionsFile = await fs.readFile(path.join(__dirname, 'sessions.json'), 'utf8');
    sessionsData = JSON.parse(sessionsFile);
    console.log('✅ Sessions data loaded');
  } catch (error) {
    console.log('📝 Creating new sessions data...');
    await saveSessions();
  }
}

async function saveResearch() {
  try {
    await fs.writeFile(
      path.join(__dirname, 'research.json'),
      JSON.stringify(researchData, null, 2)
    );
  } catch (error) {
    console.error('Failed to save research:', error);
  }
}

async function saveSessions() {
  try {
    await fs.writeFile(
      path.join(__dirname, 'sessions.json'),
      JSON.stringify(sessionsData, null, 2)
    );
  } catch (error) {
    console.error('Failed to save sessions:', error);
  }
}

// ==================== API ROUTES ====================

// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    data: {
      projects: Object.keys(researchData.projects).length,
      users: Object.keys(researchData.users).length,
      discussions: Object.keys(researchData.discussions).length
    }
  });
});

// API status
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    service: 'ThoraxLab Research Platform',
    version: '3.3.0',
    timestamp: new Date().toISOString()
  });
});

// User login
app.post('/api/login', async (req, res) => {
  try {
    const { name, email, institution } = req.body;
    
    if (!name || !email) {
      return res.status(400).json({
        success: false,
        error: 'Name and email are required'
      });
    }

    const userId = `user-${uuidv4().slice(0, 8)}`;
    const sessionId = `session-${uuidv4()}`;

    // Create user
    researchData.users[userId] = {
      id: userId,
      name,
      email: email.toLowerCase(),
      role: 'clinician',
      institution: institution || 'General Hospital',
      impactScore: 100,
      projects: [],
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString()
    };

    // Create session
    sessionsData[sessionId] = {
      userId,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      lastActivity: new Date().toISOString()
    };

    await saveResearch();
    await saveSessions();

    res.json({
      success: true,
      user: {
        id: userId,
        name,
        email: email.toLowerCase(),
        institution: institution || 'General Hospital',
        role: 'clinician'
      },
      sessionId
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get all projects
app.get('/api/projects', (req, res) => {
  try {
    const projects = Object.values(researchData.projects)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({
      success: true,
      projects: projects,
      count: projects.length
    });
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({ success: false, error: 'Failed to load projects' });
  }
});

// Get single project - CRITICAL ROUTE THAT WAS MISSING
app.get('/api/projects/:id', (req, res) => {
  try {
    const projectId = req.params.id;
    const project = researchData.projects[projectId];

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    res.json({
      success: true,
      project: project
    });
  } catch (error) {
    console.error('Get project error:', error);
    res.status(500).json({ success: false, error: 'Failed to load project' });
  }
});

// Get project discussions - CRITICAL ROUTE THAT WAS MISSING
app.get('/api/projects/:id/discussions', (req, res) => {
  try {
    const projectId = req.params.id;
    const discussions = Object.values(researchData.discussions)
      .filter(d => d.projectId === projectId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({
      success: true,
      discussions: discussions,
      count: discussions.length
    });
  } catch (error) {
    console.error('Get discussions error:', error);
    res.status(500).json({ success: false, error: 'Failed to load discussions' });
  }
});

// Create project
app.post('/api/projects', async (req, res) => {
  try {
    const { title, description, status, tags, lead, leadId } = req.body;
    
    if (!title || !description) {
      return res.status(400).json({
        success: false,
        error: 'Title and description are required'
      });
    }

    const projectId = `project-${Date.now()}`;
    
    const project = {
      id: projectId,
      title: title.trim(),
      description: description.trim(),
      status: status || 'planning',
      tags: tags || ['Clinical Research'],
      lead: lead || 'Researcher',
      leadId: leadId || 'anonymous',
      discussionCount: 0,
      consensusScore: 75,
      startDate: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    researchData.projects[projectId] = project;
    researchData.analytics.totalProjects = Object.keys(researchData.projects).length;
    
    await saveResearch();

    res.json({
      success: true,
      projectId,
      project
    });

  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ success: false, error: 'Failed to create project' });
  }
});

// Get stats
app.get('/api/stats', (req, res) => {
  try {
    const projects = Object.values(researchData.projects);
    
    res.json({
      success: true,
      stats: {
        totalProjects: projects.length,
        activeProjects: projects.filter(p => p.status === 'active').length,
        totalUsers: Object.keys(researchData.users).length,
        platformConsensus: 75
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to load stats' });
  }
});

// ==================== SOCKET.IO HANDLERS ====================
io.on('connection', (socket) => {
  console.log('🔌 User connected:', socket.id);

  socket.on('joinProject', (projectId) => {
    socket.join(`project:${projectId}`);
    socket.emit('projectJoined', { projectId });
  });

  socket.on('createDiscussion', async (data) => {
    try {
      const { projectId, discussion } = data;
      
      if (!discussion?.title || !discussion?.content) {
        return;
      }

      const discussionId = `disc-${Date.now()}`;
      
      const newDiscussion = {
        id: discussionId,
        projectId,
        title: discussion.title.trim(),
        content: discussion.content.trim(),
        author: discussion.author || 'Researcher',
        authorId: discussion.authorId || 'anonymous',
        upvotes: 0,
        downvotes: 0,
        comments: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      researchData.discussions[discussionId] = newDiscussion;
      researchData.analytics.totalDiscussions = Object.keys(researchData.discussions).length;
      
      await saveResearch();

      io.to(`project:${projectId}`).emit('discussionCreated', newDiscussion);

    } catch (error) {
      console.error('Create discussion error:', error);
    }
  });

  socket.on('addComment', async (data) => {
    try {
      const { discussionId, comment } = data;
      const discussion = researchData.discussions[discussionId];
      
      if (discussion) {
        if (!discussion.comments) discussion.comments = [];
        
        const newComment = {
          id: `comment-${Date.now()}`,
          author: comment.author || 'Researcher',
          authorId: comment.authorId || 'anonymous',
          content: comment.content,
          timestamp: new Date().toISOString()
        };
        
        discussion.comments.push(newComment);
        discussion.updatedAt = new Date().toISOString();
        
        await saveResearch();

        io.emit('commentAdded', {
          discussionId,
          comment: newComment
        });
      }
    } catch (error) {
      console.error('Add comment error:', error);
    }
  });

  socket.on('vote', async (data) => {
    try {
      const { discussionId, voteType } = data;
      const discussion = researchData.discussions[discussionId];
      
      if (discussion) {
        if (voteType === 'up') {
          discussion.upvotes = (discussion.upvotes || 0) + 1;
        } else if (voteType === 'down') {
          discussion.downvotes = (discussion.downvotes || 0) + 1;
        }
        
        discussion.updatedAt = new Date().toISOString();
        await saveResearch();

        io.emit('voteUpdate', {
          discussionId,
          upvotes: discussion.upvotes || 0,
          downvotes: discussion.downvotes || 0
        });
      }
    } catch (error) {
      console.error('Vote error:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log('🔌 User disconnected:', socket.id);
  });
});

// ==================== ERROR HANDLING ====================

// 404 for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'API endpoint not found'
  });
});

// ==================== SPA FALLBACK ====================
// ⚠️ THIS MUST BE THE VERY LAST ROUTE ⚠️
// It catches everything that wasn't matched above
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== START SERVER ====================
async function startServer() {
  await loadData();
  
  server.listen(PORT, () => {
    console.log(`
✅ THORAXLAB PLATFORM RUNNING
===============================
🌐 URL: http://localhost:${PORT}
🔧 API Status: http://localhost:${PORT}/api/status
📊 Health: http://localhost:${PORT}/health
👥 Dashboard: http://localhost:${PORT}/

📈 Platform Stats:
   • Projects: ${Object.keys(researchData.projects).length}
   • Users: ${Object.keys(researchData.users).length}
   • Discussions: ${Object.keys(researchData.discussions).length}

🚀 Ready for Railway deployment!
    `);
    
    // Log all registered routes for debugging
    console.log('\n📋 Registered Routes:');
    console.log('  GET  /health');
    console.log('  GET  /api/status');
    console.log('  POST /api/login');
    console.log('  GET  /api/projects');
    console.log('  GET  /api/projects/:id');
    console.log('  GET  /api/projects/:id/discussions');
    console.log('  POST /api/projects');
    console.log('  GET  /api/stats');
    console.log('  GET  /* (SPA fallback)');
  });
}

// Global error handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

// Start the server
startServer().catch(console.error);
