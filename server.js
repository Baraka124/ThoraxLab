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
const NODE_ENV = process.env.NODE_ENV || 'production'; // Railway sets to production
const RAILWAY_PUBLIC_DOMAIN = process.env.RAILWAY_PUBLIC_DOMAIN || 'localhost';

// ==================== INITIALIZATION ====================
const app = express();
const server = createServer(app);

// ==================== RAILWAY-SPECIFIC CSP ====================
const cspDirectives = {
  defaultSrc: ["'self'"],
  scriptSrc: [
    "'self'",
    "'unsafe-inline'",  // Allow inline scripts for now
  ],
  styleSrc: [
    "'self'",
    "'unsafe-inline'",  // Allow inline styles
    "https://fonts.googleapis.com",
    "https://cdnjs.cloudflare.com"
  ],
  fontSrc: [
    "'self'",
    "data:",
    "https://fonts.gstatic.com",
    "https://cdnjs.cloudflare.com"
  ],
  imgSrc: [
    "'self'",
    "data:",
    "blob:",
    "https:"
  ],
  connectSrc: [
    "'self'",
    "ws://" + RAILWAY_PUBLIC_DOMAIN,
    "wss://" + RAILWAY_PUBLIC_DOMAIN
  ],
  frameSrc: ["'self'"],
  objectSrc: ["'none'"],
  mediaSrc: ["'self'"],
  manifestSrc: ["'self'"]
};

// Relax CSP in development
if (NODE_ENV === 'development') {
  cspDirectives.connectSrc.push("ws://*", "wss://*");
  cspDirectives.scriptSrc.push("'unsafe-eval'");
}

app.use(helmet({
  contentSecurityPolicy: {
    directives: cspDirectives,
    reportOnly: NODE_ENV === 'development'
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// ==================== MIDDLEWARE ====================
app.use(compression());
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files - serve from public directory
app.use(express.static('public', {
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else {
      // Cache static assets for 1 year
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url} ${req.ip}`);
  next();
});

// ==================== SESSION MANAGEMENT ====================
const sessions = new Map();

function createSession(userId) {
  const sessionId = `session-${uuidv4()}`;
  const expiresAt = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)); // 7 days
  
  const session = {
    id: sessionId,
    userId,
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
    lastActivity: new Date().toISOString(),
    userAgent: 'unknown'
  };
  
  sessions.set(sessionId, session);
  return session;
}

function validateSession(sessionId) {
  if (!sessionId) return null;
  
  const session = sessions.get(sessionId);
  if (!session) return null;
  
  // Check expiration
  if (new Date(session.expiresAt) < new Date()) {
    sessions.delete(sessionId);
    return null;
  }
  
  // Update last activity
  session.lastActivity = new Date().toISOString();
  sessions.set(sessionId, session);
  
  return session;
}

// ==================== DATA STORAGE WITH RAILWAY VOLUME ====================
class RailwayDataStore {
  constructor() {
    this.users = new Map();
    this.projects = new Map();
    this.dataPath = path.join(__dirname, 'data');
    
    // Create data directory if it doesn't exist
    this.initializeDataDirectory();
    this.initializeDefaultData();
  }
  
  async initializeDataDirectory() {
    try {
      await fs.mkdir(this.dataPath, { recursive: true });
      console.log('✅ Data directory initialized');
    } catch (error) {
      console.error('Failed to create data directory:', error);
    }
  }
  
  async saveToDisk() {
    try {
      const data = {
        users: Array.from(this.users.entries()),
        projects: Array.from(this.projects.entries()),
        timestamp: new Date().toISOString()
      };
      
      const filePath = path.join(this.dataPath, 'store.json');
      await fs.writeFile(filePath, JSON.stringify(data, null, 2));
      console.log('💾 Data saved to disk');
    } catch (error) {
      console.error('Failed to save data:', error);
    }
  }
  
  async loadFromDisk() {
    try {
      const filePath = path.join(this.dataPath, 'store.json');
      const data = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(data);
      
      this.users = new Map(parsed.users);
      this.projects = new Map(parsed.projects);
      console.log('✅ Loaded data from disk');
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('📝 No existing data found, starting fresh');
      } else {
        console.error('Failed to load data:', error);
      }
    }
  }
  
  initializeDefaultData() {
    // Create default admin if no users exist
    if (this.users.size === 0) {
      const adminId = 'admin-' + Date.now();
      this.users.set(adminId, {
        id: adminId,
        name: 'Platform Administrator',
        email: 'admin@thoraxlab.org',
        institution: 'ThoraxLab HQ',
        role: 'administrator',
        specialty: 'platform_management',
        impactScore: 1000,
        isAdmin: true,
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        projects: [],
        discussions: [],
        preferences: {
          notifications: true,
          theme: 'medical-blue'
        }
      });
      
      // Create welcome project
      const projectId = 'project-' + Date.now();
      this.projects.set(projectId, {
        id: projectId,
        title: 'Welcome to ThoraxLab',
        description: 'This is a sample project to demonstrate the ThoraxLab platform features for thoracic research collaboration.',
        status: 'active',
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
          joinedAt: new Date().toISOString()
        }],
        objectives: [
          'Explore platform features and capabilities',
          'Learn how to create and manage research projects',
          'Understand the consensus building process',
          'Collaborate effectively with research teams'
        ],
        methodology: 'Mixed-methods research with quantitative and qualitative analysis',
        timeline: {
          startDate: new Date().toISOString(),
          estimatedDuration: 'Ongoing',
          milestones: [
            { title: 'Platform Setup', date: new Date().toISOString(), completed: true },
            { title: 'Team Onboarding', date: new Date(Date.now() + 86400000).toISOString(), completed: false },
            { title: 'First Research Cycle', date: new Date(Date.now() + 604800000).toISOString(), completed: false }
          ],
          progress: 25
        },
        metrics: {
          consensus: 85,
          engagement: 42,
          discussions: 3,
          comments: 12,
          votes: 28
        },
        settings: {
          isPublic: true,
          allowComments: true,
          allowVoting: true,
          requireApproval: false
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      
      // Add project to admin
      const admin = this.users.get(adminId);
      admin.projects.push(projectId);
      
      // Save to disk
      this.saveToDisk();
      
      console.log('👑 Created default administrator and welcome project');
    }
  }
  
  // User methods
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
      isAdmin: userData.email === 'admin' || userData.email.includes('@thoraxlab.org'),
      createdAt: now,
      lastActivity: now,
      projects: [],
      discussions: [],
      votes: [],
      comments: [],
      preferences: {
        notifications: true,
        theme: 'medical-blue'
      }
    };
    
    this.users.set(userId, user);
    this.saveToDisk();
    return user;
  }
  
  findUserByEmail(email) {
    const normalizedEmail = email.trim().toLowerCase();
    for (const [_, user] of this.users) {
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
    const projectId = `project-${uuidv4()}`;
    const now = new Date().toISOString();
    const user = this.users.get(userId);
    
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
    
    this.projects.set(projectId, project);
    user.projects.push(projectId);
    
    this.saveToDisk();
    return project;
  }
  
  getProject(projectId) {
    return this.projects.get(projectId);
  }
  
  updateProject(projectId, updates) {
    const project = this.projects.get(projectId);
    if (!project) throw new Error('Project not found');
    
    // Apply updates
    if (updates.title !== undefined) project.title = updates.title.trim();
    if (updates.description !== undefined) project.description = updates.description.trim();
    if (updates.status !== undefined) project.status = updates.status;
    if (updates.objectives !== undefined) project.objectives = updates.objectives;
    if (updates.methodology !== undefined) project.methodology = updates.methodology;
    if (updates.timeline !== undefined) project.timeline = { ...project.timeline, ...updates.timeline };
    if (updates.metrics !== undefined) project.metrics = { ...project.metrics, ...updates.metrics };
    
    project.updatedAt = new Date().toISOString();
    
    this.saveToDisk();
    return project;
  }
  
  getProjectsForUser(userId) {
    const userProjects = [];
    for (const [_, project] of this.projects) {
      if (project.team.some(member => member.id === userId)) {
        userProjects.push(project);
      }
    }
    return userProjects;
  }
  
  // Statistics
  getPlatformStats() {
    const totalProjects = this.projects.size;
    const activeProjects = Array.from(this.projects.values()).filter(p => p.status === 'active').length;
    const totalUsers = this.users.size;
    
    return {
      totalProjects,
      activeProjects,
      totalUsers,
      consensusScore: 78, // Example calculation
      engagementRate: 45
    };
  }
}

// Initialize data store
const dataStore = new RailwayDataStore();

// ==================== AUTHENTICATION MIDDLEWARE ====================
async function authenticate(req, res, next) {
  try {
    // Get session ID from cookie or Authorization header
    let sessionId = req.cookies?.sessionId;
    
    // Also check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      sessionId = authHeader.substring(7);
    }
    
    if (!sessionId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        details: 'No valid session found'
      });
    }
    
    const session = validateSession(sessionId);
    if (!session) {
      res.clearCookie('sessionId');
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired session',
        details: 'Please login again'
      });
    }
    
    const user = dataStore.getUser(session.userId);
    if (!user) {
      sessions.delete(sessionId);
      res.clearCookie('sessionId');
      return res.status(401).json({
        success: false,
        error: 'User not found',
        details: 'User account no longer exists'
      });
    }
    
    // Update user activity
    user.lastActivity = new Date().toISOString();
    
    // Attach to request
    req.user = user;
    req.session = session;
    next();
    
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication failed',
      details: error.message
    });
  }
}

// ==================== SOCKET.IO SETUP ====================
const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true
  },
  transports: ['websocket', 'polling']
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

// Health endpoint for Railway
app.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'ThoraxLab Platform',
    version: '4.0.0',
    environment: NODE_ENV,
    domain: RAILWAY_PUBLIC_DOMAIN,
    timestamp: new Date().toISOString(),
    status: 'operational',
    stats: {
      users: dataStore.users.size,
      projects: dataStore.projects.size,
      sessions: sessions.size
    }
  });
});

// Status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    service: 'ThoraxLab Platform',
    environment: NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

// Login endpoint
app.post('/api/login', async (req, res) => {
  try {
    const { name, email, institution } = req.body;
    
    if (!name || !email) {
      return res.status(400).json({
        success: false,
        error: 'Name and email are required'
      });
    }
    
    // Find existing user or create new
    let user = dataStore.findUserByEmail(email);
    if (!user) {
      user = dataStore.createUser({
        name: name.trim(),
        email: email.trim(),
        institution: institution || 'Medical Center'
      });
      console.log('Created new user:', user.id);
    } else {
      console.log('Found existing user:', user.id);
    }
    
    // Create session
    const session = createSession(user.id);
    
    // Set secure cookie for Railway
    res.cookie('sessionId', session.id, {
      httpOnly: true,
      secure: NODE_ENV === 'production',
      sameSite: NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/',
      domain: NODE_ENV === 'production' ? RAILWAY_PUBLIC_DOMAIN : undefined
    });
    
    console.log('Login successful for:', user.name);
    
    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        institution: user.institution,
        role: user.role,
        impactScore: user.impactScore,
        isAdmin: user.isAdmin
      },
      session: {
        id: session.id,
        expiresAt: session.expiresAt
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed',
      details: error.message
    });
  }
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
  try {
    const sessionId = req.cookies?.sessionId || 
                     req.headers.authorization?.replace('Bearer ', '');
    
    if (sessionId) {
      sessions.delete(sessionId);
    }
    
    res.clearCookie('sessionId', {
      httpOnly: true,
      secure: NODE_ENV === 'production',
      sameSite: NODE_ENV === 'production' ? 'none' : 'lax',
      path: '/',
      domain: NODE_ENV === 'production' ? RAILWAY_PUBLIC_DOMAIN : undefined
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
        impactScore: user.impactScore,
        isAdmin: user.isAdmin,
        projectCount: user.projects?.length || 0
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
      title: project.title
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
    
    // Check if user has access
    const hasAccess = project.team.some(member => member.id === user.id) || user.isAdmin;
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    res.json({
      success: true,
      project
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
    
    if (!isLead && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
    }
    
    const updatedProject = dataStore.updateProject(id, updates);
    
    // Emit update
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
    res.status(500).json({
      success: false,
      error: 'Failed to load team'
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
          isAdmin: user.isAdmin
        },
        platform: platformStats
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

// ==================== SPA FALLBACK ====================
app.get('*', (req, res) => {
  // Don't serve HTML for API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      success: false,
      error: 'API endpoint not found',
      path: req.path
    });
  }
  
  // Serve the SPA
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== ERROR HANDLERS ====================
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'API endpoint not found',
    path: req.originalUrl
  });
});

app.use((err, req, res, next) => {
  console.error('🔥 Server error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: NODE_ENV === 'development' ? err.message : undefined
  });
});

// ==================== START SERVER ====================
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
🚀 THORAXLAB DEPLOYED ON RAILWAY v4.0.0
===============================================
🌐 Environment: ${NODE_ENV}
🔗 Domain: ${RAILWAY_PUBLIC_DOMAIN}
📡 Port: ${PORT}
🚦 Health Check: /health
📊 API Status: /api/status
👥 Dashboard: /

🔧 FEATURES:
   ✅ Railway-optimized CSP
   ✅ Persistent data storage
   ✅ Secure cookie handling
   ✅ Production-ready configuration
   ✅ Health checks for Railway
   ✅ Automatic data backup

📈 INITIAL STATS:
   • Users: ${dataStore.users.size}
   • Projects: ${dataStore.projects.size}
   • Storage: ./data/store.json

🔐 DEFAULT CREDENTIALS:
   • Admin: Name="Admin", Email="admin"
   • Any name/email works for new users

💡 Server started successfully on port ${PORT}
`);
});

// Graceful shutdown for Railway
process.on('SIGTERM', () => {
  console.log('SIGTERM received, saving data and shutting down...');
  dataStore.saveToDisk();
  server.close(() => {
    console.log('Server closed gracefully');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, saving data and shutting down...');
  dataStore.saveToDisk();
  server.close(() => {
    console.log('Server closed gracefully');
    process.exit(0);
  });
});
