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
import cookieParser from 'cookie-parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'production';
const isProduction = NODE_ENV === 'production';

const app = express();
const server = createServer(app);

// ==================== HEALTHCARE INNOVATION PLATFORM DATA STORE ====================
class HealthcareInnovationPlatform {
    constructor() {
        this.dataPath = path.join(__dirname, 'healthcare_innovation_data.json');
        this.data = {
            users: {},
            innovationProjects: {},
            stakeholderNetwork: {},
            innovationOpportunities: {},
            sessions: {},
            platformAnalytics: {
                totalInnovations: 0,
                activeCollaborations: 0,
                stakeholderConnections: 0,
                innovationPipelineValue: 0,
                successStories: []
            }
        };
        this.initializePlatform();
    }

    async initializePlatform() {
        try {
            const platformData = await fs.readFile(this.dataPath, 'utf8');
            this.data = JSON.parse(platformData);
            console.log(`🏥 Healthcare Innovation Platform: Loaded ${Object.keys(this.data.users).length} stakeholders across ${Object.keys(this.data.innovationProjects).length} innovation projects`);
            
            this.ensurePlatformAdministrator();
        } catch (error) {
            if (error.code === 'ENOENT') {
                await this.createPlatformFoundation();
                console.log('🚀 Created Healthcare Innovation Platform foundation');
            } else {
                console.error('Platform initialization error:', error);
            }
        }

        // Platform auto-save
        setInterval(() => this.savePlatformData(), 300000);
    }

    async createPlatformFoundation() {
        // Create platform director
        const directorId = `director-${Date.now()}`;
        this.data.users[directorId] = {
            id: directorId,
            name: 'Healthcare Innovation Director',
            email: 'director@healthcare-innovation.org',
            organization: 'Healthcare Innovation Institute',
            stakeholderType: 'platform_administration',
            role: 'platform_director',
            expertise: ['innovation_management', 'healthcare_technology', 'stakeholder_engagement'],
            credentials: 'MBA, MPH, FACHE',
            innovationImpact: 1000,
            isAdmin: true,
            permissions: ['platform_management', 'stakeholder_verification', 'opportunity_curation'],
            meta: {
                verificationStatus: 'verified',
                organizationRole: 'Director of Innovation',
                innovationFocus: ['digital_health', 'medical_devices', 'care_delivery']
            },
            createdAt: new Date().toISOString(),
            lastActivity: new Date().toISOString(),
            innovationProjects: [],
            connections: [],
            opportunitiesPosted: []
        };

        // Create flagship innovation project
        const flagshipId = `innovation-${uuidv4()}`;
        this.data.innovationProjects[flagshipId] = {
            id: flagshipId,
            title: 'AI-Powered Thoracic Surgery Decision Support System',
            tagline: 'Real-time surgical guidance using AI and augmented reality',
            description: 'A collaborative innovation project developing an AI-powered decision support system for thoracic surgeons, integrating real-time imaging, patient data, and surgical expertise to improve outcomes.',
            innovationType: 'digital_health_medical_device',
            stage: 'prototype_development',
            therapeuticArea: 'thoracic_surgery',
            clinicalNeed: 'Reduce surgical complications and improve precision in thoracic procedures',
            valueProposition: '30% reduction in post-operative complications, 20% reduction in OR time',
            businessModel: 'SaaS subscription for hospitals',
            ipStatus: 'patent_pending',
            leadStakeholder: {
                id: directorId,
                name: 'Healthcare Innovation Director',
                organization: 'Healthcare Innovation Institute',
                stakeholderType: 'platform_administration'
            },
            stakeholderTeam: [
                {
                    id: directorId,
                    name: 'Healthcare Innovation Director',
                    organization: 'Healthcare Innovation Institute',
                    stakeholderType: 'platform_administration',
                    role: 'project_lead',
                    contribution: 'project_management_stakeholder_engagement'
                }
            ],
            collaboratingOrganizations: [
                {
                    name: 'Thoracic Surgery Department',
                    type: 'clinical',
                    role: 'clinical_validation',
                    status: 'active'
                },
                {
                    name: 'Medical Device Startup',
                    type: 'industry',
                    role: 'technology_development',
                    status: 'seeking'
                },
                {
                    name: 'AI Research Lab',
                    type: 'academic',
                    role: 'algorithm_development',
                    status: 'interested'
                }
            ],
            projectGoals: [
                'Develop MVP prototype within 12 months',
                'Achieve clinical validation at 3 major centers',
                'Secure Series A funding',
                'Obtain regulatory clearance (FDA 510k)',
                'First commercial deployment within 24 months'
            ],
            technologyStack: ['AI/ML algorithms', 'Augmented Reality', 'Real-time imaging processing', 'Cloud infrastructure'],
            developmentRoadmap: {
                phase1: { name: 'Feasibility Study', timeline: 'Months 1-3', status: 'completed' },
                phase2: { name: 'Prototype Development', timeline: 'Months 4-9', status: 'in_progress' },
                phase3: { name: 'Clinical Validation', timeline: 'Months 10-15', status: 'planned' },
                phase4: { name: 'Regulatory Submission', timeline: 'Months 16-18', status: 'planned' },
                phase5: { name: 'Commercial Launch', timeline: 'Months 19-24', status: 'planned' }
            },
            resourceNeeds: {
                funding: { amount: 2000000, currency: 'USD', stage: 'seed' },
                expertise: ['AI/ML engineers', 'Thoracic surgeons', 'Regulatory specialists', 'Clinical researchers'],
                infrastructure: ['Cloud computing', 'Medical grade hardware', 'Testing facilities'],
                partnerships: ['Medical device manufacturers', 'Hospital systems', 'Regulatory consultants']
            },
            successMetrics: {
                clinical: ['Reduction in complication rates', 'Improved surgical precision', 'Faster recovery times'],
                business: ['Market adoption rate', 'Revenue growth', 'Customer acquisition cost'],
                innovation: ['IP generated', 'Publications', 'Conference presentations']
            },
            engagementMetrics: {
                stakeholderParticipation: 85,
                collaborationIntensity: 92,
                decisionVelocity: 78,
                innovationProgress: 45
            },
            regulatoryPath: {
                fdaClassification: 'Class II medical device',
                regulatoryStrategy: 'De Novo pathway',
                timeline: '18-24 months',
                estimatedCost: 500000
            },
            marketAnalysis: {
                targetMarket: 'Thoracic surgery departments globally',
                marketSize: 2500000000,
                competition: ['Existing surgical navigation systems', 'Manual surgical techniques'],
                uniqueAdvantage: 'Real-time AI guidance, surgeon-specific adaptation, lower cost'
            },
            fundingHistory: [
                { round: 'seed', amount: 500000, date: '2024-01-15', investors: ['Innovation Institute'] },
                { round: 'series_a', amount: 1500000, date: '2024-06-30', investors: [], status: 'seeking' }
            ],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        // Create stakeholder network foundation
        this.data.stakeholderNetwork = {
            clinicians: {
                count: 0,
                specialties: {},
                engagementLevel: 0
            },
            industry: {
                count: 0,
                sectors: {},
                engagementLevel: 0
            },
            researchers: {
                count: 0,
                domains: {},
                engagementLevel: 0
            },
            investors: {
                count: 0,
                focusAreas: {},
                engagementLevel: 0
            },
            patients: {
                count: 0,
                conditions: {},
                engagementLevel: 0
            }
        };

        // Create innovation opportunities
        this.data.innovationOpportunities = {
            'opp-001': {
                id: 'opp-001',
                title: 'Need: Better Post-Operative Monitoring for Thoracic Patients',
                description: 'Current post-op monitoring is resource-intensive. Opportunity for remote monitoring solutions.',
                submittedBy: directorId,
                stakeholderType: 'clinical',
                innovationCategory: 'remote_monitoring_digital_health',
                urgency: 'high',
                marketPotential: 500000000,
                status: 'open',
                seeking: ['Technology partners', 'Clinical validation sites', 'Funding'],
                createdAt: new Date().toISOString()
            }
        };

        // Add project to director
        this.data.users[directorId].innovationProjects.push(flagshipId);

        // Initialize platform analytics
        this.data.platformAnalytics = {
            totalInnovations: 1,
            activeCollaborations: 1,
            stakeholderConnections: 0,
            innovationPipelineValue: 2000000,
            successStories: [],
            platformHealth: {
                uptime: 100,
                stakeholderSatisfaction: 0,
                collaborationEfficiency: 0,
                innovationVelocity: 0
            }
        };

        await this.savePlatformData();
    }

    ensurePlatformAdministrator() {
        const adminEmail = 'director@healthcare-innovation.org';
        const adminExists = Object.values(this.data.users).some(u => u.email === adminEmail);
        
        if (!adminExists) {
            const directorId = `director-${Date.now()}`;
            this.data.users[directorId] = {
                id: directorId,
                name: 'Healthcare Innovation Director',
                email: adminEmail,
                organization: 'Healthcare Innovation Institute',
                stakeholderType: 'platform_administration',
                isAdmin: true,
                createdAt: new Date().toISOString(),
                lastActivity: new Date().toISOString(),
                innovationProjects: []
            };
            this.savePlatformData();
        }
    }

    async savePlatformData() {
        try {
            await fs.writeFile(this.dataPath, JSON.stringify(this.data, null, 2));
        } catch (error) {
            console.error('Platform data save error:', error);
        }
    }

    // ==================== STAKEHOLDER MANAGEMENT ====================
    registerStakeholder(stakeholderData) {
        const stakeholderId = `stakeholder-${uuidv4()}`;
        const now = new Date().toISOString();
        
        const stakeholder = {
            id: stakeholderId,
            name: stakeholderData.name.trim(),
            email: stakeholderData.email.trim().toLowerCase(),
            organization: stakeholderData.organization || 'Independent',
            stakeholderType: stakeholderData.stakeholderType || 'clinician',
            role: stakeholderData.role || 'contributor',
            expertise: stakeholderData.expertise || [],
            credentials: stakeholderData.credentials || '',
            innovationImpact: 100,
            isAdmin: stakeholderData.email === 'director@healthcare-innovation.org',
            verificationStatus: 'pending',
            permissions: this.getStakeholderPermissions(stakeholderData.stakeholderType),
            meta: {
                joinDate: now,
                organizationVerified: false,
                profileComplete: false,
                areasOfInterest: stakeholderData.areasOfInterest || ['general_innovation']
            },
            createdAt: now,
            lastActivity: now,
            innovationProjects: [],
            connections: [],
            opportunities: [],
            contributions: []
        };

        this.data.users[stakeholderId] = stakeholder;
        
        // Update stakeholder network
        this.updateStakeholderNetwork(stakeholder);
        
        this.savePlatformData();
        
        console.log(`🤝 New stakeholder registered: ${stakeholder.name} (${stakeholder.stakeholderType}) from ${stakeholder.organization}`);
        return stakeholder;
    }

    getStakeholderPermissions(stakeholderType) {
        const permissions = {
            clinician: ['create_innovation', 'join_project', 'provide_clinical_input', 'review_opportunities'],
            industry: ['create_innovation', 'join_project', 'provide_technical_expertise', 'fund_opportunities'],
            researcher: ['create_innovation', 'join_project', 'conduct_research', 'publish_findings'],
            investor: ['discover_opportunities', 'fund_projects', 'join_project', 'provide_strategic_guidance'],
            patient: ['submit_needs', 'join_project', 'provide_patient_perspective', 'test_prototypes']
        };
        return permissions[stakeholderType] || ['join_project', 'view_opportunities'];
    }

    updateStakeholderNetwork(stakeholder) {
        const network = this.data.stakeholderNetwork[stakeholder.stakeholderType];
        if (network) {
            network.count = (network.count || 0) + 1;
        }
    }

    authenticateStakeholder(email) {
        const normalizedEmail = email.trim().toLowerCase();
        return Object.values(this.data.users).find(user => user.email === normalizedEmail);
    }

    getStakeholderProfile(stakeholderId) {
        const user = this.data.users[stakeholderId];
        if (!user) return null;

        return {
            ...user,
            innovationProjectCount: user.innovationProjects.length,
            innovationMetrics: {
                activeProjects: user.innovationProjects.filter(pid => {
                    const project = this.data.innovationProjects[pid];
                    return project && project.stage !== 'completed';
                }).length,
                contributionsMade: user.contributions?.length || 0,
                collaborationScore: this.calculateCollaborationScore(stakeholderId),
                innovationImpact: user.innovationImpact
            },
            networkStrength: this.calculateNetworkStrength(stakeholderId)
        };
    }

    calculateCollaborationScore(stakeholderId) {
        const user = this.data.users[stakeholderId];
        if (!user) return 0;
        
        let score = 0;
        score += user.innovationProjects.length * 10;
        score += user.connections?.length * 5;
        score += user.contributions?.length * 3;
        return Math.min(100, score);
    }

    calculateNetworkStrength(stakeholderId) {
        const user = this.data.users[stakeholderId];
        if (!user) return 0;
        
        return {
            connectionCount: user.connections?.length || 0,
            crossSectorConnections: this.countCrossSectorConnections(stakeholderId),
            influenceScore: Math.min(100, (user.connections?.length || 0) * 2)
        };
    }

    countCrossSectorConnections(stakeholderId) {
        const user = this.data.users[stakeholderId];
        if (!user.connections) return 0;
        
        const userSector = user.stakeholderType;
        let crossSectorCount = 0;
        
        user.connections.forEach(connId => {
            const conn = this.data.users[connId];
            if (conn && conn.stakeholderType !== userSector) {
                crossSectorCount++;
            }
        });
        
        return crossSectorCount;
    }

    // ==================== INNOVATION PROJECT MANAGEMENT ====================
    initiateInnovationProject(projectData, leadStakeholderId) {
        const projectId = `innovation-${uuidv4()}`;
        const now = new Date().toISOString();
        const lead = this.data.users[leadStakeholderId];

        if (!lead) {
            throw new Error('Lead stakeholder not found');
        }

        const innovationProject = {
            id: projectId,
            title: projectData.title.trim(),
            tagline: projectData.tagline || '',
            description: projectData.description.trim(),
            innovationType: projectData.innovationType || 'product_innovation',
            stage: 'ideation',
            therapeuticArea: projectData.therapeuticArea || 'general_healthcare',
            clinicalNeed: projectData.clinicalNeed || '',
            valueProposition: projectData.valueProposition || '',
            leadStakeholder: {
                id: lead.id,
                name: lead.name,
                organization: lead.organization,
                stakeholderType: lead.stakeholderType
            },
            stakeholderTeam: [{
                id: lead.id,
                name: lead.name,
                organization: lead.organization,
                stakeholderType: lead.stakeholderType,
                role: 'project_lead',
                contribution: 'project_leadership',
                joinDate: now
            }],
            collaboratingOrganizations: [],
            projectGoals: projectData.goals || [],
            developmentRoadmap: {
                currentPhase: 'ideation',
                phases: {
                    ideation: { startDate: now, targetCompletion: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() }
                }
            },
            resourceNeeds: {
                funding: { amount: 0, currency: 'USD', stage: 'concept' },
                expertise: [],
                infrastructure: [],
                partnerships: []
            },
            engagementMetrics: {
                stakeholderParticipation: 0,
                collaborationIntensity: 0,
                decisionVelocity: 0,
                innovationProgress: 0
            },
            marketPotential: projectData.marketPotential || 0,
            ipConsiderations: projectData.ipConsiderations || 'To be determined',
            regulatoryPath: projectData.regulatoryPath || 'To be determined',
            createdAt: now,
            updatedAt: now,
            version: '1.0'
        };

        this.data.innovationProjects[projectId] = innovationProject;
        lead.innovationProjects.push(projectId);
        
        // Update platform analytics
        this.data.platformAnalytics.totalInnovations = Object.keys(this.data.innovationProjects).length;
        
        this.savePlatformData();
        
        console.log(`💡 New innovation project initiated: ${innovationProject.title} (Lead: ${lead.name})`);
        return innovationProject;
    }

    getInnovationProject(projectId) {
        return this.data.innovationProjects[projectId];
    }

    getStakeholderProjects(stakeholderId) {
        return Object.values(this.data.innovationProjects)
            .filter(project => project.stakeholderTeam.some(member => member.id === stakeholderId))
            .map(project => ({
                id: project.id,
                title: project.title,
                tagline: project.tagline,
                innovationType: project.innovationType,
                stage: project.stage,
                leadStakeholder: project.leadStakeholder.name,
                teamSize: project.stakeholderTeam.length,
                engagementMetrics: project.engagementMetrics,
                developmentRoadmap: project.developmentRoadmap,
                createdAt: project.createdAt,
                updatedAt: project.updatedAt
            }))
            .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    }

    // ==================== INNOVATION OPPORTUNITIES ====================
    submitInnovationOpportunity(opportunityData, submitterId) {
        const opportunityId = `opp-${uuidv4()}`;
        const now = new Date().toISOString();
        
        const opportunity = {
            id: opportunityId,
            title: opportunityData.title.trim(),
            description: opportunityData.description.trim(),
            submittedBy: submitterId,
            stakeholderType: opportunityData.stakeholderType || 'clinical',
            innovationCategory: opportunityData.innovationCategory || 'product_innovation',
            clinicalProblem: opportunityData.clinicalProblem || '',
            impactPotential: opportunityData.impactPotential || 'high',
            marketSize: opportunityData.marketSize || 0,
            urgency: opportunityData.urgency || 'medium',
            status: 'open',
            seeking: opportunityData.seeking || [],
            matches: [],
            createdAt: now,
            updatedAt: now
        };

        this.data.innovationOpportunities[opportunityId] = opportunity;
        
        // Add to submitter's opportunities
        const submitter = this.data.users[submitterId];
        if (submitter) {
            if (!submitter.opportunities) submitter.opportunities = [];
            submitter.opportunities.push(opportunityId);
        }
        
        this.savePlatformData();
        
        console.log(`🎯 New innovation opportunity submitted: ${opportunity.title}`);
        return opportunity;
    }

    // ==================== PLATFORM ANALYTICS ====================
    getPlatformAnalytics() {
        const totalProjects = Object.keys(this.data.innovationProjects).length;
        const activeProjects = Object.values(this.data.innovationProjects).filter(p => p.stage !== 'completed').length;
        const totalStakeholders = Object.keys(this.data.users).length;
        
        // Calculate cross-sector collaboration
        let crossSectorProjects = 0;
        Object.values(this.data.innovationProjects).forEach(project => {
            const stakeholderTypes = new Set(project.stakeholderTeam.map(m => m.stakeholderType));
            if (stakeholderTypes.size > 1) crossSectorProjects++;
        });

        return {
            summary: {
                totalInnovationProjects: totalProjects,
                activeInnovations: activeProjects,
                totalStakeholders: totalStakeholders,
                crossSectorCollaborations: crossSectorProjects,
                innovationPipelineValue: this.calculatePipelineValue(),
                platformUptime: 100
            },
            stakeholderDistribution: this.getStakeholderDistribution(),
            innovationStageBreakdown: this.getInnovationStageBreakdown(),
            collaborationMetrics: {
                averageTeamSize: this.calculateAverageTeamSize(),
                crossSectorRate: totalProjects > 0 ? (crossSectorProjects / totalProjects * 100).toFixed(1) + '%' : '0%',
                stakeholderEngagement: this.calculateAverageEngagement()
            },
            recentActivity: this.getRecentActivity()
        };
    }

    calculatePipelineValue() {
        return Object.values(this.data.innovationProjects).reduce((total, project) => {
            return total + (project.resourceNeeds?.funding?.amount || 0);
        }, 0);
    }

    getStakeholderDistribution() {
        const distribution = {};
        Object.values(this.data.users).forEach(user => {
            distribution[user.stakeholderType] = (distribution[user.stakeholderType] || 0) + 1;
        });
        return distribution;
    }

    getInnovationStageBreakdown() {
        const stages = {};
        Object.values(this.data.innovationProjects).forEach(project => {
            stages[project.stage] = (stages[project.stage] || 0) + 1;
        });
        return stages;
    }

    calculateAverageTeamSize() {
        const projects = Object.values(this.data.innovationProjects);
        if (projects.length === 0) return 0;
        const totalTeamMembers = projects.reduce((sum, project) => sum + project.stakeholderTeam.length, 0);
        return (totalTeamMembers / projects.length).toFixed(1);
    }

    calculateAverageEngagement() {
        const projects = Object.values(this.data.innovationProjects);
        if (projects.length === 0) return 0;
        const totalEngagement = projects.reduce((sum, project) => sum + (project.engagementMetrics.stakeholderParticipation || 0), 0);
        return (totalEngagement / projects.length).toFixed(1);
    }

    getRecentActivity() {
        const allProjects = Object.values(this.data.innovationProjects);
        return allProjects
            .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
            .slice(0, 5)
            .map(p => ({
                title: p.title,
                stage: p.stage,
                lastUpdated: p.updatedAt,
                teamSize: p.stakeholderTeam.length
            }));
    }
}

// ==================== INITIALIZE PLATFORM ====================
const innovationPlatform = new HealthcareInnovationPlatform();

// ==================== EXPRESS MIDDLEWARE ====================
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.socket.io"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "data:", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "ws:", "wss:"],
            frameSrc: ["'self'"],
            objectSrc: ["'none'"]
        }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(cors({
    origin: function(origin, callback) {
        // Allow all origins for development, specific for production
        if (!origin && NODE_ENV === 'development') return callback(null, true);
        
        const allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:5173',
            'https://thoraxlab.up.railway.app',
            /\.railway\.app$/,
            /\.healthcare-innovation\.org$/
        ];
        
        if (!origin || allowedOrigins.some(allowed => {
            if (typeof allowed === 'string') return origin === allowed;
            if (allowed instanceof RegExp) return allowed.test(origin);
            return false;
        })) {
            callback(null, true);
        } else {
            console.log('🔒 CORS blocked origin:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files with cache control
app.use(express.static('public', {
    maxAge: isProduction ? '1y' : '0',
    setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
    }
}));

// Request logging middleware
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} ${req.method.padEnd(7)} ${req.url}`);
    next();
});

// ==================== AUTHENTICATION MIDDLEWARE ====================
const authenticateStakeholder = (req, res, next) => {
    try {
        let sessionId = req.cookies?.sessionId || 
                       req.headers.authorization?.replace('Bearer ', '');
        
        console.log('🔐 Stakeholder auth check:', {
            hasCookie: !!req.cookies?.sessionId,
            sessionId: sessionId ? `${sessionId.substring(0, 10)}...` : 'none'
        });
        
        if (!sessionId) {
            return res.status(401).json({ 
                success: false, 
                error: 'Stakeholder authentication required',
                code: 'NO_SESSION'
            });
        }
        
        // Check session in platform data
        const session = innovationPlatform.data.sessions[sessionId];
        if (!session || new Date(session.expiresAt) < new Date()) {
            res.clearCookie('sessionId');
            return res.status(401).json({ 
                success: false, 
                error: 'Invalid or expired session',
                code: 'INVALID_SESSION'
            });
        }
        
        const stakeholder = innovationPlatform.data.users[session.stakeholderId];
        if (!stakeholder) {
            delete innovationPlatform.data.sessions[sessionId];
            res.clearCookie('sessionId');
            return res.status(401).json({ 
                success: false, 
                error: 'Stakeholder account not found',
                code: 'STAKEHOLDER_NOT_FOUND'
            });
        }
        
        // Update activity
        stakeholder.lastActivity = new Date().toISOString();
        session.lastActivity = new Date().toISOString();
        
        req.stakeholder = stakeholder;
        req.session = session;
        
        console.log(`✅ Authenticated stakeholder: ${stakeholder.name} (${stakeholder.stakeholderType})`);
        next();
        
    } catch (error) {
        console.error('🔥 Stakeholder auth error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Authentication failed',
            details: error.message 
        });
    }
};

// ==================== SOCKET.IO FOR REAL-TIME COLLABORATION ====================
const io = new Server(server, {
    cors: {
        origin: function(origin, callback) {
            if (!origin && NODE_ENV === 'development') return callback(null, true);
            
            const allowedOrigins = [
                'http://localhost:3000',
                'http://localhost:5173',
                'https://thoraxlab.up.railway.app',
                /\.railway\.app$/,
                /\.healthcare-innovation\.org$/
            ];
            
            if (!origin || allowedOrigins.some(allowed => {
                if (typeof allowed === 'string') return origin === allowed;
                if (allowed instanceof RegExp) return allowed.test(origin);
                return false;
            })) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        },
        credentials: true
    },
    transports: ['websocket', 'polling']
});

io.on('connection', (socket) => {
    console.log(`🔌 Real-time connection: ${socket.id}`);
    
    socket.on('join:innovation', (innovationId) => {
        socket.join(`innovation:${innovationId}`);
        console.log(`💡 Socket joined innovation project: ${innovationId}`);
    });
    
    socket.on('innovation:update', (data) => {
        const { innovationId, updateType, data: updateData } = data;
        socket.to(`innovation:${innovationId}`).emit('innovation:updated', {
            innovationId,
            updateType,
            data: updateData,
            timestamp: new Date().toISOString()
        });
    });
    
    socket.on('disconnect', () => {
        console.log(`🔌 Socket disconnected: ${socket.id}`);
    });
});

// ==================== HEALTHCARE INNOVATION PLATFORM API ====================

// 1. HEALTH CHECK (CRITICAL FOR RAILWAY)
app.get('/health', (req, res) => {
    res.json({ 
        success: true,
        platform: 'Healthcare Innovation Collaboration Platform',
        version: '1.0.0',
        environment: NODE_ENV,
        timestamp: new Date().toISOString(),
        status: 'operational',
        platformHealth: {
            stakeholders: Object.keys(innovationPlatform.data.users).length,
            innovationProjects: Object.keys(innovationPlatform.data.innovationProjects).length,
            activeSessions: Object.keys(innovationPlatform.data.sessions).length,
            uptime: process.uptime()
        }
    });
});

// 2. PLATFORM STATUS
app.get('/api/status', (req, res) => {
    const analytics = innovationPlatform.getPlatformAnalytics();
    res.json({
        success: true,
        platform: 'Healthcare Innovation Collaboration Platform',
        mission: 'Connecting clinicians, industry, researchers, and investors to drive healthcare innovation',
        timestamp: new Date().toISOString(),
        analytics: analytics.summary,
        stakeholderNetwork: analytics.stakeholderDistribution
    });
});

// 3. STAKEHOLDER REGISTRATION
app.post('/api/stakeholders/register', (req, res) => {
    try {
        const { name, email, organization, stakeholderType, role, expertise, credentials } = req.body;
        
        console.log('🤝 Stakeholder registration:', { name, email, stakeholderType });
        
        if (!name || !email || !stakeholderType) {
            return res.status(400).json({
                success: false,
                error: 'Name, email, and stakeholder type are required',
                code: 'MISSING_FIELDS'
            });
        }
        
        let stakeholder = innovationPlatform.authenticateStakeholder(email);
        const isNewStakeholder = !stakeholder;
        
        if (!stakeholder) {
            stakeholder = innovationPlatform.registerStakeholder({
                name, email, organization, stakeholderType, role, expertise, credentials
            });
            console.log(`👤 New stakeholder registered: ${stakeholder.name}`);
        } else {
            console.log(`👤 Existing stakeholder: ${stakeholder.name}`);
        }
        
        // Create session
        const sessionId = `session-${uuidv4()}`;
        const session = {
            id: sessionId,
            stakeholderId: stakeholder.id,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            lastActivity: new Date().toISOString()
        };
        innovationPlatform.data.sessions[sessionId] = session;
        
        // Set cookie for Railway
        res.cookie('sessionId', sessionId, {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? 'none' : 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: '/',
            domain: isProduction ? '.railway.app' : undefined
        });
        
        console.log(`✅ Stakeholder authenticated: ${stakeholder.name} (${stakeholder.stakeholderType})`);
        
        res.json({
            success: true,
            stakeholder: {
                id: stakeholder.id,
                name: stakeholder.name,
                email: stakeholder.email,
                organization: stakeholder.organization,
                stakeholderType: stakeholder.stakeholderType,
                role: stakeholder.role,
                expertise: stakeholder.expertise,
                isAdmin: stakeholder.isAdmin,
                isNewStakeholder,
                profileComplete: stakeholder.meta?.profileComplete || false
            },
            session: {
                id: sessionId,
                expiresAt: session.expiresAt,
                socketToken: sessionId
            }
        });
        
    } catch (error) {
        console.error('🔥 Stakeholder registration error:', error);
        res.status(500).json({
            success: false,
            error: 'Registration failed',
            details: error.message,
            code: 'REGISTRATION_FAILED'
        });
    }
});

// 4. GET CURRENT STAKEHOLDER
app.get('/api/stakeholders/me', authenticateStakeholder, (req, res) => {
    try {
        const stakeholder = innovationPlatform.getStakeholderProfile(req.stakeholder.id);
        
        res.json({
            success: true,
            stakeholder,
            platformAnalytics: innovationPlatform.getPlatformAnalytics().summary
        });
    } catch (error) {
        console.error('Get stakeholder error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get stakeholder profile'
        });
    }
});

// 5. GET STAKEHOLDER INNOVATION PROJECTS
app.get('/api/stakeholders/me/projects', authenticateStakeholder, (req, res) => {
    try {
        const projects = innovationPlatform.getStakeholderProjects(req.stakeholder.id);
        
        res.json({
            success: true,
            projects,
            count: projects.length,
            stakeholderType: req.stakeholder.stakeholderType,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Get projects error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load innovation projects'
        });
    }
});

// 6. INITIATE NEW INNOVATION PROJECT
app.post('/api/innovation/projects', authenticateStakeholder, (req, res) => {
    try {
        const { title, description, innovationType, therapeuticArea, clinicalNeed, valueProposition, goals } = req.body;
        
        if (!title || !description) {
            return res.status(400).json({
                success: false,
                error: 'Title and description are required',
                code: 'MISSING_FIELDS'
            });
        }
        
        const innovationProject = innovationPlatform.initiateInnovationProject({
            title,
            description,
            innovationType,
            therapeuticArea,
            clinicalNeed,
            valueProposition,
            goals
        }, req.stakeholder.id);
        
        // Real-time notification
        io.emit('innovation:created', {
            projectId: innovationProject.id,
            title: innovationProject.title,
            leadStakeholder: req.stakeholder.name,
            stakeholderType: req.stakeholder.stakeholderType,
            timestamp: new Date().toISOString()
        });
        
        res.status(201).json({
            success: true,
            innovationProject,
            message: 'Innovation project initiated successfully'
        });
    } catch (error) {
        console.error('Create innovation project error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to initiate innovation project',
            details: error.message
        });
    }
});

// 7. GET INNOVATION PROJECT DETAILS
app.get('/api/innovation/projects/:id', authenticateStakeholder, (req, res) => {
    try {
        const projectId = req.params.id;
        const project = innovationPlatform.getInnovationProject(projectId);
        
        if (!project) {
            return res.status(404).json({
                success: false,
                error: 'Innovation project not found'
            });
        }
        
        // Check access - allow if stakeholder is in team or is admin
        const hasAccess = project.stakeholderTeam.some(member => member.id === req.stakeholder.id) || req.stakeholder.isAdmin;
        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                error: 'Access denied to innovation project'
            });
        }
        
        res.json({
            success: true,
            innovationProject: project
        });
    } catch (error) {
        console.error('Get innovation project error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load innovation project'
        });
    }
});

// 8. GET PLATFORM ANALYTICS
app.get('/api/platform/analytics', authenticateStakeholder, (req, res) => {
    try {
        const analytics = innovationPlatform.getPlatformAnalytics();
        
        res.json({
            success: true,
            analytics,
            stakeholderRole: req.stakeholder.stakeholderType,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Get analytics error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load platform analytics'
        });
    }
});

// 9. LOGOUT
app.post('/api/stakeholders/logout', authenticateStakeholder, (req, res) => {
    try {
        const sessionId = req.cookies?.sessionId || 
                         req.headers.authorization?.replace('Bearer ', '');
        
        if (sessionId) {
            delete innovationPlatform.data.sessions[sessionId];
        }
        
        res.clearCookie('sessionId', {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? 'none' : 'lax',
            path: '/'
        });
        
        console.log(`👋 Stakeholder logged out: ${req.stakeholder.name}`);
        
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

// 10. SUBMIT INNOVATION OPPORTUNITY
app.post('/api/innovation/opportunities', authenticateStakeholder, (req, res) => {
    try {
        const { title, description, stakeholderType, innovationCategory, clinicalProblem, impactPotential, marketSize, urgency, seeking } = req.body;
        
        if (!title || !description || !clinicalProblem) {
            return res.status(400).json({
                success: false,
                error: 'Title, description, and clinical problem are required',
                code: 'MISSING_FIELDS'
            });
        }
        
        const opportunity = innovationPlatform.submitInnovationOpportunity({
            title,
            description,
            stakeholderType: req.stakeholder.stakeholderType,
            innovationCategory,
            clinicalProblem,
            impactPotential,
            marketSize,
            urgency,
            seeking
        }, req.stakeholder.id);
        
        // Real-time notification
        io.emit('opportunity:submitted', {
            opportunityId: opportunity.id,
            title: opportunity.title,
            submittedBy: req.stakeholder.name,
            stakeholderType: req.stakeholder.stakeholderType,
            timestamp: new Date().toISOString()
        });
        
        res.status(201).json({
            success: true,
            opportunity,
            message: 'Innovation opportunity submitted successfully'
        });
    } catch (error) {
        console.error('Submit opportunity error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to submit innovation opportunity',
            details: error.message
        });
    }
});

// 11. GET INNOVATION OPPORTUNITIES
app.get('/api/innovation/opportunities', authenticateStakeholder, (req, res) => {
    try {
        const opportunities = Object.values(innovationPlatform.data.innovationOpportunities)
            .filter(opp => opp.status === 'open')
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        // Filter based on stakeholder type (e.g., investors see different opportunities than clinicians)
        const filteredOpportunities = opportunities.filter(opp => {
            if (req.stakeholder.stakeholderType === 'investor') {
                return opp.impactPotential === 'high' || opp.marketSize > 1000000;
            }
            return true;
        });
        
        res.json({
            success: true,
            opportunities: filteredOpportunities,
            count: filteredOpportunities.length,
            stakeholderType: req.stakeholder.stakeholderType,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Get opportunities error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load innovation opportunities'
        });
    }
});

// SPA FALLBACK
app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({
            success: false,
            error: 'API endpoint not found',
            path: req.originalUrl
        });
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// GLOBAL ERROR HANDLER
app.use((err, req, res, next) => {
    console.error('🔥 Healthcare Innovation Platform error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: NODE_ENV === 'development' ? err.message : undefined,
        timestamp: new Date().toISOString(),
        platform: 'Healthcare Innovation Collaboration Platform'
    });
});

// ==================== START HEALTHCARE INNOVATION PLATFORM ====================
server.listen(PORT, '0.0.0.0', () => {
    console.log(`
🚀 HEALTHCARE INNOVATION COLLABORATION PLATFORM
==================================================
📡 Server running on port ${PORT}
🌐 Environment: ${NODE_ENV}
🔒 Production: ${isProduction}
🏥 Mission: Connecting stakeholders to drive healthcare innovation

📊 PLATFORM STATUS:
   • Stakeholders: ${Object.keys(innovationPlatform.data.users).length}
   • Innovation Projects: ${Object.keys(innovationPlatform.data.innovationProjects).length}
   • Opportunities: ${Object.keys(innovationPlatform.data.innovationOpportunities).length}
   • Data: healthcare_innovation_data.json

👥 STAKEHOLDER TYPES:
   • Clinicians
   • Industry Partners  
   • Researchers
   • Investors
   • Patients

🔗 CRITICAL ENDPOINTS:
   • Health: http://localhost:${PORT}/health
   • Status: http://localhost:${PORT}/api/status
   • Register: POST /api/stakeholders/register

💡 TEST CREDENTIALS:
   • Director: Email="director@healthcare-innovation.org"
   • Any email works for new stakeholders

🌟 Ready to transform healthcare through collaboration!
`);
});

// Graceful shutdown
const gracefulShutdown = () => {
    console.log('\n🔻 Healthcare Innovation Platform shutting down...');
    
    // Save all data
    innovationPlatform.savePlatformData();
    console.log('💾 Platform data saved');
    
    // Close server
    server.close(() => {
        console.log('📴 Platform server closed gracefully');
        process.exit(0);
    });
    
    setTimeout(() => {
        console.log('⏰ Forcing platform shutdown...');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
