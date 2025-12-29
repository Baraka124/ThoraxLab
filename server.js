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

// Socket.IO with enhanced configuration
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
    skipMiddlewares: true
  }
});

// ==================== MIDDLEWARE ====================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.socket.io"],
      connectSrc: ["'self'", "ws://*", "wss://*"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

app.use(compression());
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate limiting with different tiers
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { success: false, error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, error: 'Too many login attempts, please try again later.' }
});

app.use('/api/', apiLimiter);
app.use('/api/login', authLimiter);

// Serve static files with cache control
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: isProduction ? '1d' : '0',
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

// ==================== DATA MANAGEMENT ====================
class ThoraxLabDataService {
  constructor() {
    this.researchData = null;
    this.sessionsData = null;
    this.analyticsCache = null;
    this.lastSave = Date.now();
    this.saveQueue = [];
    this.isSaving = false;
  }

  async initialize() {
    await this.loadData();
    // Auto-save every 30 seconds if there are changes
    setInterval(() => this.autoSave(), 30000);
  }

  async loadData() {
    try {
      // Load research data
      try {
        const researchFile = await fs.readFile(path.join(__dirname, 'research.json'), 'utf8');
        this.researchData = JSON.parse(researchFile);
        console.log('✅ Research data loaded');
      } catch (error) {
        console.log('📝 Creating new research database...');
        this.researchData = this.getDefaultResearchData();
        await this.saveResearch();
      }

      // Load sessions
      try {
        const sessionsFile = await fs.readFile(path.join(__dirname, 'sessions.json'), 'utf8');
        this.sessionsData = JSON.parse(sessionsFile);
        console.log('✅ Sessions data loaded');
      } catch (error) {
        console.log('📝 Creating new sessions database...');
        this.sessionsData = {};
        await this.saveSessions();
      }

      // Initialize analytics cache
      this.updateAnalyticsCache();
      
      return true;
    } catch (error) {
      console.error('❌ Failed to load data:', error);
      // Initialize with default data
      this.researchData = this.getDefaultResearchData();
      this.sessionsData = {};
      return false;
    }
  }

  getDefaultResearchData() {
    return {
      projects: {},
      discussions: {},
      users: {},
      analytics: {
        totalProjects: 0,
        totalUsers: 0,
        totalDiscussions: 0,
        totalComments: 0,
        consensusRate: 75,
        activeResearchers: 0,
        researchImpactScore: 100,
        recentActivity: [],
        dailyStats: {},
        institutionStats: {}
      },
      activityLog: [],
      researchTemplates: this.getDefaultTemplates(),
      notifications: {},
      config: {
        institution: 'ThoraxLab Research Platform',
        theme: 'medical',
        features: {
          realtimeUpdates: true,
          fileAttachments: true,
          codeSnippets: true,
          mentions: true,
          reactions: true,
          templates: true,
          export: true,
          analytics: true
        }
      }
    };
  }

  getDefaultTemplates() {
    return {
      'randomized-controlled-trial': {
        id: 'rct',
        name: 'Randomized Controlled Trial',
        description: 'Template for RCT studies in pneumology',
        fields: ['title', 'hypothesis', 'primaryEndpoint', 'secondaryEndpoints', 'sampleSize', 'inclusionCriteria', 'exclusionCriteria', 'intervention', 'control', 'outcomeMeasures', 'statisticalPlan'],
        tags: ['RCT', 'Clinical Trial', 'Interventional'],
        status: 'active'
      },
      'cohort-study': {
        id: 'cohort',
        name: 'Cohort Study',
        description: 'Template for observational cohort studies',
        fields: ['title', 'studyPopulation', 'exposure', 'outcome', 'followupDuration', 'dataCollectionMethods', 'confoundingFactors', 'analysisPlan'],
        tags: ['Observational', 'Cohort', 'Epidemiology'],
        status: 'active'
      },
      'case-study': {
        id: 'case',
        name: 'Case Study',
        description: 'Template for detailed case reports',
        fields: ['title', 'patientPresentation', 'diagnosticWorkup', 'treatmentCourse', 'outcome', 'discussion', 'clinicalPearls'],
        tags: ['Case Report', 'Clinical', 'Educational'],
        status: 'active'
      },
      'systematic-review': {
        id: 'review',
        name: 'Systematic Review',
        description: 'Template for systematic reviews and meta-analyses',
        fields: ['title', 'researchQuestion', 'inclusionCriteria', 'searchStrategy', 'qualityAssessment', 'dataExtraction', 'synthesisMethods', 'results', 'conclusions'],
        tags: ['Review', 'Meta-analysis', 'Evidence Synthesis'],
        status: 'active'
      }
    };
  }

  updateAnalyticsCache() {
    const projects = Object.values(this.researchData.projects);
    const users = Object.values(this.researchData.users);
    
    // Calculate active users (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const activeUsers = users.filter(u => new Date(u.lastActivity) > sevenDaysAgo);
    
    // Calculate consensus rate from discussions
    const discussions = Object.values(this.researchData.discussions);
    const totalVotes = discussions.reduce((sum, d) => sum + (d.upvotes || 0) + (d.downvotes || 0), 0);
    const positiveVotes = discussions.reduce((sum, d) => sum + (d.upvotes || 0), 0);
    const consensusRate = totalVotes > 0 ? Math.round((positiveVotes / totalVotes) * 100) : 75;
    
    // Calculate research impact score
    const impactScore = this.calculateResearchImpact(projects, discussions);
    
    this.analyticsCache = {
      totalProjects: projects.length,
      activeProjects: projects.filter(p => p.status === 'active').length,
      planningProjects: projects.filter(p => p.status === 'planning').length,
      completedProjects: projects.filter(p => p.status === 'completed').length,
      totalUsers: users.length,
      activeResearchers: activeUsers.length,
      totalDiscussions: discussions.length,
      totalComments: this.getTotalComments(),
      platformConsensus: consensusRate,
      researchImpactScore: impactScore,
      avgTeamSize: this.calculateAverageTeamSize(projects),
      completionRate: this.calculateCompletionRate(projects),
      topInstitutions: this.getTopInstitutions(users),
      recentActivity: this.researchData.activityLog.slice(-10)
    };
    
    return this.analyticsCache;
  }

  calculateResearchImpact(projects, discussions) {
    let score = 100;
    
    // Projects impact
    score += projects.length * 5;
    score += projects.filter(p => p.status === 'active').length * 10;
    score += projects.filter(p => p.status === 'completed').length * 15;
    
    // Engagement impact
    score += discussions.length * 2;
    score += this.getTotalComments() * 1;
    
    // Team size impact
    const avgTeamSize = this.calculateAverageTeamSize(projects);
    score += avgTeamSize * 3;
    
    return Math.min(score, 1000);
  }

  calculateAverageTeamSize(projects) {
    if (projects.length === 0) return 1;
    const totalMembers = projects.reduce((sum, p) => sum + (p.teamMembers ? p.teamMembers.length : 1), 0);
    return Math.round(totalMembers / projects.length);
  }

  calculateCompletionRate(projects) {
    if (projects.length === 0) return 0;
    const completed = projects.filter(p => p.status === 'completed').length;
    return Math.round((completed / projects.length) * 100);
  }

  getTopInstitutions(users) {
    const institutionCount = {};
    users.forEach(user => {
      const inst = user.institution || 'Unknown';
      institutionCount[inst] = (institutionCount[inst] || 0) + 1;
    });
    
    return Object.entries(institutionCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));
  }

  getTotalComments() {
    const discussions = Object.values(this.researchData.discussions);
    return discussions.reduce((sum, d) => sum + (d.comments ? d.comments.length : 0), 0);
  }

  async queueSave(collection) {
    this.saveQueue.push(collection);
    if (!this.isSaving) {
      await this.processSaveQueue();
    }
  }

  async processSaveQueue() {
    if (this.isSaving || this.saveQueue.length === 0) return;
    
    this.isSaving = true;
    const collections = [...new Set(this.saveQueue)];
    this.saveQueue = [];
    
    try {
      if (collections.includes('research')) {
        await this.saveResearch();
      }
      if (collections.includes('sessions')) {
        await this.saveSessions();
      }
      this.lastSave = Date.now();
      console.log(`💾 Saved data: ${collections.join(', ')}`);
    } catch (error) {
      console.error('Save error:', error);
    } finally {
      this.isSaving = false;
      
      // Process any new items that arrived while saving
      if (this.saveQueue.length > 0) {
        setTimeout(() => this.processSaveQueue(), 1000);
      }
    }
  }

  async autoSave() {
    if (Date.now() - this.lastSave > 25000) { // 25 seconds
      await this.queueSave('research');
    }
  }

  async saveResearch() {
    try {
      // Update analytics before saving
      this.researchData.analytics = {
        ...this.researchData.analytics,
        totalProjects: Object.keys(this.researchData.projects).length,
        totalUsers: Object.keys(this.researchData.users).length,
        totalDiscussions: Object.keys(this.researchData.discussions).length,
        totalComments: this.getTotalComments()
      };
      
      await fs.writeFile(
        path.join(__dirname, 'research.json'),
        JSON.stringify(this.researchData, null, 2)
      );
      return true;
    } catch (error) {
      console.error('Failed to save research:', error);
      return false;
    }
  }

  async saveSessions() {
    try {
      // Clean expired sessions
      const now = new Date();
      Object.keys(this.sessionsData).forEach(sessionId => {
        const session = this.sessionsData[sessionId];
        if (new Date(session.expiresAt) < now) {
          delete this.sessionsData[sessionId];
        }
      });
      
      await fs.writeFile(
        path.join(__dirname, 'sessions.json'),
        JSON.stringify(this.sessionsData, null, 2)
      );
      return true;
    } catch (error) {
      console.error('Failed to save sessions:', error);
      return false;
    }
  }

  logActivity(userId, action, details) {
    const activity = {
      id: `act-${Date.now()}`,
      userId,
      action,
      details,
      timestamp: new Date().toISOString(),
      ip: 'system' // In production, you'd get this from request
    };
    
    this.researchData.activityLog.push(activity);
    
    // Keep only last 1000 activities
    if (this.researchData.activityLog.length > 1000) {
      this.researchData.activityLog = this.researchData.activityLog.slice(-1000);
    }
    
    this.queueSave('research');
    return activity;
  }

  // Helper methods for medical data
  validateMedicalData(data, type) {
    const validators = {
      'patient': this.validatePatientData.bind(this),
      'lung-function': this.validateLungFunctionData.bind(this),
      'treatment': this.validateTreatmentData.bind(this)
    };
    
    const validator = validators[type];
    return validator ? validator(data) : { valid: true, errors: [] };
  }

  validatePatientData(data) {
    const errors = [];
    
    // Age validation
    if (data.age && (data.age < 0 || data.age > 120)) {
      errors.push('Age must be between 0 and 120');
    }
    
    // Gender validation
    if (data.gender && !['male', 'female', 'other', 'prefer-not-to-say'].includes(data.gender)) {
      errors.push('Invalid gender value');
    }
    
    // Diagnosis validation
    if (data.diagnosis && data.diagnosis.length > 500) {
      errors.push('Diagnosis too long');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  validateLungFunctionData(data) {
    const errors = [];
    
    // FEV1 validation (typical range 1.0-5.0 L)
    if (data.fev1 && (data.fev1 < 0.5 || data.fev1 > 10)) {
      errors.push('FEV1 value outside reasonable range');
    }
    
    // FVC validation (typical range 2.0-6.0 L)
    if (data.fvc && (data.fvc < 1 || data.fvc > 12)) {
      errors.push('FVC value outside reasonable range');
    }
    
    // FEV1/FVC ratio validation
    if (data.fev1 && data.fvc) {
      const ratio = data.fev1 / data.fvc;
      if (ratio < 0.2 || ratio > 1.0) {
        errors.push('FEV1/FVC ratio outside reasonable range');
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Search functionality
  searchProjects(query, filters = {}) {
    const projects = Object.values(this.researchData.projects);
    
    return projects.filter(project => {
      // Text search
      const searchText = query.toLowerCase();
      const matchesText = 
        project.title.toLowerCase().includes(searchText) ||
        project.description.toLowerCase().includes(searchText) ||
        (project.tags || []).some(tag => tag.toLowerCase().includes(searchText));
      
      if (!matchesText && query) return false;
      
      // Filter by status
      if (filters.status && project.status !== filters.status) return false;
      
      // Filter by lead
      if (filters.leadId && project.leadId !== filters.leadId) return false;
      
      // Filter by tags
      if (filters.tags && filters.tags.length > 0) {
        const projectTags = new Set(project.tags || []);
        const hasAllTags = filters.tags.every(tag => projectTags.has(tag));
        if (!hasAllTags) return false;
      }
      
      // Filter by date range
      if (filters.startDate && new Date(project.createdAt) < new Date(filters.startDate)) return false;
      if (filters.endDate && new Date(project.createdAt) > new Date(filters.endDate)) return false;
      
      return true;
    }).sort((a, b) => {
      // Sort by relevance or date
      if (query) {
        const aRelevance = this.calculateRelevance(a, query);
        const bRelevance = this.calculateRelevance(b, query);
        return bRelevance - aRelevance;
      }
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }

  calculateRelevance(project, query) {
    let score = 0;
    const searchTerms = query.toLowerCase().split(' ');
    
    // Title match (highest weight)
    if (project.title.toLowerCase().includes(query.toLowerCase())) {
      score += 100;
    }
    
    // Tag matches
    searchTerms.forEach(term => {
      if ((project.tags || []).some(tag => tag.toLowerCase().includes(term))) {
        score += 50;
      }
    });
    
    // Description match
    searchTerms.forEach(term => {
      if (project.description.toLowerCase().includes(term)) {
        score += 10;
      }
    });
    
    // Recency bonus
    const daysOld = (Date.now() - new Date(project.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysOld < 7) score += 20; // Recent projects
    if (daysOld < 30) score += 10; // Last month
    
    // Activity bonus
    if (project.discussionCount > 5) score += 15;
    
    return score;
  }

  // Get similar projects
  getSimilarProjects(projectId, limit = 5) {
    const currentProject = this.researchData.projects[projectId];
    if (!currentProject) return [];
    
    const projects = Object.values(this.researchData.projects)
      .filter(p => p.id !== projectId);
    
    // Calculate similarity score based on tags and content
    const scoredProjects = projects.map(p => ({
      project: p,
      score: this.calculateProjectSimilarity(currentProject, p)
    }))
    .filter(p => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(p => p.project);
    
    return scoredProjects;
  }

  calculateProjectSimilarity(projectA, projectB) {
    let score = 0;
    
    // Tag similarity
    const tagsA = new Set(projectA.tags || []);
    const tagsB = new Set(projectB.tags || []);
    const commonTags = [...tagsA].filter(tag => tagsB.has(tag));
    score += commonTags.length * 25;
    
    // Status similarity
    if (projectA.status === projectB.status) score += 20;
    
    // Lead similarity (same researcher)
    if (projectA.leadId === projectB.leadId) score += 30;
    
    // Content similarity (simple word overlap)
    const wordsA = new Set(projectA.description.toLowerCase().split(/\W+/));
    const wordsB = new Set(projectB.description.toLowerCase().split(/\W+/));
    const commonWords = [...wordsA].filter(word => wordsB.has(word));
    score += Math.min(commonWords.length, 10) * 2;
    
    return score;
  }

  // Generate project statistics
  getProjectStatistics(projectId) {
    const project = this.researchData.projects[projectId];
    if (!project) return null;
    
    const discussions = Object.values(this.researchData.discussions)
      .filter(d => d.projectId === projectId);
    
    const totalComments = discussions.reduce((sum, d) => sum + (d.comments ? d.comments.length : 0), 0);
    const totalVotes = discussions.reduce((sum, d) => sum + (d.upvotes || 0) + (d.downvotes || 0), 0);
    const consensusScore = totalVotes > 0 
      ? Math.round((discussions.reduce((sum, d) => sum + (d.upvotes || 0), 0) / totalVotes) * 100)
      : 75;
    
    // Calculate engagement score
    const engagementScore = Math.min(
      (discussions.length * 10) + (totalComments * 5) + (totalVotes * 2),
      100
    );
    
    // Calculate timeline progress
    const createdDate = new Date(project.createdAt);
    const now = new Date();
    const daysActive = Math.floor((now - createdDate) / (1000 * 60 * 60 * 24));
    
    return {
      discussionCount: discussions.length,
      commentCount: totalComments,
      voteCount: totalVotes,
      consensusScore,
      engagementScore,
      daysActive,
      teamSize: project.teamMembers ? project.teamMembers.length : 1,
      lastActivity: this.getLastProjectActivity(projectId),
      completionEstimate: this.estimateProjectCompletion(project)
    };
  }

  getLastProjectActivity(projectId) {
    const discussions = Object.values(this.researchData.discussions)
      .filter(d => d.projectId === projectId);
    
    let lastActivity = null;
    
    // Check discussions
    discussions.forEach(d => {
      const discussionDate = new Date(d.updatedAt || d.createdAt);
      if (!lastActivity || discussionDate > lastActivity) {
        lastActivity = discussionDate;
      }
      
      // Check comments
      if (d.comments) {
        d.comments.forEach(c => {
          const commentDate = new Date(c.timestamp);
          if (!lastActivity || commentDate > lastActivity) {
            lastActivity = commentDate;
          }
        });
      }
    });
    
    return lastActivity ? lastActivity.toISOString() : null;
  }

  estimateProjectCompletion(project) {
    // Simple estimation based on status and activity
    const baseEstimates = {
      'planning': 90, // 90 days from start
      'active': 180,  // 180 days from start
      'completed': 0   // Already completed
    };
    
    const baseDays = baseEstimates[project.status] || 90;
    const startDate = new Date(project.startDate || project.createdAt);
    const estimatedEnd = new Date(startDate.getTime() + baseDays * 24 * 60 * 60 * 1000);
    const now = new Date();
    
    const daysRemaining = Math.max(0, Math.floor((estimatedEnd - now) / (1000 * 60 * 60 * 24)));
    
    return {
      estimatedEndDate: estimatedEnd.toISOString().split('T')[0],
      daysRemaining,
      progressPercentage: project.status === 'completed' ? 100 : 
                         Math.min(95, Math.floor((baseDays - daysRemaining) / baseDays * 100))
    };
  }

  // Notifications system
  createNotification(userId, type, data) {
    const notificationId = `notif-${Date.now()}`;
    const notification = {
      id: notificationId,
      userId,
      type,
      data,
      read: false,
      createdAt: new Date().toISOString()
    };
    
    if (!this.researchData.notifications[userId]) {
      this.researchData.notifications[userId] = [];
    }
    
    this.researchData.notifications[userId].push(notification);
    
    // Keep only last 50 notifications per user
    if (this.researchData.notifications[userId].length > 50) {
      this.researchData.notifications[userId] = this.researchData.notifications[userId].slice(-50);
    }
    
    this.queueSave('research');
    return notification;
  }

  getUserNotifications(userId, unreadOnly = false) {
    const notifications = this.researchData.notifications[userId] || [];
    return unreadOnly ? notifications.filter(n => !n.read) : notifications;
  }

  markNotificationAsRead(userId, notificationId) {
    const notifications = this.researchData.notifications[userId];
    if (notifications) {
      const notification = notifications.find(n => n.id === notificationId);
      if (notification) {
        notification.read = true;
        this.queueSave('research');
        return true;
      }
    }
    return false;
  }

  markAllNotificationsAsRead(userId) {
    const notifications = this.researchData.notifications[userId];
    if (notifications) {
      notifications.forEach(n => n.read = true);
      this.queueSave('research');
      return true;
    }
    return false;
  }
}

// Initialize data service
const dataService = new ThoraxLabDataService();

// ==================== HELPER MIDDLEWARE ====================
const authenticate = async (req, res, next) => {
  try {
    const sessionId = req.headers['authorization']?.replace('Bearer ', '') || 
                     req.query.sessionId || 
                     req.cookies?.sessionId;
    
    if (!sessionId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    const session = dataService.sessionsData[sessionId];
    if (!session) {
      return res.status(401).json({
        success: false,
        error: 'Invalid session'
      });
    }
    
    // Check if session expired
    if (new Date(session.expiresAt) < new Date()) {
      delete dataService.sessionsData[sessionId];
      await dataService.saveSessions();
      return res.status(401).json({
        success: false,
        error: 'Session expired'
      });
    }
    
    // Update session activity
    session.lastActivity = new Date().toISOString();
    await dataService.queueSave('sessions');
    
    req.userId = session.userId;
    req.user = dataService.researchData.users[session.userId];
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ success: false, error: 'Authentication failed' });
  }
};

const validateMedicalInput = (type) => (req, res, next) => {
  if (req.body.medicalData) {
    const validation = dataService.validateMedicalData(req.body.medicalData, type);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid medical data',
        details: validation.errors
      });
    }
  }
  next();
};

// ==================== API ROUTES ====================

// Health check with detailed status
app.get('/health', (req, res) => {
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();
  
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'ThoraxLab Research Platform',
    version: '3.5.0',
    environment: isProduction ? 'production' : 'development',
    uptime: `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`,
    memory: {
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`
    },
    data: {
      projects: Object.keys(dataService.researchData.projects).length,
      users: Object.keys(dataService.researchData.users).length,
      discussions: Object.keys(dataService.researchData.discussions).length,
      activeSessions: Object.keys(dataService.sessionsData).length
    }
  });
});

// API status with feature flags
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    service: 'ThoraxLab Research Platform',
    version: '3.5.0',
    timestamp: new Date().toISOString(),
    environment: isProduction ? 'production' : 'development',
    features: dataService.researchData.config.features,
    endpoints: {
      login: 'POST /api/login',
      projects: 'GET /api/projects',
      createProject: 'POST /api/projects',
      stats: 'GET /api/stats',
      templates: 'GET /api/templates',
      search: 'GET /api/search',
      notifications: 'GET /api/notifications'
    }
  });
});

// User login with enhanced response
app.post('/api/login', async (req, res) => {
  try {
    const { name, email, institution, role = 'clinician' } = req.body;
    
    if (!name || !email) {
      return res.status(400).json({
        success: false,
        error: 'Name and email are required'
      });
    }

    // Check if user exists
    const existingUser = Object.values(dataService.researchData.users)
      .find(u => u.email.toLowerCase() === email.toLowerCase());
    
    let userId;
    if (existingUser) {
      userId = existingUser.id;
      // Update last activity
      existingUser.lastActivity = new Date().toISOString();
    } else {
      // Create new user
      userId = `user-${uuidv4().slice(0, 8)}`;
      dataService.researchData.users[userId] = {
        id: userId,
        name,
        email: email.toLowerCase(),
        role,
        institution: institution || 'General Hospital',
        specialty: 'Pneumology',
        impactScore: 100,
        projects: [],
        notificationsEnabled: true,
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        preferences: {
          theme: 'medical',
          notifications: {
            discussions: true,
            mentions: true,
            projectUpdates: true
          }
        }
      };
    }

    // Create session
    const sessionId = `session-${uuidv4()}`;
    dataService.sessionsData[sessionId] = {
      userId,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      lastActivity: new Date().toISOString(),
      userAgent: req.get('User-Agent')
    };

    // Log activity
    dataService.logActivity(userId, 'login', {
      method: 'email',
      institution: institution || 'General Hospital'
    });

    await dataService.queueSave('research');
    await dataService.queueSave('sessions');

    res.json({
      success: true,
      user: {
        id: userId,
        name,
        email: email.toLowerCase(),
        institution: institution || 'General Hospital',
        role,
        impactScore: dataService.researchData.users[userId].impactScore || 100,
        projectCount: dataService.researchData.users[userId].projects?.length || 0
      },
      sessionId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      features: dataService.researchData.config.features
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get current user profile
app.get('/api/me', authenticate, (req, res) => {
  try {
    const user = dataService.researchData.users[req.userId];
    const userProjects = user.projects?.map(pid => dataService.researchData.projects[pid]) || [];
    
    res.json({
      success: true,
      user: {
        ...user,
        projects: userProjects.filter(p => p), // Filter out any deleted projects
        stats: {
          projectCount: userProjects.length,
          discussionCount: Object.values(dataService.researchData.discussions)
            .filter(d => d.authorId === req.userId).length,
          commentCount: Object.values(dataService.researchData.discussions)
            .reduce((sum, d) => sum + (d.comments?.filter(c => c.authorId === req.userId).length || 0), 0)
        }
      },
      notifications: dataService.getUserNotifications(req.userId, true).length
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ success: false, error: 'Failed to load user profile' });
  }
});

// Get all projects with pagination and filtering
app.get('/api/projects', (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status;
    const search = req.query.search;
    const tags = req.query.tags ? req.query.tags.split(',') : [];
    
    let projects = Object.values(dataService.researchData.projects);
    
    // Apply filters
    if (status) {
      projects = projects.filter(p => p.status === status);
    }
    
    if (tags.length > 0) {
      projects = projects.filter(p => 
        p.tags && tags.every(tag => p.tags.includes(tag))
      );
    }
    
    if (search) {
      projects = dataService.searchProjects(search, { status, tags });
    }
    
    // Sort by updated date (newest first)
    projects.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
    
    // Pagination
    const total = projects.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = Math.min(startIndex + limit, total);
    const paginatedProjects = projects.slice(startIndex, endIndex);
    
    // Enrich with statistics
    const enrichedProjects = paginatedProjects.map(project => ({
      ...project,
      stats: dataService.getProjectStatistics(project.id)
    }));
    
    res.json({
      success: true,
      projects: enrichedProjects,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      },
      filters: {
        status,
        search,
        tags
      }
    });
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({ success: false, error: 'Failed to load projects' });
  }
});

// Get single project with detailed statistics
app.get('/api/projects/:id', (req, res) => {
  try {
    const projectId = req.params.id;
    const project = dataService.researchData.projects[projectId];

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    // Get team members
    const teamMembers = project.teamMembers ? 
      project.teamMembers.map(memberId => dataService.researchData.users[memberId]).filter(Boolean) :
      [dataService.researchData.users[project.leadId]].filter(Boolean);

    // Get similar projects
    const similarProjects = dataService.getSimilarProjects(projectId, 3);

    res.json({
      success: true,
      project: {
        ...project,
        teamDetails: teamMembers,
        similarProjects,
        statistics: dataService.getProjectStatistics(projectId),
        timeline: dataService.estimateProjectCompletion(project)
      }
    });
  } catch (error) {
    console.error('Get project error:', error);
    res.status(500).json({ success: false, error: 'Failed to load project' });
  }
});

// Get project discussions with pagination
app.get('/api/projects/:id/discussions', (req, res) => {
  try {
    const projectId = req.params.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    
    let discussions = Object.values(dataService.researchData.discussions)
      .filter(d => d.projectId === projectId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Pagination
    const total = discussions.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = Math.min(startIndex + limit, total);
    const paginatedDiscussions = discussions.slice(startIndex, endIndex);

    res.json({
      success: true,
      discussions: paginatedDiscussions,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Get discussions error:', error);
    res.status(500).json({ success: false, error: 'Failed to load discussions' });
  }
});

// Create project with template support
app.post('/api/projects', authenticate, validateMedicalInput('patient'), async (req, res) => {
  try {
    const { title, description, status, tags, template, medicalData } = req.body;
    
    if (!title || !description) {
      return res.status(400).json({
        success: false,
        error: 'Title and description are required'
      });
    }

    const projectId = `project-${Date.now()}`;
    
    // Apply template if specified
    let templateData = {};
    if (template && dataService.researchData.researchTemplates[template]) {
      const templateConfig = dataService.researchData.researchTemplates[template];
      templateData = {
        template: templateConfig.name,
        templateId: template,
        fields: templateConfig.fields.reduce((acc, field) => {
          acc[field] = req.body[field] || '';
          return acc;
        }, {})
      };
    }
    
    const project = {
      id: projectId,
      title: title.trim(),
      description: description.trim(),
      status: status || 'planning',
      tags: tags || ['Clinical Research', 'Pneumology'],
      lead: req.user.name,
      leadId: req.userId,
      teamMembers: [req.userId],
      discussionCount: 0,
      consensusScore: 75,
      startDate: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      medicalData: medicalData || null,
      ...templateData
    };

    dataService.researchData.projects[projectId] = project;
    
    // Add project to user's list
    if (!req.user.projects) req.user.projects = [];
    req.user.projects.push(projectId);
    req.user.impactScore = (req.user.impactScore || 100) + 10;
    req.user.lastActivity = new Date().toISOString();
    
    // Log activity
    dataService.logActivity(req.userId, 'create_project', {
      projectId,
      title: project.title,
      template: template || 'custom'
    });
    
    // Create welcome discussion
    const discussionId = `disc-${Date.now()}`;
    const welcomeDiscussion = {
      id: discussionId,
      projectId,
      title: 'Welcome to the project!',
      content: `Let's use this space to discuss our research on "${project.title}". Feel free to ask questions, share insights, or suggest changes.`,
      author: 'ThoraxLab System',
      authorId: 'system',
      upvotes: 0,
      downvotes: 0,
      comments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isSystem: true
    };
    
    dataService.researchData.discussions[discussionId] = welcomeDiscussion;
    
    await dataService.queueSave('research');

    // Notify via Socket.IO
    io.emit('projectCreated', {
      project,
      discussion: welcomeDiscussion,
      userId: req.userId
    });

    res.json({
      success: true,
      projectId,
      project,
      discussion: welcomeDiscussion,
      message: 'Project created successfully'
    });

  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ success: false, error: 'Failed to create project' });
  }
});

// Update project
app.put('/api/projects/:id', authenticate, async (req, res) => {
  try {
    const projectId = req.params.id;
    const project = dataService.researchData.projects[projectId];
    
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }
    
    // Check permission (lead or team member)
    if (project.leadId !== req.userId && !project.teamMembers?.includes(req.userId)) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to update this project'
      });
    }
    
    // Update allowed fields
    const allowedUpdates = ['title', 'description', 'status', 'tags', 'medicalData'];
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        project[field] = req.body[field];
      }
    });
    
    project.updatedAt = new Date().toISOString();
    
    // Log activity
    dataService.logActivity(req.userId, 'update_project', {
      projectId,
      changes: Object.keys(req.body).filter(k => allowedUpdates.includes(k))
    });
    
    await dataService.queueSave('research');
    
    // Notify team members
    const teamMembers = project.teamMembers || [project.leadId];
    teamMembers.forEach(memberId => {
      if (memberId !== req.userId) {
        dataService.createNotification(memberId, 'project_updated', {
          projectId,
          projectTitle: project.title,
          updatedBy: req.user.name,
          changes: Object.keys(req.body).filter(k => allowedUpdates.includes(k))
        });
      }
    });
    
    // Socket.IO broadcast
    io.to(`project:${projectId}`).emit('projectUpdated', {
      project,
      updatedBy: req.userId
    });

    res.json({
      success: true,
      project,
      message: 'Project updated successfully'
    });

  } catch (error) {
    console.error('Update project error:', error);
    res.status(500).json({ success: false, error: 'Failed to update project' });
  }
});

// Get enhanced stats
app.get('/api/stats', (req, res) => {
  try {
    const analytics = dataService.updateAnalyticsCache();
    
    res.json({
      success: true,
      stats: analytics,
      trends: {
        dailyProjects: this.calculateDailyTrend(dataService.researchData.projects),
        dailyUsers: this.calculateDailyTrend(dataService.researchData.users),
        engagement: this.calculateEngagementTrend(dataService.researchData.discussions)
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to load stats' });
  }
});

// Search across projects, discussions, and users
app.get('/api/search', (req, res) => {
  try {
    const query = req.query.q;
    const type = req.query.type || 'all';
    const limit = parseInt(req.query.limit) || 10;
    
    if (!query || query.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters'
      });
    }
    
    const results = {
      projects: [],
      discussions: [],
      users: []
    };
    
    if (type === 'all' || type === 'projects') {
      results.projects = dataService.searchProjects(query).slice(0, limit);
    }
    
    if (type === 'all' || type === 'discussions') {
      const discussions = Object.values(dataService.researchData.discussions);
      results.discussions = discussions
        .filter(d => 
          d.title.toLowerCase().includes(query.toLowerCase()) ||
          d.content.toLowerCase().includes(query.toLowerCase())
        )
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, limit);
    }
    
    if (type === 'all' || type === 'users') {
      const users = Object.values(dataService.researchData.users);
      results.users = users
        .filter(u => 
          u.name.toLowerCase().includes(query.toLowerCase()) ||
          u.institution.toLowerCase().includes(query.toLowerCase())
        )
        .slice(0, limit);
    }
    
    res.json({
      success: true,
      query,
      type,
      results,
      counts: {
        projects: results.projects.length,
        discussions: results.discussions.length,
        users: results.users.length
      }
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ success: false, error: 'Search failed' });
  }
});

// Get research templates
app.get('/api/templates', (req, res) => {
  try {
    const templates = dataService.researchData.researchTemplates;
    
    res.json({
      success: true,
      templates: Object.values(templates).filter(t => t.status === 'active'),
      count: Object.keys(templates).length
    });
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({ success: false, error: 'Failed to load templates' });
  }
});

// Get template by ID
app.get('/api/templates/:id', (req, res) => {
  try {
    const templateId = req.params.id;
    const templates = dataService.researchData.researchTemplates;
    const template = Object.values(templates).find(t => t.id === templateId);
    
    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found'
      });
    }
    
    res.json({
      success: true,
      template
    });
  } catch (error) {
    console.error('Get template error:', error);
    res.status(500).json({ success: false, error: 'Failed to load template' });
  }
});

// User notifications
app.get('/api/notifications', authenticate, (req, res) => {
  try {
    const unreadOnly = req.query.unread === 'true';
    const notifications = dataService.getUserNotifications(req.userId, unreadOnly);
    
    res.json({
      success: true,
      notifications,
      count: notifications.length,
      unreadCount: dataService.getUserNotifications(req.userId, true).length
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ success: false, error: 'Failed to load notifications' });
  }
});

// Mark notification as read
app.post('/api/notifications/:id/read', authenticate, (req, res) => {
  try {
    const notificationId = req.params.id;
    const success = dataService.markNotificationAsRead(req.userId, notificationId);
    
    if (success) {
      res.json({
        success: true,
        message: 'Notification marked as read'
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }
  } catch (error) {
    console.error('Mark notification error:', error);
    res.status(500).json({ success: false, error: 'Failed to mark notification' });
  }
});

// Mark all notifications as read
app.post('/api/notifications/read-all', authenticate, (req, res) => {
  try {
    const success = dataService.markAllNotificationsAsRead(req.userId);
    
    if (success) {
      res.json({
        success: true,
        message: 'All notifications marked as read'
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'No notifications found'
      });
    }
  } catch (error) {
    console.error('Mark all notifications error:', error);
    res.status(500).json({ success: false, error: 'Failed to mark notifications' });
  }
});

// User profile update
app.put('/api/profile', authenticate, async (req, res) => {
  try {
    const user = dataService.researchData.users[req.userId];
    const allowedUpdates = ['name', 'institution', 'specialty', 'preferences'];
    
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        user[field] = req.body[field];
      }
    });
    
    user.updatedAt = new Date().toISOString();
    await dataService.queueSave('research');
    
    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        institution: user.institution,
        role: user.role,
        specialty: user.specialty,
        preferences: user.preferences
      },
      message: 'Profile updated successfully'
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, error: 'Failed to update profile' });
  }
});

// Export project data
app.get('/api/projects/:id/export', authenticate, (req, res) => {
  try {
    const projectId = req.params.id;
    const format = req.query.format || 'json';
    const project = dataService.researchData.projects[projectId];
    
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }
    
    // Get discussions and comments
    const discussions = Object.values(dataService.researchData.discussions)
      .filter(d => d.projectId === projectId);
    
    // Get team members
    const teamMembers = project.teamMembers ? 
      project.teamMembers.map(memberId => {
        const user = dataService.researchData.users[memberId];
        return user ? {
          id: user.id,
          name: user.name,
          email: user.email,
          institution: user.institution,
          role: user.role
        } : null;
      }).filter(Boolean) : [];
    
    const exportData = {
      project: {
        ...project,
        teamMembers,
        statistics: dataService.getProjectStatistics(projectId)
      },
      discussions,
      exportDate: new Date().toISOString(),
      exportedBy: req.user.name,
      exportedById: req.userId
    };
    
    // Log export activity
    dataService.logActivity(req.userId, 'export_project', {
      projectId,
      format,
      includesDiscussions: discussions.length
    });
    
    if (format === 'csv') {
      // Convert to CSV (simplified)
      const csv = this.convertToCSV(exportData);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="thoraxlab-project-${projectId}.csv"`);
      return res.send(csv);
    } else if (format === 'pdf') {
      // For PDF, we'd use a library like pdfkit
      res.json({
        success: true,
        message: 'PDF export coming soon',
        data: exportData
      });
    } else {
      // Default JSON
      res.json({
        success: true,
        ...exportData
      });
    }
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ success: false, error: 'Failed to export project' });
  }
});

// ==================== SOCKET.IO ENHANCED HANDLERS ====================
io.on('connection', (socket) => {
  console.log('🔌 User connected:', socket.id);
  
  // Store user info with socket
  let socketUser = null;
  
  socket.on('authenticate', async (data) => {
    try {
      const { sessionId } = data;
      const session = dataService.sessionsData[sessionId];
      
      if (session) {
        socketUser = {
          id: session.userId,
          sessionId,
          socketId: socket.id
        };
        
        // Update session activity
        session.lastActivity = new Date().toISOString();
        await dataService.queueSave('sessions');
        
        socket.emit('authenticated', {
          success: true,
          userId: session.userId
        });
        
        console.log(`✅ Socket authenticated: ${session.userId}`);
      } else {
        socket.emit('authentication_failed', {
          success: false,
          error: 'Invalid session'
        });
      }
    } catch (error) {
      console.error('Socket auth error:', error);
      socket.emit('error', { error: 'Authentication failed' });
    }
  });
  
  socket.on('joinProject', (projectId) => {
    if (!socketUser) {
      socket.emit('error', { error: 'Not authenticated' });
      return;
    }
    
    socket.join(`project:${projectId}`);
    socket.join(`user:${socketUser.id}`);
    
    socket.emit('projectJoined', { 
      projectId,
      timestamp: new Date().toISOString()
    });
    
    console.log(`👥 ${socketUser.id} joined project: ${projectId}`);
  });
  
  socket.on('leaveProject', (projectId) => {
    socket.leave(`project:${projectId}`);
  });
  
  socket.on('createDiscussion', async (data) => {
    try {
      if (!socketUser) {
        socket.emit('error', { error: 'Not authenticated' });
        return;
      }
      
      const { projectId, discussion } = data;
      
      if (!discussion?.title || !discussion?.content) {
        socket.emit('error', { error: 'Title and content are required' });
        return;
      }
      
      const user = dataService.researchData.users[socketUser.id];
      if (!user) {
        socket.emit('error', { error: 'User not found' });
        return;
      }
      
      const discussionId = `disc-${Date.now()}`;
      
      const newDiscussion = {
        id: discussionId,
        projectId,
        title: discussion.title.trim(),
        content: discussion.content.trim(),
        author: user.name,
        authorId: socketUser.id,
        authorInstitution: user.institution,
        upvotes: 0,
        downvotes: 0,
        comments: [],
        mentions: this.extractMentions(discussion.content),
        tags: discussion.tags || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      dataService.researchData.discussions[discussionId] = newDiscussion;
      
      // Update project discussion count
      const project = dataService.researchData.projects[projectId];
      if (project) {
        project.discussionCount = (project.discussionCount || 0) + 1;
        project.updatedAt = new Date().toISOString();
      }
      
      // Log activity
      dataService.logActivity(socketUser.id, 'create_discussion', {
        projectId,
        discussionId,
        title: newDiscussion.title
      });
      
      await dataService.queueSave('research');
      
      // Notify mentioned users
      if (newDiscussion.mentions && newDiscussion.mentions.length > 0) {
        newDiscussion.mentions.forEach(mentionedUserId => {
          if (mentionedUserId !== socketUser.id) {
            dataService.createNotification(mentionedUserId, 'mention', {
              projectId,
              projectTitle: project?.title,
              discussionId,
              discussionTitle: newDiscussion.title,
              mentionedBy: user.name,
              content: newDiscussion.content.substring(0, 100) + '...'
            });
            
            // Real-time notification for online users
            io.to(`user:${mentionedUserId}`).emit('notification', {
              type: 'mention',
              discussionId,
              projectId,
              title: `You were mentioned in "${newDiscussion.title}"`
            });
          }
        });
      }
      
      // Broadcast to project room
      io.to(`project:${projectId}`).emit('discussionCreated', newDiscussion);
      
      // Send confirmation to sender
      socket.emit('discussionCreatedConfirm', {
        discussionId,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Create discussion error:', error);
      socket.emit('error', { error: 'Failed to create discussion' });
    }
  });
  
  socket.on('addComment', async (data) => {
    try {
      if (!socketUser) {
        socket.emit('error', { error: 'Not authenticated' });
        return;
      }
      
      const { discussionId, comment } = data;
      const discussion = dataService.researchData.discussions[discussionId];
      
      if (!discussion) {
        socket.emit('error', { error: 'Discussion not found' });
        return;
      }
      
      const user = dataService.researchData.users[socketUser.id];
      if (!user) {
        socket.emit('error', { error: 'User not found' });
        return;
      }
      
      if (!discussion.comments) discussion.comments = [];
      
      const newComment = {
        id: `comment-${Date.now()}`,
        author: user.name,
        authorId: socketUser.id,
        authorInstitution: user.institution,
        content: comment.content,
        mentions: this.extractMentions(comment.content),
        timestamp: new Date().toISOString()
      };
      
      discussion.comments.push(newComment);
      discussion.updatedAt = new Date().toISOString();
      
      // Log activity
      dataService.logActivity(socketUser.id, 'add_comment', {
        discussionId,
        projectId: discussion.projectId,
        commentLength: comment.content.length
      });
      
      await dataService.queueSave('research');
      
      // Notify discussion author (if different from commenter)
      if (discussion.authorId !== socketUser.id) {
        dataService.createNotification(discussion.authorId, 'comment', {
          projectId: discussion.projectId,
          discussionId,
          discussionTitle: discussion.title,
          commentedBy: user.name,
          comment: comment.content.substring(0, 100) + '...'
        });
        
        // Real-time notification
        io.to(`user:${discussion.authorId}`).emit('notification', {
          type: 'comment',
          discussionId,
          projectId: discussion.projectId,
          title: `New comment on "${discussion.title}"`
        });
      }
      
      // Notify mentioned users
      if (newComment.mentions && newComment.mentions.length > 0) {
        newComment.mentions.forEach(mentionedUserId => {
          if (mentionedUserId !== socketUser.id && mentionedUserId !== discussion.authorId) {
            dataService.createNotification(mentionedUserId, 'mention', {
              projectId: discussion.projectId,
              discussionId,
              discussionTitle: discussion.title,
              mentionedBy: user.name,
              content: comment.content.substring(0, 100) + '...'
            });
            
            io.to(`user:${mentionedUserId}`).emit('notification', {
              type: 'mention',
              discussionId,
              projectId: discussion.projectId,
              title: `You were mentioned in a comment on "${discussion.title}"`
            });
          }
        });
      }
      
      // Broadcast to all in project room
      io.to(`project:${discussion.projectId}`).emit('commentAdded', {
        discussionId,
        comment: newComment
      });
      
      socket.emit('commentAddedConfirm', {
        commentId: newComment.id,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Add comment error:', error);
      socket.emit('error', { error: 'Failed to add comment' });
    }
  });
  
  socket.on('vote', async (data) => {
    try {
      if (!socketUser) {
        socket.emit('error', { error: 'Not authenticated' });
        return;
      }
      
      const { discussionId, voteType } = data;
      const discussion = dataService.researchData.discussions[discussionId];
      
      if (!discussion) {
        socket.emit('error', { error: 'Discussion not found' });
        return;
      }
      
      // Initialize vote tracking if not exists
      if (!discussion.votes) discussion.votes = {};
      
      // Check if user already voted
      const previousVote = discussion.votes[socketUser.id];
      
      // Update counts
      if (previousVote === voteType) {
        // Same vote - remove it
        if (voteType === 'up') {
          discussion.upvotes = Math.max(0, (discussion.upvotes || 0) - 1);
        } else if (voteType === 'down') {
          discussion.downvotes = Math.max(0, (discussion.downvotes || 0) - 1);
        }
        delete discussion.votes[socketUser.id];
      } else {
        // New or changed vote
        if (previousVote === 'up') {
          discussion.upvotes = Math.max(0, (discussion.upvotes || 0) - 1);
        } else if (previousVote === 'down') {
          discussion.downvotes = Math.max(0, (discussion.downvotes || 0) - 1);
        }
        
        if (voteType === 'up') {
          discussion.upvotes = (discussion.upvotes || 0) + 1;
        } else if (voteType === 'down') {
          discussion.downvotes = (discussion.downvotes || 0) + 1;
        }
        
        discussion.votes[socketUser.id] = voteType;
      }
      
      discussion.updatedAt = new Date().toISOString();
      
      // Log activity
      dataService.logActivity(socketUser.id, voteType === 'up' ? 'upvote' : 'downvote', {
        discussionId,
        projectId: discussion.projectId
      });
      
      await dataService.queueSave('research');
      
      // Broadcast vote update
      io.to(`project:${discussion.projectId}`).emit('voteUpdate', {
        discussionId,
        upvotes: discussion.upvotes || 0,
        downvotes: discussion.downvotes || 0,
        voteCount: (discussion.upvotes || 0) + (discussion.downvotes || 0),
        userVote: discussion.votes[socketUser.id] || null
      });
      
    } catch (error) {
      console.error('Vote error:', error);
      socket.emit('error', { error: 'Failed to process vote' });
    }
  });
  
  socket.on('typing', (data) => {
    if (!socketUser) return;
    
    const { projectId, discussionId, isTyping } = data;
    
    socket.to(`project:${projectId}`).emit('userTyping', {
      userId: socketUser.id,
      userName: dataService.researchData.users[socketUser.id]?.name || 'User',
      discussionId,
      isTyping,
      timestamp: new Date().toISOString()
    });
  });
  
  socket.on('reaction', async (data) => {
    try {
      if (!socketUser) {
        socket.emit('error', { error: 'Not authenticated' });
        return;
      }
      
      const { discussionId, commentId, reaction } = data;
      const discussion = dataService.researchData.discussions[discussionId];
      
      if (!discussion) {
        socket.emit('error', { error: 'Discussion not found' });
        return;
      }
      
      const validReactions = ['👍', '👎', '❤️', '🎯', '❓', '💡'];
      if (!validReactions.includes(reaction)) {
        socket.emit('error', { error: 'Invalid reaction' });
        return;
      }
      
      let target = discussion;
      if (commentId) {
        const comment = discussion.comments?.find(c => c.id === commentId);
        if (!comment) {
          socket.emit('error', { error: 'Comment not found' });
          return;
        }
        target = comment;
      }
      
      if (!target.reactions) target.reactions = {};
      if (!target.reactions[reaction]) target.reactions[reaction] = [];
      
      // Toggle reaction
      const userIndex = target.reactions[reaction].indexOf(socketUser.id);
      if (userIndex > -1) {
        target.reactions[reaction].splice(userIndex, 1);
      } else {
        target.reactions[reaction].push(socketUser.id);
      }
      
      discussion.updatedAt = new Date().toISOString();
      await dataService.queueSave('research');
      
      // Broadcast reaction update
      io.to(`project:${discussion.projectId}`).emit('reactionUpdate', {
        discussionId,
        commentId,
        reaction,
        userId: socketUser.id,
        userReactions: target.reactions,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Reaction error:', error);
      socket.emit('error', { error: 'Failed to process reaction' });
    }
  });
  
  socket.on('disconnect', () => {
    console.log('🔌 User disconnected:', socket.id);
    
    if (socketUser) {
      // Notify project rooms user left
      // (We'd need to track which rooms the user was in)
    }
  });
});

// Helper function to extract mentions from text
function extractMentions(text) {
  const mentionRegex = /@(\w+)/g;
  const mentions = [];
  let match;
  while ((match = mentionRegex.exec(text)) !== null) {
    mentions.push(match[1]);
  }
  return mentions;
}

// Helper function to calculate daily trends
function calculateDailyTrend(items) {
  const dailyCounts = {};
  const now = new Date();
  
  Object.values(items).forEach(item => {
    const date = new Date(item.createdAt || item.lastActivity || now).toISOString().split('T')[0];
    dailyCounts[date] = (dailyCounts[date] || 0) + 1;
  });
  
  // Get last 7 days
  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    last7Days.push({
      date: dateStr,
      count: dailyCounts[dateStr] || 0
    });
  }
  
  return last7Days;
}

// Helper function to calculate engagement trend
function calculateEngagementTrend(discussions) {
  const weeklyEngagement = {};
  const now = new Date();
  
  Object.values(discussions).forEach(discussion => {
    const week = this.getWeekNumber(new Date(discussion.createdAt));
    weeklyEngagement[week] = weeklyEngagement[week] || { discussions: 0, comments: 0, votes: 0 };
    weeklyEngagement[week].discussions += 1;
    weeklyEngagement[week].comments += (discussion.comments?.length || 0);
    weeklyEngagement[week].votes += (discussion.upvotes || 0) + (discussion.downvotes || 0);
  });
  
  // Get last 4 weeks
  const last4Weeks = [];
  for (let i = 3; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - (i * 7));
    const week = this.getWeekNumber(date);
    last4Weeks.push({
      week: `Week ${week}`,
      ...(weeklyEngagement[week] || { discussions: 0, comments: 0, votes: 0 })
    });
  }
  
  return last4Weeks;
}

function getWeekNumber(date) {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

// ==================== ERROR HANDLING ====================

// 404 for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'API endpoint not found',
    path: req.originalUrl,
    timestamp: new Date().toISOString()
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('🔥 Server error:', err);
  
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: isProduction ? 'Something went wrong' : err.message,
    timestamp: new Date().toISOString()
  });
});

// ==================== SPA FALLBACK ====================
// ⚠️ MUST BE THE VERY LAST ROUTE ⚠️
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== START SERVER ====================
async function startServer() {
  try {
    await dataService.initialize();
    
    server.listen(PORT, () => {
      console.log(`
🎯 THORAXLAB ENHANCED PLATFORM RUNNING
========================================
🌐 URL: http://localhost:${PORT}
🔧 API Status: http://localhost:${PORT}/api/status
📊 Health: http://localhost:${PORT}/health
👥 Dashboard: http://localhost:${PORT}/

📈 Platform Stats:
   • Projects: ${Object.keys(dataService.researchData.projects).length}
   • Users: ${Object.keys(dataService.researchData.users).length}
   • Discussions: ${Object.keys(dataService.researchData.discussions).length}
   • Active Features: ${Object.keys(dataService.researchData.config.features).filter(k => dataService.researchData.config.features[k]).length}

🚀 Enhanced Features:
   ✅ Research Templates
   ✅ Medical Data Validation
   ✅ Real-time Notifications
   ✅ @mentions System
   ✅ Reaction Emojis
   ✅ Advanced Analytics
   ✅ Export Tools
   ✅ Search Functionality

💡 Ready for production use!
      `);
    });
  } catch (error) {
    console.error('💥 Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await dataService.saveResearch();
  await dataService.saveSessions();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down...');
  await dataService.saveResearch();
  await dataService.saveSessions();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Start the enhanced server
startServer().catch(console.error);
