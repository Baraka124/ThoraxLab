const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
const cors = require('cors');
const { database } = require('./database.js');

const PORT = process.env.PORT || 3000;
const app = express();
const server = require('http').createServer(app);

// ===== CONSTANTS =====
const DISCUSSION_TYPES = {
  CLINICAL_QUESTION: 'clinical_question',
  TECHNICAL_SOLUTION: 'technical_solution',
  JOINT_REVIEW: 'joint_review'
};

const ROLE_PERMISSIONS = {
  clinician: [DISCUSSION_TYPES.CLINICAL_QUESTION, DISCUSSION_TYPES.JOINT_REVIEW],
  industry: [DISCUSSION_TYPES.TECHNICAL_SOLUTION, DISCUSSION_TYPES.JOINT_REVIEW],
  lead: Object.values(DISCUSSION_TYPES)
};

const VOTE_TYPES = {
  CLINICAL_AGREE: 'clinical_agree',
  CLINICAL_DISAGREE: 'clinical_disagree',
  TECHNICAL_FEASIBLE: 'technical_feasible',
  TECHNICAL_INFEASIBLE: 'technical_infeasible',
  NEEDS_EVIDENCE: 'needs_evidence'
};

const PRESENCE_STATUS = {
  ONLINE: 'online',
  AWAY: 'away',
  OFFLINE: 'offline'
};

// ===== ENHANCED: WEB SOCKET SERVER =====
const wss = new WebSocket.Server({ server });
const clients = new Map();

wss.on('connection', (ws, req) => {
  const clientId = `client_${uuidv4()}`;
  clients.set(clientId, {
    ws,
    userId: null,
    projectSubscriptions: new Set(),
    lastActivity: Date.now()
  });

  console.log(`🔌 WebSocket client connected: ${clientId}`);

  // Send ping every 30 seconds to keep connection alive
  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  }, 30000);

  ws.on('message', async (data) => {
    try {
      const client = clients.get(clientId);
      if (client) {
        client.lastActivity = Date.now();
      }

      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'authenticate':
          const session = await database.getSessionByToken(message.token);
          if (session) {
            const user = await database.getUser(session.user_id);
            if (user) {
              const client = clients.get(clientId);
              client.userId = user.id;
              
              // Update user presence
              await database.updateUserPresence(user.id, PRESENCE_STATUS.ONLINE);
              
              // Notify subscribed projects about presence
              client.projectSubscriptions.forEach(projectId => {
                broadcastToProject(projectId, {
                  type: 'presence_updated',
                  userId: user.id,
                  status: PRESENCE_STATUS.ONLINE,
                  timestamp: new Date().toISOString()
                });
              });
              
              ws.send(JSON.stringify({
                type: 'authenticated',
                user: {
                  id: user.id,
                  name: user.name,
                  role: user.role,
                  organization: user.organization,
                  avatar_color: user.avatar_color,
                  avatar_initials: user.avatar_initials
                }
              }));
              
              // Send pending notifications
              const notifications = await database.getUserNotifications(user.id, true);
              if (notifications.length > 0) {
                ws.send(JSON.stringify({
                  type: 'notifications',
                  notifications: notifications.slice(0, 10)
                }));
              }
            }
          } else {
            ws.send(JSON.stringify({
              type: 'auth_error',
              error: 'Invalid or expired session'
            }));
          }
          break;
          
        case 'update_presence':
          const presenceClient = clients.get(clientId);
          if (presenceClient && presenceClient.userId) {
            await database.updateUserPresence(
              presenceClient.userId, 
              message.status, 
              message.projectId
            );
            
            // Broadcast presence update to all subscribed projects
            presenceClient.projectSubscriptions.forEach(projectId => {
              broadcastToProject(projectId, {
                type: 'presence_updated',
                userId: presenceClient.userId,
                status: message.status,
                timestamp: new Date().toISOString()
              });
            });
          }
          break;
          
        case 'join_project':
          const joinClient = clients.get(clientId);
          if (joinClient) {
            joinClient.projectSubscriptions.add(message.projectId);
            
            // If user is authenticated, update presence with current project
            if (joinClient.userId) {
              await database.updateUserPresence(
                joinClient.userId, 
                PRESENCE_STATUS.ONLINE, 
                message.projectId
              );
              
              // Notify project members about presence
              broadcastToProject(message.projectId, {
                type: 'presence_updated',
                userId: joinClient.userId,
                status: PRESENCE_STATUS.ONLINE,
                timestamp: new Date().toISOString()
              });
            }
          }
          break;
          
        case 'leave_project':
          const leaveClient = clients.get(clientId);
          if (leaveClient) {
            leaveClient.projectSubscriptions.delete(message.projectId);
          }
          break;
          
        case 'vote_discussion':
          const voteResult = await database.addDiscussionVote(
            message.discussionId,
            message.userId,
            message.voteType,
            message.userRole
          );
          
          if (voteResult) {
            const consensus = await database.calculateConsensus(message.discussionId);
            
            // Update discussion consensus status
            await database.run(`
              UPDATE discussions 
              SET consensus_status = ?
              WHERE id = ?
            `, [consensus.status, message.discussionId]);
            
            broadcastToProject(message.projectId, {
              type: 'consensus_updated',
              discussionId: message.discussionId,
              consensus,
              timestamp: new Date().toISOString()
            });
          }
          break;
          
        case 'mark_notification_read':
          if (message.notificationId) {
            await database.markNotificationRead(message.notificationId);
          } else if (message.userId) {
            await database.markAllNotificationsRead(message.userId);
          }
          break;
      }
    } catch (error) {
      console.error('WebSocket error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: 'Internal server error'
      }));
    }
  });
  
  ws.on('pong', () => {
    const client = clients.get(clientId);
    if (client) {
      client.lastActivity = Date.now();
    }
  });
  
  ws.on('close', async () => {
    clearInterval(pingInterval);
    
    const client = clients.get(clientId);
    if (client && client.userId) {
      // Update user presence to offline
      await database.updateUserPresence(client.userId, PRESENCE_STATUS.OFFLINE);
      
      // Notify subscribed projects about offline status
      client.projectSubscriptions.forEach(projectId => {
        broadcastToProject(projectId, {
          type: 'presence_updated',
          userId: client.userId,
          status: PRESENCE_STATUS.OFFLINE,
          timestamp: new Date().toISOString()
        });
      });
    }
    
    clients.delete(clientId);
    console.log(`🔌 WebSocket client disconnected: ${clientId}`);
  });
  
  ws.on('error', (error) => {
    console.error(`WebSocket error for client ${clientId}:`, error);
  });
});

// Clean up inactive clients every minute
setInterval(() => {
  const now = Date.now();
  const timeout = 5 * 60 * 1000; // 5 minutes
  
  for (const [clientId, client] of clients.entries()) {
    if (now - client.lastActivity > timeout) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.close();
      }
      clients.delete(clientId);
    }
  }
}, 60000);

function broadcastToProject(projectId, message) {
  const data = JSON.stringify(message);
  
  for (const [clientId, client] of clients.entries()) {
    if (client.ws.readyState === WebSocket.OPEN && 
        client.projectSubscriptions.has(projectId)) {
      client.ws.send(data);
    }
  }
}

// ===== ENHANCED: AUTHENTICATION MIDDLEWARE =====
async function authenticateToken(req, res, next) {
  try {
    const token = req.headers['authorization']?.split(' ')[1] || 
                  req.cookies?.session_token || 
                  req.query.token;
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        error: 'Authentication required' 
      });
    }
    
    const session = await database.getSessionByToken(token);
    if (!session) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid or expired session' 
      });
    }
    
    const user = await database.getUser(session.user_id);
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        error: 'User not found' 
      });
    }
    
    // Update user activity
    await database.updateUserActivity(user.id);
    
    req.user = user;
    req.session = session;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Authentication failed' 
    });
  }
}

function validateRolePermission(requiredTypes) {
  return (req, res, next) => {
    try {
      const userTypes = ROLE_PERMISSIONS[req.user.role] || [];
      const hasPermission = requiredTypes.some(type => userTypes.includes(type));
      
      if (!hasPermission) {
        return res.status(403).json({ 
          success: false, 
          error: `Role ${req.user.role} cannot perform this action` 
        });
      }
      
      next();
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: 'Permission validation failed' 
      });
    }
  };
}

// ===== MIDDLEWARE =====
app.use(cors({ 
  origin: true, 
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ===== ENHANCED: API ROUTES =====

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const dbConnected = await database.checkConnection();
    const activeUsers = await database.getUsersByPresence('online');
    const totalProjects = await database.all('SELECT COUNT(*) as count FROM projects WHERE is_archived = 0');
    
    res.json({
      success: true,
      status: 'healthy',
      service: 'ThoraxLab Platform',
      version: '4.0.0',
      timestamp: new Date().toISOString(),
      database: dbConnected ? 'connected' : 'disconnected',
      stats: {
        active_users: activeUsers.length,
        total_projects: totalProjects[0]?.count || 0
      },
      features: [
        'role-based-discussions', 
        'consensus-tracking', 
        'evidence-system',
        'real-time-presence',
        'notifications',
        'search-filtering'
      ]
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      status: 'unhealthy', 
      error: error.message 
    });
  }
});

// Login/Register (enhanced)
app.post('/api/login', async (req, res) => {
  try {
    const { name, email, organization, role } = req.body;
    
    if (!name || !email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Name and email required' 
      });
    }
    
    let user = await database.findUserByEmail(email);
    if (!user) {
      user = await database.createUser({
        name,
        email,
        organization: organization || 'Medical Center',
        role: role || 'clinician'
      });
    }
    
    // Create session token
    const token = `tok_${uuidv4()}`;
    const session = await database.createSession(user.id, token, 24);
    
    // Update user presence
    await database.updateUserPresence(user.id, PRESENCE_STATUS.ONLINE);
    
    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        organization: user.organization,
        role: user.role,
        avatar_color: user.avatar_color,
        avatar_initials: user.avatar_initials,
        presence: user.presence
      },
      token,
      expires_at: session.expires_at
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

// Logout
app.post('/api/logout', authenticateToken, async (req, res) => {
  try {
    const token = req.headers['authorization']?.split(' ')[1];
    
    if (token) {
      await database.deleteSession(token);
    }
    
    // Update user presence
    await database.updateUserPresence(req.user.id, PRESENCE_STATUS.OFFLINE);
    
    // Broadcast offline status to subscribed projects
    const client = Array.from(clients.values()).find(c => c.userId === req.user.id);
    if (client) {
      client.projectSubscriptions.forEach(projectId => {
        broadcastToProject(projectId, {
          type: 'presence_updated',
          userId: req.user.id,
          status: PRESENCE_STATUS.OFFLINE,
          timestamp: new Date().toISOString()
        });
      });
    }
    
    res.json({ 
      success: true, 
      message: 'Logged out successfully' 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Logout failed' 
    });
  }
});

// Get current user
app.get('/api/me', authenticateToken, async (req, res) => {
  try {
    const user = await database.getUser(req.user.id);
    
    // Get notifications
    const notifications = await database.getUserNotifications(req.user.id, true);
    
    res.json({ 
      success: true, 
      user,
      notifications: notifications.slice(0, 10),
      unread_count: notifications.length
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get user' 
    });
  }
});

// Update user profile
app.put('/api/me', authenticateToken, async (req, res) => {
  try {
    const { name, organization, specialty } = req.body;
    
    const updates = {};
    if (name) updates.name = name;
    if (organization) updates.organization = organization;
    if (specialty) updates.specialty = specialty;
    
    // In a real implementation, you would update the user
    // For now, just return success
    res.json({ 
      success: true, 
      message: 'Profile updated successfully' 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update profile' 
    });
  }
});

// ===== ENHANCED: PROJECTS API =====

// Get all projects with search and filtering
app.get('/api/projects', authenticateToken, async (req, res) => {
  try {
    const { search, type, status, limit } = req.query;
    
    const options = {
      search: search || null,
      type: type || null,
      status: status || null,
      limit: limit ? parseInt(limit) : null,
      userId: req.user.id
    };
    
    const projects = await database.getAllProjects(options);
    res.json({ 
      success: true, 
      projects, 
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

// Search projects
app.get('/api/projects/search', authenticateToken, async (req, res) => {
  try {
    const { q, type, status } = req.query;
    
    const projects = await database.getAllProjects({
      search: q,
      type,
      status,
      userId: req.user.id
    });
    
    res.json({ 
      success: true, 
      projects, 
      count: projects.length 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to search projects' 
    });
  }
});

// Create project (with objectives matrix)
app.post('/api/projects', authenticateToken, async (req, res) => {
  try {
    const { title, description, type, objectives, methodology } = req.body;
    
    if (!title || !description) {
      return res.status(400).json({ 
        success: false, 
        error: 'Title and description required' 
      });
    }
    
    const project = await database.createProject({
      title,
      description,
      type: type || 'clinical',
      status: 'planning',
      objectives: objectives || {
        clinical: [],
        industry: [],
        shared: []
      },
      methodology
    }, req.user.id);
    
    res.status(201).json({ 
      success: true, 
      project 
    });
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to create project' 
    });
  }
});

// Get single project with bridge data
app.get('/api/projects/:id', authenticateToken, async (req, res) => {
  try {
    const project = await database.getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ 
        success: false, 
        error: 'Project not found' 
      });
    }
    
    const team = await database.getProjectTeam(req.params.id);
    const discussions = await database.getProjectDiscussions(req.params.id, { limit: 10 });
    const decisions = await database.getProjectDecisions(req.params.id);
    const stats = await database.getProjectStats(req.params.id);
    
    // Calculate bridge visualization
    const clinicalTeam = team.filter(m => m.role === 'clinician');
    const industryTeam = team.filter(m => m.role === 'industry');
    
    // Check if user is part of team
    const isTeamMember = team.some(member => member.user_id === req.user.id);
    if (!isTeamMember && !req.user.is_admin) {
      return res.status(403).json({ 
        success: false, 
        error: 'Access denied: Not a team member' 
      });
    }
    
    res.json({
      success: true,
      project: {
        ...project,
        bridge: {
          clinical_count: clinicalTeam.length,
          industry_count: industryTeam.length,
          shared_objectives: project.objectives?.shared?.length || 0
        }
      },
      team,
      discussions,
      decisions: decisions.slice(0, 10),
      stats,
      user_role: team.find(m => m.user_id === req.user.id)?.role || 'viewer'
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
app.put('/api/projects/:id', authenticateToken, async (req, res) => {
  try {
    const { title, description, status, type } = req.body;
    
    // Check if user is project lead or admin
    const team = await database.getProjectTeam(req.params.id);
    const isLead = team.some(m => 
      m.user_id === req.user.id && (m.role === 'lead' || req.user.is_admin)
    );
    
    if (!isLead) {
      return res.status(403).json({ 
        success: false, 
        error: 'Only project lead can update project' 
      });
    }
    
    const updates = {};
    if (title) updates.title = title;
    if (description) updates.description = description;
    if (status) updates.status = status;
    if (type) updates.type = type;
    
    const project = await database.updateProject(req.params.id, updates);
    
    if (project) {
      // Log activity
      await database.logActivity(
        req.params.id, 
        req.user.id, 
        'project_updated', 
        'Updated project details'
      );
      
      // Broadcast update
      broadcastToProject(req.params.id, {
        type: 'project_updated',
        projectId: req.params.id,
        project,
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({ 
      success: true, 
      project 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update project' 
    });
  }
});

// Archive project
app.delete('/api/projects/:id', authenticateToken, async (req, res) => {
  try {
    // Check if user is project lead or admin
    const team = await database.getProjectTeam(req.params.id);
    const isLead = team.some(m => 
      m.user_id === req.user.id && (m.role === 'lead' || req.user.is_admin)
    );
    
    if (!isLead) {
      return res.status(403).json({ 
        success: false, 
        error: 'Only project lead can archive project' 
      });
    }
    
    const project = await database.archiveProject(req.params.id);
    
    // Log activity
    await database.logActivity(
      req.params.id, 
      req.user.id, 
      'project_archived', 
      'Archived project'
    );
    
    res.json({ 
      success: true, 
      project 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to archive project' 
    });
  }
});

// Update project objectives
app.put('/api/projects/:id/objectives', authenticateToken, async (req, res) => {
  try {
    const { clinical, industry, shared } = req.body;
    
    // Check if user is project lead or admin
    const team = await database.getProjectTeam(req.params.id);
    const isLead = team.some(m => 
      m.user_id === req.user.id && (m.role === 'lead' || req.user.is_admin)
    );
    
    if (!isLead) {
      return res.status(403).json({ 
        success: false, 
        error: 'Only project lead can update objectives' 
      });
    }
    
    const project = await database.updateProject(req.params.id, {
      objectives: { clinical, industry, shared }
    });
    
    if (!project) {
      return res.status(404).json({ 
        success: false, 
        error: 'Project not found' 
      });
    }
    
    // Log activity
    await database.logActivity(
      req.params.id, 
      req.user.id, 
      'objectives_updated', 
      'Updated project objectives'
    );
    
    // Broadcast update
    broadcastToProject(req.params.id, {
      type: 'objectives_updated',
      projectId: req.params.id,
      objectives: project.objectives,
      timestamp: new Date().toISOString()
    });
    
    res.json({ 
      success: true, 
      project 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update objectives' 
    });
  }
});

// Get project team
app.get('/api/projects/:id/team', authenticateToken, async (req, res) => {
  try {
    const team = await database.getProjectTeam(req.params.id);
    res.json({ 
      success: true, 
      team, 
      count: team.length 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to load team' 
    });
  }
});

// Add team member
app.post('/api/projects/:id/team', authenticateToken, async (req, res) => {
  try {
    const { name, email, role, organization } = req.body;
    
    if (!name || !email || !role) {
      return res.status(400).json({ 
        success: false, 
        error: 'Name, email and role required' 
      });
    }
    
    // Check if user is project lead or admin
    const team = await database.getProjectTeam(req.params.id);
    const isLead = team.some(m => 
      m.user_id === req.user.id && (m.role === 'lead' || req.user.is_admin)
    );
    
    if (!isLead) {
      return res.status(403).json({ 
        success: false, 
        error: 'Only project lead can add team members' 
      });
    }
    
    let user = await database.findUserByEmail(email);
    if (!user) {
      user = await database.createUser({
        name,
        email,
        organization: organization || 'Medical Center',
        role
      });
    }
    
    const member = await database.addTeamMember(req.params.id, user.id, role, organization);
    
    // Create notification for new team member
    await database.createNotification({
      userId: user.id,
      type: 'team_invite',
      title: 'Added to project team',
      message: `You've been added to the project team for "${req.params.id}" as ${role}`,
      metadata: { projectId: req.params.id, role }
    });
    
    broadcastToProject(req.params.id, {
      type: 'team_member_added',
      projectId: req.params.id,
      member: {
        ...member,
        name: user.name,
        email: user.email,
        avatar_color: user.avatar_color,
        avatar_initials: user.avatar_initials,
        presence: user.presence
      },
      timestamp: new Date().toISOString()
    });
    
    res.status(201).json({ 
      success: true, 
      member 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to add team member' 
    });
  }
});

// Remove team member
app.delete('/api/projects/:id/team/:userId', authenticateToken, async (req, res) => {
  try {
    // Check if user is project lead or admin
    const team = await database.getProjectTeam(req.params.id);
    const isLead = team.some(m => 
      m.user_id === req.user.id && (m.role === 'lead' || req.user.is_admin)
    );
    
    if (!isLead) {
      return res.status(403).json({ 
        success: false, 
        error: 'Only project lead can remove team members' 
      });
    }
    
    // Cannot remove yourself
    if (req.params.userId === req.user.id) {
      return res.status(400).json({ 
        success: false, 
        error: 'Cannot remove yourself from project' 
      });
    }
    
    await database.removeTeamMember(req.params.id, req.params.userId);
    
    // Log activity
    await database.logActivity(
      req.params.id, 
      req.user.id, 
      'team_member_removed', 
      'Removed team member'
    );
    
    // Broadcast update
    broadcastToProject(req.params.id, {
      type: 'team_member_removed',
      projectId: req.params.id,
      userId: req.params.userId,
      timestamp: new Date().toISOString()
    });
    
    res.json({ 
      success: true, 
      message: 'Team member removed successfully' 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to remove team member' 
    });
  }
});

// ===== ENHANCED: DISCUSSIONS API =====

// Get project discussions with filtering
app.get('/api/projects/:id/discussions', authenticateToken, async (req, res) => {
  try {
    const { type, search, limit } = req.query;
    
    const discussions = await database.getProjectDiscussions(req.params.id, {
      type: type || null,
      search: search || null,
      limit: limit ? parseInt(limit) : 20
    });
    
    res.json({ 
      success: true, 
      discussions, 
      count: discussions.length 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to load discussions' 
    });
  }
});

// Create discussion (with role-based validation)
app.post('/api/projects/:id/discussions', authenticateToken, async (req, res) => {
  try {
    const { title, content, discussionType, evidenceLinks } = req.body;
    
    if (!title || !content || !discussionType) {
      return res.status(400).json({ 
        success: false, 
        error: 'Title, content and discussion type required' 
      });
    }
    
    // Validate role permission for discussion type
    const userTypes = ROLE_PERMISSIONS[req.user.role] || [];
    if (!userTypes.includes(discussionType)) {
      return res.status(403).json({ 
        success: false, 
        error: `Role ${req.user.role} cannot create ${discussionType} discussions` 
      });
    }
    
    // Validate evidence for clinical/technical discussions
    if ((discussionType === DISCUSSION_TYPES.CLINICAL_QUESTION || 
         discussionType === DISCUSSION_TYPES.TECHNICAL_SOLUTION) && 
        (!evidenceLinks || evidenceLinks.length === 0)) {
      return res.status(400).json({ 
        success: false, 
        error: `${discussionType} discussions require evidence links` 
      });
    }
    
    const discussion = await database.createDiscussion({
      projectId: req.params.id,
      title,
      content,
      type: discussionType,
      evidenceLinks: evidenceLinks || [],
      author: {
        id: req.user.id,
        name: req.user.name,
        role: req.user.role,
        organization: req.user.organization
      }
    });
    
    // Create notifications for team members
    const team = await database.getProjectTeam(req.params.id);
    for (const member of team) {
      if (member.user_id !== req.user.id) {
        await database.createNotification({
          userId: member.user_id,
          type: 'new_discussion',
          title: 'New discussion started',
          message: `${req.user.name} started a new discussion: "${title}"`,
          metadata: { 
            projectId: req.params.id, 
            discussionId: discussion.id,
            discussionType 
          }
        });
      }
    }
    
    broadcastToProject(req.params.id, {
      type: 'discussion_created',
      discussion,
      timestamp: new Date().toISOString()
    });
    
    res.status(201).json({ 
      success: true, 
      discussion 
    });
  } catch (error) {
    console.error('Create discussion error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to create discussion' 
    });
  }
});

// Get discussion with consensus data
app.get('/api/discussions/:id', authenticateToken, async (req, res) => {
  try {
    const discussion = await database.getDiscussion(req.params.id);
    if (!discussion) {
      return res.status(404).json({ 
        success: false, 
        error: 'Discussion not found' 
      });
    }
    
    const consensus = await database.calculateConsensus(req.params.id);
    const comments = await database.getDiscussionComments(req.params.id);
    
    res.json({
      success: true,
      discussion: {
        ...discussion,
        consensus
      },
      comments
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to load discussion' 
    });
  }
});

// Add vote to discussion
app.post('/api/discussions/:id/vote', authenticateToken, async (req, res) => {
  try {
    const { voteType, projectId } = req.body;
    
    if (!voteType) {
      return res.status(400).json({ 
        success: false, 
        error: 'Vote type required' 
      });
    }
    
    const vote = await database.addDiscussionVote(
      req.params.id, 
      req.user.id, 
      voteType, 
      req.user.role
    );
    
    const consensus = await database.calculateConsensus(req.params.id);
    
    // Update discussion consensus status
    await database.run(`
      UPDATE discussions 
      SET consensus_status = ?
      WHERE id = ?
    `, [consensus.status, req.params.id]);
    
    if (projectId) {
      broadcastToProject(projectId, {
        type: 'consensus_updated',
        discussionId: req.params.id,
        consensus,
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({ 
      success: true, 
      vote, 
      consensus 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to add vote' 
    });
  }
});

// ===== ENHANCED: COMMENTS API =====

// Get discussion comments
app.get('/api/discussions/:id/comments', authenticateToken, async (req, res) => {
  try {
    const comments = await database.getDiscussionComments(req.params.id);
    res.json({ 
      success: true, 
      comments, 
      count: comments.length 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to load comments' 
    });
  }
});

// Create comment
app.post('/api/comments', authenticateToken, async (req, res) => {
  try {
    const { discussionId, projectId, content, evidenceLinks } = req.body;
    
    if (!discussionId || !content) {
      return res.status(400).json({ 
        success: false, 
        error: 'Discussion ID and content required' 
      });
    }
    
    const comment = await database.createComment({
      discussionId,
      projectId,
      content,
      evidenceLinks: evidenceLinks || [],
      author: {
        id: req.user.id,
        name: req.user.name,
        role: req.user.role,
        organization: req.user.organization
      }
    });
    
    // Create notification for discussion author
    const discussion = await database.getDiscussion(discussionId);
    if (discussion && discussion.author_id !== req.user.id) {
      await database.createNotification({
        userId: discussion.author_id,
        type: 'new_comment',
        title: 'New comment on your discussion',
        message: `${req.user.name} commented on your discussion: "${discussion.title}"`,
        metadata: { 
          projectId, 
          discussionId,
          commentId: comment.id 
        }
      });
    }
    
    if (projectId) {
      broadcastToProject(projectId, {
        type: 'comment_created',
        comment,
        timestamp: new Date().toISOString()
      });
    }
    
    res.status(201).json({ 
      success: true, 
      comment 
    });
  } catch (error) {
    console.error('Create comment error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to create comment' 
    });
  }
});

// ===== ENHANCED: EVIDENCE API =====

// Add evidence to discussion
app.post('/api/discussions/:id/evidence', authenticateToken, async (req, res) => {
  try {
    const { evidenceType, sourceId, title, url } = req.body;
    
    if (!evidenceType || !sourceId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Evidence type and source ID required' 
      });
    }
    
    const evidence = await database.addEvidence(req.params.id, null, null, {
      evidenceType,
      sourceId,
      title,
      url,
      addedBy: req.user.id
    });
    
    // Update discussion evidence count
    await database.updateDiscussionEvidenceCount(req.params.id);
    
    res.status(201).json({ 
      success: true, 
      evidence 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to add evidence' 
    });
  }
});

// ===== ENHANCED: DASHBOARD & ANALYTICS =====

app.get('/api/dashboard', authenticateToken, async (req, res) => {
  try {
    const projects = await database.getProjectsForUser(req.user.id);
    const recentActivity = await database.getRecentActivity(req.user.id, { limit: 10 });
    
    // Calculate real metrics
    let clinicalActivity = 0;
    let industryActivity = 0;
    let crossPollination = 0;
    
    for (const project of projects) {
      const discussions = await database.getProjectDiscussions(project.id);
      const clinicalDiscussions = discussions.filter(d => d.type === DISCUSSION_TYPES.CLINICAL_QUESTION);
      const technicalDiscussions = discussions.filter(d => d.type === DISCUSSION_TYPES.TECHNICAL_SOLUTION);
      
      clinicalActivity += clinicalDiscussions.length;
      industryActivity += technicalDiscussions.length;
      
      // Cross-pollination: discussions where both clinical and industry team members participated
      for (const discussion of discussions) {
        const consensus = discussion.consensus || await database.calculateConsensus(discussion.id);
        if (consensus.clinicalVotes > 0 && consensus.industryVotes > 0) {
          crossPollination++;
        }
      }
    }
    
    // Get online team members from user's projects
    let onlineTeamMembers = 0;
    for (const project of projects) {
      const team = await database.getProjectTeam(project.id);
      onlineTeamMembers += team.filter(m => m.presence_status === 'online').length;
    }
    
    res.json({
      success: true,
      dashboard: {
        user: req.user,
        metrics: {
          clinicalActivity,
          industryActivity,
          crossPollination,
          projectCount: projects.length,
          onlineTeamMembers,
          consensusRate: 65 // This would be calculated from all discussions
        },
        activeProjects: projects.slice(0, 6),
        recentActivity
      }
    });
  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to load dashboard' 
    });
  }
});

// Get activity with filtering
app.get('/api/activity', authenticateToken, async (req, res) => {
  try {
    const { projectId, type, limit } = req.query;
    
    const activity = await database.getRecentActivity(req.user.id, {
      projectId: projectId || null,
      activityType: type || null,
      limit: limit ? parseInt(limit) : 20
    });
    
    res.json({ 
      success: true, 
      activity, 
      count: activity.length 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to load activity' 
    });
  }
});

// Get notifications
app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const { unread } = req.query;
    const unreadOnly = unread === 'true';
    
    const notifications = await database.getUserNotifications(req.user.id, unreadOnly);
    
    res.json({ 
      success: true, 
      notifications, 
      count: notifications.length,
      unread_count: unreadOnly ? notifications.length : 
        notifications.filter(n => !n.read).length
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to load notifications' 
    });
  }
});

// Mark notification as read
app.post('/api/notifications/:id/read', authenticateToken, async (req, res) => {
  try {
    await database.markNotificationRead(req.params.id);
    res.json({ 
      success: true, 
      message: 'Notification marked as read' 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to mark notification as read' 
    });
  }
});

// Mark all notifications as read
app.post('/api/notifications/read-all', authenticateToken, async (req, res) => {
  try {
    await database.markAllNotificationsRead(req.user.id);
    res.json({ 
      success: true, 
      message: 'All notifications marked as read' 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to mark notifications as read' 
    });
  }
});

// ===== ENHANCED: DECISION API =====

// Create decision from discussion consensus
app.post('/api/discussions/:id/decide', authenticateToken, async (req, res) => {
  try {
    const { title, description, decisionType, priority, impactScore } = req.body;
    
    const discussion = await database.getDiscussion(req.params.id);
    if (!discussion) {
      return res.status(404).json({ 
        success: false, 
        error: 'Discussion not found' 
      });
    }
    
    const consensus = await database.calculateConsensus(req.params.id);
    
    // Check consensus thresholds
    if (consensus.clinicalAgreement < 70 || consensus.technicalFeasibility < 70) {
      return res.status(400).json({ 
        success: false, 
        error: 'Consensus thresholds not met (70% clinical agreement, 70% technical feasibility required)' 
      });
    }
    
    const decision = await database.createDecision({
      discussionId: req.params.id,
      projectId: discussion.project_id,
      title,
      description,
      decisionType: decisionType || 'joint',
      priority: priority || 'medium',
      impactScore: impactScore || 0,
      consensusData: consensus,
      createdBy: req.user.id
    });
    
    // Create notifications for team members
    const team = await database.getProjectTeam(discussion.project_id);
    for (const member of team) {
      if (member.user_id !== req.user.id) {
        await database.createNotification({
          userId: member.user_id,
          type: 'decision_reached',
          title: 'Decision reached',
          message: `A decision has been reached on discussion: "${discussion.title}"`,
          metadata: { 
            projectId: discussion.project_id, 
            discussionId: req.params.id,
            decisionId: decision.id
          }
        });
      }
    }
    
    broadcastToProject(discussion.project_id, {
      type: 'decision_reached',
      decision,
      discussionId: req.params.id,
      timestamp: new Date().toISOString()
    });
    
    res.status(201).json({ 
      success: true, 
      decision 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to create decision' 
    });
  }
});

// Get project decisions
app.get('/api/projects/:id/decisions', authenticateToken, async (req, res) => {
  try {
    const decisions = await database.getProjectDecisions(req.params.id);
    res.json({ 
      success: true, 
      decisions, 
      count: decisions.length 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to load decisions' 
    });
  }
});

// ===== ENHANCED: USERS & PRESENCE API =====

// Get online users
app.get('/api/users/online', authenticateToken, async (req, res) => {
  try {
    const onlineUsers = await database.getUsersByPresence('online');
    res.json({ 
      success: true, 
      users: onlineUsers, 
      count: onlineUsers.length 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to load online users' 
    });
  }
});

// Update user presence
app.post('/api/users/presence', authenticateToken, async (req, res) => {
  try {
    const { status, projectId } = req.body;
    
    if (!status || !PRESENCE_STATUS[status.toUpperCase()]) {
      return res.status(400).json({ 
        success: false, 
        error: 'Valid status required (online, away, offline)' 
      });
    }
    
    const presence = await database.updateUserPresence(req.user.id, status, projectId);
    
    // Broadcast presence update to subscribed projects
    const client = Array.from(clients.values()).find(c => c.userId === req.user.id);
    if (client) {
      client.projectSubscriptions.forEach(projectId => {
        broadcastToProject(projectId, {
          type: 'presence_updated',
          userId: req.user.id,
          status,
          timestamp: new Date().toISOString()
        });
      });
    }
    
    res.json({ 
      success: true, 
      presence 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update presence' 
    });
  }
});

// ===== TEST ENDPOINT =====
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: 'ThoraxLab Collaboration Platform v4.0',
    version: '4.0.0',
    timestamp: new Date().toISOString(),
    features: [
      'Enhanced role-based discussion workflows',
      'Real-time consensus tracking with voting',
      'Evidence system for clinical/technical claims',
      'Project objectives matrix with updates',
      'Bridge visualization with live data',
      'Formal decision making with notifications',
      'User presence tracking',
      'Search and filtering across projects',
      'Enhanced WebSocket support'
    ]
  });
});

// ===== SPA ROUTING =====
app.get('/project', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'project.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== ERROR HANDLING =====
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ===== START SERVER =====
async function startServer() {
  try {
    await database.connect();
    
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`
🚀 THORAXLAB COLLABORATION PLATFORM v4.0 ENHANCED
📍 Port: ${PORT}
🌐 WebSocket: Real-time presence & consensus tracking
💾 Database: Enhanced with sessions & notifications
📊 Features:
  • Enhanced role-based discussion workflows
  • Real-time consensus tracking with voting
  • Evidence system with URL generation
  • Project objectives matrix with updates
  • Bridge visualization with live data
  • Formal decision making with notifications
  • User presence tracking (online/away/offline)
  • Search and filtering across projects
  • Enhanced authentication with sessions
  • Notification system for team activities
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', async () => {
  await database.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await database.close();
  process.exit(0);
});

startServer();
