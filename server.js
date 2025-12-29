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

// Configuration
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Initialize Express
const app = express();
const server = createServer(app);

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Data Service
class DataService {
  constructor() {
    this.data = { research: null, sessions: null };
  }

  async loadData() {
    try {
      // Load or create research data
      try {
        const researchData = await fs.readFile(path.join(__dirname, 'research.json'), 'utf8');
        this.data.research = JSON.parse(researchData);
        console.log('✅ Research data loaded');
      } catch (error) {
        console.log('📝 Creating new research database...');
        this.data.research = {
          projects: {},
          discussions: {},
          users: {},
          analytics: { totalProjects: 0, totalUsers: 0, totalDiscussions: 0, consensusRate: 75 },
          activity: [],
          config: { institution: 'ThoraxLab Research Platform', theme: 'medical' }
        };
        await this.saveResearch();
      }

      // Load or create sessions
      try {
        const sessionsData = await fs.readFile(path.join(__dirname, 'sessions.json'), 'utf8');
        this.data.sessions = JSON.parse(sessionsData);
        console.log('✅ Sessions data loaded');
      } catch (error) {
        console.log('📝 Creating new sessions database...');
        this.data.sessions = {};
        await this.saveSessions();
      }

      return this.data;
    } catch (error) {
      console.error('❌ Failed to load data:', error);
      // Return empty data structure instead of crashing
      return {
        research: { projects: {}, discussions: {}, users: {}, analytics: {}, activity: [] },
        sessions: {}
      };
    }
  }

  async saveResearch() {
    try {
      await fs.writeFile(
        path.join(__dirname, 'research.json'),
        JSON.stringify(this.data.research, null, 2)
      );
      return true;
    } catch (error) {
      console.error('Failed to save research:', error);
      return false;
    }
  }

  async saveSessions() {
    try {
      await fs.writeFile(
        path.join(__dirname, 'sessions.json'),
        JSON.stringify(this.data.sessions, null, 2)
      );
      return true;
    } catch (error) {
      console.error('Failed to save sessions:', error);
      return false;
    }
  }
}

const dataService = new DataService();

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// API Routes
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    service: 'ThoraxLab Research Platform',
    version: '3.3.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

app.post('/api/login', async (req, res) => {
  try {
    const { name, email, institution } = req.body;
    
    if (!name || !email || !institution) {
      return res.status(400).json({
        success: false,
        error: 'Name, email, and institution are required'
      });
    }

    const userId = 'user-' + email.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const sessionId = 'session-' + uuidv4();

    // Create user
    const userData = await dataService.loadData();
    
    if (!userData.research.users[userId]) {
      userData.research.users[userId] = {
        id: userId,
        name,
        email: email.toLowerCase(),
        role: 'clinician',
        institution,
        impactScore: 100,
        projects: [],
        createdAt: new Date().toISOString()
      };
      await dataService.saveResearch();
    }

    res.json({
      success: true,
      user: {
        id: userId,
        name,
        email: email.toLowerCase(),
        institution
      },
      sessionId
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.get('/api/projects', async (req, res) => {
  try {
    const data = await dataService.loadData();
    const projects = Object.values(data.research.projects || {});
    
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

app.post('/api/projects', async (req, res) => {
  try {
    const { title, description, status, tags, lead, leadId } = req.body;
    
    if (!title || !description) {
      return res.status(400).json({
        success: false,
        error: 'Title and description are required'
      });
    }

    const projectId = 'project-' + Date.now();
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
      createdAt: new Date().toISOString()
    };

    const data = await dataService.loadData();
    data.research.projects[projectId] = project;
    await dataService.saveResearch();

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

app.get('/api/stats', async (req, res) => {
  try {
    const data = await dataService.loadData();
    const projects = Object.values(data.research.projects || {});
    
    res.json({
      success: true,
      stats: {
        totalProjects: projects.length,
        activeProjects: projects.filter(p => p.status === 'active').length,
        totalUsers: Object.keys(data.research.users || {}).length,
        platformConsensus: 75
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to load stats' });
  }
});

// Socket.IO
io.on('connection', (socket) => {
  console.log('🔌 User connected:', socket.id);

  socket.on('joinProject', (projectId) => {
    socket.join(`project:${projectId}`);
    socket.emit('projectJoined', { projectId });
  });

  socket.on('disconnect', () => {
    console.log('🔌 User disconnected:', socket.id);
  });
});

// SPA Fallback - must be LAST
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
async function startServer() {
  await dataService.loadData();
  
  server.listen(PORT, () => {
    console.log(`
✅ THORAXLAB PLATFORM RUNNING
===============================
🌐 URL: http://localhost:${PORT}
🔧 API Status: http://localhost:${PORT}/api/status
📊 Health: http://localhost:${PORT}/health
👥 Dashboard: http://localhost:${PORT}/
🚀 Ready for Railway deployment!
    `);
  });
}

startServer().catch(console.error);
