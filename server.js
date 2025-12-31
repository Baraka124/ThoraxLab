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
  TECHNICAL_FEASIBLE: 'technical_feasible',
  NEEDS_EVIDENCE: 'needs_evidence'
};

// ===== WEB SOCKET SERVER =====
const wss = new WebSocket.Server({ server });
const clients = new Map();

wss.on('connection', (ws, req) => {
  const clientId = uuidv4();
  clients.set(clientId, {
    ws,
    userId: null,
    projectSubscriptions: new Set()
  });

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'authenticate':
          const user = await database.getUser(message.userId);
          if (user) {
            const client = clients.get(clientId);
            client.userId = message.userId;
            await database.updateUserActivity(message.userId);
            
            ws.send(JSON.stringify({
              type: 'authenticated',
              user: {
                id: user.id,
                name: user.name,
                role: user.role,
                organization: user.organization
              }
            }));
          }
          break;
          
        case 'join_project':
          const client = clients.get(clientId);
          if (client) {
            client.projectSubscriptions.add(message.projectId);
          }
          break;
          
        case 'vote_discussion':
          const voteResult = await database.addDiscussionVote(
            message.discussionId,
            message.userId,
            message.voteType
          );
          
          if (voteResult) {
            const consensus = await database.calculateConsensus(message.discussionId);
            broadcastToProject(message.projectId, {
              type: 'consensus_updated',
              discussionId: message.discussionId,
              consensus
            });
          }
          break;
      }
    } catch (error) {
      console.error('WebSocket error:', error);
    }
  });
  
  ws.on('close', () => {
    clients.delete(clientId);
  });
});

function broadcastToProject(projectId, message) {
  const data = JSON.stringify(message);
  for (const [clientId, client] of clients.entries()) {
    if (client.ws.readyState === WebSocket.OPEN && 
        client.projectSubscriptions.has(projectId)) {
      client.ws.send(data);
    }
  }
}

// ===== MIDDLEWARE =====
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Role validation middleware
const validateRolePermission = (requiredTypes) => async (req, res, next) => {
  try {
    const users = await database.getAllUsers();
    const user = users[0]; // For now, first user
    if (!user) return res.status(401).json({ success: false, error: 'Authentication required' });
    
    const userTypes = ROLE_PERMISSIONS[user.role] || [];
    const hasPermission = requiredTypes.some(type => userTypes.includes(type));
    
    if (!hasPermission) {
      return res.status(403).json({ 
        success: false, 
        error: `Role ${user.role} cannot perform this action` 
      });
    }
    
    req.user = user;
    next();
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ===== API ROUTES =====

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const dbConnected = await database.checkConnection();
    res.json({
      status: 'healthy',
      service: 'ThoraxLab Platform',
      version: '4.0.0',
      timestamp: new Date().toISOString(),
      database: dbConnected ? 'connected' : 'disconnected',
      features: ['role-based-discussions', 'consensus-tracking', 'evidence-system']
    });
  } catch (error) {
    res.status(500).json({ status: 'unhealthy', error: error.message });
  }
});

// Login/Register
app.post('/api/login', async (req, res) => {
  try {
    const { name, email, institution, role } = req.body;
    
    if (!name || !email) {
      return res.status(400).json({ success: false, error: 'Name and email required' });
    }
    
    let user = await database.findUserByEmail(email);
    if (!user) {
      user = await database.createUser({
        name,
        email,
        organization: institution || 'Medical Center',
        role: role || 'clinician'
      });
    }
    
    await database.updateUserActivity(user.id);
    
    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        organization: user.organization,
        role: user.role,
        avatar_color: user.avatar_color || '#1A5F7A'
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Login failed', details: error.message });
  }
});

// Get current user
app.get('/api/me', async (req, res) => {
  try {
    const users = await database.getAllUsers();
    const user = users[0];
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    
    await database.updateUserActivity(user.id);
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get user' });
  }
});

// Get all projects
app.get('/api/projects', async (req, res) => {
  try {
    const projects = await database.getAllProjects();
    res.json({ success: true, projects, count: projects.length });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to load projects' });
  }
});

// Create project (with objectives matrix)
app.post('/api/projects', async (req, res) => {
  try {
    const { title, description, type, objectives } = req.body;
    
    if (!title || !description) {
      return res.status(400).json({ success: false, error: 'Title and description required' });
    }
    
    const users = await database.getAllUsers();
    const user = users[0];
    if (!user) return res.status(401).json({ success: false, error: 'User not found' });
    
    const project = await database.createProject({
      title,
      description,
      type: type || 'clinical',
      status: 'planning',
      objectives: objectives || {
        clinical: [],
        industry: [],
        shared: []
      }
    }, user.id);
    
    res.status(201).json({ success: true, project });
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ success: false, error: 'Failed to create project' });
  }
});

// Get single project with bridge data
app.get('/api/projects/:id', async (req, res) => {
  try {
    const project = await database.getProject(req.params.id);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
    
    const team = await database.getProjectTeam(req.params.id);
    const discussions = await database.getProjectDiscussions(req.params.id);
    
    // Calculate bridge visualization
    const clinicalTeam = team.filter(m => m.role === 'clinician');
    const industryTeam = team.filter(m => m.role === 'industry');
    
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
      discussions
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to load project' });
  }
});

// Update project objectives
app.put('/api/projects/:id/objectives', async (req, res) => {
  try {
    const { clinical, industry, shared } = req.body;
    
    const project = await database.updateProject(req.params.id, {
      objectives: { clinical, industry, shared }
    });
    
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
    
    broadcastToProject(req.params.id, {
      type: 'objectives_updated',
      projectId: req.params.id,
      objectives: project.objectives
    });
    
    res.json({ success: true, project });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update objectives' });
  }
});

// Get project team
app.get('/api/projects/:id/team', async (req, res) => {
  try {
    const team = await database.getProjectTeam(req.params.id);
    res.json({ success: true, team, count: team.length });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to load team' });
  }
});

// Add team member
app.post('/api/projects/:id/team', async (req, res) => {
  try {
    const { name, email, role, organization } = req.body;
    
    if (!name || !email || !role) {
      return res.status(400).json({ success: false, error: 'Name, email and role required' });
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
    
    broadcastToProject(req.params.id, {
      type: 'team_member_added',
      projectId: req.params.id,
      member
    });
    
    res.status(201).json({ success: true, member });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to add team member' });
  }
});

// ===== DISCUSSIONS API =====

// Get project discussions
app.get('/api/projects/:id/discussions', async (req, res) => {
  try {
    const discussions = await database.getProjectDiscussions(req.params.id);
    res.json({ success: true, discussions, count: discussions.length });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to load discussions' });
  }
});

// Create discussion (with role-based validation)
app.post('/api/projects/:id/discussions', async (req, res) => {
  try {
    const { title, content, discussionType, evidenceLinks } = req.body;
    
    if (!title || !content || !discussionType) {
      return res.status(400).json({ 
        success: false, 
        error: 'Title, content and discussion type required' 
      });
    }
    
    const users = await database.getAllUsers();
    const user = users[0];
    if (!user) return res.status(401).json({ success: false, error: 'User not found' });
    
    // Validate role permission for discussion type
    const userTypes = ROLE_PERMISSIONS[user.role] || [];
    if (!userTypes.includes(discussionType)) {
      return res.status(403).json({ 
        success: false, 
        error: `Role ${user.role} cannot create ${discussionType} discussions` 
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
        id: user.id,
        name: user.name,
        role: user.role,
        organization: user.organization
      }
    });
    
    broadcastToProject(req.params.id, {
      type: 'discussion_created',
      discussion,
      timestamp: new Date().toISOString()
    });
    
    res.status(201).json({ success: true, discussion });
  } catch (error) {
    console.error('Create discussion error:', error);
    res.status(500).json({ success: false, error: 'Failed to create discussion' });
  }
});

// Get discussion with consensus data
app.get('/api/discussions/:id', async (req, res) => {
  try {
    const discussion = await database.getDiscussion(req.params.id);
    if (!discussion) return res.status(404).json({ success: false, error: 'Discussion not found' });
    
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
    res.status(500).json({ success: false, error: 'Failed to load discussion' });
  }
});

// Add vote to discussion
app.post('/api/discussions/:id/vote', async (req, res) => {
  try {
    const { userId, voteType, projectId } = req.body;
    
    if (!userId || !voteType) {
      return res.status(400).json({ success: false, error: 'User ID and vote type required' });
    }
    
    const user = await database.getUser(userId);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    
    const vote = await database.addDiscussionVote(req.params.id, userId, voteType, user.role);
    
    const consensus = await database.calculateConsensus(req.params.id);
    
    if (projectId) {
      broadcastToProject(projectId, {
        type: 'consensus_updated',
        discussionId: req.params.id,
        consensus
      });
    }
    
    res.json({ success: true, vote, consensus });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to add vote' });
  }
});

// ===== COMMENTS API =====

// Get discussion comments
app.get('/api/discussions/:id/comments', async (req, res) => {
  try {
    const comments = await database.getDiscussionComments(req.params.id);
    res.json({ success: true, comments, count: comments.length });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to load comments' });
  }
});

// Create comment
app.post('/api/comments', async (req, res) => {
  try {
    const { discussionId, projectId, content, evidenceLinks } = req.body;
    
    if (!discussionId || !content) {
      return res.status(400).json({ success: false, error: 'Discussion ID and content required' });
    }
    
    const users = await database.getAllUsers();
    const user = users[0];
    if (!user) return res.status(401).json({ success: false, error: 'User not found' });
    
    const comment = await database.createComment({
      discussionId,
      projectId,
      content,
      evidenceLinks: evidenceLinks || [],
      author: {
        id: user.id,
        name: user.name,
        role: user.role,
        organization: user.organization
      }
    });
    
    if (projectId) {
      broadcastToProject(projectId, {
        type: 'comment_created',
        comment,
        timestamp: new Date().toISOString()
      });
    }
    
    res.status(201).json({ success: true, comment });
  } catch (error) {
    console.error('Create comment error:', error);
    res.status(500).json({ success: false, error: 'Failed to create comment' });
  }
});

// ===== EVIDENCE API =====

// Add evidence to discussion
app.post('/api/discussions/:id/evidence', async (req, res) => {
  try {
    const { evidenceType, sourceId, title, url } = req.body;
    
    if (!evidenceType || !sourceId) {
      return res.status(400).json({ success: false, error: 'Evidence type and source ID required' });
    }
    
    const evidence = await database.addEvidence(req.params.id, {
      evidenceType, // 'pubmed', 'clinical_trial', 'guideline'
      sourceId,
      title,
      url
    });
    
    // Update discussion evidence count
    await database.updateDiscussionEvidenceCount(req.params.id);
    
    res.status(201).json({ success: true, evidence });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to add evidence' });
  }
});

// ===== DASHBOARD & ANALYTICS =====

app.get('/api/dashboard', async (req, res) => {
  try {
    const users = await database.getAllUsers();
    const user = users[0];
    if (!user) return res.status(401).json({ success: false, error: 'User not found' });
    
    const projects = await database.getProjectsForUser(user.id);
    const recentActivity = await database.getRecentActivity(user.id);
    
    // Calculate real metrics
    let clinicalActivity = 0;
    let industryActivity = 0;
    
    for (const project of projects) {
      const discussions = await database.getProjectDiscussions(project.id);
      clinicalActivity += discussions.filter(d => d.type === DISCUSSION_TYPES.CLINICAL_QUESTION).length;
      industryActivity += discussions.filter(d => d.type === DISCUSSION_TYPES.TECHNICAL_SOLUTION).length;
    }
    
    res.json({
      success: true,
      dashboard: {
        user,
        metrics: {
          clinicalActivity,
          industryActivity,
          crossPollination: Math.round((clinicalActivity + industryActivity) / 2),
          projectCount: projects.length,
          consensusRate: 0 // Will calculate from votes
        },
        activeProjects: projects.slice(0, 5),
        recentActivity
      }
    });
  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({ success: false, error: 'Failed to load dashboard' });
  }
});

app.get('/api/activity', async (req, res) => {
  try {
    const users = await database.getAllUsers();
    const user = users[0];
    if (!user) return res.status(401).json({ success: false, error: 'User not found' });
    
    const activity = await database.getRecentActivity(user.id);
    res.json({ success: true, activity, count: activity.length });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to load activity' });
  }
});

// ===== DECISION API =====

// Create decision from discussion consensus
app.post('/api/discussions/:id/decide', async (req, res) => {
  try {
    const { title, description, decisionType } = req.body;
    
    const discussion = await database.getDiscussion(req.params.id);
    if (!discussion) return res.status(404).json({ success: false, error: 'Discussion not found' });
    
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
      consensusData: consensus
    });
    
    broadcastToProject(discussion.project_id, {
      type: 'decision_reached',
      decision,
      discussionId: req.params.id
    });
    
    res.status(201).json({ success: true, decision });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create decision' });
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
      'Role-based discussion workflows',
      'Consensus tracking with role-weighted voting',
      'Evidence system for clinical/technical claims',
      'Project objectives matrix',
      'Bridge visualization',
      'Formal decision making'
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

// ===== START SERVER =====
async function startServer() {
  try {
    await database.connect();
    
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`
🚀 THORAXLAB COLLABORATION PLATFORM v4.0
📍 Port: ${PORT}
🌐 WebSocket: Role-based consensus tracking
💾 Database: Evidence and decision system
📊 Features:
  • Role-based discussion workflows
  • Consensus tracking with voting
  • Evidence requirement system
  • Project objectives matrix
  • Bridge visualization
  • Formal decision making
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
