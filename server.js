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
const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';

// ==================== INITIALIZATION ====================
const app = express();
const server = createServer(app);

// ==================== BASIC CONFIG ====================
const config = {
  app: {
    name: 'ThoraxLab Research Platform',
    version: '4.0.0'
  },
  security: {
    sessionDuration: 7 * 24 * 60 * 60 * 1000 // 7 days
  },
  paths: {
    data: __dirname,
    public: path.join(__dirname, 'public')
  }
};

// ==================== MIDDLEWARE ====================
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: true,
  credentials: true
}));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use(express.static('public'));

// ==================== SOCKET.IO SETUP ====================
const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true
  }
});

// ==================== SIMPLE DATA SERVICE ====================
class SimpleDataService {
  constructor() {
    this.researchData = null;
    this.sessionsData = {};
  }

  async initialize() {
    try {
      console.log('🚀 Initializing data service...');
      
      // Load or create research data
      await this.loadResearchData();
      
      console.log('✅ Data service initialized');
      return true;
    } catch (error) {
      console.error('❌ Data service init error:', error);
      // Create default data
      this.researchData = {
        metadata: {
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          lastModified: new Date().toISOString()
        },
        projects: {},
        users: {},
        discussions: {},
        analytics: {
          totalProjects: 0,
          totalUsers: 0,
          totalDiscussions: 0,
          consensusRate: 75
        },
        activity: []
      };
      return false;
    }
  }

  async loadResearchData() {
    const filePath = path.join(config.paths.data, 'research.json');
    
    try {
      await fs.access(filePath);
      const data = await fs.readFile(filePath, 'utf8');
      this.researchData = JSON.parse(data);
      console.log('✅ Loaded research data');
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('📝 Creating new research data...');
        this.researchData = {
          metadata: {
            version: '1.0.0',
            createdAt: new Date().toISOString(),
            lastModified: new Date().toISOString()
          },
          projects: {},
          users: {},
          discussions: {},
          analytics: {
            totalProjects: 0,
            totalUsers: 0,
            totalDiscussions: 0,
            consensusRate: 75
          },
          activity: []
        };
        await this.saveResearchData();
      } else {
        throw error;
      }
    }
  }

  async saveResearchData() {
    try {
      const filePath = path.join(config.paths.data, 'research.json');
      this.researchData.metadata.lastModified = new Date().toISOString();
      await fs.writeFile(filePath, JSON.stringify(this.researchData, null, 2));
      console.log('💾 Saved research data');
    } catch (error) {
      console.error('❌ Save error:', error);
    }
  }

  async saveSessionsData() {
    try {
      const filePath = path.join(config.paths.data, 'sessions.json');
      await fs.writeFile(filePath, JSON.stringify(this.sessionsData, null, 2));
    } catch (error) {
      console.error('❌ Save sessions error:', error);
    }
  }
}

// Initialize data service
const dataService = new SimpleDataService();

// ==================== API ROUTES ====================

// Health endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: config.app.name,
    version: config.app.version
  });
});

// API status
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    service: config.app.name,
    timestamp: new Date().toISOString()
  });
});

// ==================== FIXED LOGIN ENDPOINT ====================
app.post('/api/login', async (req, res) => {
  try {
    console.log('=== LOGIN REQUEST ===');
    console.log('Body:', req.body);
    
    // Get data with fallbacks
    const name = req.body?.name || req.body?.username || '';
    const email = req.body?.email || req.body?.identifier || '';
    const institution = req.body?.institution || 'Medical Center';
    
    console.log('Parsed:', { name, email, institution });
    
    // Validate
    if (!name.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Name is required'
      });
    }
    
    if (!email.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Email or username is required'
      });
    }
    
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanInstitution = institution.trim();
    
    // Find or create user
    let user = null;
    let userId = null;
    
    // Look for existing user
    const users = Object.values(dataService.researchData.users);
    const existingUser = users.find(u => 
      u.email.toLowerCase() === cleanEmail || 
      u.name.toLowerCase() === cleanName.toLowerCase()
    );
    
    if (existingUser) {
      console.log('Found existing user:', existingUser.id);
      user = existingUser;
      userId = user.id;
      
      // Update user
      user.name = cleanName;
      user.institution = cleanInstitution;
      user.lastActivity = new Date().toISOString();
      user.updatedAt = new Date().toISOString();
    } else {
      // Create new user
      userId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      console.log('Creating new user:', userId);
      
      user = {
        id: userId,
        name: cleanName,
        email: cleanEmail,
        institution: cleanInstitution,
        role: 'clinician',
        specialty: 'pulmonology',
        impactScore: 100,
        projects: [],
        votesGiven: 0,
        discussionsStarted: 0,
        commentsPosted: 0,
        preferences: {
          theme: 'medical-blue',
          notifications: true
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastActivity: new Date().toISOString()
      };
      
      // Special handling for admin
      if (cleanEmail === 'admin' || cleanEmail === 'Admin') {
        user.role = 'administrator';
        user.impactScore = 1000;
        user.isAdmin = true;
      }
      
      dataService.researchData.users[userId] = user;
      dataService.researchData.analytics.totalUsers = Object.keys(dataService.researchData.users).length;
    }
    
    // Create session
    const sessionId = `session-${uuidv4()}`;
    dataService.sessionsData[sessionId] = {
      id: sessionId,
      userId,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + config.security.sessionDuration).toISOString(),
      lastActivity: new Date().toISOString(),
      ip: req.ip,
      userAgent: req.headers['user-agent'] || 'unknown'
    };
    
    // Log activity
    dataService.researchData.activity.push({
      id: `act-${Date.now()}`,
      userId,
      action: 'login',
      timestamp: new Date().toISOString(),
      details: { institution: cleanInstitution }
    });
    
    // Save data
    await dataService.saveResearchData();
    await dataService.saveSessionsData();
    
    // Prepare response
    const response = {
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        institution: user.institution,
        role: user.role,
        impactScore: user.impactScore,
        projectCount: user.projects?.length || 0
      },
      session: {
        id: sessionId,
        expiresAt: dataService.sessionsData[sessionId].expiresAt
      }
    };
    
    // Set cookie
    res.cookie('sessionId', sessionId, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: config.security.sessionDuration
    });
    
    console.log('✅ Login successful for:', user.name);
    res.json(response);
    
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed. Please try again.',
      details: error.message
    });
  }
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
  try {
    const sessionId = req.cookies?.sessionId || 
                     req.headers.authorization?.replace('Bearer ', '');
    
    if (sessionId && dataService.sessionsData[sessionId]) {
      delete dataService.sessionsData[sessionId];
      dataService.saveSessionsData();
    }
    
    res.clearCookie('sessionId');
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
app.get('/api/me', (req, res) => {
  try {
    const sessionId = req.cookies?.sessionId || 
                     req.headers.authorization?.replace('Bearer ', '');
    
    if (!sessionId || !dataService.sessionsData[sessionId]) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated'
      });
    }
    
    const session = dataService.sessionsData[sessionId];
    const user = dataService.researchData.users[session.userId];
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        institution: user.institution,
        role: user.role,
        impactScore: user.impactScore
      }
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user info'
    });
  }
});

// ==================== BASIC PROJECTS API ====================
app.get('/api/projects', (req, res) => {
  try {
    const projects = Object.values(dataService.researchData.projects);
    
    res.json({
      success: true,
      projects: projects.map(p => ({
        id: p.id,
        title: p.title,
        description: p.description,
        status: p.status,
        lead: p.lead,
        createdAt: p.createdAt
      })),
      count: projects.length
    });
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load projects'
    });
  }
});

app.post('/api/projects', async (req, res) => {
  try {
    const { title, description } = req.body;
    
    if (!title || !description) {
      return res.status(400).json({
        success: false,
        error: 'Title and description are required'
      });
    }
    
    // Check authentication
    const sessionId = req.cookies?.sessionId || 
                     req.headers.authorization?.replace('Bearer ', '');
    const session = sessionId ? dataService.sessionsData[sessionId] : null;
    const user = session ? dataService.researchData.users[session.userId] : null;
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    const projectId = `project-${Date.now()}`;
    const now = new Date().toISOString();
    
    const project = {
      id: projectId,
      title: title.trim(),
      description: description.trim(),
      status: 'planning',
      lead: user.name,
      leadId: user.id,
      teamMembers: [user.id],
      createdAt: now,
      updatedAt: now
    };
    
    dataService.researchData.projects[projectId] = project;
    dataService.researchData.analytics.totalProjects = Object.keys(dataService.researchData.projects).length;
    
    // Add project to user
    if (!user.projects) user.projects = [];
    user.projects.push(projectId);
    
    await dataService.saveResearchData();
    
    res.status(201).json({
      success: true,
      project,
      message: 'Project created successfully'
    });
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create project'
    });
  }
});

// ==================== SOCKET.IO HANDLERS ====================
io.on('connection', (socket) => {
  console.log('🔌 Socket connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('🔌 Socket disconnected:', socket.id);
  });
});

// ==================== ERROR HANDLING ====================
// 404 handler
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'API endpoint not found',
    path: req.originalUrl
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('🔥 Server error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: isProduction ? undefined : err.message
  });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(config.paths.public, 'index.html'));
});

// ==================== START SERVER ====================
async function startServer() {
  try {
    // Initialize data
    await dataService.initialize();
    
    // Start server
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`
🎯 THORAXLAB RESEARCH PLATFORM
=========================================
🌐 Server URL: http://localhost:${PORT}
🚀 Health Check: http://localhost:${PORT}/health
📊 API Status: http://localhost:${PORT}/api/status
👥 Dashboard: http://localhost:${PORT}/

📈 STATISTICS:
   • Users: ${Object.keys(dataService.researchData.users).length}
   • Projects: ${Object.keys(dataService.researchData.projects).length}
   • Sessions: ${Object.keys(dataService.sessionsData).length}

🔧 FEATURES:
   ✅ Simple authentication
   ✅ Project management
   ✅ Real-time sockets
   ✅ Basic analytics
   ✅ Error handling

💡 Server started on port ${PORT}
      `);
    });
  } catch (error) {
    console.error('💥 Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Start the server
startServer().catch(console.error);
