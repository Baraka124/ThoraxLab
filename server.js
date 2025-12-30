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
const NODE_ENV = process.env.NODE_ENV || 'development';

// ==================== INITIALIZATION ====================
const app = express();
const server = createServer(app);

// ==================== FIXED CSP CONFIGURATION ====================
// Allow Font Awesome and other necessary resources
const cspDirectives = {
  defaultSrc: ["'self'"],
  scriptSrc: [
    "'self'",
    "'unsafe-inline'",  // Allow inline scripts (for demo)
    "'unsafe-eval'"     // Allow eval for development
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
    `ws://localhost:${PORT}`,
    `ws://127.0.0.1:${PORT}`
  ],
  frameSrc: ["'self'"],
  objectSrc: ["'none'"],
  mediaSrc: ["'self'"],
  manifestSrc: ["'self'"]
};

if (NODE_ENV === 'development') {
  // Relax CSP for development
  cspDirectives.connectSrc.push("ws://*");
  cspDirectives.scriptSrc.push("'unsafe-eval'");
}

app.use(helmet({
  contentSecurityPolicy: {
    directives: cspDirectives,
    reportOnly: false
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

// ==================== SIMPLE DATA STORAGE ====================
class DataStore {
  constructor() {
    this.users = new Map();
    this.projects = new Map();
    this.discussions = new Map();
    this.comments = new Map();
    this.votes = new Map();
    
    // Create default admin
    this.initializeDefaultData();
  }
  
  initializeDefaultData() {
    // Default admin user
    const adminId = 'admin-' + Date.now();
    this.users.set(adminId, {
      id: adminId,
      name: 'Platform Admin',
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
    
    // Create a sample project
    const projectId = 'project-' + Date.now();
    this.projects.set(projectId, {
      id: projectId,
      title: 'Welcome to ThoraxLab',
      description: 'This is a sample project to demonstrate the ThoraxLab platform features.',
      status: 'active',
      lead: {
        id: adminId,
        name: 'Platform Admin',
        email: 'admin@thoraxlab.org'
      },
      team: [{
        id: adminId,
        name: 'Platform Admin',
        email: 'admin@thoraxlab.org',
        role: 'lead',
        joinedAt: new Date().toISOString()
      }],
      objectives: [
        'Explore platform features',
        'Learn how to create discussions',
        'Understand consensus building'
      ],
      methodology: 'Demonstration of research collaboration platform',
      timeline: {
        startDate: new Date().toISOString(),
        estimatedDuration: 'Ongoing',
        milestones: [],
        progress: 100
      },
      metrics: {
        consensus: 85,
        engagement: 50,
        discussions: 1,
        comments: 0,
        votes: 0
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
    
    console.log('✅ Initialized default data');
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
        'Assemble research team'
      ],
      methodology: projectData.methodology || 'To be determined',
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
    
    return project;
  }
  
  getProject(projectId) {
    return this.projects.get(projectId);
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
}

// Initialize data store
const dataStore = new DataStore();

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
    
    console.log('Auth check:', { 
      hasCookie: !!req.cookies?.sessionId, 
      hasAuthHeader: !!authHeader,
      sessionId: sessionId?.substring(0, 20) + '...'
    });
    
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
    
    const user = dataStore.users.get(session.userId);
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

// Health endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'ThoraxLab Platform',
    version: '4.0.0',
    timestamp: new Date().toISOString(),
    status: 'operational',
    stats: {
      users: dataStore.users.size,
      projects: dataStore.projects.size,
      sessions: sessions.size
    }
  });
});

// Login endpoint
app.post('/api/login', (req, res) => {
  try {
    console.log('Login attempt:', req.body);
    
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
    
    // Set cookie
    res.cookie('sessionId', session.id, {
      httpOnly: true,
      secure: NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/'
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
    
    // Apply updates
    if (updates.title !== undefined) project.title = updates.title.trim();
    if (updates.description !== undefined) project.description = updates.description.trim();
    if (updates.status !== undefined) project.status = updates.status;
    if (updates.objectives !== undefined) project.objectives = updates.objectives;
    if (updates.methodology !== undefined) project.methodology = updates.methodology;
    
    project.updatedAt = new Date().toISOString();
    
    // Emit update
    io.to(`project:${id}`).emit('project:updated', {
      projectId: id,
      updates: Object.keys(updates)
    });
    
    res.json({
      success: true,
      project,
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
      const userData = dataStore.users.get(member.id);
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

// Get project discussions (placeholder)
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
    
    // Return empty array for now (discussions feature coming soon)
    res.json({
      success: true,
      discussions: [],
      count: 0
    });
  } catch (error) {
    console.error('Get discussions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load discussions'
    });
  }
});

// Create discussion (placeholder)
app.post('/api/projects/:id/discussions', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const { title, content } = req.body;
    const user = req.user;
    
    if (!title || !content) {
      return res.status(400).json({
        success: false,
        error: 'Title and content are required'
      });
    }
    
    // Return placeholder response
    res.status(201).json({
      success: true,
      discussion: {
        id: `discussion-${uuidv4()}`,
        title,
        content,
        author: {
          id: user.id,
          name: user.name
        },
        createdAt: new Date().toISOString()
      },
      message: 'Discussion created (feature coming soon)'
    });
  } catch (error) {
    console.error('Create discussion error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create discussion'
    });
  }
});

// Get analytics
app.get('/api/analytics', authenticate, (req, res) => {
  try {
    const user = req.user;
    
    const userProjects = dataStore.getProjectsForUser(user.id);
    
    res.json({
      success: true,
      analytics: {
        user: {
          projectCount: userProjects.length,
          impactScore: user.impactScore,
          role: user.role
        },
        platform: {
          totalUsers: dataStore.users.size,
          totalProjects: dataStore.projects.size,
          activeProjects: Array.from(dataStore.projects.values()).filter(p => p.status === 'active').length
        }
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
// This must be AFTER all API routes but BEFORE error handlers
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
// 404 handler for API routes
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
    message: NODE_ENV === 'development' ? err.message : undefined
  });
});

// ==================== START SERVER ====================
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
🎯 THORAXLAB RESEARCH PLATFORM v4.0.0
===============================================
🌐 Server URL: http://localhost:${PORT}
🚀 Health Check: http://localhost:${PORT}/health
📊 API Status: http://localhost:${PORT}/api/me
👥 Dashboard: http://localhost:${PORT}/

🔧 FEATURES:
   ✅ Fixed CSP for Font Awesome
   ✅ Session-based authentication
   ✅ Project management
   ✅ Real-time WebSocket support
   ✅ In-memory data storage
   ✅ CORS enabled for development

📈 STATISTICS:
   • Users: ${dataStore.users.size}
   • Projects: ${dataStore.projects.size}
   • Active Sessions: ${sessions.size}

🔐 TEST CREDENTIALS:
   • Admin: Name="Admin", Email="admin"
   • Any name/email will work

💡 Server started on port ${PORT}
`);
});

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
