const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { database } = require('./database.js');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'thoraxlab-secret-key-change-in-production';
const JWT_EXPIRES_IN = '24h';

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false // Allow inline styles for demo
}));

app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://*.railway.app', 'https://*.vercel.app']
        : ['http://localhost:3000', 'http://127.0.0.1:3000']
}));

app.use(compression());
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
});
app.use('/api/', limiter);

// Static files
app.use(express.static(__dirname));

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Authentication middleware
const authenticate = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token required' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const session = await database.getSessionByToken(token);
        
        if (!session) {
            return res.status(401).json({ error: 'Invalid session' });
        }

        const user = await database.getUser(session.user_id);
        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }

        req.user = user;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired' });
        }
        return res.status(403).json({ error: 'Invalid token' });
    }
};

// Routes
app.post('/api/login', async (req, res) => {
    try {
        const { name, email, organization, role } = req.body;

        if (!name || !email || !role) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        let user = await database.findUserByEmail(email);
        if (!user) {
            user = await database.createUser({ name, email, organization, role });
        }

        const token = jwt.sign(
            { userId: user.id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        await database.createSession(user.id, token);

        res.json({
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
        console.error('Login error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/logout', authenticate, async (req, res) => {
    try {
        const token = req.headers.authorization.split(' ')[1];
        await database.deleteSession(token);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/dashboard', authenticate, async (req, res) => {
    try {
        const dashboardData = await database.getDashboardData(req.user.id);
        
        // Add demo metrics
        const clinicalCount = Math.floor(Math.random() * 50) + 10;
        const industryCount = Math.floor(Math.random() * 30) + 5;
        const crossCount = Math.floor(Math.random() * 20) + 3;
        
        res.json({
            success: true,
            dashboard: {
                metrics: {
                    ...dashboardData.metrics,
                    clinicalActivity: clinicalCount,
                    industryActivity: industryCount,
                    crossPollination: crossCount
                },
                activeProjects: dashboardData.recentProjects.map(p => ({
                    ...p,
                    team_count: 3 // Demo count
                })),
                recentActivity: dashboardData.recentActivity
            }
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/projects', authenticate, async (req, res) => {
    try {
        const projects = await database.getProjectsForUser(req.user.id);
        
        res.json({
            success: true,
            projects: projects.map(p => ({
                ...p,
                team_count: Math.floor(Math.random() * 5) + 1
            }))
        });
    } catch (error) {
        console.error('Projects error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/projects', authenticate, async (req, res) => {
    try {
        const { title, description, type } = req.body;

        if (!title || !description || !type) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const project = await database.createProject({
            title,
            description,
            type
        }, req.user.id);

        res.status(201).json({
            success: true,
            project: {
                ...project,
                team_count: 1
            }
        });
    } catch (error) {
        console.error('Create project error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/projects/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const hasAccess = await database.isUserInProject(id, req.user.id);
        
        if (!hasAccess) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const project = await database.getProject(id);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        const team = await database.getProjectTeam(id);
        const metrics = await database.getProjectMetrics(id);
        
        res.json({
            success: true,
            project: {
                ...project,
                team,
                metrics,
                team_count: team.length
            }
        });
    } catch (error) {
        console.error('Project error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/projects/:id/documents', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const hasAccess = await database.isUserInProject(id, req.user.id);
        
        if (!hasAccess) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Demo documents
        const documents = [
            {
                id: "doc_1",
                title: "COPD Clinical Trial Protocol v2.1",
                description: "Phase III trial design for exacerbation prediction algorithm validation.",
                tags: ["audience:clinical", "specialty:pulmonology", "type:protocol"],
                audience: "clinical",
                date: "2024-01-15",
                author: "Dr. Alex Chen",
                icon: "fas fa-file-medical"
            },
            {
                id: "doc_2",
                title: "Spirometry Data Pipeline Architecture",
                description: "Technical specification for real-time data ingestion and preprocessing.",
                tags: ["audience:technical", "domain:data", "type:api"],
                audience: "technical",
                date: "2024-01-20",
                author: "Sarah Rodriguez",
                icon: "fas fa-database"
            }
        ];

        res.json({
            success: true,
            documents
        });
    } catch (error) {
        console.error('Documents error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/translate', authenticate, async (req, res) => {
    try {
        const { text, direction = 'clinical-to-technical' } = req.body;

        if (!text) {
            return res.status(400).json({ error: 'Text required' });
        }

        // Demo translations
        const translations = {
            'copd exacerbation': {
                term: 'COPD Exacerbation',
                clinical: 'A sudden worsening of COPD symptoms requiring medical intervention.',
                technical: 'Time-series classification problem detecting deterioration patterns.',
                analogy: 'Like a car engine warning light.'
            },
            'fev1 variability': {
                term: 'FEV1 Variability',
                clinical: 'Changes in lung function measurements over time.',
                technical: 'Standard deviation analysis of pulmonary function data.',
                analogy: 'Like monitoring battery degradation.'
            }
        };

        const lowerText = text.toLowerCase();
        let translation = translations[lowerText];

        if (!translation) {
            translation = {
                term: text.charAt(0).toUpperCase() + text.slice(1),
                clinical: `${text} is assessed through diagnostic tests and tracking.`,
                technical: `Technical implementation involves ${text.toLowerCase()} monitoring.`,
                analogy: 'Like building a weather station network.'
            };
        }
        
        res.json({
            success: true,
            translation: {
                ...translation,
                direction,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Translate error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// Start server
async function startServer() {
    try {
        await database.connect();
        
        app.listen(PORT, () => {
            console.log(`
🚀 ThoraxLab Server Started
─────────────────────────────
✅ Port: ${PORT}
✅ Health: http://localhost:${PORT}/health
✅ Database: Connected
─────────────────────────────
            `);
        });

        // Graceful shutdown
        process.on('SIGTERM', async () => {
            console.log('Shutting down gracefully...');
            await database.close();
            process.exit(0);
        });

        process.on('SIGINT', async () => {
            console.log('Shutting down gracefully...');
            await database.close();
            process.exit(0);
        });

    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

module.exports = app;
