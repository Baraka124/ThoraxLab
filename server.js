const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { database } = require('./database.js');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ========================
// CONFIGURATION
// ========================
const config = {
  jwtSecret: process.env.JWT_SECRET || 'thoraxlab-dev-secret-2024-change-in-production',
  jwtExpiresIn: '24h',
  rateLimitWindow: 15 * 60 * 1000, // 15 minutes
  rateLimitMax: 100 // limit each IP to 100 requests per windowMs
};

// ========================
// MIDDLEWARE
// ========================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https:"]
    }
  }
}));

app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://thoraxlab.up.railway.app', 'https://thorax-lab.vercel.app'] 
    : ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true
}));

app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: config.rateLimitWindow,
  max: config.rateLimitMax,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/', apiLimiter);

// ========================
// STATIC FILES
// ========================
app.use(express.static(path.join(__dirname)));
app.use('/data', express.static(path.join(__dirname, 'data')));

// ========================
// AUTHENTICATION MIDDLEWARE
// ========================
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ 
      success: false, 
      error: 'Authentication token required' 
    });
  }

  try {
    // Verify JWT token
    const decoded = jwt.verify(token, config.jwtSecret);
    
    // Check if session exists in database
    const session = await database.getSessionByToken(token);
    if (!session) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid or expired session' 
      });
    }

    // Get user from database
    const user = await database.getUser(session.user_id);
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    req.user = user;
    req.session = session;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        error: 'Token expired' 
      });
    }
    
    return res.status(403).json({ 
      success: false, 
      error: 'Invalid token' 
    });
  }
}

// ========================
// ERROR HANDLING MIDDLEWARE
// ========================
app.use((err, req, res, next) => {
  console.error('Server Error:', err);

  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

// ========================
// HEALTH CHECK ENDPOINTS
// ========================
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'thoraxlab-api',
    version: '1.0.0'
  });
});

app.get('/health/db', async (req, res) => {
  try {
    await database.connect();
    const testQuery = await database.get('SELECT 1 as test');
    
    res.status(200).json({
      status: 'ok',
      database: 'connected',
      test: testQuery.test === 1 ? 'ok' : 'error'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      database: 'disconnected',
      error: error.message
    });
  }
});

// ========================
// AUTHENTICATION ENDPOINTS
// ========================
app.post('/api/login', async (req, res, next) => {
  try {
    const { name, email, organization, role } = req.body;

    // Input validation
    if (!name || !email || !role) {
      return res.status(400).json({
        success: false,
        error: 'Name, email, and role are required'
      });
    }

    if (!['clinician', 'industry'].includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Role must be either clinician or industry'
      });
    }

    // Check if user exists
    let user = await database.findUserByEmail(email);
    
    // Create user if doesn't exist
    if (!user) {
      user = await database.createUser({
        name,
        email,
        organization: organization || '',
        role
      });
    }

    // Create JWT token
    const token = jwt.sign(
      { 
        userId: user.id,
        email: user.email,
        role: user.role 
      },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );

    // Create database session
    const session = await database.createSession(user.id, token, 24);

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        organization: user.organization,
        role: user.role,
        avatar_initials: user.avatar_initials
      }
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/logout', authenticateToken, async (req, res, next) => {
  try {
    await database.deleteSession(req.session.token);
    
    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/validate', authenticateToken, async (req, res) => {
  res.status(200).json({
    success: true,
    user: req.user
  });
});

// ========================
// PROJECT ENDPOINTS
// ========================
app.get('/api/projects', authenticateToken, async (req, res, next) => {
  try {
    const projects = await database.getProjectsForUser(req.user.id);
    
    res.status(200).json({
      success: true,
      projects: projects.map(p => ({
        ...p,
        team_count: 0 // Will be populated when we fetch team
      }))
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/projects', authenticateToken, async (req, res, next) => {
  try {
    const { title, description, type, objectives } = req.body;

    if (!title || !description || !type) {
      return res.status(400).json({
        success: false,
        error: 'Title, description, and type are required'
      });
    }

    const project = await database.createProject({
      title,
      description,
      type,
      objectives: objectives || { clinical: [], industry: [], shared: [] }
    }, req.user.id);

    // Get team count
    const team = await database.getProjectTeam(project.id);
    
    res.status(201).json({
      success: true,
      project: {
        ...project,
        team_count: team.length
      }
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/projects/:id', authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Check if user has access to project
    const hasAccess = await database.isUserInProject(id, req.user.id);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this project'
      });
    }

    const project = await database.getProject(id);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    // Get team and metrics
    const team = await database.getProjectTeam(id);
    const metrics = await database.getProjectMetrics(id);
    
    res.status(200).json({
      success: true,
      project: {
        ...project,
        team,
        metrics,
        team_count: team.length
      }
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/projects/:id/metrics', authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const hasAccess = await database.isUserInProject(id, req.user.id);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const metrics = await database.getProjectMetrics(id);
    
    res.status(200).json({
      success: true,
      metrics
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/projects/:id/activity', authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { limit = 10 } = req.query;
    
    const hasAccess = await database.isUserInProject(id, req.user.id);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const activity = await database.getProjectActivity(id, parseInt(limit));
    
    res.status(200).json({
      success: true,
      activity
    });
  } catch (error) {
    next(error);
  }
});

// ========================
// DASHBOARD ENDPOINTS
// ========================
app.get('/api/dashboard', authenticateToken, async (req, res, next) => {
  try {
    const dashboardData = await database.getDashboardData(req.user.id);
    
    // Calculate additional metrics for frontend
    const clinicalCount = Math.floor(Math.random() * 50) + 10; // Demo data
    const industryCount = Math.floor(Math.random() * 30) + 5;
    const crossCount = Math.floor(Math.random() * 20) + 3;
    
    res.status(200).json({
      success: true,
      dashboard: {
        metrics: {
          ...dashboardData.metrics,
          clinicalActivity: clinicalCount,
          industryActivity: industryCount,
          crossPollination: crossCount
        },
        activeProjects: dashboardData.recentProjects,
        recentActivity: dashboardData.recentActivity
      }
    });
  } catch (error) {
    next(error);
  }
});

// ========================
// DOCUMENTS ENDPOINTS
// ========================
app.get('/api/projects/:id/documents', authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { tags } = req.query;
    
    const hasAccess = await database.isUserInProject(id, req.user.id);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // For now, return demo data - in production, this would query documents table
    const documents = [
      {
        id: "doc_1",
        title: "COPD Clinical Trial Protocol v2.1",
        description: "Phase III trial design for exacerbation prediction algorithm validation in real-world settings.",
        tags: ["audience:clinical", "specialty:pulmonology", "type:protocol"],
        audience: "clinical",
        date: "2024-01-15",
        author: "Dr. Alex Chen",
        icon: "fas fa-file-medical"
      },
      {
        id: "doc_2",
        title: "Spirometry Data Pipeline Architecture",
        description: "Technical specification for real-time data ingestion, preprocessing, and quality validation.",
        tags: ["audience:technical", "domain:data", "type:api"],
        audience: "technical",
        date: "2024-01-20",
        author: "Sarah Rodriguez",
        icon: "fas fa-database"
      }
    ];

    // Filter by tags if provided
    let filteredDocs = documents;
    if (tags) {
      const tagArray = tags.split(',');
      filteredDocs = documents.filter(doc => 
        tagArray.every(tag => doc.tags.includes(tag))
      );
    }
    
    res.status(200).json({
      success: true,
      documents: filteredDocs
    });
  } catch (error) {
    next(error);
  }
});

// ========================
// KNOWLEDGE BRIDGE ENDPOINTS
// ========================
app.post('/api/translate', authenticateToken, async (req, res, next) => {
  try {
    const { text, direction = 'clinical-to-technical' } = req.body;

    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'Text is required for translation'
      });
    }

    // Demo translations - in production, this could use AI/ML
    const translations = {
      'copd exacerbation': {
        term: 'COPD Exacerbation',
        clinical: 'A sudden worsening of COPD symptoms including increased breathlessness, cough, and sputum production requiring medical intervention.',
        technical: 'Time-series classification problem detecting deterioration patterns in multivariate physiological signals using ensemble machine learning models.',
        analogy: 'Like a car engine warning light - detects early signs of trouble before complete breakdown.'
      },
      'fev1 variability': {
        term: 'FEV1 Variability',
        clinical: 'Changes in Forced Expiratory Volume in 1 second measurements over time, indicating lung function stability or deterioration.',
        technical: 'Standard deviation and trend analysis of time-series pulmonary function data for predictive modeling.',
        analogy: 'Like monitoring battery degradation patterns in smartphones.'
      }
    };

    const lowerText = text.toLowerCase();
    let translation = translations[lowerText];

    if (!translation) {
      // Generate dynamic translation
      translation = {
        term: text.charAt(0).toUpperCase() + text.slice(1),
        clinical: `${text} is assessed through patient symptoms, diagnostic tests, and outcome tracking.`,
        technical: `Technical implementation involves ${text.toLowerCase()} monitoring through data analysis and predictive modeling.`,
        analogy: 'Like building a weather station network to predict conditions.'
      };
    }
    
    res.status(200).json({
      success: true,
      translation: {
        ...translation,
        direction,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/translation/history', authenticateToken, async (req, res, next) => {
  try {
    // Demo history - in production, store in database
    const history = [
      {
        id: "trans_1",
        input: "COPD exacerbation",
        output: "Time-series classification problem",
        direction: "clinical-to-technical",
        timestamp: "2024-01-15T10:30:00Z"
      },
      {
        id: "trans_2",
        input: "Random forest classifier",
        output: "Ensemble decision-making tool",
        direction: "technical-to-clinical",
        timestamp: "2024-01-15T09:15:00Z"
      }
    ];
    
    res.status(200).json({
      success: true,
      history
    });
  } catch (error) {
    next(error);
  }
});

// ========================
// DISCUSSION ENDPOINTS (Stubs for future implementation)
// ========================
app.get('/api/projects/:id/discussions', authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const hasAccess = await database.isUserInProject(id, req.user.id);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const discussions = await database.getProjectDiscussions(id);
    
    res.status(200).json({
      success: true,
      discussions
    });
  } catch (error) {
    next(error);
  }
});

// ========================
// SERVER INITIALIZATION
// ========================
async function startServer() {
  try {
    // Initialize database
    await database.connect();
    console.log('Database connected successfully');

    // Start server
    app.listen(PORT, () => {
      console.log(`
🚀 ThoraxLab Server Started!
─────────────────────────────
✅ Server:   http://localhost:${PORT}
✅ Health:   http://localhost:${PORT}/health
✅ Database: Connected
✅ Mode:     ${process.env.NODE_ENV || 'development'}
─────────────────────────────
      `);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('SIGTERM received. Shutting down gracefully...');
      await database.close();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      console.log('SIGINT received. Shutting down gracefully...');
      await database.close();
      process.exit(0);
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

// Export for testing
module.exports = { app, database };
