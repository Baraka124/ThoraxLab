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

// ==================== CONFIGURATION ====================
const config = {
  app: {
    name: 'ThoraxLab Research Platform',
    version: '4.0.0'
  },
  security: {
    sessionDuration: 7 * 24 * 60 * 60 * 1000, // 7 days
    maxLoginAttempts: 5
  },
  storage: {
    dataPath: path.join(__dirname, 'data'),
    ensureExists: true
  }
};

// ==================== DATA SERVICE ====================
class ThoraxLabDataService {
  constructor() {
    this.data = {
      users: {},
      projects: {},
      discussions: {},
      votes: {},
      comments: {},
      teamMembers: {},
      analytics: {
        platformStats: {
          totalProjects: 0,
          activeProjects: 0,
          totalUsers: 0,
          totalDiscussions: 0,
          totalComments: 0,
          consensusScore: 75,
          engagementRate: 45
        }
      },
      activityLog: []
    };
  }

  async initialize() {
    console.log('🚀 Initializing ThoraxLab Data Service...');
    
    try {
      // Ensure data directory exists
      await fs.mkdir(config.storage.dataPath, { recursive: true });
      
      // Load existing data or create default
      await this.loadData();
      
      // Initialize default admin if none exists
      await this.ensureDefaultAdmin();
      
      console.log('✅ Data service initialized');
      console.log(`📊 Stats: ${Object.keys(this.data.users).length} users, ${Object.keys(this.data.projects).length} projects`);
      
      return true;
    } catch (error) {
      console.error('❌ Data service init error:', error);
      return false;
    }
  }

  async loadData() {
    const files = [
      { name: 'users', key: 'users' },
      { name: 'projects', key: 'projects' },
      { name: 'discussions', key: 'discussions' },
      { name: 'comments', key: 'comments' },
      { name: 'votes', key: 'votes' },
      { name: 'team', key: 'teamMembers' },
      { name: 'analytics', key: 'analytics' },
      { name: 'activity', key: 'activityLog' }
    ];

    for (const file of files) {
      const filePath = path.join(config.storage.dataPath, `${file.name}.json`);
      try {
        const content = await fs.readFile(filePath, 'utf8');
        this.data[file.key] = JSON.parse(content);
        console.log(`✅ Loaded ${file.name}`);
      } catch (error) {
        if (error.code === 'ENOENT') {
          console.log(`📝 Creating default ${file.name} data`);
          this.data[file.key] = file.key === 'analytics' ? {
            platformStats: {
              totalProjects: 0,
              activeProjects: 0,
              totalUsers: 0,
              totalDiscussions: 0,
              totalComments: 0,
              consensusScore: 75,
              engagementRate: 45
            }
          } : {};
        } else {
          throw error;
        }
      }
    }
  }

  async saveData(key) {
    if (!key) {
      // Save all
      const savePromises = Object.keys(this.data).map(k => this.saveData(k));
      await Promise.all(savePromises);
      return;
    }

    const fileMap = {
      users: 'users.json',
      projects: 'projects.json',
      discussions: 'discussions.json',
      comments: 'comments.json',
      votes: 'votes.json',
      teamMembers: 'team.json',
      analytics: 'analytics.json',
      activityLog: 'activity.json'
    };

    const fileName = fileMap[key];
    if (!fileName) return;

    const filePath = path.join(config.storage.dataPath, fileName);
    await fs.writeFile(filePath, JSON.stringify(this.data[key], null, 2));
    console.log(`💾 Saved ${key}`);
  }

  async ensureDefaultAdmin() {
    const adminId = 'admin-' + Date.now();
    if (!this.data.users[adminId]) {
      this.data.users[adminId] = {
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
      };
      await this.saveData('users');
      console.log('👑 Created default administrator');
    }
  }

  // ==================== USER MANAGEMENT ====================
  async createUser(userData) {
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
      isAdmin: false,
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

    // Special handling for admin
    if (user.email === 'admin' || user.email.includes('@thoraxlab.org')) {
      user.role = 'administrator';
      user.impactScore = 1000;
      user.isAdmin = true;
    }

    this.data.users[userId] = user;
    this.data.analytics.platformStats.totalUsers = Object.keys(this.data.users).length;
    
    // Log activity
    this.logActivity(userId, 'user_registered', {
      institution: user.institution
    });

    await this.saveData(['users', 'analytics', 'activityLog']);
    
    return user;
  }

  async updateUserActivity(userId) {
    const user = this.data.users[userId];
    if (user) {
      user.lastActivity = new Date().toISOString();
      await this.saveData('users');
    }
  }

  // ==================== PROJECT MANAGEMENT ====================
  async createProject(projectData, userId) {
    const projectId = `project-${uuidv4()}`;
    const now = new Date().toISOString();
    const user = this.data.users[userId];
    
    if (!user) {
      throw new Error('User not found');
    }

    const project = {
      id: projectId,
      title: projectData.title.trim(),
      description: projectData.description.trim(),
      status: 'planning',
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
      objectives: projectData.objectives || ['Define research objectives', 'Establish methodology'],
      methodology: projectData.methodology || 'Mixed methods research',
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

    this.data.projects[projectId] = project;
    
    // Add project to user
    user.projects.push(projectId);
    
    // Update analytics
    this.data.analytics.platformStats.totalProjects = Object.keys(this.data.projects).length;
    this.data.analytics.platformStats.activeProjects = Object.values(this.data.projects)
      .filter(p => p.status === 'active').length;

    // Log activity
    this.logActivity(userId, 'project_created', {
      projectId,
      projectTitle: project.title
    });

    await this.saveData(['projects', 'users', 'analytics', 'activityLog']);
    
    return project;
  }

  async getProject(projectId) {
    const project = this.data.projects[projectId];
    if (!project) return null;

    // Enhance with real-time data
    const enhancedProject = { ...project };
    
    // Get discussions count
    const discussions = Object.values(this.data.discussions)
      .filter(d => d.projectId === projectId);
    enhancedProject.metrics.discussions = discussions.length;
    
    // Get comments count
    const comments = Object.values(this.data.comments)
      .filter(c => discussions.some(d => d.id === c.discussionId));
    enhancedProject.metrics.comments = comments.length;
    
    // Calculate consensus (average of discussion consensus)
    if (discussions.length > 0) {
      const totalConsensus = discussions.reduce((sum, d) => sum + (d.consensus || 0), 0);
      enhancedProject.metrics.consensus = Math.round(totalConsensus / discussions.length);
    }
    
    // Calculate engagement (discussions + comments + votes)
    const votes = Object.values(this.data.votes)
      .filter(v => discussions.some(d => d.id === v.discussionId));
    enhancedProject.metrics.votes = votes.length;
    enhancedProject.metrics.engagement = discussions.length + comments.length + votes.length;
    
    return enhancedProject;
  }

  async updateProject(projectId, updates, userId) {
    const project = this.data.projects[projectId];
    if (!project) {
      throw new Error('Project not found');
    }

    // Check permissions
    const user = this.data.users[userId];
    if (!user) {
      throw new Error('User not found');
    }

    const isLead = project.lead.id === userId;
    const isTeamMember = project.team.some(member => member.id === userId);
    const isAdmin = user.isAdmin;

    if (!isLead && !isAdmin) {
      throw new Error('Insufficient permissions');
    }

    // Apply updates
    if (updates.title !== undefined) project.title = updates.title.trim();
    if (updates.description !== undefined) project.description = updates.description.trim();
    if (updates.status !== undefined) project.status = updates.status;
    if (updates.objectives !== undefined) project.objectives = updates.objectives;
    if (updates.methodology !== undefined) project.methodology = updates.methodology;
    
    // Update timeline if provided
    if (updates.timeline) {
      project.timeline = { ...project.timeline, ...updates.timeline };
    }
    
    // Update metrics if provided
    if (updates.metrics) {
      project.metrics = { ...project.metrics, ...updates.metrics };
    }
    
    // Update settings if provided
    if (updates.settings) {
      project.settings = { ...project.settings, ...updates.settings };
    }
    
    project.updatedAt = new Date().toISOString();

    // Log activity
    this.logActivity(userId, 'project_updated', {
      projectId,
      changes: Object.keys(updates)
    });

    await this.saveData(['projects', 'activityLog']);
    
    return project;
  }

  // ==================== DISCUSSION MANAGEMENT ====================
  async createDiscussion(discussionData, userId, projectId) {
    const discussionId = `discussion-${uuidv4()}`;
    const now = new Date().toISOString();
    const user = this.data.users[userId];
    
    if (!user) {
      throw new Error('User not found');
    }

    const project = this.data.projects[projectId];
    if (!project) {
      throw new Error('Project not found');
    }

    // Check if user is in project team
    const isTeamMember = project.team.some(member => member.id === userId);
    if (!isTeamMember) {
      throw new Error('Only team members can create discussions');
    }

    const discussion = {
      id: discussionId,
      projectId,
      title: discussionData.title.trim(),
      content: discussionData.content.trim(),
      author: {
        id: userId,
        name: user.name,
        email: user.email
      },
      tags: discussionData.tags || ['general'],
      status: 'open',
      metrics: {
        upvotes: 0,
        downvotes: 0,
        comments: 0,
        consensus: 50 // Starting consensus
      },
      settings: {
        allowComments: true,
        allowVoting: true,
        isPinned: false
      },
      createdAt: now,
      updatedAt: now
    };

    this.data.discussions[discussionId] = discussion;
    
    // Update user's discussions
    user.discussions.push(discussionId);
    
    // Update project metrics
    project.metrics.discussions = (project.metrics.discussions || 0) + 1;
    project.updatedAt = now;
    
    // Update platform analytics
    this.data.analytics.platformStats.totalDiscussions = 
      Object.keys(this.data.discussions).length;

    // Log activity
    this.logActivity(userId, 'discussion_created', {
      projectId,
      discussionId,
      discussionTitle: discussion.title
    });

    await this.saveData(['discussions', 'users', 'projects', 'analytics', 'activityLog']);
    
    return discussion;
  }

  // ==================== COMMENT MANAGEMENT ====================
  async createComment(commentData, userId, discussionId) {
    const commentId = `comment-${uuidv4()}`;
    const now = new Date().toISOString();
    const user = this.data.users[userId];
    
    if (!user) {
      throw new Error('User not found');
    }

    const discussion = this.data.discussions[discussionId];
    if (!discussion) {
      throw new Error('Discussion not found');
    }

    const project = this.data.projects[discussion.projectId];
    if (!project) {
      throw new Error('Project not found');
    }

    // Check if user is in project team
    const isTeamMember = project.team.some(member => member.id === userId);
    if (!isTeamMember && !discussion.settings.allowComments) {
      throw new Error('Only team members can comment');
    }

    const comment = {
      id: commentId,
      discussionId,
      projectId: discussion.projectId,
      content: commentData.content.trim(),
      author: {
        id: userId,
        name: user.name,
        email: user.email
      },
      parentId: commentData.parentId, // For threaded comments
      isEdited: false,
      reactions: {},
      createdAt: now,
      updatedAt: now
    };

    this.data.comments[commentId] = comment;
    
    // Update discussion metrics
    discussion.metrics.comments = (discussion.metrics.comments || 0) + 1;
    discussion.updatedAt = now;
    
    // Update user's comments
    user.comments.push(commentId);
    
    // Update project metrics
    project.metrics.comments = (project.metrics.comments || 0) + 1;
    project.updatedAt = now;
    
    // Update platform analytics
    this.data.analytics.platformStats.totalComments = 
      Object.keys(this.data.comments).length;

    // Log activity
    this.logActivity(userId, 'comment_created', {
      projectId: discussion.projectId,
      discussionId,
      commentId
    });

    await this.saveData(['comments', 'discussions', 'users', 'projects', 'analytics', 'activityLog']);
    
    return comment;
  }

  // ==================== VOTE MANAGEMENT ====================
  async castVote(voteData, userId) {
    const voteId = `vote-${uuidv4()}`;
    const now = new Date().toISOString();
    const user = this.data.users[userId];
    
    if (!user) {
      throw new Error('User not found');
    }

    const discussion = this.data.discussions[voteData.discussionId];
    if (!discussion) {
      throw new Error('Discussion not found');
    }

    const project = this.data.projects[discussion.projectId];
    if (!project) {
      throw new Error('Project not found');
    }

    // Check if user is in project team
    const isTeamMember = project.team.some(member => member.id === userId);
    if (!isTeamMember && !discussion.settings.allowVoting) {
      throw new Error('Only team members can vote');
    }

    // Check for existing vote
    const existingVote = Object.values(this.data.votes).find(v => 
      v.discussionId === voteData.discussionId && v.userId === userId
    );

    let vote;
    if (existingVote) {
      // Update existing vote
      const oldType = existingVote.type;
      existingVote.type = voteData.type;
      existingVote.updatedAt = now;
      vote = existingVote;
      
      // Adjust discussion metrics
      if (oldType === 'upvote' && voteData.type === 'downvote') {
        discussion.metrics.upvotes = Math.max(0, discussion.metrics.upvotes - 1);
        discussion.metrics.downvotes = (discussion.metrics.downvotes || 0) + 1;
      } else if (oldType === 'downvote' && voteData.type === 'upvote') {
        discussion.metrics.downvotes = Math.max(0, discussion.metrics.downvotes - 1);
        discussion.metrics.upvotes = (discussion.metrics.upvotes || 0) + 1;
      }
    } else {
      // Create new vote
      vote = {
        id: voteId,
        discussionId: voteData.discussionId,
        projectId: discussion.projectId,
        userId,
        type: voteData.type,
        createdAt: now,
        updatedAt: now
      };
      
      this.data.votes[voteId] = vote;
      
      // Update discussion metrics
      if (voteData.type === 'upvote') {
        discussion.metrics.upvotes = (discussion.metrics.upvotes || 0) + 1;
      } else if (voteData.type === 'downvote') {
        discussion.metrics.downvotes = (discussion.metrics.downvotes || 0) + 1;
      }
      
      // Update user's votes
      user.votes.push(voteId);
    }
    
    // Update discussion consensus
    const totalVotes = (discussion.metrics.upvotes || 0) + (discussion.metrics.downvotes || 0);
    if (totalVotes > 0) {
      discussion.metrics.consensus = Math.round(
        (discussion.metrics.upvotes / totalVotes) * 100
      );
    }
    
    discussion.updatedAt = now;
    
    // Update project metrics
    project.metrics.votes = (project.metrics.votes || 0) + 1;
    project.updatedAt = now;

    // Log activity
    this.logActivity(userId, 'vote_cast', {
      projectId: discussion.projectId,
      discussionId: voteData.discussionId,
      voteType: voteData.type
    });

    await this.saveData(['votes', 'discussions', 'users', 'projects', 'activityLog']);
    
    return vote;
  }

  // ==================== TEAM MANAGEMENT ====================
  async addTeamMember(projectId, userId, newMemberData) {
    const project = this.data.projects[projectId];
    if (!project) {
      throw new Error('Project not found');
    }

    const user = this.data.users[userId];
    if (!user) {
      throw new Error('User not found');
    }

    // Check permissions (only lead or admin can add members)
    const isLead = project.lead.id === userId;
    const isAdmin = user.isAdmin;
    
    if (!isLead && !isAdmin) {
      throw new Error('Only project lead or admin can add team members');
    }

    // Check if new member exists
    let newMember = Object.values(this.data.users).find(u => 
      u.email === newMemberData.email.trim().toLowerCase()
    );

    if (!newMember) {
      // Create new user
      newMember = await this.createUser({
        name: newMemberData.name,
        email: newMemberData.email,
        institution: newMemberData.institution || project.lead.institution,
        specialty: newMemberData.specialty || 'clinician'
      });
    }

    // Check if already in team
    const isAlreadyMember = project.team.some(member => member.id === newMember.id);
    if (isAlreadyMember) {
      throw new Error('User is already a team member');
    }

    // Add to team
    project.team.push({
      id: newMember.id,
      name: newMember.name,
      email: newMember.email,
      role: newMemberData.role || 'researcher',
      joinedAt: new Date().toISOString()
    });

    project.updatedAt = new Date().toISOString();

    // Log activity
    this.logActivity(userId, 'team_member_added', {
      projectId,
      memberId: newMember.id,
      memberName: newMember.name
    });

    await this.saveData(['projects', 'activityLog']);
    
    return project.team;
  }

  // ==================== ANALYTICS & ACTIVITY ====================
  logActivity(userId, action, details = {}) {
    const activity = {
      id: `activity-${uuidv4()}`,
      userId,
      action,
      timestamp: new Date().toISOString(),
      details,
      ipAddress: '127.0.0.1' // In production, get from request
    };

    this.data.activityLog.unshift(activity);
    
    // Keep only last 1000 activities
    if (this.data.activityLog.length > 1000) {
      this.data.activityLog = this.data.activityLog.slice(0, 1000);
    }
    
    return activity;
  }

  async getPlatformStats() {
    const stats = { ...this.data.analytics.platformStats };
    
    // Calculate engagement rate
    const totalInteractions = stats.totalDiscussions + stats.totalComments;
    const totalPossibleInteractions = stats.totalUsers * 10; // Rough estimate
    if (totalPossibleInteractions > 0) {
      stats.engagementRate = Math.round((totalInteractions / totalPossibleInteractions) * 100);
    }
    
    return stats;
  }

  async getUserAnalytics(userId) {
    const user = this.data.users[userId];
    if (!user) return null;

    const userProjects = Object.values(this.data.projects)
      .filter(p => p.team.some(m => m.id === userId));
    
    const userDiscussions = Object.values(this.data.discussions)
      .filter(d => d.author.id === userId);
    
    const userComments = Object.values(this.data.comments)
      .filter(c => c.author.id === userId);

    return {
      userImpact: user.impactScore,
      projectCount: userProjects.length,
      discussionCount: userDiscussions.length,
      commentCount: userComments.length,
      voteCount: user.votes?.length || 0,
      activityTrend: 'increasing', // Would calculate from activity log
      collaborationScore: Math.round((userProjects.length + userDiscussions.length) / 2)
    };
  }
}

// ==================== MIDDLEWARE ====================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'", "ws://localhost:" + PORT],
    },
  },
}));

app.use(compression());
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// ==================== SOCKET.IO ====================
const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true
  }
});

// ==================== INITIALIZE SERVICES ====================
const dataService = new ThoraxLabDataService();

// ==================== AUTHENTICATION MIDDLEWARE ====================
const sessions = new Map();

async function authenticate(req, res, next) {
  try {
    const sessionId = req.cookies?.sessionId || 
                     req.headers.authorization?.replace('Bearer ', '');
    
    if (!sessionId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(401).json({
        success: false,
        error: 'Invalid session'
      });
    }

    // Check expiration
    if (new Date(session.expiresAt) < new Date()) {
      sessions.delete(sessionId);
      return res.status(401).json({
        success: false,
        error: 'Session expired'
      });
    }

    // Update last activity
    session.lastActivity = new Date().toISOString();
    
    // Get user
    const user = dataService.data.users[session.userId];
    if (!user) {
      sessions.delete(sessionId);
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }

    req.user = user;
    req.session = session;
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication failed'
    });
  }
}

// ==================== API ROUTES ====================

// Health endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    service: config.app.name,
    version: config.app.version,
    timestamp: new Date().toISOString(),
    status: 'operational'
  });
});

// Status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    service: config.app.name,
    timestamp: new Date().toISOString(),
    stats: {
      users: Object.keys(dataService.data.users).length,
      projects: Object.keys(dataService.data.projects).length,
      discussions: Object.keys(dataService.data.discussions).length,
      uptime: process.uptime()
    }
  });
});

// ==================== AUTHENTICATION ====================
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
    const existingUser = Object.values(dataService.data.users).find(u => 
      u.email.toLowerCase() === email.toLowerCase().trim()
    );

    let user;
    if (existingUser) {
      user = existingUser;
      // Update user info
      user.name = name.trim();
      user.institution = institution || user.institution;
      user.lastActivity = new Date().toISOString();
    } else {
      // Create new user
      user = await dataService.createUser({
        name: name.trim(),
        email: email.trim(),
        institution: institution || 'Medical Center'
      });
    }

    // Create session
    const sessionId = `session-${uuidv4()}`;
    const expiresAt = new Date(Date.now() + config.security.sessionDuration);
    
    sessions.set(sessionId, {
      id: sessionId,
      userId: user.id,
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
      lastActivity: new Date().toISOString()
    });

    // Update user activity
    await dataService.updateUserActivity(user.id);

    // Set cookie
    res.cookie('sessionId', sessionId, {
      httpOnly: true,
      secure: NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: config.security.sessionDuration
    });

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
        id: sessionId,
        expiresAt: expiresAt.toISOString()
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

app.post('/api/logout', authenticate, (req, res) => {
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

app.get('/api/me', authenticate, (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      institution: req.user.institution,
      role: req.user.role,
      impactScore: req.user.impactScore,
      isAdmin: req.user.isAdmin,
      preferences: req.user.preferences
    }
  });
});

// ==================== PROJECTS API ====================
app.get('/api/projects', authenticate, async (req, res) => {
  try {
    const user = req.user;
    const userProjects = Object.values(dataService.data.projects)
      .filter(project => project.team.some(member => member.id === user.id))
      .map(project => ({
        id: project.id,
        title: project.title,
        description: project.description,
        status: project.status,
        lead: project.lead.name,
        leadId: project.lead.id,
        metrics: project.metrics,
        team: project.team,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt
      }));

    res.json({
      success: true,
      projects: userProjects,
      count: userProjects.length
    });
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load projects'
    });
  }
});

app.post('/api/projects', authenticate, async (req, res) => {
  try {
    const { title, description, objectives, methodology } = req.body;
    const user = req.user;
    
    if (!title || !description) {
      return res.status(400).json({
        success: false,
        error: 'Title and description are required'
      });
    }

    const project = await dataService.createProject({
      title,
      description,
      objectives,
      methodology
    }, user.id);

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

app.get('/api/projects/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    
    const project = await dataService.getProject(id);
    
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

app.put('/api/projects/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const user = req.user;
    
    const project = await dataService.updateProject(id, updates, user.id);
    
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

// ==================== DISCUSSIONS API ====================
app.get('/api/projects/:id/discussions', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    
    // Check access
    const project = dataService.data.projects[id];
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    const hasAccess = project.team.some(member => member.id === user.id) || user.isAdmin;
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const discussions = Object.values(dataService.data.discussions)
      .filter(d => d.projectId === id)
      .map(discussion => {
        // Get comments for each discussion
        const comments = Object.values(dataService.data.comments)
          .filter(c => c.discussionId === discussion.id)
          .map(comment => ({
            id: comment.id,
            content: comment.content,
            author: comment.author,
            createdAt: comment.createdAt,
            isEdited: comment.isEdited
          }));

        return {
          ...discussion,
          comments,
          commentCount: comments.length
        };
      });

    res.json({
      success: true,
      discussions,
      count: discussions.length
    });
  } catch (error) {
    console.error('Get discussions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load discussions'
    });
  }
});

app.post('/api/projects/:id/discussions', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, tags } = req.body;
    const user = req.user;
    
    if (!title || !content) {
      return res.status(400).json({
        success: false,
        error: 'Title and content are required'
      });
    }

    const discussion = await dataService.createDiscussion({
      title,
      content,
      tags
    }, user.id, id);

    // Emit real-time event
    io.to(`project:${id}`).emit('discussion:created', discussion);

    res.status(201).json({
      success: true,
      discussion,
      message: 'Discussion created successfully'
    });
  } catch (error) {
    console.error('Create discussion error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create discussion',
      details: error.message
    });
  }
});

// ==================== COMMENTS API ====================
app.post('/api/discussions/:id/comments', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { content, parentId } = req.body;
    const user = req.user;
    
    if (!content) {
      return res.status(400).json({
        success: false,
        error: 'Comment content is required'
      });
    }

    const comment = await dataService.createComment({
      content,
      parentId
    }, user.id, id);

    // Emit real-time event
    const discussion = dataService.data.discussions[id];
    if (discussion) {
      io.to(`discussion:${id}`).emit('comment:created', comment);
    }

    res.status(201).json({
      success: true,
      comment,
      message: 'Comment added successfully'
    });
  } catch (error) {
    console.error('Create comment error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add comment',
      details: error.message
    });
  }
});

// ==================== VOTES API ====================
app.post('/api/discussions/:id/vote', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { type } = req.body;
    const user = req.user;
    
    if (!type || !['upvote', 'downvote'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Valid vote type is required'
      });
    }

    const vote = await dataService.castVote({
      discussionId: id,
      type
    }, user.id);

    // Emit real-time event
    io.to(`discussion:${id}`).emit('vote:updated', {
      discussionId: id,
      metrics: dataService.data.discussions[id]?.metrics,
      vote
    });

    res.json({
      success: true,
      vote,
      message: 'Vote recorded successfully'
    });
  } catch (error) {
    console.error('Vote error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record vote',
      details: error.message
    });
  }
});

// ==================== TEAM API ====================
app.get('/api/projects/:id/team', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    
    const project = dataService.data.projects[id];
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
      const userData = dataService.data.users[member.id];
      return {
        ...member,
        specialty: userData?.specialty,
        impactScore: userData?.impactScore,
        lastActivity: userData?.lastActivity,
        isOnline: false // Would track via WebSocket
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

app.post('/api/projects/:id/team', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role, institution } = req.body;
    const user = req.user;
    
    if (!name || !email) {
      return res.status(400).json({
        success: false,
        error: 'Name and email are required'
      });
    }

    const team = await dataService.addTeamMember(id, user.id, {
      name,
      email,
      role,
      institution
    });

    res.json({
      success: true,
      team,
      message: 'Team member added successfully'
    });
  } catch (error) {
    console.error('Add team member error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add team member',
      details: error.message
    });
  }
});

// ==================== ANALYTICS API ====================
app.get('/api/analytics/platform', authenticate, async (req, res) => {
  try {
    const user = req.user;
    
    if (!user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    const stats = await dataService.getPlatformStats();
    
    res.json({
      success: true,
      analytics: stats
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load analytics'
    });
  }
});

app.get('/api/analytics/user', authenticate, async (req, res) => {
  try {
    const user = req.user;
    
    const analytics = await dataService.getUserAnalytics(user.id);
    
    res.json({
      success: true,
      analytics
    });
  } catch (error) {
    console.error('Get user analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load user analytics'
    });
  }
});

app.get('/api/analytics/projects/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    
    const project = dataService.data.projects[id];
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

    // Get discussions for this project
    const discussions = Object.values(dataService.data.discussions)
      .filter(d => d.projectId === id);
    
    // Get comments for these discussions
    const comments = Object.values(dataService.data.comments)
      .filter(c => discussions.some(d => d.id === c.discussionId));
    
    // Get votes for these discussions
    const votes = Object.values(dataService.data.votes)
      .filter(v => discussions.some(d => d.id === v.discussionId));

    const analytics = {
      projectMetrics: project.metrics,
      discussionStats: {
        total: discussions.length,
        byStatus: {
          open: discussions.filter(d => d.status === 'open').length,
          closed: discussions.filter(d => d.status === 'closed').length,
          resolved: discussions.filter(d => d.status === 'resolved').length
        },
        averageConsensus: discussions.length > 0 
          ? Math.round(discussions.reduce((sum, d) => sum + (d.metrics.consensus || 0), 0) / discussions.length)
          : 0
      },
      engagement: {
        comments: comments.length,
        votes: votes.length,
        uniqueParticipants: new Set([
          ...discussions.map(d => d.author.id),
          ...comments.map(c => c.author.id),
          ...votes.map(v => v.userId)
        ]).size
      },
      teamActivity: project.team.map(member => {
        const memberDiscussions = discussions.filter(d => d.author.id === member.id).length;
        const memberComments = comments.filter(c => c.author.id === member.id).length;
        const memberVotes = votes.filter(v => v.userId === member.id).length;
        
        return {
          id: member.id,
          name: member.name,
          role: member.role,
          discussions: memberDiscussions,
          comments: memberComments,
          votes: memberVotes,
          totalActivity: memberDiscussions + memberComments + memberVotes
        };
      })
    };

    res.json({
      success: true,
      analytics
    });
  } catch (error) {
    console.error('Get project analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load project analytics'
    });
  }
});

// ==================== SOCKET.IO EVENTS ====================
io.on('connection', (socket) => {
  console.log('🔌 Socket connected:', socket.id);
  
  socket.on('join:project', (projectId) => {
    socket.join(`project:${projectId}`);
    console.log(`Socket ${socket.id} joined project ${projectId}`);
  });
  
  socket.on('join:discussion', (discussionId) => {
    socket.join(`discussion:${discussionId}`);
    console.log(`Socket ${socket.id} joined discussion ${discussionId}`);
  });
  
  socket.on('typing:start', (data) => {
    socket.to(`discussion:${data.discussionId}`).emit('user:typing', {
      userId: data.userId,
      userName: data.userName,
      discussionId: data.discussionId
    });
  });
  
  socket.on('typing:stop', (data) => {
    socket.to(`discussion:${data.discussionId}`).emit('user:stopped-typing', {
      userId: data.userId,
      discussionId: data.discussionId
    });
  });
  
  socket.on('disconnect', () => {
    console.log('🔌 Socket disconnected:', socket.id);
  });
});

// ==================== ERROR HANDLING ====================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
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
async function startServer() {
  try {
    // Initialize data service
    const initialized = await dataService.initialize();
    if (!initialized) {
      console.error('💥 Failed to initialize data service');
      process.exit(1);
    }
    
    // Start server
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`
🎯 THORAXLAB RESEARCH PLATFORM v${config.app.version}
===============================================
🌐 Server URL: http://localhost:${PORT}
🚀 Health Check: http://localhost:${PORT}/health
📊 API Status: http://localhost:${PORT}/api/status
👥 Dashboard: http://localhost:${PORT}/

📈 PLATFORM STATISTICS:
   • Users: ${Object.keys(dataService.data.users).length}
   • Projects: ${Object.keys(dataService.data.projects).length}
   • Discussions: ${Object.keys(dataService.data.discussions).length}
   • Comments: ${Object.keys(dataService.data.comments).length}

🔧 AVAILABLE ENDPOINTS:
   ✅ Authentication (/api/login, /api/logout, /api/me)
   ✅ Projects CRUD (/api/projects)
   ✅ Discussions & Comments (/api/projects/:id/discussions)
   ✅ Voting System (/api/discussions/:id/vote)
   ✅ Team Management (/api/projects/:id/team)
   ✅ Analytics (/api/analytics/*)
   ✅ Real-time WebSocket support

📁 Data stored in: ${config.storage.dataPath}

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
