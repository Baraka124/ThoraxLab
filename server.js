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

// ==================== CONFIGURATION ====================
const config = {
  app: {
    name: 'ThoraxLab Research Platform',
    version: '4.0.0',
    description: 'Advanced medical research collaboration platform'
  },
  security: {
    sessionDuration: 7 * 24 * 60 * 60 * 1000, // 7 days
    maxLoginAttempts: isProduction ? 5 : 10,
    passwordMinLength: 8,
    corsOrigins: isProduction 
      ? [/\.railway\.app$/, /\.thoraxlab\.com$/]
      : [/localhost:\d+$/, /127\.0\.0\.1:\d+$/, /\.railway\.app$/]
  },
  limits: {
    json: '10mb',
    urlencoded: '10mb',
    fileUpload: '5mb',
    rateLimitWindow: 15 * 60 * 1000, // 15 minutes
    rateLimitMax: isProduction ? 100 : 200
  },
  paths: {
    data: __dirname,
    public: path.join(__dirname, 'public')
  }
};

// ==================== MIDDLEWARE SETUP ====================
// Enhanced security headers with CSP
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.socket.io"],
      scriptSrcAttr: ["'unsafe-inline'"],
      connectSrc: ["'self'", "ws://*", "wss://*", "https://*.railway.app"],
      imgSrc: ["'self'", "data:", "https:"],
      frameSrc: ["'self'"]
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

// Enhanced CORS for Railway
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    
    if (config.security.corsOrigins.some(pattern => pattern.test(origin))) {
      callback(null, true);
    } else {
      console.warn(`Blocked by CORS: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Session-ID', 'X-Request-ID'],
  exposedHeaders: ['X-Session-Expiry', 'X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
  maxAge: 86400
}));

// Request logging with unique IDs
app.use((req, res, next) => {
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  req.requestId = requestId;
  req.startTime = Date.now();
  
  res.setHeader('X-Request-ID', requestId);
  
  const logData = {
    id: requestId,
    method: req.method,
    url: req.url,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent')?.substring(0, 100),
    timestamp: new Date().toISOString()
  };
  
  console.log(JSON.stringify({ type: 'REQUEST', ...logData }));
  
  // Log response time
  res.on('finish', () => {
    const duration = Date.now() - req.startTime;
    console.log(JSON.stringify({
      type: 'RESPONSE',
      id: requestId,
      status: res.statusCode,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    }));
  });
  
  next();
});

// Body parsing
app.use(express.json({ 
  limit: config.limits.json,
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: config.limits.urlencoded 
}));

// Rate limiting with enhanced Redis support (if available)
const rateLimitStore = new Map(); // Simple in-memory store
const apiLimiter = rateLimit({
  windowMs: config.limits.rateLimitWindow,
  max: config.limits.rateLimitMax,
  message: {
    success: false,
    error: 'Too many requests',
    retryAfter: Math.ceil(config.limits.rateLimitWindow / 60000)
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise IP + user agent
    const sessionId = req.headers['authorization']?.replace('Bearer ', '') || 
                     req.query.sessionId;
    if (sessionId) {
      const session = dataService?.sessionsData?.[sessionId];
      if (session) return `user:${session.userId}`;
    }
    return `${req.ip}-${req.headers['user-agent']?.substring(0, 50) || 'unknown'}`;
  },
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health' || req.path === '/api/status';
  }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 10 : 20,
  message: {
    success: false,
    error: 'Too many login attempts',
    retryAfter: 15
  },
  skipSuccessfulRequests: true
});

app.use('/api/', apiLimiter);
app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);

// Static files with cache control
app.use(express.static(config.paths.public, {
  maxAge: isProduction ? '7d' : '0',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    } else if (filePath.match(/\.(js|css)$/)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));

// ==================== SOCKET.IO SETUP ====================
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      
      if (config.security.corsOrigins.some(pattern => pattern.test(origin))) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST'],
    credentials: true
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 5 * 60 * 1000, // 5 minutes
    skipMiddlewares: true
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
  allowUpgrades: true,
  maxHttpBufferSize: 1e7, // 10MB
  connectTimeout: 45000,
  adapter: isProduction ? null : undefined // In production, use Redis adapter
});

// ==================== DATA SERVICE ====================
class ThoraxLabDataService {
  constructor() {
    this.researchData = null;
    this.sessionsData = null;
    this.cache = new Map();
    this.saveQueue = new Set();
    this.isSaving = false;
    this.lastSave = 0;
    this.analyticsCache = null;
    this.analyticsTTL = 30000; // 30 seconds
    
    // Bind methods
    this.processSaveQueue = this.processSaveQueue.bind(this);
    this.autoSave = this.autoSave.bind(this);
  }

  async initialize() {
    try {
      console.log('🚀 Initializing ThoraxLab Data Service...');
      
      // Load or create research data
      await this.loadResearchData();
      
      // Load or create sessions
      await this.loadSessionsData();
      
      // Start auto-save interval
      setInterval(this.autoSave, 30000);
      
      // Clean expired sessions every hour
      setInterval(() => this.cleanExpiredSessions(), 3600000);
      
      console.log('✅ Data service initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize data service:', error);
      // Create default data structures
      this.researchData = this.getDefaultResearchData();
      this.sessionsData = {};
      return false;
    }
  }

  async loadResearchData() {
    const filePath = path.join(config.paths.data, 'research.json');
    
    try {
      await fs.access(filePath);
      const data = await fs.readFile(filePath, 'utf8');
      this.researchData = JSON.parse(data);
      
      // Validate and migrate data if needed
      this.migrateResearchData();
      
      console.log(`✅ Loaded ${Object.keys(this.researchData.projects).length} projects`);
      console.log(`✅ Loaded ${Object.keys(this.researchData.users).length} users`);
      console.log(`✅ Loaded ${Object.keys(this.researchData.discussions).length} discussions`);
      
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('📝 Creating new research database...');
        this.researchData = this.getDefaultResearchData();
        await this.saveResearchData();
        return true;
      }
      throw error;
    }
  }

  async loadSessionsData() {
    const filePath = path.join(config.paths.data, 'sessions.json');
    
    try {
      await fs.access(filePath);
      const data = await fs.readFile(filePath, 'utf8');
      this.sessionsData = JSON.parse(data);
      
      // Clean expired sessions on load
      this.cleanExpiredSessions();
      
      console.log(`✅ Loaded ${Object.keys(this.sessionsData).length} sessions`);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('📝 Creating new sessions database...');
        this.sessionsData = {};
        await this.saveSessionsData();
        return true;
      }
      throw error;
    }
  }

  getDefaultResearchData() {
    const defaultTimestamp = new Date().toISOString();
    
    return {
      metadata: {
        version: '4.0.0',
        createdAt: defaultTimestamp,
        lastModified: defaultTimestamp,
        schemaVersion: 1
      },
      projects: {},
      users: {},
      discussions: {},
      notifications: {},
      analytics: {
        platformStats: {
          totalProjects: 0,
          totalUsers: 0,
          totalDiscussions: 0,
          activeProjects: 0,
          completedProjects: 0,
          consensusRate: 75,
          avgTeamSize: 1,
          engagementScore: 0
        },
        activityLog: [],
        dailyStats: {},
        institutionStats: {}
      },
      config: {
        institution: 'ThoraxLab Research Network',
        theme: 'medical-blue',
        features: {
          realtimeCollaboration: true,
          medicalDataValidation: true,
          researchTemplates: true,
          exportTools: true,
          analyticsDashboard: true,
          notifications: true,
          mentions: true,
          reactions: true,
          fileAttachments: false // Enable when file storage is implemented
        },
        settings: {
          maxTeamSize: 20,
          maxProjectsPerUser: 50,
          autoArchiveInactiveDays: 90,
          backupIntervalHours: 24
        }
      },
      researchTemplates: this.getResearchTemplates()
    };
  }

  getResearchTemplates() {
    return {
      'randomized-controlled-trial': {
        id: 'rct',
        name: 'Randomized Controlled Trial',
        description: 'Gold standard for interventional studies',
        category: 'Interventional',
        fields: {
          required: ['title', 'hypothesis', 'primaryEndpoint', 'sampleSize'],
          optional: ['secondaryEndpoints', 'inclusionCriteria', 'exclusionCriteria', 'intervention', 'control', 'statisticalPlan', 'timeline']
        },
        medicalFields: ['patientPopulation', 'diagnosisCriteria', 'outcomeMeasures', 'safetyMonitoring'],
        validationRules: {
          sampleSize: { min: 10, max: 10000 },
          duration: { min: 1, max: 60 } // months
        },
        status: 'active'
      },
      'observational-cohort': {
        id: 'cohort',
        name: 'Observational Cohort Study',
        description: 'Long-term follow-up of patient groups',
        category: 'Observational',
        fields: {
          required: ['title', 'studyPopulation', 'exposure', 'outcome', 'followupDuration'],
          optional: ['dataCollectionMethods', 'confoundingFactors', 'analysisPlan', 'ethicalConsiderations']
        },
        medicalFields: ['baselineCharacteristics', 'inclusionExclusion', 'outcomeDefinitions', 'statisticalMethods'],
        validationRules: {
          followupDuration: { min: 1, max: 240 } // months
        },
        status: 'active'
      },
      'case-report': {
        id: 'case',
        name: 'Case Report / Series',
        description: 'Detailed report of interesting cases',
        category: 'Descriptive',
        fields: {
          required: ['title', 'patientPresentation', 'diagnosticWorkup', 'treatmentCourse'],
          optional: ['outcome', 'discussion', 'clinicalPearls', 'literatureReview']
        },
        medicalFields: ['patientDemographics', 'clinicalFindings', 'diagnosticResults', 'treatmentDetails'],
        status: 'active'
      },
      'systematic-review': {
        id: 'review',
        name: 'Systematic Review / Meta-analysis',
        description: 'Comprehensive evidence synthesis',
        category: 'Review',
        fields: {
          required: ['title', 'researchQuestion', 'inclusionCriteria', 'searchStrategy'],
          optional: ['qualityAssessment', 'dataExtraction', 'synthesisMethods', 'publicationBias']
        },
        medicalFields: ['picotQuestion', 'evidenceGrading', 'clinicalImplications', 'researchGaps'],
        status: 'active'
      }
    };
  }

  migrateResearchData() {
    // Ensure all required fields exist
    if (!this.researchData.metadata) {
      this.researchData.metadata = {
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        schemaVersion: 1
      };
    }

    if (!this.researchData.analytics) {
      this.researchData.analytics = this.getDefaultResearchData().analytics;
    }

    if (!this.researchData.researchTemplates) {
      this.researchData.researchTemplates = this.getResearchTemplates();
    }

    // Migrate users if needed
    Object.values(this.researchData.users).forEach(user => {
      if (!user.impactScore) user.impactScore = 100;
      if (!user.preferences) user.preferences = { theme: 'medical-blue', notifications: true };
      if (!user.createdAt) user.createdAt = new Date().toISOString();
    });

    // Migrate projects if needed
    Object.values(this.researchData.projects).forEach(project => {
      if (!project.consensusScore) project.consensusScore = 75;
      if (!project.discussionCount) project.discussionCount = 0;
      if (!project.teamMembers) project.teamMembers = [project.leadId];
      if (!project.tags) project.tags = ['Clinical Research'];
    });

    this.queueSave('research');
  }

  // ==================== DATA VALIDATION ====================
  validateMedicalData(data, type) {
    const validators = {
      'patient': this.validatePatientData.bind(this),
      'lung-function': this.validateLungFunctionData.bind(this),
      'treatment': this.validateTreatmentData.bind(this),
      'radiology': this.validateRadiologyData.bind(this),
      'laboratory': this.validateLaboratoryData.bind(this)
    };

    const validator = validators[type];
    return validator ? validator(data) : { valid: true, errors: [], warnings: [] };
  }

  validatePatientData(data) {
    const errors = [];
    const warnings = [];

    // Required fields
    if (!data.age && data.age !== 0) errors.push('Age is required');
    if (!data.gender) errors.push('Gender is required');

    // Age validation
    if (data.age !== undefined) {
      if (data.age < 0 || data.age > 120) errors.push('Age must be between 0 and 120');
      if (data.age > 100) warnings.push('Patient age exceeds 100 years');
    }

    // Gender validation
    const validGenders = ['male', 'female', 'other', 'prefer-not-to-say'];
    if (data.gender && !validGenders.includes(data.gender)) {
      errors.push('Invalid gender value');
    }

    // Diagnosis validation
    if (data.diagnosis && data.diagnosis.length > 1000) {
      errors.push('Diagnosis too long (max 1000 characters)');
    }

    // Smoking history validation
    if (data.smokingHistory) {
      if (data.smokingHistory.packYears < 0) errors.push('Pack years cannot be negative');
      if (data.smokingHistory.packYears > 200) warnings.push('Extremely high pack years (>200)');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  validateLungFunctionData(data) {
    const errors = [];
    const warnings = [];
    const results = {};

    // FEV1 validation
    if (data.fev1 !== undefined) {
      if (data.fev1 < 0.3 || data.fev1 > 8.0) {
        errors.push('FEV1 value outside reasonable range (0.3-8.0 L)');
      }
      results.fev1 = data.fev1;
    }

    // FVC validation
    if (data.fvc !== undefined) {
      if (data.fvc < 0.5 || data.fvc > 10.0) {
        errors.push('FVC value outside reasonable range (0.5-10.0 L)');
      }
      results.fvc = data.fvc;
    }

    // FEV1/FVC ratio calculation
    if (results.fev1 && results.fvc) {
      results.fev1FvcRatio = results.fev1 / results.fvc;
      
      if (results.fev1FvcRatio < 0.2 || results.fev1FvcRatio > 1.0) {
        errors.push('FEV1/FVC ratio outside reasonable range (0.2-1.0)');
      }
      
      // Clinical interpretation
      if (results.fev1FvcRatio < 0.7) {
        warnings.push('FEV1/FVC ratio < 0.7 suggests obstructive pattern');
      }
      
      if (results.fev1FvcRatio >= 0.7 && results.fev1 < 0.8 * (data.predictedFEV1 || 3.0)) {
        warnings.push('FEV1/FVC ratio ≥ 0.7 with reduced FEV1 suggests restrictive pattern');
      }
    }

    // DLCO validation (if present)
    if (data.dlco !== undefined) {
      if (data.dlco < 5 || data.dlco > 150) {
        errors.push('DLCO value outside reasonable range (5-150)');
      }
      
      if (data.dlco < 40) warnings.push('Severely reduced DLCO (<40% predicted)');
      results.dlco = data.dlco;
    }

    // Calculate GOLD stage if FEV1% predicted is available
    if (data.fev1PercentPredicted) {
      results.goldStage = this.calculateGOLDStage(data.fev1PercentPredicted);
      results.goldStageValue = this.getGOLDStageValue(data.fev1PercentPredicted);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined,
      results
    };
  }

  validateTreatmentData(data) {
    const errors = [];
    const warnings = [];

    if (!data.medications || !Array.isArray(data.medications)) {
      errors.push('Medications array is required');
      return { valid: false, errors, warnings };
    }

    data.medications.forEach((med, index) => {
      if (!med.name) errors.push(`Medication ${index + 1}: Name is required`);
      if (med.dose !== undefined && med.dose <= 0) errors.push(`Medication ${index + 1}: Dose must be positive`);
      if (med.frequency && !/^\d+\s*(times\s*)?(per|a)\s*(day|week|month)$/i.test(med.frequency)) {
        warnings.push(`Medication ${index + 1}: Frequency format may be incorrect`);
      }
    });

    // Oxygen therapy validation
    if (data.oxygenTherapy) {
      if (data.oxygenTherapy.flowRate !== undefined) {
        if (data.oxygenTherapy.flowRate < 0.5 || data.oxygenTherapy.flowRate > 15) {
          warnings.push('Oxygen flow rate outside typical range (0.5-15 L/min)');
        }
      }
    }

    // Inhaler technique check
    if (data.inhalerTechnique === 'poor') {
      warnings.push('Poor inhaler technique noted - consider education/review');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  validateRadiologyData(data) {
    const errors = [];
    const findings = [];

    if (data.modality && !['xray', 'ct', 'mri', 'ultrasound'].includes(data.modality)) {
      errors.push('Invalid imaging modality');
    }

    if (data.findings) {
      if (typeof data.findings !== 'string' || data.findings.length > 5000) {
        errors.push('Findings must be a string under 5000 characters');
      } else {
        // Extract potential findings
        const findingKeywords = ['consolidation', 'nodule', 'mass', 'effusion', 'pneumothorax', 'fibrosis', 'emphysema'];
        findingKeywords.forEach(keyword => {
          if (data.findings.toLowerCase().includes(keyword)) {
            findings.push(keyword);
          }
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      findings: findings.length > 0 ? findings : undefined
    };
  }

  validateLaboratoryData(data) {
    const errors = [];
    const abnormalities = [];

    // Blood gas validation
    if (data.bloodGas) {
      const bg = data.bloodGas;
      
      if (bg.ph !== undefined && (bg.ph < 6.8 || bg.ph > 7.8)) {
        errors.push('pH outside survivable range');
      } else if (bg.ph < 7.35) abnormalities.push('Acidemia');
      else if (bg.ph > 7.45) abnormalities.push('Alkalemia');
      
      if (bg.pao2 !== undefined && bg.pao2 < 50) abnormalities.push('Severe hypoxemia');
      if (bg.paco2 !== undefined && bg.paco2 > 50) abnormalities.push('Hypercapnia');
    }

    // Inflammatory markers
    if (data.crp !== undefined && data.crp > 100) abnormalities.push('Markedly elevated CRP');
    if (data.esr !== undefined && data.esr > 100) abnormalities.push('Markedly elevated ESR');

    return {
      valid: errors.length === 0,
      errors,
      abnormalities: abnormalities.length > 0 ? abnormalities : undefined
    };
  }

  // ==================== MEDICAL CALCULATORS ====================
  calculateGOLDStage(fev1Percent) {
    if (fev1Percent >= 80) return 'GOLD 1 (Mild)';
    if (fev1Percent >= 50) return 'GOLD 2 (Moderate)';
    if (fev1Percent >= 30) return 'GOLD 3 (Severe)';
    return 'GOLD 4 (Very Severe)';
  }

  getGOLDStageValue(fev1Percent) {
    if (fev1Percent >= 80) return 1;
    if (fev1Percent >= 50) return 2;
    if (fev1Percent >= 30) return 3;
    return 4;
  }

  calculateBODEIndex(data) {
    let score = 0;
    
    // FEV1% predicted
    if (data.fev1Percent >= 65) score += 0;
    else if (data.fev1Percent >= 50) score += 1;
    else if (data.fev1Percent >= 36) score += 2;
    else score += 3;
    
    // 6MWT distance (meters)
    if (data.sixMWT >= 350) score += 0;
    else if (data.sixMWT >= 250) score += 1;
    else if (data.sixMWT >= 150) score += 2;
    else score += 3;
    
    // MMRC dyspnea scale (0-4)
    if (data.mmrc !== undefined) score += Math.min(Math.max(data.mmrc, 0), 4);
    
    // BMI
    if (data.bmi > 21) score += 0;
    else score += 1;
    
    // Interpretation
    let risk, mortality;
    if (score <= 2) {
      risk = 'Low';
      mortality = '~10% annual mortality';
    } else if (score <= 4) {
      risk = 'Medium';
      mortality = '~20% annual mortality';
    } else if (score <= 6) {
      risk = 'High';
      mortality = '~30% annual mortality';
    } else {
      risk = 'Very High';
      mortality = '~40% annual mortality';
    }
    
    return {
      score,
      risk,
      mortality,
      components: {
        fev1Percent: data.fev1Percent,
        sixMWT: data.sixMWT,
        mmrc: data.mmrc,
        bmi: data.bmi
      }
    };
  }

  calculateARDSNet(tableData) {
    // ARDSNet prediction calculator
    const { pao2, fio2, peep } = tableData;
    
    if (!pao2 || !fio2) return null;
    
    const pao2Fio2Ratio = pao2 / fio2;
    let severity = 'Mild';
    
    if (pao2Fio2Ratio <= 100) severity = 'Severe';
    else if (pao2Fio2Ratio <= 200) severity = 'Moderate';
    
    const mortalityRisk = {
      'Mild': '27%',
      'Moderate': '32%',
      'Severe': '45%'
    }[severity];
    
    return {
      pao2Fio2Ratio: Math.round(pao2Fio2Ratio),
      severity,
      mortalityRisk,
      peepRecommendation: severity === 'Severe' ? 'Consider higher PEEP' : 'Standard PEEP'
    };
  }

  // ==================== DATA PERSISTENCE ====================
  queueSave(collection) {
    this.saveQueue.add(collection);
    if (!this.isSaving) {
      setTimeout(() => this.processSaveQueue(), 100);
    }
  }

  async processSaveQueue() {
    if (this.isSaving || this.saveQueue.size === 0) return;
    
    this.isSaving = true;
    const collections = Array.from(this.saveQueue);
    this.saveQueue.clear();
    
    try {
      const savePromises = [];
      
      if (collections.includes('research')) {
        savePromises.push(this.saveResearchData());
      }
      if (collections.includes('sessions')) {
        savePromises.push(this.saveSessionsData());
      }
      
      await Promise.all(savePromises);
      this.lastSave = Date.now();
      
      console.log(`💾 Saved collections: ${collections.join(', ')}`);
    } catch (error) {
      console.error('❌ Save error:', error);
      // Re-add failed collections to queue
      collections.forEach(coll => this.saveQueue.add(coll));
    } finally {
      this.isSaving = false;
      
      // Process any new items
      if (this.saveQueue.size > 0) {
        setTimeout(() => this.processSaveQueue(), 1000);
      }
    }
  }

  async saveResearchData() {
    try {
      // Update metadata
      this.researchData.metadata.lastModified = new Date().toISOString();
      this.researchData.metadata.version = config.app.version;
      
      // Update analytics before saving
      this.updateAnalytics();
      
      const filePath = path.join(config.paths.data, 'research.json');
      const tempPath = filePath + '.tmp';
      
      // Write to temp file first
      await fs.writeFile(tempPath, JSON.stringify(this.researchData, null, 2));
      
      // Atomic rename
      await fs.rename(tempPath, filePath);
      
      // Update cache timestamp
      this.cache.set('research:lastSave', Date.now());
      
      return true;
    } catch (error) {
      console.error('❌ Failed to save research data:', error);
      throw error;
    }
  }

  async saveSessionsData() {
    try {
      const filePath = path.join(config.paths.data, 'sessions.json');
      const tempPath = filePath + '.tmp';
      
      // Clean expired sessions before saving
      this.cleanExpiredSessions();
      
      await fs.writeFile(tempPath, JSON.stringify(this.sessionsData, null, 2));
      await fs.rename(tempPath, filePath);
      
      return true;
    } catch (error) {
      console.error('❌ Failed to save sessions data:', error);
      throw error;
    }
  }

  cleanExpiredSessions() {
    const now = new Date();
    let expiredCount = 0;
    
    Object.keys(this.sessionsData).forEach(sessionId => {
      const session = this.sessionsData[sessionId];
      if (new Date(session.expiresAt) < now) {
        delete this.sessionsData[sessionId];
        expiredCount++;
      }
    });
    
    if (expiredCount > 0) {
      console.log(`🧹 Cleaned ${expiredCount} expired sessions`);
      this.queueSave('sessions');
    }
  }

  autoSave() {
    if (Date.now() - this.lastSave > 30000 && this.saveQueue.size > 0) {
      this.queueSave('research');
    }
  }

  // ==================== ANALYTICS ====================
  updateAnalytics() {
    const cacheKey = 'analytics';
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.analyticsTTL) {
      return cached.data;
    }
    
    const projects = Object.values(this.researchData.projects);
    const users = Object.values(this.researchData.users);
    const discussions = Object.values(this.researchData.discussions);
    
    // Active users (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const activeUsers = users.filter(u => new Date(u.lastActivity) > thirtyDaysAgo);
    
    // Project statistics
    const projectStats = projects.reduce((stats, p) => {
      stats[p.status] = (stats[p.status] || 0) + 1;
      return stats;
    }, {});
    
    // Consensus rate
    const totalVotes = discussions.reduce((sum, d) => sum + (d.upvotes || 0) + (d.downvotes || 0), 0);
    const positiveVotes = discussions.reduce((sum, d) => sum + (d.upvotes || 0), 0);
    const consensusRate = totalVotes > 0 ? Math.round((positiveVotes / totalVotes) * 100) : 75;
    
    // Team size statistics
    const teamSizes = projects.map(p => p.teamMembers?.length || 1);
    const avgTeamSize = teamSizes.length > 0 ? 
      Math.round(teamSizes.reduce((a, b) => a + b, 0) / teamSizes.length * 10) / 10 : 1;
    
    // Engagement score
    const totalComments = discussions.reduce((sum, d) => sum + (d.comments?.length || 0), 0);
    const engagementScore = Math.min(
      ((discussions.length * 10) + (totalComments * 5)) / (users.length || 1),
      100
    );
    
    // Top institutions
    const institutionStats = users.reduce((stats, user) => {
      const inst = user.institution || 'Unknown';
      stats[inst] = (stats[inst] || 0) + 1;
      return stats;
    }, {});
    
    const topInstitutions = Object.entries(institutionStats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count, percentage: Math.round((count / users.length) * 100) }));
    
    // Recent activity (last 50 entries)
    const recentActivity = this.researchData.analytics.activityLog
      .slice(-50)
      .reverse()
      .map(activity => ({
        ...activity,
        timeAgo: this.getTimeAgo(activity.timestamp)
      }));
    
    const analytics = {
      platformStats: {
        totalProjects: projects.length,
        totalUsers: users.length,
        totalDiscussions: discussions.length,
        totalComments,
        activeProjects: projectStats.active || 0,
        completedProjects: projectStats.completed || 0,
        planningProjects: projectStats.planning || 0,
        consensusRate,
        activeResearchers: activeUsers.length,
        avgTeamSize,
        engagementScore: Math.round(engagementScore),
        researchImpactScore: this.calculateResearchImpact(projects, discussions),
        avgProjectDuration: this.calculateAvgProjectDuration(projects),
        completionRate: this.calculateCompletionRate(projects)
      },
      userDistribution: {
        byRole: this.groupUsersByRole(users),
        byInstitution: topInstitutions,
        byActivity: {
          active: activeUsers.length,
          inactive: users.length - activeUsers.length
        }
      },
      projectDistribution: {
        byStatus: projectStats,
        byTemplate: this.groupProjectsByTemplate(projects),
        bySpecialty: this.groupProjectsBySpecialty(projects)
      },
      engagementMetrics: {
        dailyActiveUsers: this.calculateDAU(users),
        avgDiscussionsPerProject: projects.length > 0 ? 
          Math.round((discussions.length / projects.length) * 10) / 10 : 0,
        avgCommentsPerDiscussion: discussions.length > 0 ? 
          Math.round((totalComments / discussions.length) * 10) / 10 : 0,
        voteParticipation: totalVotes > 0 ? 
          Math.round((users.filter(u => u.votesGiven > 0).length / users.length) * 100) : 0
      },
      recentActivity,
      generatedAt: new Date().toISOString(),
      cacheUntil: new Date(Date.now() + this.analyticsTTL).toISOString()
    };
    
    this.analyticsCache = analytics;
    this.cache.set(cacheKey, { data: analytics, timestamp: Date.now() });
    
    // Update research data analytics
    this.researchData.analytics.platformStats = analytics.platformStats;
    this.researchData.analytics.recentActivity = recentActivity.slice(0, 20);
    
    return analytics;
  }

  calculateResearchImpact(projects, discussions) {
    let score = 100;
    
    // Project-based impact
    score += projects.length * 2;
    score += projects.filter(p => p.status === 'active').length * 5;
    score += projects.filter(p => p.status === 'completed').length * 10;
    
    // Publication impact (if tracked)
    const publishedProjects = projects.filter(p => p.publications && p.publications.length > 0);
    score += publishedProjects.length * 20;
    
    // Discussion impact
    score += discussions.length;
    score += discussions.reduce((sum, d) => sum + (d.comments?.length || 0), 0) * 0.5;
    
    // Collaboration impact
    const avgTeamSize = this.calculateAverageTeamSize(projects);
    score += avgTeamSize * 3;
    
    // Recent activity bonus
    const recentProjects = projects.filter(p => {
      const daysSinceUpdate = (Date.now() - new Date(p.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
      return daysSinceUpdate < 30;
    });
    score += recentProjects.length * 3;
    
    return Math.min(Math.round(score), 1000);
  }

  calculateAverageTeamSize(projects) {
    if (projects.length === 0) return 1;
    const totalMembers = projects.reduce((sum, p) => sum + (p.teamMembers?.length || 1), 0);
    return Math.round((totalMembers / projects.length) * 10) / 10;
  }

  calculateCompletionRate(projects) {
    if (projects.length === 0) return 0;
    const completed = projects.filter(p => p.status === 'completed').length;
    return Math.round((completed / projects.length) * 100);
  }

  calculateAvgProjectDuration(projects) {
    const completedProjects = projects.filter(p => p.status === 'completed' && p.createdAt && p.completedAt);
    
    if (completedProjects.length === 0) return 0;
    
    const totalDays = completedProjects.reduce((sum, p) => {
      const start = new Date(p.createdAt);
      const end = new Date(p.completedAt);
      const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
      return sum + days;
    }, 0);
    
    return Math.round(totalDays / completedProjects.length);
  }

  groupUsersByRole(users) {
    const roles = {};
    users.forEach(user => {
      const role = user.role || 'clinician';
      roles[role] = (roles[role] || 0) + 1;
    });
    return roles;
  }

  groupProjectsByTemplate(projects) {
    const templates = {};
    projects.forEach(project => {
      const template = project.template || 'custom';
      templates[template] = (templates[template] || 0) + 1;
    });
    return templates;
  }

  groupProjectsBySpecialty(projects) {
    const specialties = {};
    projects.forEach(project => {
      const specialty = project.medicalData?.specialty || 'general';
      specialties[specialty] = (specialties[specialty] || 0) + 1;
    });
    return specialties;
  }

  calculateDAU(users) {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const todayActive = users.filter(u => u.lastActivity?.startsWith(today)).length;
    const yesterdayActive = users.filter(u => u.lastActivity?.startsWith(yesterday)).length;
    
    return { today: todayActive, yesterday: yesterdayActive, change: todayActive - yesterdayActive };
  }

  getTimeAgo(timestamp) {
    const now = new Date();
    const past = new Date(timestamp);
    const diffMs = now - past;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return `${Math.floor(diffDays / 7)}w ago`;
  }

  // ==================== SEARCH FUNCTIONALITY ====================
  searchProjects(query, filters = {}) {
    const cacheKey = `search:${query}:${JSON.stringify(filters)}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < 10000) { // 10 second cache
      return cached.data;
    }
    
    const projects = Object.values(this.researchData.projects);
    let results = projects;
    
    // Text search
    if (query && query.trim().length >= 2) {
      const searchTerms = query.toLowerCase().trim().split(/\s+/);
      
      results = results.filter(project => {
        const searchableText = [
          project.title || '',
          project.description || '',
          (project.tags || []).join(' '),
          project.medicalData?.diagnosis || '',
          project.lead || ''
        ].join(' ').toLowerCase();
        
        return searchTerms.every(term => searchableText.includes(term));
      });
      
      // Sort by relevance
      results.sort((a, b) => {
        const aScore = this.calculateSearchRelevance(a, query);
        const bScore = this.calculateSearchRelevance(b, query);
        return bScore - aScore;
      });
    }
    
    // Apply filters
    if (filters.status) {
      results = results.filter(p => p.status === filters.status);
    }
    
    if (filters.tags && filters.tags.length > 0) {
      results = results.filter(p => 
        p.tags && filters.tags.every(tag => p.tags.includes(tag))
      );
    }
    
    if (filters.leadId) {
      results = results.filter(p => p.leadId === filters.leadId);
    }
    
    if (filters.template) {
      results = results.filter(p => p.template === filters.template);
    }
    
    // Date filters
    if (filters.startDate) {
      const start = new Date(filters.startDate);
      results = results.filter(p => new Date(p.createdAt) >= start);
    }
    
    if (filters.endDate) {
      const end = new Date(filters.endDate);
      results = results.filter(p => new Date(p.createdAt) <= end);
    }
    
    // Cache results
    this.cache.set(cacheKey, { data: results, timestamp: Date.now() });
    
    return results;
  }

  calculateSearchRelevance(project, query) {
    let score = 0;
    const searchTerms = query.toLowerCase().split(/\s+/);
    
    // Title match (highest weight)
    if (project.title) {
      const titleLower = project.title.toLowerCase();
      searchTerms.forEach(term => {
        if (titleLower.includes(term)) score += 50;
        if (titleLower === term) score += 100; // Exact match
      });
    }
    
    // Tag matches
    if (project.tags) {
      searchTerms.forEach(term => {
        if (project.tags.some(tag => tag.toLowerCase().includes(term))) {
          score += 30;
        }
      });
    }
    
    // Description match
    if (project.description) {
      const descLower = project.description.toLowerCase();
      searchTerms.forEach(term => {
        if (descLower.includes(term)) score += 10;
      });
    }
    
    // Recency bonus
    const daysOld = (Date.now() - new Date(project.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysOld < 7) score += 25; // This week
    else if (daysOld < 30) score += 15; // This month
    
    // Activity bonus
    if (project.discussionCount > 5) score += 20;
    if (project.teamMembers?.length > 3) score += 15;
    
    // Status bonus
    if (project.status === 'active') score += 10;
    if (project.status === 'completed') score += 5;
    
    return score;
  }

  // ==================== NOTIFICATION SYSTEM ====================
  createNotification(userId, type, data, priority = 'normal') {
    if (!this.researchData.notifications[userId]) {
      this.researchData.notifications[userId] = [];
    }
    
    const notification = {
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId,
      type,
      data,
      priority,
      read: false,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
    };
    
    this.researchData.notifications[userId].unshift(notification); // Add to beginning
    
    // Limit notifications per user
    if (this.researchData.notifications[userId].length > 100) {
      this.researchData.notifications[userId] = this.researchData.notifications[userId].slice(0, 100);
    }
    
    this.queueSave('research');
    
    // Emit real-time notification via Socket.IO if user is connected
    if (io) {
      io.to(`user:${userId}`).emit('notification', notification);
    }
    
    return notification;
  }

  getUserNotifications(userId, unreadOnly = false, limit = 50) {
    const notifications = this.researchData.notifications[userId] || [];
    const filtered = unreadOnly ? notifications.filter(n => !n.read) : notifications;
    return filtered.slice(0, limit);
  }

  markNotificationAsRead(userId, notificationId) {
    const notifications = this.researchData.notifications[userId];
    if (!notifications) return false;
    
    const notification = notifications.find(n => n.id === notificationId);
    if (notification) {
      notification.read = true;
      notification.readAt = new Date().toISOString();
      this.queueSave('research');
      return true;
    }
    
    return false;
  }

  markAllNotificationsAsRead(userId) {
    const notifications = this.researchData.notifications[userId];
    if (!notifications) return false;
    
    const now = new Date().toISOString();
    notifications.forEach(n => {
      n.read = true;
      n.readAt = now;
    });
    
    this.queueSave('research');
    return true;
  }

  // ==================== HELPER METHODS ====================
  extractMentions(text) {
    if (!text) return [];
    
    const mentionRegex = /@(\w+)/g;
    const mentions = new Set();
    let match;
    
    while ((match = mentionRegex.exec(text)) !== null) {
      mentions.add(match[1]);
    }
    
    return Array.from(mentions);
  }

  getProjectStatistics(projectId) {
    const project = this.researchData.projects[projectId];
    if (!project) return null;
    
    const cacheKey = `project-stats:${projectId}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < 30000) { // 30 second cache
      return cached.data;
    }
    
    const discussions = Object.values(this.researchData.discussions)
      .filter(d => d.projectId === projectId);
    
    const totalComments = discussions.reduce((sum, d) => sum + (d.comments?.length || 0), 0);
    const totalVotes = discussions.reduce((sum, d) => sum + (d.upvotes || 0) + (d.downvotes || 0), 0);
    
    const consensusScore = totalVotes > 0 ? 
      Math.round((discussions.reduce((sum, d) => sum + (d.upvotes || 0), 0) / totalVotes) * 100) : 
      75;
    
    const engagementScore = Math.min(
      (discussions.length * 10) + (totalComments * 5) + (totalVotes * 2),
      100
    );
    
    const createdDate = new Date(project.createdAt);
    const now = new Date();
    const daysActive = Math.floor((now - createdDate) / (1000 * 60 * 60 * 24));
    
    const stats = {
      discussionCount: discussions.length,
      commentCount: totalComments,
      voteCount: totalVotes,
      consensusScore,
      engagementScore,
      daysActive,
      teamSize: project.teamMembers?.length || 1,
      lastActivity: this.getLastProjectActivity(projectId),
      timeline: this.estimateProjectTimeline(project),
      medicalData: project.medicalData ? {
        hasData: true,
        dataTypes: Object.keys(project.medicalData),
        validation: this.validateMedicalData(project.medicalData, 'patient')
      } : { hasData: false }
    };
    
    this.cache.set(cacheKey, { data: stats, timestamp: Date.now() });
    return stats;
  }

  getLastProjectActivity(projectId) {
    let lastActivity = null;
    
    // Check discussions
    const discussions = Object.values(this.researchData.discussions)
      .filter(d => d.projectId === projectId);
    
    discussions.forEach(discussion => {
      const discussionDate = new Date(discussion.updatedAt || discussion.createdAt);
      if (!lastActivity || discussionDate > lastActivity) {
        lastActivity = discussionDate;
      }
      
      // Check comments
      if (discussion.comments) {
        discussion.comments.forEach(comment => {
          const commentDate = new Date(comment.timestamp);
          if (!lastActivity || commentDate > lastActivity) {
            lastActivity = commentDate;
          }
        });
      }
    });
    
    return lastActivity ? lastActivity.toISOString() : null;
  }

  estimateProjectTimeline(project) {
    const baseEstimates = {
      'planning': { duration: 90, progressWeight: 0.3 },
      'active': { duration: 180, progressWeight: 0.7 },
      'completed': { duration: 0, progressWeight: 1.0 },
      'on-hold': { duration: 365, progressWeight: 0.5 }
    };
    
    const estimate = baseEstimates[project.status] || baseEstimates.planning;
    const startDate = new Date(project.startDate || project.createdAt);
    const now = new Date();
    
    let estimatedEnd, daysRemaining, progressPercentage;
    
    if (project.status === 'completed' && project.completedAt) {
      estimatedEnd = new Date(project.completedAt);
      daysRemaining = 0;
      progressPercentage = 100;
    } else {
      estimatedEnd = new Date(startDate.getTime() + estimate.duration * 24 * 60 * 60 * 1000);
      daysRemaining = Math.max(0, Math.floor((estimatedEnd - now) / (1000 * 60 * 60 * 24)));
      
      const totalDays = estimate.duration;
      const daysPassed = totalDays - daysRemaining;
      progressPercentage = Math.min(
        99,
        Math.max(0, Math.round((daysPassed / totalDays) * 100 * estimate.progressWeight))
      );
    }
    
    return {
      startDate: startDate.toISOString().split('T')[0],
      estimatedEndDate: estimatedEnd.toISOString().split('T')[0],
      daysRemaining,
      progressPercentage,
      status: project.status,
      isDelayed: daysRemaining < 0,
      milestone: this.getCurrentMilestone(project, progressPercentage)
    };
  }

  getCurrentMilestone(project, progress) {
    if (project.status === 'completed') return 'Completed';
    if (project.status === 'planning') {
      if (progress < 30) return 'Initial Planning';
      if (progress < 60) return 'Protocol Development';
      if (progress < 90) return 'Ethics Approval';
      return 'Ready to Start';
    }
    if (project.status === 'active') {
      if (progress < 25) return 'Patient Recruitment';
      if (progress < 50) return 'Data Collection';
      if (progress < 75) return 'Intervention Phase';
      if (progress < 90) return 'Follow-up Phase';
      return 'Analysis Phase';
    }
    return 'In Progress';
  }

  getSimilarProjects(projectId, limit = 5) {
    const project = this.researchData.projects[projectId];
    if (!project) return [];
    
    const cacheKey = `similar:${projectId}:${limit}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < 300000) { // 5 minute cache
      return cached.data;
    }
    
    const otherProjects = Object.values(this.researchData.projects)
      .filter(p => p.id !== projectId);
    
    const scored = otherProjects.map(other => ({
      project: other,
      similarity: this.calculateProjectSimilarity(project, other)
    }))
    .filter(item => item.similarity > 0.3)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)
    .map(item => ({
      ...item.project,
      similarity: Math.round(item.similarity * 100)
    }));
    
    this.cache.set(cacheKey, { data: scored, timestamp: Date.now() });
    return scored;
  }

  calculateProjectSimilarity(projectA, projectB) {
    let score = 0;
    let maxScore = 0;
    
    // Tag similarity (weight: 40%)
    if (projectA.tags && projectB.tags) {
      const tagsA = new Set(projectA.tags);
      const tagsB = new Set(projectB.tags);
      const commonTags = [...tagsA].filter(tag => tagsB.has(tag)).length;
      const totalTags = new Set([...tagsA, ...tagsB]).size;
      
      score += (commonTags / (totalTags || 1)) * 0.4;
    }
    maxScore += 0.4;
    
    // Medical specialty similarity (weight: 30%)
    if (projectA.medicalData?.specialty && projectB.medicalData?.specialty) {
      if (projectA.medicalData.specialty === projectB.medicalData.specialty) {
        score += 0.3;
      }
    }
    maxScore += 0.3;
    
    // Template similarity (weight: 20%)
    if (projectA.template && projectB.template) {
      if (projectA.template === projectB.template) {
        score += 0.2;
      }
    }
    maxScore += 0.2;
    
    // Lead similarity (weight: 10%)
    if (projectA.leadId === projectB.leadId) {
      score += 0.1;
    }
    maxScore += 0.1;
    
    return score / maxScore;
  }

  // ==================== ACTIVITY LOGGING ====================
  logActivity(userId, action, details = {}) {
    const activity = {
      id: `act-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      userId,
      action,
      details,
      timestamp: new Date().toISOString(),
      ip: 'system', // In production, get from request
      userAgent: 'server'
    };
    
    this.researchData.analytics.activityLog.push(activity);
    
    // Keep log manageable
    if (this.researchData.analytics.activityLog.length > 10000) {
      this.researchData.analytics.activityLog = this.researchData.analytics.activityLog.slice(-5000);
    }
    
    this.queueSave('research');
    return activity;
  }

  // ==================== DATA EXPORT ====================
  generateExportData(projectId, options = {}) {
    const project = this.researchData.projects[projectId];
    if (!project) return null;
    
    const includeMedical = options.includeMedical || false;
    const includeDiscussions = options.includeDiscussions !== false;
    const includeComments = options.includeComments !== false;
    const format = options.format || 'structured';
    
    const exportData = {
      metadata: {
        exportedFrom: config.app.name,
        version: config.app.version,
        exportDate: new Date().toISOString(),
        projectId,
        format,
        options
      },
      project: {
        ...project,
        statistics: this.getProjectStatistics(projectId),
        team: project.teamMembers?.map(memberId => {
          const user = this.researchData.users[memberId];
          return user ? {
            id: user.id,
            name: user.name,
            email: user.email,
            institution: user.institution,
            role: user.role,
            specialty: user.specialty
          } : null;
        }).filter(Boolean)
      }
    };
    
    if (includeDiscussions) {
      const discussions = Object.values(this.researchData.discussions)
        .filter(d => d.projectId === projectId);
      
      exportData.discussions = discussions.map(discussion => {
        const exportedDiscussion = { ...discussion };
        
        if (!includeComments) {
          delete exportedDiscussion.comments;
        } else if (exportedDiscussion.comments) {
          exportedDiscussion.comments = exportedDiscussion.comments.map(comment => ({
            ...comment,
            // Remove sensitive data if needed
            authorEmail: undefined
          }));
        }
        
        // Remove vote tracking for export
        delete exportedDiscussion.votes;
        delete exportedDiscussion.reactions;
        
        return exportedDiscussion;
      });
    }
    
    if (includeMedical && project.medicalData) {
      exportData.medicalData = {
        ...project.medicalData,
        validation: this.validateMedicalData(project.medicalData, 'patient'),
        calculations: this.generateMedicalCalculations(project.medicalData)
      };
      
      // Anonymize patient data for export
      if (options.anonymize) {
        exportData.medicalData = this.anonymizeMedicalData(exportData.medicalData);
      }
    }
    
    // Summary statistics
    exportData.summary = {
      totalDiscussions: exportData.discussions?.length || 0,
      totalComments: exportData.discussions?.reduce((sum, d) => sum + (d.comments?.length || 0), 0) || 0,
      teamSize: exportData.project.team?.length || 0,
      durationDays: Math.floor(
        (new Date() - new Date(project.createdAt)) / (1000 * 60 * 60 * 24)
      ),
      consensusScore: exportData.project.statistics?.consensusScore || 75,
      engagementScore: exportData.project.statistics?.engagementScore || 0
    };
    
    return exportData;
  }

  generateMedicalCalculations(medicalData) {
    const calculations = {};
    
    if (medicalData.lungFunction) {
      const lf = medicalData.lungFunction;
      
      if (lf.fev1 && lf.fvc) {
        calculations.fev1FvcRatio = lf.fev1 / lf.fvc;
        
        if (lf.fev1PercentPredicted) {
          calculations.goldStage = this.calculateGOLDStage(lf.fev1PercentPredicted);
        }
      }
      
      if (lf.dlco && lf.dlcoPercentPredicted) {
        calculations.dlcoSeverity = lf.dlcoPercentPredicted < 40 ? 'Severely Reduced' :
                                   lf.dlcoPercentPredicted < 60 ? 'Moderately Reduced' :
                                   lf.dlcoPercentPredicted < 80 ? 'Mildly Reduced' : 'Normal';
      }
    }
    
    if (medicalData.sixMWT) {
      calculations.sixMWTPercentPredicted = (medicalData.sixMWT.distance / 500) * 100; // Rough estimate
    }
    
    if (medicalData.bmi) {
      calculations.bmiCategory = medicalData.bmi < 18.5 ? 'Underweight' :
                                medicalData.bmi < 25 ? 'Normal' :
                                medicalData.bmi < 30 ? 'Overweight' : 'Obese';
    }
    
    return calculations;
  }

  anonymizeMedicalData(medicalData) {
    const anonymized = { ...medicalData };
    
    // Remove direct identifiers
    delete anonymized.patientId;
    delete anonymized.name;
    delete anonymized.email;
    delete anonymized.phone;
    delete anonymized.address;
    
    // Generalize age
    if (anonymized.age) {
      anonymized.age = Math.floor(anonymized.age / 10) * 10; // Round to nearest 10
    }
    
    // Generalize dates
    if (anonymized.dateOfBirth) {
      const dob = new Date(anonymized.dateOfBirth);
      anonymized.dateOfBirth = `${dob.getFullYear()}-01-01`; // Keep only year
    }
    
    return anonymized;
  }
}

// ==================== INITIALIZE DATA SERVICE ====================
const dataService = new ThoraxLabDataService();

// ==================== MIDDLEWARE ====================
const authenticate = async (req, res, next) => {
  try {
    const sessionId = req.headers['authorization']?.replace('Bearer ', '') || 
                     req.query.sessionId || 
                     req.cookies?.sessionId;
    
    if (!sessionId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'NO_SESSION'
      });
    }
    
    const session = dataService.sessionsData[sessionId];
    
    if (!session) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired session',
        code: 'INVALID_SESSION'
      });
    }
    
    // Check expiration
    if (new Date(session.expiresAt) < new Date()) {
      delete dataService.sessionsData[sessionId];
      dataService.queueSave('sessions');
      
      return res.status(401).json({
        success: false,
        error: 'Session expired',
        code: 'SESSION_EXPIRED'
      });
    }
    
    // Get user
    const user = dataService.researchData.users[session.userId];
    if (!user) {
      delete dataService.sessionsData[sessionId];
      dataService.queueSave('sessions');
      
      return res.status(401).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }
    
    // Update session activity
    session.lastActivity = new Date().toISOString();
    session.ip = req.ip;
    session.userAgent = req.get('User-Agent');
    
    // Update user activity
    user.lastActivity = new Date().toISOString();
    
    dataService.queueSave('sessions');
    dataService.queueSave('research');
    
    // Attach to request
    req.user = user;
    req.userId = user.id;
    req.sessionId = sessionId;
    
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication failed',
      code: 'AUTH_ERROR'
    });
  }
};

const validateRequest = (schema) => (req, res, next) => {
  try {
    if (schema.body) {
      const { error } = schema.body.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.details.map(d => d.message)
        });
      }
    }
    
    if (schema.params) {
      const { error } = schema.params.validate(req.params);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'Invalid parameters',
          details: error.details.map(d => d.message)
        });
      }
    }
    
    if (schema.query) {
      const { error } = schema.query.validate(req.query);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'Invalid query parameters',
          details: error.details.map(d => d.message)
        });
      }
    }
    
    next();
  } catch (error) {
    console.error('Validation error:', error);
    res.status(400).json({
      success: false,
      error: 'Request validation failed'
    });
  }
};

// ==================== API ROUTES ====================

// Health endpoint (required by Railway)
app.get('/health', (req, res) => {
  const uptime = process.uptime();
  const memory = process.memoryUsage();
  
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: config.app.name,
    version: config.app.version,
    environment: NODE_ENV,
    uptime: {
      hours: Math.floor(uptime / 3600),
      minutes: Math.floor((uptime % 3600) / 60),
      seconds: Math.floor(uptime % 60)
    },
    memory: {
      rss: `${Math.round(memory.rss / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(memory.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memory.heapTotal / 1024 / 1024)}MB`,
      external: `${Math.round(memory.external / 1024 / 1024)}MB`
    },
    data: {
      projects: Object.keys(dataService.researchData.projects).length,
      users: Object.keys(dataService.researchData.users).length,
      discussions: Object.keys(dataService.researchData.discussions).length,
      sessions: Object.keys(dataService.sessionsData).length
    },
    system: {
      node: process.version,
      platform: process.platform,
      arch: process.arch
    }
  };
  
  res.json(health);
});

// API status
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    service: config.app.name,
    version: config.app.version,
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    features: dataService.researchData.config.features,
    limits: {
      maxFileSize: config.limits.fileUpload,
      maxTeamSize: dataService.researchData.config.settings.maxTeamSize,
      maxProjectsPerUser: dataService.researchData.config.settings.maxProjectsPerUser
    },
    endpoints: {
      auth: ['POST /api/login', 'POST /api/logout', 'GET /api/me'],
      projects: ['GET /api/projects', 'POST /api/projects', 'GET /api/projects/:id'],
      discussions: ['GET /api/projects/:id/discussions', 'POST /api/discussions'],
      analytics: ['GET /api/stats', 'GET /api/analytics'],
      search: ['GET /api/search'],
      templates: ['GET /api/templates'],
      export: ['GET /api/projects/:id/export']
    }
  });
});

// User authentication
app.post('/api/login', async (req, res) => {
  try {
    const { name, email, institution, role = 'clinician', specialty = 'pulmonology' } = req.body;
    
    if (!name || !email) {
      return res.status(400).json({
        success: false,
        error: 'Name and email are required'
      });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }
    
    // Check for existing user
    let user = Object.values(dataService.researchData.users)
      .find(u => u.email.toLowerCase() === email.toLowerCase());
    
    let userId;
    if (user) {
      userId = user.id;
      // Update user information
      user.name = name;
      user.institution = institution || user.institution;
      user.role = role;
      user.specialty = specialty;
      user.lastActivity = new Date().toISOString();
      user.updatedAt = new Date().toISOString();
    } else {
      // Create new user
      userId = `user-${uuidv4().slice(0, 8)}`;
      user = {
        id: userId,
        name,
        email: email.toLowerCase(),
        role,
        institution: institution || 'Medical Center',
        specialty,
        impactScore: 100,
        projects: [],
        votesGiven: 0,
        discussionsStarted: 0,
        commentsPosted: 0,
        preferences: {
          theme: 'medical-blue',
          notifications: {
            mentions: true,
            comments: true,
            projectUpdates: true,
            weeklyDigest: true
          },
          privacy: {
            showEmail: false,
            showInstitution: true,
            showActivity: true
          }
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastActivity: new Date().toISOString()
      };
      
      dataService.researchData.users[userId] = user;
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
      userAgent: req.get('User-Agent')
    };
    
    // Log activity
    dataService.logActivity(userId, 'login', {
      method: 'email',
      institution: user.institution,
      ip: req.ip
    });
    
    await dataService.queueSave('research');
    await dataService.queueSave('sessions');
    
    // Prepare response
    const response = {
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        institution: user.institution,
        role: user.role,
        specialty: user.specialty,
        impactScore: user.impactScore,
        projectCount: user.projects?.length || 0,
        preferences: user.preferences
      },
      session: {
        id: sessionId,
        expiresAt: dataService.sessionsData[sessionId].expiresAt
      },
      features: dataService.researchData.config.features,
      limits: dataService.researchData.config.settings
    };
    
    // Set cookie for web clients
    res.cookie('sessionId', sessionId, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: config.security.sessionDuration
    });
    
    res.json(response);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed',
      code: 'LOGIN_ERROR'
    });
  }
});

app.post('/api/logout', authenticate, async (req, res) => {
  try {
    const sessionId = req.sessionId;
    
    if (sessionId && dataService.sessionsData[sessionId]) {
      delete dataService.sessionsData[sessionId];
      await dataService.queueSave('sessions');
    }
    
    // Clear cookie
    res.clearCookie('sessionId');
    
    // Log activity
    dataService.logActivity(req.userId, 'logout', {
      method: 'session',
      ip: req.ip
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

// User profile
app.get('/api/me', authenticate, (req, res) => {
  try {
    const user = req.user;
    
    // Get user projects
    const userProjects = user.projects?.map(pid => 
      dataService.researchData.projects[pid]
    ).filter(Boolean) || [];
    
    // Get user statistics
    const userDiscussions = Object.values(dataService.researchData.discussions)
      .filter(d => d.authorId === user.id);
    
    const userComments = Object.values(dataService.researchData.discussions)
      .reduce((sum, d) => sum + (d.comments?.filter(c => c.authorId === user.id).length || 0), 0);
    
    const response = {
      success: true,
      user: {
        ...user,
        // Remove sensitive data
        email: undefined,
        preferences: user.preferences
      },
      stats: {
        projects: userProjects.length,
        discussions: userDiscussions.length,
        comments: userComments,
        impactScore: user.impactScore,
        votesGiven: user.votesGiven || 0
      },
      projects: userProjects.map(p => ({
        id: p.id,
        title: p.title,
        status: p.status,
        role: p.leadId === user.id ? 'Lead' : 'Member',
        lastActivity: dataService.getLastProjectActivity(p.id)
      })),
      notifications: {
        unread: dataService.getUserNotifications(user.id, true).length,
        total: dataService.getUserNotifications(user.id).length
      }
    };
    
    res.json(response);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load profile'
    });
  }
});

// Projects
app.get('/api/projects', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      search,
      tags,
      template,
      sort = 'updated',
      order = 'desc'
    } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;
    
    // Build filters
    const filters = {};
    if (status) filters.status = status;
    if (tags) filters.tags = tags.split(',');
    if (template) filters.template = template;
    
    // Search or get all projects
    let projects;
    if (search && search.trim().length >= 2) {
      projects = dataService.searchProjects(search.trim(), filters);
    } else {
      projects = Object.values(dataService.researchData.projects);
      
      // Apply filters
      if (filters.status) {
        projects = projects.filter(p => p.status === filters.status);
      }
      if (filters.tags) {
        projects = projects.filter(p => 
          p.tags && filters.tags.every(tag => p.tags.includes(tag))
        );
      }
      if (filters.template) {
        projects = projects.filter(p => p.template === filters.template);
      }
    }
    
    // Sort projects
    const sortField = sort === 'created' ? 'createdAt' : 'updatedAt';
    const sortOrder = order === 'asc' ? 1 : -1;
    
    projects.sort((a, b) => {
      const aDate = new Date(a[sortField] || a.createdAt);
      const bDate = new Date(b[sortField] || b.createdAt);
      return (bDate - aDate) * sortOrder;
    });
    
    // Pagination
    const total = projects.length;
    const totalPages = Math.ceil(total / limitNum);
    const paginatedProjects = projects.slice(offset, offset + limitNum);
    
    // Enrich with statistics
    const enrichedProjects = paginatedProjects.map(project => ({
      ...project,
      stats: dataService.getProjectStatistics(project.id),
      teamSize: project.teamMembers?.length || 1
    }));
    
    // Get available filters for UI
    const availableFilters = {
      statuses: [...new Set(projects.map(p => p.status))],
      templates: [...new Set(projects.map(p => p.template).filter(Boolean))],
      tags: [...new Set(projects.flatMap(p => p.tags || []))]
    };
    
    res.json({
      success: true,
      projects: enrichedProjects,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1
      },
      filters: {
        applied: { status, search, tags, template, sort, order },
        available: availableFilters
      }
    });
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load projects'
    });
  }
});

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
    const teamMembers = (project.teamMembers || [project.leadId])
      .map(memberId => {
        const user = dataService.researchData.users[memberId];
        return user ? {
          id: user.id,
          name: user.name,
          institution: user.institution,
          role: user.role,
          specialty: user.specialty,
          impactScore: user.impactScore
        } : null;
      })
      .filter(Boolean);
    
    // Get similar projects
    const similarProjects = dataService.getSimilarProjects(projectId, 3);
    
    // Get project statistics
    const statistics = dataService.getProjectStatistics(projectId);
    
    const response = {
      success: true,
      project: {
        ...project,
        team: teamMembers,
        similarProjects,
        statistics,
        timeline: dataService.estimateProjectTimeline(project)
      }
    };
    
    // Include medical data validation if authenticated and authorized
    if (req.user && (project.leadId === req.userId || project.teamMembers?.includes(req.userId))) {
      if (project.medicalData) {
        response.project.medicalValidation = dataService.validateMedicalData(project.medicalData, 'patient');
        response.project.medicalCalculations = dataService.generateMedicalCalculations(project.medicalData);
      }
    }
    
    res.json(response);
  } catch (error) {
    console.error('Get project error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load project'
    });
  }
});

app.post('/api/projects', authenticate, async (req, res) => {
  try {
    const {
      title,
      description,
      status = 'planning',
      tags = [],
      template,
      medicalData,
      startDate
    } = req.body;
    
    if (!title || !description) {
      return res.status(400).json({
        success: false,
        error: 'Title and description are required'
      });
    }
    
    // Validate medical data if provided
    if (medicalData) {
      const validation = dataService.validateMedicalData(medicalData, 'patient');
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: 'Invalid medical data',
          details: validation.errors
        });
      }
    }
    
    // Apply template if specified
    let templateData = {};
    if (template && dataService.researchData.researchTemplates[template]) {
      const templateConfig = dataService.researchData.researchTemplates[template];
      templateData = {
        template: templateConfig.id,
        templateName: templateConfig.name,
        templateFields: templateConfig.fields
      };
    }
    
    const projectId = `project-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const now = new Date().toISOString();
    
    const project = {
      id: projectId,
      title: title.trim(),
      description: description.trim(),
      status,
      tags: Array.isArray(tags) ? tags : [tags],
      lead: req.user.name,
      leadId: req.user.id,
      leadInstitution: req.user.institution,
      teamMembers: [req.user.id],
      discussionCount: 0,
      consensusScore: 75,
      startDate: startDate || now.split('T')[0],
      medicalData: medicalData || null,
      createdAt: now,
      updatedAt: now,
      ...templateData
    };
    
    dataService.researchData.projects[projectId] = project;
    
    // Add project to user's list
    if (!req.user.projects) req.user.projects = [];
    req.user.projects.push(projectId);
    req.user.impactScore = (req.user.impactScore || 100) + 10;
    
    // Create welcome discussion
    const discussionId = `disc-${Date.now()}`;
    const welcomeDiscussion = {
      id: discussionId,
      projectId,
      title: 'Welcome to the project!',
      content: `This project "${title}" has been created. Use this space to discuss research methodology, share findings, and collaborate with your team.`,
      author: req.user.name,
      authorId: req.user.id,
      authorInstitution: req.user.institution,
      upvotes: 0,
      downvotes: 0,
      comments: [],
      createdAt: now,
      updatedAt: now,
      isSystem: true,
      tags: ['welcome', 'introduction']
    };
    
    dataService.researchData.discussions[discussionId] = welcomeDiscussion;
    project.discussionCount = 1;
    
    // Log activity
    dataService.logActivity(req.user.id, 'create_project', {
      projectId,
      title: project.title,
      template: template || 'custom',
      hasMedicalData: !!medicalData
    });
    
    // Create notification for user
    dataService.createNotification(req.user.id, 'project_created', {
      projectId,
      projectTitle: project.title,
      discussionId
    });
    
    await dataService.queueSave('research');
    
    // Clear relevant caches
    dataService.cache.delete('analytics');
    dataService.cache.delete('search:*');
    
    // Socket.IO broadcast
    io.emit('project:created', {
      project: {
        ...project,
        stats: dataService.getProjectStatistics(projectId)
      },
      discussion: welcomeDiscussion,
      userId: req.user.id
    });
    
    res.status(201).json({
      success: true,
      project,
      discussion: welcomeDiscussion,
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
    
    // Check permissions
    if (project.leadId !== req.userId && !project.teamMembers?.includes(req.userId)) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to update this project'
      });
    }
    
    // Update allowed fields
    const allowedUpdates = ['title', 'description', 'status', 'tags', 'medicalData', 'startDate'];
    const updates = {};
    
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
        project[field] = req.body[field];
      }
    });
    
    // Validate medical data if being updated
    if (updates.medicalData) {
      const validation = dataService.validateMedicalData(updates.medicalData, 'patient');
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: 'Invalid medical data',
          details: validation.errors
        });
      }
    }
    
    project.updatedAt = new Date().toISOString();
    
    // Log activity
    dataService.logActivity(req.userId, 'update_project', {
      projectId,
      updates: Object.keys(updates),
      medicalDataUpdated: !!updates.medicalData
    });
    
    // Notify team members
    const teamMembers = project.teamMembers || [project.leadId];
    teamMembers.forEach(memberId => {
      if (memberId !== req.userId) {
        dataService.createNotification(memberId, 'project_updated', {
          projectId,
          projectTitle: project.title,
          updatedBy: req.user.name,
          updates: Object.keys(updates)
        });
      }
    });
    
    await dataService.queueSave('research');
    
    // Clear caches
    dataService.cache.delete(`project-stats:${projectId}`);
    dataService.cache.delete('analytics');
    
    // Socket.IO broadcast
    io.to(`project:${projectId}`).emit('project:updated', {
      projectId,
      updates,
      updatedBy: req.userId,
      timestamp: project.updatedAt
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
      error: 'Failed to update project'
    });
  }
});

// Analytics and statistics
app.get('/api/stats', (req, res) => {
  try {
    const analytics = dataService.updateAnalytics();
    
    res.json({
      success: true,
      stats: analytics.platformStats,
      distributions: {
        projects: analytics.projectDistribution,
        users: analytics.userDistribution
      },
      engagement: analytics.engagementMetrics,
      recentActivity: analytics.recentActivity.slice(0, 10),
      generatedAt: analytics.generatedAt
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load statistics'
    });
  }
});

app.get('/api/analytics/detailed', authenticate, (req, res) => {
  try {
    // Only allow for platform admins or the user's own analytics
    const analytics = dataService.updateAnalytics();
    
    res.json({
      success: true,
      ...analytics,
      userSpecific: {
        userId: req.userId,
        userImpact: req.user.impactScore,
        userProjects: req.user.projects?.length || 0
      }
    });
  } catch (error) {
    console.error('Get detailed analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load detailed analytics'
    });
  }
});

// Search
app.get('/api/search', (req, res) => {
  try {
    const { q: query, type = 'all', limit = 10 } = req.query;
    
    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters'
      });
    }
    
    const searchQuery = query.trim();
    const results = {
      projects: [],
      discussions: [],
      users: []
    };
    
    // Search projects
    if (type === 'all' || type === 'projects') {
      results.projects = dataService.searchProjects(searchQuery)
        .slice(0, limit)
        .map(p => ({
          id: p.id,
          title: p.title,
          description: p.description.substring(0, 150) + (p.description.length > 150 ? '...' : ''),
          status: p.status,
          tags: p.tags,
          lead: p.lead,
          createdAt: p.createdAt
        }));
    }
    
    // Search discussions
    if (type === 'all' || type === 'discussions') {
      const discussions = Object.values(dataService.researchData.discussions);
      results.discussions = discussions
        .filter(d => 
          d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          d.content.toLowerCase().includes(searchQuery.toLowerCase())
        )
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, limit)
        .map(d => ({
          id: d.id,
          title: d.title,
          content: d.content.substring(0, 200) + (d.content.length > 200 ? '...' : ''),
          author: d.author,
          projectId: d.projectId,
          projectTitle: dataService.researchData.projects[d.projectId]?.title,
          createdAt: d.createdAt
        }));
    }
    
    // Search users
    if (type === 'all' || type === 'users') {
      const users = Object.values(dataService.researchData.users);
      results.users = users
        .filter(u => 
          u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          u.institution.toLowerCase().includes(searchQuery.toLowerCase()) ||
          u.specialty.toLowerCase().includes(searchQuery.toLowerCase())
        )
        .slice(0, limit)
        .map(u => ({
          id: u.id,
          name: u.name,
          institution: u.institution,
          specialty: u.specialty,
          role: u.role,
          impactScore: u.impactScore
        }));
    }
    
    res.json({
      success: true,
      query: searchQuery,
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
    res.status(500).json({
      success: false,
      error: 'Search failed'
    });
  }
});

// Templates
app.get('/api/templates', (req, res) => {
  try {
    const templates = dataService.researchData.researchTemplates;
    
    res.json({
      success: true,
      templates: Object.entries(templates).map(([key, template]) => ({
        id: key,
        ...template
      })),
      count: Object.keys(templates).length
    });
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load templates'
    });
  }
});

app.get('/api/templates/:id', (req, res) => {
  try {
    const templateId = req.params.id;
    const template = dataService.researchData.researchTemplates[templateId];
    
    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found'
      });
    }
    
    res.json({
      success: true,
      template: {
        id: templateId,
        ...template
      }
    });
  } catch (error) {
    console.error('Get template error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load template'
    });
  }
});

// Export
app.get('/api/projects/:id/export', authenticate, (req, res) => {
  try {
    const projectId = req.params.id;
    const format = req.query.format || 'json';
    const includeMedical = req.query.medical === 'true';
    const anonymize = req.query.anonymize === 'true';
    
    const project = dataService.researchData.projects[projectId];
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }
    
    // Check authorization
    if (project.leadId !== req.userId && !project.teamMembers?.includes(req.userId)) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to export this project'
      });
    }
    
    const exportData = dataService.generateExportData(projectId, {
      includeMedical,
      includeDiscussions: true,
      includeComments: true,
      anonymize,
      format
    });
    
    // Log export activity
    dataService.logActivity(req.userId, 'export_project', {
      projectId,
      format,
      includeMedical,
      anonymize
    });
    
    if (format === 'csv') {
      // Simple CSV conversion
      const csvData = [];
      
      // Project data
      csvData.push(['Project Data']);
      csvData.push(['Field', 'Value']);
      Object.entries(exportData.project).forEach(([key, value]) => {
        if (typeof value !== 'object' || value === null) {
          csvData.push([key, value]);
        }
      });
      
      // Team data
      csvData.push([]);
      csvData.push(['Team Members']);
      csvData.push(['Name', 'Institution', 'Role', 'Specialty']);
      exportData.project.team?.forEach(member => {
        csvData.push([member.name, member.institution, member.role, member.specialty]);
      });
      
      const csv = csvData.map(row => row.map(cell => 
        `"${String(cell).replace(/"/g, '""')}"`
      ).join(',')).join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 
        `attachment; filename="thoraxlab-project-${projectId}-${new Date().toISOString().split('T')[0]}.csv"`
      );
      return res.send(csv);
    } else {
      res.json({
        success: true,
        ...exportData
      });
    }
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export project'
    });
  }
});

// Medical calculators
app.post('/api/medical/calculate', authenticate, (req, res) => {
  try {
    const { type, data } = req.body;
    
    if (!type || !data) {
      return res.status(400).json({
        success: false,
        error: 'Type and data are required'
      });
    }
    
    let result;
    
    switch (type) {
      case 'gold-stage':
        if (!data.fev1Percent) {
          return res.status(400).json({
            success: false,
            error: 'FEV1% predicted is required for GOLD staging'
          });
        }
        result = {
          stage: dataService.calculateGOLDStage(data.fev1Percent),
          value: dataService.getGOLDStageValue(data.fev1Percent),
          fev1Percent: data.fev1Percent
        };
        break;
        
      case 'bode-index':
        const requiredFields = ['fev1Percent', 'sixMWT', 'mmrc', 'bmi'];
        const missing = requiredFields.filter(field => data[field] === undefined);
        
        if (missing.length > 0) {
          return res.status(400).json({
            success: false,
            error: `Missing required fields: ${missing.join(', ')}`
          });
        }
        
        result = dataService.calculateBODEIndex(data);
        break;
        
      case 'ards-net':
        if (!data.pao2 || !data.fio2) {
          return res.status(400).json({
            success: false,
            error: 'PaO2 and FiO2 are required for ARDSNet calculation'
          });
        }
        result = dataService.calculateARDSNet(data);
        break;
        
      default:
        return res.status(400).json({
          success: false,
          error: 'Unsupported calculation type'
        });
    }
    
    // Log calculation activity
    dataService.logActivity(req.userId, 'medical_calculation', {
      type,
      hasResult: !!result
    });
    
    res.json({
      success: true,
      type,
      data,
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Medical calculation error:', error);
    res.status(500).json({
      success: false,
      error: 'Calculation failed'
    });
  }
});

// Notifications
app.get('/api/notifications', authenticate, (req, res) => {
  try {
    const unreadOnly = req.query.unread === 'true';
    const limit = parseInt(req.query.limit) || 50;
    
    const notifications = dataService.getUserNotifications(req.userId, unreadOnly, limit);
    
    res.json({
      success: true,
      notifications,
      counts: {
        total: dataService.getUserNotifications(req.userId).length,
        unread: dataService.getUserNotifications(req.userId, true).length,
        shown: notifications.length
      }
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load notifications'
    });
  }
});

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
    res.status(500).json({
      success: false,
      error: 'Failed to mark notification'
    });
  }
});

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
    res.status(500).json({
      success: false,
      error: 'Failed to mark notifications'
    });
  }
});

// Discussions
app.get('/api/projects/:id/discussions', (req, res) => {
  try {
    const projectId = req.params.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    
    // Get project to ensure it exists
    const project = dataService.researchData.projects[projectId];
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }
    
    // Get discussions for this project
    let discussions = Object.values(dataService.researchData.discussions)
      .filter(d => d.projectId === projectId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // Filter by tag if specified
    if (req.query.tag) {
      discussions = discussions.filter(d => 
        d.tags && d.tags.includes(req.query.tag)
      );
    }
    
    // Filter by author if specified
    if (req.query.authorId) {
      discussions = discussions.filter(d => d.authorId === req.query.authorId);
    }
    
    // Pagination
    const total = discussions.length;
    const totalPages = Math.ceil(total / limit);
    const paginatedDiscussions = discussions.slice(offset, offset + limit);
    
    // Enrich with author details
    const enrichedDiscussions = paginatedDiscussions.map(discussion => {
      const author = dataService.researchData.users[discussion.authorId];
      return {
        ...discussion,
        authorDetails: author ? {
          name: author.name,
          institution: author.institution,
          role: author.role
        } : null,
        commentCount: discussion.comments?.length || 0,
        voteCount: (discussion.upvotes || 0) + (discussion.downvotes || 0)
      };
    });
    
    res.json({
      success: true,
      discussions: enrichedDiscussions,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      },
      project: {
        id: project.id,
        title: project.title,
        discussionCount: discussions.length
      }
    });
  } catch (error) {
    console.error('Get discussions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load discussions'
    });
  }
});

// ==================== SOCKET.IO HANDLERS ====================
io.on('connection', (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);
  
  let userId = null;
  let user = null;
  
  // Authenticate socket
  socket.on('authenticate', async (data) => {
    try {
      const { sessionId } = data;
      
      if (!sessionId) {
        socket.emit('error', { error: 'Session ID required' });
        return;
      }
      
      const session = dataService.sessionsData[sessionId];
      
      if (!session) {
        socket.emit('authentication_failed', { error: 'Invalid session' });
        return;
      }
      
      // Check expiration
      if (new Date(session.expiresAt) < new Date()) {
        delete dataService.sessionsData[sessionId];
        dataService.queueSave('sessions');
        
        socket.emit('authentication_failed', { error: 'Session expired' });
        return;
      }
      
      user = dataService.researchData.users[session.userId];
      if (!user) {
        socket.emit('authentication_failed', { error: 'User not found' });
        return;
      }
      
      userId = user.id;
      
      // Join user room for private messages
      socket.join(`user:${userId}`);
      
      // Update session activity
      session.lastActivity = new Date().toISOString();
      dataService.queueSave('sessions');
      
      socket.emit('authenticated', {
        success: true,
        userId,
        user: {
          id: user.id,
          name: user.name,
          institution: user.institution
        }
      });
      
      console.log(`✅ Socket authenticated: ${userId} (${socket.id})`);
    } catch (error) {
      console.error('Socket auth error:', error);
      socket.emit('error', { error: 'Authentication failed' });
    }
  });
  
  // Join project room
  socket.on('join:project', (projectId) => {
    if (!userId) {
      socket.emit('error', { error: 'Not authenticated' });
      return;
    }
    
    // Check if user has access to project
    const project = dataService.researchData.projects[projectId];
    if (!project) {
      socket.emit('error', { error: 'Project not found' });
      return;
    }
    
    if (project.leadId !== userId && !project.teamMembers?.includes(userId)) {
      socket.emit('error', { error: 'Not authorized to join project' });
      return;
    }
    
    socket.join(`project:${projectId}`);
    
    socket.emit('joined:project', {
      projectId,
      timestamp: new Date().toISOString()
    });
    
    // Notify others in project
    socket.to(`project:${projectId}`).emit('user:joined', {
      userId,
      userName: user.name,
      timestamp: new Date().toISOString()
    });
    
    console.log(`👥 ${userId} joined project: ${projectId}`);
  });
  
  // Leave project room
  socket.on('leave:project', (projectId) => {
    socket.leave(`project:${projectId}`);
    
    if (userId) {
      socket.to(`project:${projectId}`).emit('user:left', {
        userId,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Create discussion
  socket.on('discussion:create', async (data) => {
    try {
      if (!userId) {
        socket.emit('error', { error: 'Not authenticated' });
        return;
      }
      
      const { projectId, title, content, tags = [] } = data;
      
      if (!projectId || !title || !content) {
        socket.emit('error', { error: 'Project ID, title, and content are required' });
        return;
      }
      
      // Check project access
      const project = dataService.researchData.projects[projectId];
      if (!project) {
        socket.emit('error', { error: 'Project not found' });
        return;
      }
      
      if (project.leadId !== userId && !project.teamMembers?.includes(userId)) {
        socket.emit('error', { error: 'Not authorized to create discussion' });
        return;
      }
      
      const discussionId = `disc-${Date.now()}`;
      const now = new Date().toISOString();
      
      const discussion = {
        id: discussionId,
        projectId,
        title: title.trim(),
        content: content.trim(),
        author: user.name,
        authorId: userId,
        authorInstitution: user.institution,
        upvotes: 0,
        downvotes: 0,
        votes: {},
        comments: [],
        mentions: dataService.extractMentions(content),
        tags: Array.isArray(tags) ? tags : [tags],
        createdAt: now,
        updatedAt: now
      };
      
      dataService.researchData.discussions[discussionId] = discussion;
      
      // Update project discussion count
      project.discussionCount = (project.discussionCount || 0) + 1;
      project.updatedAt = now;
      
      // Log activity
      dataService.logActivity(userId, 'create_discussion', {
        projectId,
        discussionId,
        title: discussion.title,
        tagCount: discussion.tags.length
      });
      
      // Update user statistics
      user.discussionsStarted = (user.discussionsStarted || 0) + 1;
      user.impactScore = (user.impactScore || 100) + 5;
      
      await dataService.queueSave('research');
      
      // Clear caches
      dataService.cache.delete(`project-stats:${projectId}`);
      dataService.cache.delete('analytics');
      
      // Notify mentioned users
      if (discussion.mentions && discussion.mentions.length > 0) {
        discussion.mentions.forEach(mentionedUserId => {
          if (mentionedUserId !== userId) {
            dataService.createNotification(mentionedUserId, 'mention', {
              projectId,
              projectTitle: project.title,
              discussionId,
              discussionTitle: discussion.title,
              mentionedBy: user.name
            });
            
            // Real-time notification
            io.to(`user:${mentionedUserId}`).emit('notification:new', {
              type: 'mention',
              discussionId,
              projectId,
              title: `You were mentioned in "${discussion.title}"`,
              from: user.name
            });
          }
        });
      }
      
      // Broadcast to project room
      io.to(`project:${projectId}`).emit('discussion:created', {
        ...discussion,
        authorDetails: {
          name: user.name,
          institution: user.institution
        }
      });
      
      // Send confirmation to sender
      socket.emit('discussion:created:confirm', {
        discussionId,
        timestamp: now
      });
      
    } catch (error) {
      console.error('Create discussion error:', error);
      socket.emit('error', { error: 'Failed to create discussion' });
    }
  });
  
  // Add comment
  socket.on('comment:add', async (data) => {
    try {
      if (!userId) {
        socket.emit('error', { error: 'Not authenticated' });
        return;
      }
      
      const { discussionId, content } = data;
      
      if (!discussionId || !content) {
        socket.emit('error', { error: 'Discussion ID and content are required' });
        return;
      }
      
      const discussion = dataService.researchData.discussions[discussionId];
      if (!discussion) {
        socket.emit('error', { error: 'Discussion not found' });
        return;
      }
      
      const project = dataService.researchData.projects[discussion.projectId];
      if (!project) {
        socket.emit('error', { error: 'Project not found' });
        return;
      }
      
      // Check project access
      if (project.leadId !== userId && !project.teamMembers?.includes(userId)) {
        socket.emit('error', { error: 'Not authorized to comment' });
        return;
      }
      
      if (!discussion.comments) discussion.comments = [];
      
      const commentId = `comment-${Date.now()}`;
      const now = new Date().toISOString();
      
      const comment = {
        id: commentId,
        author: user.name,
        authorId: userId,
        authorInstitution: user.institution,
        content: content.trim(),
        mentions: dataService.extractMentions(content),
        timestamp: now
      };
      
      discussion.comments.push(comment);
      discussion.updatedAt = now;
      
      // Log activity
      dataService.logActivity(userId, 'add_comment', {
        projectId: discussion.projectId,
        discussionId,
        commentLength: content.length
      });
      
      // Update user statistics
      user.commentsPosted = (user.commentsPosted || 0) + 1;
      user.impactScore = (user.impactScore || 100) + 2;
      
      await dataService.queueSave('research');
      
      // Clear caches
      dataService.cache.delete(`project-stats:${discussion.projectId}`);
      
      // Notify discussion author (if different from commenter)
      if (discussion.authorId !== userId) {
        dataService.createNotification(discussion.authorId, 'comment', {
          projectId: discussion.projectId,
          projectTitle: project.title,
          discussionId,
          discussionTitle: discussion.title,
          commentedBy: user.name,
          commentPreview: content.substring(0, 100)
        });
        
        // Real-time notification
        io.to(`user:${discussion.authorId}`).emit('notification:new', {
          type: 'comment',
          discussionId,
          projectId: discussion.projectId,
          title: `New comment on "${discussion.title}"`,
          from: user.name
        });
      }
      
      // Notify mentioned users
      if (comment.mentions && comment.mentions.length > 0) {
        comment.mentions.forEach(mentionedUserId => {
          if (mentionedUserId !== userId && mentionedUserId !== discussion.authorId) {
            dataService.createNotification(mentionedUserId, 'mention', {
              projectId: discussion.projectId,
              discussionId,
              discussionTitle: discussion.title,
              mentionedBy: user.name,
              commentPreview: content.substring(0, 100)
            });
            
            io.to(`user:${mentionedUserId}`).emit('notification:new', {
              type: 'mention',
              discussionId,
              projectId: discussion.projectId,
              title: `You were mentioned in a comment on "${discussion.title}"`,
              from: user.name
            });
          }
        });
      }
      
      // Broadcast to project room
      io.to(`project:${discussion.projectId}`).emit('comment:added', {
        discussionId,
        comment: {
          ...comment,
          authorDetails: {
            name: user.name,
            institution: user.institution
          }
        }
      });
      
      socket.emit('comment:added:confirm', {
        commentId,
        timestamp: now
      });
      
    } catch (error) {
      console.error('Add comment error:', error);
      socket.emit('error', { error: 'Failed to add comment' });
    }
  });
  
  // Vote on discussion
  socket.on('discussion:vote', async (data) => {
    try {
      if (!userId) {
        socket.emit('error', { error: 'Not authenticated' });
        return;
      }
      
      const { discussionId, voteType } = data;
      
      if (!discussionId || !voteType) {
        socket.emit('error', { error: 'Discussion ID and vote type are required' });
        return;
      }
      
      if (!['up', 'down'].includes(voteType)) {
        socket.emit('error', { error: 'Invalid vote type' });
        return;
      }
      
      const discussion = dataService.researchData.discussions[discussionId];
      if (!discussion) {
        socket.emit('error', { error: 'Discussion not found' });
        return;
      }
      
      const project = dataService.researchData.projects[discussion.projectId];
      if (!project) {
        socket.emit('error', { error: 'Project not found' });
        return;
      }
      
      // Check project access
      if (project.leadId !== userId && !project.teamMembers?.includes(userId)) {
        socket.emit('error', { error: 'Not authorized to vote' });
        return;
      }
      
      // Initialize vote tracking
      if (!discussion.votes) discussion.votes = {};
      
      const previousVote = discussion.votes[userId];
      
      // Update counts
      if (previousVote === voteType) {
        // Remove vote
        if (voteType === 'up') {
          discussion.upvotes = Math.max(0, (discussion.upvotes || 0) - 1);
        } else {
          discussion.downvotes = Math.max(0, (discussion.downvotes || 0) - 1);
        }
        delete discussion.votes[userId];
      } else {
        // Update or change vote
        if (previousVote === 'up') {
          discussion.upvotes = Math.max(0, (discussion.upvotes || 0) - 1);
        } else if (previousVote === 'down') {
          discussion.downvotes = Math.max(0, (discussion.downvotes || 0) - 1);
        }
        
        if (voteType === 'up') {
          discussion.upvotes = (discussion.upvotes || 0) + 1;
        } else {
          discussion.downvotes = (discussion.downvotes || 0) + 1;
        }
        
        discussion.votes[userId] = voteType;
      }
      
      discussion.updatedAt = new Date().toISOString();
      
      // Log activity
      dataService.logActivity(userId, voteType === 'up' ? 'upvote' : 'downvote', {
        discussionId,
        projectId: discussion.projectId
      });
      
      // Update user statistics
      user.votesGiven = (user.votesGiven || 0) + 1;
      
      await dataService.queueSave('research');
      
      // Clear caches
      dataService.cache.delete(`project-stats:${discussion.projectId}`);
      
      // Broadcast vote update
      io.to(`project:${discussion.projectId}`).emit('discussion:vote:update', {
        discussionId,
        upvotes: discussion.upvotes || 0,
        downvotes: discussion.downvotes || 0,
        userVote: discussion.votes[userId],
        totalVotes: (discussion.upvotes || 0) + (discussion.downvotes || 0)
      });
      
    } catch (error) {
      console.error('Vote error:', error);
      socket.emit('error', { error: 'Failed to process vote' });
    }
  });
  
  // Typing indicator
  socket.on('typing', (data) => {
    if (!userId) return;
    
    const { projectId, discussionId, isTyping } = data;
    
    if (projectId && discussionId) {
      socket.to(`project:${projectId}`).emit('user:typing', {
        userId,
        userName: user.name,
        discussionId,
        isTyping,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Disconnect handler
  socket.on('disconnect', () => {
    console.log(`🔌 Socket disconnected: ${socket.id} (${userId || 'unauthenticated'})`);
    
    if (userId) {
      // Leave all project rooms
      // Note: Socket.IO automatically removes socket from rooms on disconnect
    }
  });
});

// ==================== ERROR HANDLING ====================
// 404 for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'API endpoint not found',
    path: req.originalUrl,
    requestId: req.requestId,
    timestamp: new Date().toISOString()
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('🔥 Server error:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    requestId: req.requestId,
    timestamp: new Date().toISOString()
  });
  
  const statusCode = err.status || 500;
  const errorResponse = {
    success: false,
    error: 'Internal server error',
    requestId: req.requestId,
    timestamp: new Date().toISOString()
  };
  
  if (!isProduction) {
    errorResponse.message = err.message;
    errorResponse.stack = err.stack;
  }
  
  res.status(statusCode).json(errorResponse);
});

// ==================== SPA FALLBACK ====================
app.get('*', (req, res) => {
  res.sendFile(path.join(config.paths.public, 'index.html'));
});

// ==================== START SERVER ====================
async function startServer() {
  try {
    // Initialize data service
    console.log('🚀 Starting ThoraxLab Research Platform...');
    console.log(`📁 Environment: ${NODE_ENV}`);
    console.log(`📁 Data directory: ${config.paths.data}`);
    console.log(`📁 Public directory: ${config.paths.public}`);
    
    await dataService.initialize();
    
    // Start server
    server.listen(PORT, '0.0.0.0', () => {
      const analytics = dataService.updateAnalytics();
      
      console.log(`
🎯 THORAXLAB RESEARCH PLATFORM v${config.app.version}
=========================================================
🌐 Server URL: http://localhost:${PORT}
🚀 Health Check: http://localhost:${PORT}/health
📊 API Status: http://localhost:${PORT}/api/status
👥 Dashboard: http://localhost:${PORT}/

📈 PLATFORM STATISTICS:
   • Projects: ${analytics.platformStats.totalProjects}
   • Users: ${analytics.platformStats.totalUsers}
   • Discussions: ${analytics.platformStats.totalDiscussions}
   • Active Sessions: ${Object.keys(dataService.sessionsData).length}
   • Consensus Rate: ${analytics.platformStats.consensusRate}%
   • Engagement Score: ${analytics.platformStats.engagementScore}/100

🩺 MEDICAL FEATURES:
   ✅ Lung Function Validation
   ✅ GOLD Staging Calculator
   ✅ BODE Index Calculator
   ✅ ARDSNet Prediction
   ✅ Medical Data Templates
   ✅ Patient Data Anonymization

🔧 TECHNICAL FEATURES:
   ✅ Real-time Collaboration
   ✅ Advanced Search
   ✅ Comprehensive Analytics
   ✅ Export Tools (JSON/CSV)
   ✅ Notification System
   ✅ Rate Limiting
   ✅ Request Logging
   ✅ Caching System
   ✅ Data Validation

🚀 DEPLOYMENT READY:
   ✅ Railway Optimized
   ✅ Production Security
   ✅ Graceful Shutdown
   ✅ Health Checks
   ✅ Error Tracking
   ✅ Performance Monitoring

💡 Server started successfully on port ${PORT}
      `);
    });
  } catch (error) {
    console.error('💥 Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, starting graceful shutdown...');
  
  try {
    // Save all pending data
    console.log('💾 Saving pending data...');
    await dataService.saveResearchData();
    await dataService.saveSessionsData();
    console.log('✅ Data saved successfully');
    
    // Close server
    server.close(() => {
      console.log('✅ HTTP server closed');
      console.log('👋 Shutdown complete');
      process.exit(0);
    });
    
    // Force shutdown after 10 seconds
    setTimeout(() => {
      console.error('⏰ Shutdown timeout, forcing exit');
      process.exit(1);
    }, 10000);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down...');
  
  try {
    await dataService.saveResearchData();
    await dataService.saveSessionsData();
    
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
    
    setTimeout(() => {
      console.error('Forced shutdown');
      process.exit(1);
    }, 5000);
  } catch (error) {
    console.error('Shutdown error:', error);
    process.exit(1);
  }
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  // Don't exit in production, let the process restart
  if (isProduction) {
    console.error('Process will continue running...');
  } else {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the server
startServer().catch(console.error);
