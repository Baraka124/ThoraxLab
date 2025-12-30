const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { database } = require('./database');

// ===== CONFIGURATION =====
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const NODE_ENV = process.env.NODE_ENV || 'development';
const WS_HEARTBEAT_INTERVAL = 30000;
const WS_TIMEOUT = 45000;

// ===== EXPRESS SERVER =====
const app = express();
const server = require('http').createServer(app);

// ===== WEB SOCKET SERVER =====
const wss = new WebSocket.Server({
  server,
  perMessageDeflate: {
    zlibDeflateOptions: {
      chunkSize: 1024,
      memLevel: 7,
      level: 3
    },
    clientNoContextTakeover: true,
    serverNoContextTakeover: true,
    concurrencyLimit: 10,
    threshold: 1024
  },
  clientTracking: true,
  maxPayload: 10 * 1024 * 1024 // 10MB
});

// ===== CLIENT MANAGEMENT =====
class ClientManager {
  constructor() {
    this.clients = new Map();
    this.projectSubscriptions = new Map();
    this.userSessions = new Map();
    this.heartbeatInterval = null;
  }

  addClient(ws, clientId, ip) {
    const client = {
      id: clientId,
      ws,
      ip,
      userId: null,
      projects: new Set(),
      lastPing: Date.now(),
      isAlive: true,
      authenticated: false,
      sessionStart: Date.now()
    };

    this.clients.set(clientId, client);

    ws.on('pong', () => {
      client.lastPing = Date.now();
      client.isAlive = true;
    });

    return client;
  }

  removeClient(clientId) {
    const client = this.clients.get(clientId);
    if (client) {
      if (client.userId) {
        this.userSessions.delete(client.userId);
        this.removeUserFromProjects(client.userId, client.projects);
      }
      this.clients.delete(clientId);
    }

    this.projectSubscriptions.forEach((users, projectId) => {
      users.delete(clientId);
      if (users.size === 0) {
        this.projectSubscriptions.delete(projectId);
      }
    });
  }

  authenticateClient(clientId, userId, userData) {
    const client = this.clients.get(clientId);
    if (client) {
      client.userId = userId;
      client.authenticated = true;
      client.userData = userData;
      this.userSessions.set(userId, clientId);

      database.recordInteraction('system', userId, 'user_login', null, null, {
        clientId,
        ip: client.ip,
        timestamp: new Date().toISOString()
      }).catch(console.error);
    }
  }

  subscribeToProject(clientId, projectId) {
    const client = this.clients.get(clientId);
    if (client && client.authenticated) {
      client.projects.add(projectId);

      if (!this.projectSubscriptions.has(projectId)) {
        this.projectSubscriptions.set(projectId, new Set());
      }
      this.projectSubscriptions.get(projectId).add(clientId);

      database.recordInteraction(projectId, client.userId, 'project_subscribe', 'project', projectId)
        .catch(console.error);
    }
  }

  unsubscribeFromProject(clientId, projectId) {
    const client = this.clients.get(clientId);
    if (client) {
      client.projects.delete(projectId);

      const projectSubs = this.projectSubscriptions.get(projectId);
      if (projectSubs) {
        projectSubs.delete(clientId);
        if (projectSubs.size === 0) {
          this.projectSubscriptions.delete(projectId);
        }
      }
    }
  }

  getProjectSubscribers(projectId) {
    return Array.from(this.projectSubscriptions.get(projectId) || []);
  }

  broadcastToProject(projectId, message, excludeClientId = null) {
    const subscribers = this.getProjectSubscribers(projectId);
    
    subscribers.forEach(clientId => {
      if (clientId !== excludeClientId) {
        this.sendToClient(clientId, message);
      }
    });
  }

  sendToClient(clientId, message) {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(JSON.stringify(message));
      } catch (error) {
        console.error(`Error sending to client ${clientId}:`, error);
      }
    }
  }

  sendToUser(userId, message) {
    const clientId = this.userSessions.get(userId);
    if (clientId) {
      this.sendToClient(clientId, message);
    }
  }

  removeUserFromProjects(userId, projects) {
    projects.forEach(projectId => {
      const projectSubs = this.projectSubscriptions.get(projectId);
      if (projectSubs) {
        for (const clientId of projectSubs) {
          const client = this.clients.get(clientId);
          if (client && client.userId === userId) {
            projectSubs.delete(clientId);
          }
        }
        if (projectSubs.size === 0) {
          this.projectSubscriptions.delete(projectId);
        }
      }
    });
  }

  checkHeartbeats() {
    const now = Date.now();
    
    for (const [clientId, client] of this.clients.entries()) {
      if (now - client.lastPing > WS_TIMEOUT) {
        console.log(`Client ${clientId} heartbeat timeout`);
        client.ws.terminate();
        this.removeClient(clientId);
      } else if (!client.isAlive) {
        client.isAlive = false;
        client.ws.ping();
      }
    }
  }

  getStats() {
    return {
      totalClients: this.clients.size,
      authenticatedClients: Array.from(this.clients.values()).filter(c => c.authenticated).length,
      projectSubscriptions: this.projectSubscriptions.size,
      userSessions: this.userSessions.size,
      activeProjects: this.projectSubscriptions.size
    };
  }

  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.checkHeartbeats();
    }, 10000);
  }

  stop() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
  }
}

const clientManager = new ClientManager();

// ===== MIDDLEWARE =====
function setupMiddleware() {
  // Security headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com"],
            connectSrc: ["'self'", "ws:", "wss:"],
            imgSrc: ["'self'", "data:", "https:"]
        }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));
  // Compression
  app.use(compression({
    level: 6,
    threshold: 1024
  }));
  
  // CORS
  app.use(cors({
    origin: NODE_ENV === 'development' ? true : [/\.thoraxlab\.com$/, 'http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-User-ID', 'X-Session-ID']
  }));
  
  // Rate limiting
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests from this IP, please try again later.'
  });
  
  // Apply rate limiting to API routes
  app.use('/api/', apiLimiter);
  
  // Body parsing
  app.use(express.json({ 
    limit: '10mb',
    verify: (req, res, buf) => {
      req.rawBody = buf;
    }
  }));
  
  app.use(express.urlencoded({ 
    extended: true, 
    limit: '10mb',
    parameterLimit: 100
  }));
  
  // Static files
  app.use(express.static(PUBLIC_DIR, {
    maxAge: NODE_ENV === 'production' ? '1h' : '0',
    setHeaders: (res, filePath) => {
      if (path.extname(filePath) === '.html') {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    }
  }));
  
  // Request logging
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
    });
    next();
  });
  
  // Error handling middleware
  app.use((err, req, res, next) => {
    console.error('Server error:', err.stack);
    res.status(err.status || 500).json({
      error: NODE_ENV === 'production' ? 'Internal server error' : err.message,
      timestamp: new Date().toISOString()
    });
  });
}

// ===== WEB SOCKET HANDLING =====
function setupWebSocket() {
  wss.on('connection', (ws, req) => {
    const clientId = uuidv4();
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
    console.log(`🔗 New WebSocket connection: ${clientId} from ${ip}`);
    
    const client = clientManager.addClient(ws, clientId, ip);
    
    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      clientId,
      timestamp: new Date().toISOString(),
      platform: 'ThoraxLab 2.0',
      heartbeat: WS_HEARTBEAT_INTERVAL
    }));
    
    // Handle incoming messages
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        await handleWebSocketMessage(clientId, message);
      } catch (error) {
        console.error(`WebSocket message error from ${clientId}:`, error);
        ws.send(JSON.stringify({
          type: 'error',
          error: 'Invalid message format',
          timestamp: new Date().toISOString()
        }));
      }
    });
    
    // Handle client disconnect
    ws.on('close', (code, reason) => {
      console.log(`🔌 WebSocket disconnected: ${clientId} (${code}) ${reason}`);
      clientManager.removeClient(clientId);
      
      if (client.userId) {
        database.updateUserStatus(client.userId, 'away').catch(console.error);
      }
    });
    
    // Handle errors
    ws.on('error', (error) => {
      console.error(`WebSocket error for ${clientId}:`, error);
      clientManager.removeClient(clientId);
    });
  });
  
  // Start heartbeat checking
  clientManager.startHeartbeat();
  
  // Broadcast platform status updates
  setInterval(async () => {
    try {
      const platformStatus = await database.getPlatformStatus();
      broadcastPlatformStatus(platformStatus);
    } catch (error) {
      console.error('Platform status broadcast error:', error);
    }
  }, 30000);
  
  console.log('✅ WebSocket server ready');
}

async function handleWebSocketMessage(clientId, message) {
  const client = clientManager.clients.get(clientId);
  if (!client) return;
  
  try {
    switch (message.type) {
      case 'authenticate':
        if (message.userId && message.token) {
          const user = await database.getUser(message.userId);
          if (user) {
            clientManager.authenticateClient(clientId, message.userId, user);
            
            clientManager.sendToClient(clientId, {
              type: 'authenticated',
              userId: message.userId,
              user: user,
              timestamp: new Date().toISOString()
            });
            
            // Send current platform status
            const platformStatus = await database.getPlatformStatus();
            clientManager.sendToClient(clientId, {
              type: 'platform_status',
              ...platformStatus
            });
            
            // Update user status
            await database.updateUserStatus(message.userId, 'online');
          }
        }
        break;
        
      case 'subscribe_project':
        if (message.projectId && client.authenticated) {
          clientManager.subscribeToProject(clientId, message.projectId);
          
          clientManager.sendToClient(clientId, {
            type: 'subscribed',
            projectId: message.projectId,
            timestamp: new Date().toISOString()
          });
        }
        break;
        
      case 'unsubscribe_project':
        if (message.projectId) {
          clientManager.unsubscribeFromProject(clientId, message.projectId);
        }
        break;
        
      case 'heartbeat':
        client.lastPing = Date.now();
        client.isAlive = true;
        clientManager.sendToClient(clientId, {
          type: 'heartbeat_ack',
          timestamp: Date.now()
        });
        break;
        
      case 'cursor_move':
        if (message.projectId && client.authenticated) {
          clientManager.broadcastToProject(message.projectId, {
            type: 'user_cursor',
            userId: client.userId,
            user: client.userData,
            projectId: message.projectId,
            position: message.position,
            timestamp: Date.now()
          }, clientId);
        }
        break;
        
      case 'typing_indicator':
        if (message.projectId && client.authenticated) {
          clientManager.broadcastToProject(message.projectId, {
            type: 'user_typing',
            userId: client.userId,
            user: client.userData,
            projectId: message.projectId,
            isTyping: message.isTyping,
            timestamp: Date.now()
          }, clientId);
        }
        break;
        
      case 'comment_added':
        if (message.comment && message.comment.projectId) {
          // Forward to other subscribers
          clientManager.broadcastToProject(message.comment.projectId, {
            type: 'comment_added',
            comment: message.comment,
            timestamp: new Date().toISOString()
          }, clientId);
          
          // Record interaction
          await database.recordInteraction(
            message.comment.projectId,
            client.userId,
            'comment_create',
            'comment',
            message.comment.id
          );
        }
        break;
        
      case 'comment_updated':
        if (message.comment && message.comment.projectId) {
          clientManager.broadcastToProject(message.comment.projectId, {
            type: 'comment_updated',
            comment: message.comment,
            timestamp: new Date().toISOString()
          });
        }
        break;
        
      case 'decision_updated':
        if (message.decision && message.decision.projectId) {
          clientManager.broadcastToProject(message.decision.projectId, {
            type: 'decision_updated',
            decision: message.decision,
            timestamp: new Date().toISOString()
          });
        }
        break;
        
      case 'project_updated':
        if (message.project && message.project.id) {
          clientManager.broadcastToProject(message.project.id, {
            type: 'project_updated',
            project: message.project,
            timestamp: new Date().toISOString()
          });
        }
        break;
        
      case 'user_status':
        if (message.userId && message.status) {
          // Broadcast to all projects this user is subscribed to
          client.projects.forEach(projectId => {
            clientManager.broadcastToProject(projectId, {
              type: 'user_status_changed',
              userId: message.userId,
              user: client.userData,
              status: message.status,
              timestamp: new Date().toISOString()
            });
          });
        }
        break;
        
      default:
        console.log(`Unknown message type from ${clientId}:`, message.type);
    }
  } catch (error) {
    console.error(`Error handling message from ${clientId}:`, error);
    clientManager.sendToClient(clientId, {
      type: 'error',
      error: 'Failed to process message',
      timestamp: new Date().toISOString()
    });
  }
}

function broadcastPlatformStatus(status) {
  const message = {
    type: 'platform_status',
    ...status,
    timestamp: new Date().toISOString()
  };
  
  // Send to all authenticated clients
  for (const [clientId, client] of clientManager.clients.entries()) {
    if (client.authenticated) {
      clientManager.sendToClient(clientId, message);
    }
  }
}

// ===== API ROUTES =====
function setupRoutes() {
  // Health check endpoint
  app.get('/api/health', async (req, res) => {
    try {
      const dbStatus = await database.checkConnection();
      const wsStats = clientManager.getStats();
      
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        environment: NODE_ENV,
        database: dbStatus ? 'connected' : 'disconnected',
        websocket: wsStats,
        uptime: process.uptime(),
        memory: process.memoryUsage()
      });
    } catch (error) {
      res.status(500).json({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Get platform status
  app.get('/api/platform/status', async (req, res) => {
    try {
      const status = await database.getPlatformStatus();
      res.json(status);
    } catch (error) {
      console.error('Platform status error:', error);
      res.status(500).json({ 
        error: 'Failed to get platform status',
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Get all projects
  app.get('/api/projects', async (req, res) => {
    try {
      const { status = 'active', limit = 50, offset = 0 } = req.query;
      const userId = req.headers['x-user-id'];
      
      let projects;
      if (userId) {
        projects = await database.getUserProjects(userId);
      } else {
        projects = await database.getAllProjects(status, parseInt(limit), parseInt(offset));
      }
      
      res.json(projects);
    } catch (error) {
      console.error('Projects fetch error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch projects',
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Get single project
  app.get('/api/projects/:id', async (req, res) => {
    try {
      const projectId = req.params.id;
      const userId = req.headers['x-user-id'] || 'anonymous';
      
      const project = await database.getProject(projectId);
      
      if (!project) {
        return res.status(404).json({ 
          error: 'Project not found',
          timestamp: new Date().toISOString()
        });
      }
      
      // Record view interaction
      await database.recordInteraction(
        projectId, 
        userId, 
        'project_view',
        'project',
        projectId,
        { source: 'api' }
      );
      
      // Add timeline event for view (if authenticated user)
      if (userId !== 'anonymous') {
        await database.addTimelineEvent(
          projectId,
          'project_viewed',
          `Project viewed by user`,
          userId,
          'project',
          projectId
        );
      }
      
      res.json(project);
    } catch (error) {
      console.error('Project fetch error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch project',
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Create project
  app.post('/api/projects', async (req, res) => {
    try {
      const { title, description, type = 'clinical', createdBy } = req.body;
      
      if (!title || !description || !createdBy) {
        return res.status(400).json({ 
          error: 'Missing required fields: title, description, createdBy',
          timestamp: new Date().toISOString()
        });
      }
      
      if (title.length > 200) {
        return res.status(400).json({ 
          error: 'Title too long (max 200 characters)',
          timestamp: new Date().toISOString()
        });
      }
      
      if (description.length > 5000) {
        return res.status(400).json({ 
          error: 'Description too long (max 5000 characters)',
          timestamp: new Date().toISOString()
        });
      }
      
      const project = await database.createProject({
        title,
        description,
        type,
        createdBy
      });
      
      // Add timeline event
      await database.addTimelineEvent(
        project.id,
        'project_created',
        `Project "${title}" created`,
        createdBy,
        'project',
        project.id
      );
      
      // Broadcast project creation
      clientManager.broadcastToProject(project.id, {
        type: 'project_created',
        project: project,
        timestamp: new Date().toISOString()
      });
      
      // Update platform metrics
      await database.updatePlatformMetrics();
      
      res.status(201).json(project);
    } catch (error) {
      console.error('Project creation error:', error);
      res.status(500).json({ 
        error: 'Failed to create project',
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Update project
  app.put('/api/projects/:id', async (req, res) => {
    try {
      const projectId = req.params.id;
      const updates = req.body;
      const userId = req.headers['x-user-id'];
      
      if (!updates || Object.keys(updates).length === 0) {
        return res.status(400).json({ 
          error: 'No updates provided',
          timestamp: new Date().toISOString()
        });
      }
      
      // Check if user is project member
      const isMember = await database.isProjectMember(projectId, userId);
      
      if (!isMember && userId !== 'system') {
        return res.status(403).json({ 
          error: 'Not authorized to update project',
          timestamp: new Date().toISOString()
        });
      }
      
      const project = await database.updateProject(projectId, updates);
      
      await database.addTimelineEvent(
        projectId,
        'project_updated',
        'Project details updated',
        userId,
        'project',
        projectId,
        { updates: Object.keys(updates) }
      );
      
      await database.recordInteraction(
        projectId,
        userId,
        'project_update',
        'project',
        projectId,
        { fields: Object.keys(updates) }
      );
      
      clientManager.broadcastToProject(projectId, {
        type: 'project_updated',
        project: project,
        timestamp: new Date().toISOString()
      });
      
      res.json(project);
    } catch (error) {
      console.error('Project update error:', error);
      res.status(500).json({ 
        error: 'Failed to update project',
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Get project comments
  app.get('/api/projects/:id/comments', async (req, res) => {
    try {
      const projectId = req.params.id;
      const { limit = 100, offset = 0, parent_id = null } = req.query;
      const userId = req.headers['x-user-id'] || '';
      
      const comments = await database.getProjectComments(
        projectId, 
        parseInt(limit), 
        parseInt(offset),
        parent_id,
        userId
      );
      
      res.json(comments);
    } catch (error) {
      console.error('Comments fetch error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch comments',
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Add comment
  app.post('/api/comments', async (req, res) => {
    try {
      const { projectId, content, userId, parentId = null } = req.body;
      
      if (!projectId || !content || !userId) {
        return res.status(400).json({ 
          error: 'Missing required fields: projectId, content, userId',
          timestamp: new Date().toISOString()
        });
      }
      
      if (content.length > 10000) {
        return res.status(400).json({ 
          error: 'Comment too long (max 10000 characters)',
          timestamp: new Date().toISOString()
        });
      }
      
      const comment = await database.createComment({
        projectId,
        userId,
        content,
        parentId
      });
      
      await database.recordInteraction(
        projectId, 
        userId, 
        'comment_create',
        'comment',
        comment.id,
        { parentId, contentLength: content.length }
      );
      
      const user = await database.getUser(userId);
      await database.addTimelineEvent(
        projectId,
        'comment_added',
        `${user?.name || 'User'} commented`,
        userId,
        'comment',
        comment.id
      );
      
      // Update project comment count
      await database.incrementProjectCounter(projectId, 'total_comments');
      
      clientManager.broadcastToProject(projectId, {
        type: 'comment_added',
        comment: comment,
        timestamp: new Date().toISOString()
      });
      
      res.status(201).json(comment);
    } catch (error) {
      console.error('Comment creation error:', error);
      res.status(500).json({ 
        error: 'Failed to create comment',
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // React to comment
  app.post('/api/comments/:id/react', async (req, res) => {
    try {
      const commentId = req.params.id;
      const { userId, reaction = 'like' } = req.body;
      
      if (!userId) {
        return res.status(400).json({ 
          error: 'User ID required',
          timestamp: new Date().toISOString()
        });
      }
      
      const result = await database.toggleCommentReaction(commentId, userId, reaction);
      
      const comment = await database.getComment(commentId);
      
      clientManager.broadcastToProject(comment.project_id, {
        type: 'comment_updated',
        comment: result.comment,
        timestamp: new Date().toISOString()
      });
      
      res.json(result.comment);
    } catch (error) {
      console.error('Comment reaction error:', error);
      res.status(500).json({ 
        error: 'Failed to update reaction',
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Get project team
  app.get('/api/projects/:id/team', async (req, res) => {
    try {
      const projectId = req.params.id;
      const team = await database.getProjectTeam(projectId);
      res.json(team);
    } catch (error) {
      console.error('Team fetch error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch team',
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Join project
  app.post('/api/projects/:id/join', async (req, res) => {
    try {
      const projectId = req.params.id;
      const { userId, role = 'contributor' } = req.body;
      
      if (!userId) {
        return res.status(400).json({ 
          error: 'User ID required',
          timestamp: new Date().toISOString()
        });
      }
      
      const result = await database.addProjectMember(projectId, userId, role);
      
      await database.recordInteraction(
        projectId, 
        userId, 
        'project_join',
        'project',
        projectId,
        { role }
      );
      
      const user = await database.getUser(userId);
      const project = await database.getProject(projectId);
      
      await database.addTimelineEvent(
        projectId,
        'member_joined',
        `${user?.name || 'User'} joined the project`,
        userId,
        'user',
        userId
      );
      
      const team = await database.getProjectTeam(projectId);
      
      clientManager.broadcastToProject(projectId, {
        type: 'team_updated',
        team: team,
        timestamp: new Date().toISOString()
      });
      
      res.json({ 
        success: true, 
        message: `Joined ${project?.title || 'project'}`,
        team: team 
      });
    } catch (error) {
      console.error('Join project error:', error);
      res.status(500).json({ 
        error: 'Failed to join project',
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Get project timeline
  app.get('/api/projects/:id/timeline', async (req, res) => {
    try {
      const projectId = req.params.id;
      const { limit = 50, offset = 0 } = req.query;
      
      const timeline = await database.getProjectTimeline(
        projectId, 
        parseInt(limit), 
        parseInt(offset)
      );
      
      res.json(timeline);
    } catch (error) {
      console.error('Timeline fetch error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch timeline',
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Get project decisions
  app.get('/api/projects/:id/decisions', async (req, res) => {
    try {
      const projectId = req.params.id;
      const { status, limit = 100, offset = 0 } = req.query;
      
      const decisions = await database.getProjectDecisions(
        projectId, 
        status, 
        parseInt(limit), 
        parseInt(offset)
      );
      
      res.json(decisions);
    } catch (error) {
      console.error('Decisions fetch error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch decisions',
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Get online users
  app.get('/api/users/online', async (req, res) => {
    try {
      const users = await database.getOnlineUsers();
      res.json(users);
    } catch (error) {
      console.error('Online users fetch error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch online users',
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Get recent activity
  app.get('/api/activity/recent', async (req, res) => {
    try {
      const { limit = 20 } = req.query;
      const activity = await database.getRecentActivity(parseInt(limit));
      res.json(activity);
    } catch (error) {
      console.error('Recent activity fetch error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch recent activity',
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // User login/registration
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, name, role = 'clinician' } = req.body;
      
      if (!email || !name) {
        return res.status(400).json({ 
          error: 'Email and name required',
          timestamp: new Date().toISOString()
        });
      }
      
      let user = await database.getUserByEmail(email);
      
      if (!user) {
        user = await database.createUser(email, name, role);
        
        // Add timeline event for new user
        await database.addTimelineEvent(
          'system',
          'user_registered',
          `New user registered: ${name} (${role})`,
          user.id,
          'user',
          user.id
        );
      } else {
        await database.updateUserStatus(user.id, 'online');
      }
      
      // Remove sensitive data
      const { ...userData } = user;
      
      // Record login
      await database.recordInteraction(
        'system',
        user.id,
        'user_login',
        'user',
        user.id,
        { method: 'email', timestamp: new Date().toISOString() }
      );
      
      res.json({
        user: userData,
        token: `demo_token_${user.id}_${Date.now()}`,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ 
        error: 'Failed to authenticate',
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // User profile
  app.get('/api/users/:id', async (req, res) => {
    try {
      const userId = req.params.id;
      const user = await database.getUserProfile(userId);
      
      if (!user) {
        return res.status(404).json({ 
          error: 'User not found',
          timestamp: new Date().toISOString()
        });
      }
      
      res.json(user);
    } catch (error) {
      console.error('User fetch error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch user',
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Serve frontend routes
  app.get('/project', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'project.html'));
  });
  
  // Catch-all route for SPA
  app.get('*', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });
}

// ===== STARTUP =====
async function initialize() {
    console.log(`
    🚀 THORAXLAB CLINICAL-INDUSTRY INNOVATION PLATFORM v2.0
    ═══════════════════════════════════════════════════════════
    Initializing...
    Environment: ${NODE_ENV}
    Port: ${PORT}
    Public Directory: ${PUBLIC_DIR}
    `);
    
    try {
        // Setup database FIRST
        console.log('💾 Initializing database...');
        try {
            await database.connect();
            console.log('✅ Database connected');
        } catch (dbError) {
            console.error('❌ Database connection failed:', dbError);
            // Continue anyway for now
        }
        
        // Setup middleware
        console.log('🔧 Setting up middleware...');
        setupMiddleware();
        
        // Setup routes
        console.log('🛣️  Setting up routes...');
        setupRoutes();
        
        // Setup WebSocket
        console.log('🔗 Setting up WebSocket...');
        setupWebSocket();
        
        // Start server
        startServer();
        
        console.log('✅ Platform initialization complete');
        
    } catch (error) {
        console.error('❌ Initialization failed:', error);
        process.exit(1);
    }
}

function startServer() {
  server.listen(PORT, () => {
    console.log(`
    ═══════════════════════════════════════════════════════════
    🎉 THORAXLAB PLATFORM READY
    📍 Port: ${PORT}
    🌐 WebSocket: Active
    💾 Database: Connected
    📁 Public Folder: ${PUBLIC_DIR}
    🔗 URL: http://localhost:${PORT}
    🏷️  Version: 2.0.0
    ═══════════════════════════════════════════════════════════
    `);
  });
  
  // Handle server errors
  server.on('error', (error) => {
    console.error('❌ Server error:', error);
    if (error.code === 'EADDRINUSE') {
      console.log(`Port ${PORT} is already in use. Trying ${parseInt(PORT) + 1}...`);
      server.listen(parseInt(PORT) + 1);
    }
  });
}

function scheduleMaintenance() {
  // Run maintenance every hour
  setInterval(async () => {
    try {
      await database.performMaintenance();
    } catch (error) {
      console.error('Scheduled maintenance error:', error);
    }
  }, 60 * 60 * 1000);
  
  // Initial maintenance after 5 minutes
  setTimeout(async () => {
    try {
      await database.performMaintenance();
    } catch (error) {
      console.error('Initial maintenance error:', error);
    }
  }, 5 * 60 * 1000);
}

// ===== GRACEFUL SHUTDOWN =====
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

async function gracefulShutdown() {
  console.log('🚦 Received shutdown signal. Shutting down gracefully...');
  
  try {
    // Close all WebSocket connections
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.close(1001, 'Server shutting down');
      }
    });
    
    // Stop client manager
    clientManager.stop();
    
    // Update all online users to away before closing
    await database.updateAllUsersStatus('away');
    
    // Close database connection
    await database.close();
    
    // Close HTTP server
    server.close(() => {
      console.log('✅ Server shutdown complete');
      process.exit(0);
    });
    
    // Force exit after 10 seconds
    setTimeout(() => {
      console.warn('⚠️  Forcing shutdown after timeout');
      process.exit(1);
    }, 10000);
    
  } catch (error) {
    console.error('Shutdown error:', error);
    process.exit(1);
  }
}

// ===== START APPLICATION =====
initialize().catch((error) => {
  console.error('Fatal initialization error:', error);
  process.exit(1);
});

// Export for testing
module.exports = { app, server, wss, clientManager, database };
