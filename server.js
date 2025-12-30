import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const app = express();
const server = createServer(app);

// ==================== COLLABORATIVE INNOVATION ARCHITECTURE ====================
class ThoraxLabPlatform {
    constructor() {
        this.innovations = new Map();
        this.collaborations = new Map();
        this.insights = new Map();
        this.activities = [];
        this.metrics = {
            innovationVelocity: 0,
            collaborationDensity: 0,
            stakeholderDiversity: 0,
            decisionQuality: 0
        };
    }

    // Create collaborative innovation
    createCollaborativeInnovation(data) {
        const innovationId = uuidv4();
        const now = new Date().toISOString();
        
        const innovation = {
            id: innovationId,
            title: data.title,
            challenge: data.challenge,
            hypothesis: data.hypothesis,
            stage: data.stage || 'exploration',
            
            // Collaborative framework
            collaborators: {
                clinical: [],
                technical: [],
                research: [],
                commercial: [],
                patient: []
            },
            
            // Knowledge framework
            insights: [],
            questions: [],
            evidence: [],
            assumptions: [],
            
            // Progress framework
            milestones: [],
            decisions: [],
            risks: [],
            opportunities: [],
            
            // Collaborative metrics
            engagement: {
                activeParticipants: 0,
                contributionDistribution: {},
                responseTime: 0
            },
            
            createdAt: now,
            updatedAt: now,
            status: 'active'
        };
        
        // Add initial collaborators if provided
        if (data.collaborators) {
            Object.keys(data.collaborators).forEach(role => {
                if (innovation.collaborators[role]) {
                    innovation.collaborators[role] = data.collaborators[role];
                }
            });
        }
        
        this.innovations.set(innovationId, innovation);
        
        // Create collaboration room
        this.collaborations.set(innovationId, {
            participants: new Map(),
            activeDiscussions: [],
            sharedResources: []
        });
        
        this.recordActivity('innovation_created', {
            innovationId,
            title: innovation.title,
            challenge: innovation.challenge
        });
        
        this.updatePlatformMetrics();
        
        return innovation;
    }

    // Add collaborative insight
    addCollaborativeInsight(data) {
        const insightId = uuidv4();
        const now = new Date().toISOString();
        
        const insight = {
            id: insightId,
            innovationId: data.innovationId,
            type: data.type, // 'observation', 'question', 'hypothesis', 'evidence', 'concern'
            content: data.content,
            contributor: data.contributor,
            
            // Context
            context: data.context,
            references: data.references || [],
            supportingData: data.supportingData || [],
            
            // Collaborative attributes
            perspectives: data.perspectives || [],
            impactAreas: data.impactAreas || [],
            confidence: data.confidence || 0.5,
            
            // Engagement
            responses: [],
            endorsements: [],
            followUps: [],
            
            createdAt: now,
            updatedAt: now
        };
        
        this.insights.set(insightId, insight);
        
        const innovation = this.innovations.get(data.innovationId);
        if (innovation) {
            innovation.insights.push(insightId);
            innovation.updatedAt = now;
            
            // Update engagement metrics
            innovation.engagement.activeParticipants = 
                this.calculateActiveParticipants(data.innovationId);
        }
        
        this.recordActivity('insight_shared', {
            innovationId: data.innovationId,
            insightId,
            contributor: data.contributor.name,
            type: data.type
        });
        
        return insight;
    }

    // Collaborative decision making
    makeCollaborativeDecision(data) {
        const decisionId = uuidv4();
        const now = new Date().toISOString();
        
        const decision = {
            id: decisionId,
            innovationId: data.innovationId,
            context: data.context,
            options: data.options,
            recommendation: data.recommendation,
            
            // Decision framework
            criteria: data.criteria || [],
            tradeoffs: data.tradeoffs || [],
            rationale: data.rationale,
            
            // Collaborative consensus
            participants: data.participants || [],
            consensus: this.calculateConsensus(data.participants),
            dissentingViews: data.dissentingViews || [],
            
            // Implementation
            actions: data.actions || [],
            timeline: data.timeline,
            owners: data.owners || [],
            
            recordedAt: now,
            recordedBy: data.recordedBy
        };
        
        const innovation = this.innovations.get(data.innovationId);
        if (innovation) {
            innovation.decisions.push(decision);
            innovation.updatedAt = now;
        }
        
        this.recordActivity('decision_made', {
            innovationId: data.innovationId,
            decisionId,
            consensus: decision.consensus,
            impact: data.impact || 'medium'
        });
        
        this.updatePlatformMetrics();
        
        return decision;
    }

    // Calculate consensus among participants
    calculateConsensus(participants) {
        if (!participants || participants.length === 0) return 0;
        
        const agreementCount = participants.filter(p => p.agreement === 'agree').length;
        return agreementCount / participants.length;
    }

    // Calculate active participants
    calculateActiveParticipants(innovationId) {
        const collaboration = this.collaborations.get(innovationId);
        if (!collaboration) return 0;
        
        return collaboration.participants.size;
    }

    // Update platform-wide metrics
    updatePlatformMetrics() {
        const innovationCount = this.innovations.size;
        let totalCollaborationDensity = 0;
        let totalStakeholderDiversity = 0;
        
        this.innovations.forEach(innovation => {
            // Calculate collaboration density
            const collaboratorCount = Object.values(innovation.collaborators)
                .flat().length;
            totalCollaborationDensity += collaboratorCount;
            
            // Calculate stakeholder diversity
            const activeRoles = Object.keys(innovation.collaborators)
                .filter(role => innovation.collaborators[role].length > 0);
            totalStakeholderDiversity += activeRoles.length / 5; // 5 possible roles
        });
        
        this.metrics = {
            activeInnovations: innovationCount,
            collaborationDensity: innovationCount > 0 ? 
                totalCollaborationDensity / innovationCount : 0,
            stakeholderDiversity: innovationCount > 0 ? 
                (totalStakeholderDiversity / innovationCount) * 100 : 0,
            innovationVelocity: this.calculateInnovationVelocity()
        };
    }

    calculateInnovationVelocity() {
        // Calculate average time between significant milestones
        return 0; // Implementation depends on actual data
    }

    // Record platform activity
    recordActivity(type, data) {
        const activity = {
            id: uuidv4(),
            type,
            data,
            timestamp: new Date().toISOString()
        };
        
        this.activities.unshift(activity);
        if (this.activities.length > 500) {
            this.activities = this.activities.slice(0, 500);
        }
    }

    // Query methods
    getCollaborativePipeline() {
        const pipeline = {
            exploration: [],
            development: [],
            validation: [],
            implementation: []
        };
        
        this.innovations.forEach(innovation => {
            if (pipeline[innovation.stage]) {
                pipeline[innovation.stage].push({
                    ...innovation,
                    collaboratorCount: this.calculateTotalCollaborators(innovation.id),
                    insightCount: innovation.insights.length,
                    decisionCount: innovation.decisions.length
                });
            }
        });
        
        return pipeline;
    }

    calculateTotalCollaborators(innovationId) {
        const innovation = this.innovations.get(innovationId);
        if (!innovation) return 0;
        
        return Object.values(innovation.collaborators)
            .flat().length;
    }

    getInnovationCollaboration(innovationId) {
        const innovation = this.innovations.get(innovationId);
        if (!innovation) return null;
        
        const collaborationInsights = innovation.insights
            .map(insightId => this.insights.get(insightId))
            .filter(Boolean);
        
        return {
            innovation,
            insights: collaborationInsights,
            activities: this.activities.filter(a => 
                a.data.innovationId === innovationId
            ).slice(0, 20),
            collaborationHealth: {
                diversityScore: this.calculateDiversityScore(innovation),
                engagementLevel: this.calculateEngagementLevel(innovationId),
                decisionClarity: this.calculateDecisionClarity(innovation),
                knowledgeDepth: this.calculateKnowledgeDepth(innovationId)
            }
        };
    }

    calculateDiversityScore(innovation) {
        const activeRoles = Object.keys(innovation.collaborators)
            .filter(role => innovation.collaborators[role].length > 0);
        return (activeRoles.length / 5) * 100;
    }

    calculateEngagementLevel(innovationId) {
        const innovation = this.innovations.get(innovationId);
        if (!innovation) return 0;
        
        const insightCount = innovation.insights.length;
        const decisionCount = innovation.decisions.length;
        const collaboratorCount = this.calculateTotalCollaborators(innovationId);
        
        if (collaboratorCount === 0) return 0;
        
        return Math.min(100, (insightCount * 10) + (decisionCount * 20));
    }

    calculateDecisionClarity(innovation) {
        if (!innovation.decisions || innovation.decisions.length === 0) return 0;
        
        const clearDecisions = innovation.decisions.filter(d => 
            d.rationale && d.actions && d.actions.length > 0
        ).length;
        
        return (clearDecisions / innovation.decisions.length) * 100;
    }

    calculateKnowledgeDepth(innovationId) {
        const innovation = this.innovations.get(innovationId);
        if (!innovation) return 0;
        
        const evidenceCount = innovation.insights.filter(insightId => {
            const insight = this.insights.get(insightId);
            return insight && insight.type === 'evidence' && insight.supportingData.length > 0;
        }).length;
        
        return Math.min(100, evidenceCount * 15);
    }
}

// ==================== INITIALIZE THORAXLAB ====================
const thoraxLab = new ThoraxLabPlatform();

// Example collaborative innovation
thoraxLab.createCollaborativeInnovation({
    title: "Collaborative AI-Assisted Thoracic Diagnosis",
    challenge: "Improving early detection accuracy through multi-disciplinary collaboration",
    hypothesis: "Combining clinical expertise with AI pattern recognition can improve diagnostic accuracy by 40%",
    stage: "development",
    collaborators: {
        clinical: [
            { id: 'clinic_1', name: 'Dr. Sarah Miller', role: 'Thoracic Radiologist', expertise: ['CT Interpretation', 'Nodule Assessment'] }
        ],
        technical: [
            { id: 'tech_1', name: 'Alex Chen', role: 'AI Research Lead', expertise: ['Deep Learning', 'Medical Imaging'] }
        ]
    }
});

// ==================== PLATFORM CONFIGURATION ====================
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "https://cdn.socket.io", "'unsafe-inline'"],
            styleSrc: ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "ws:", "wss:", "https://cdn.socket.io"],
            frameSrc: ["'self'"]
        }
    }
}));

app.use(cors());
app.use(compression());
app.use(express.json());
app.use(express.static('public'));

// ==================== COLLABORATIVE REAL-TIME ====================
const io = new Server(server, {
    cors: { origin: "*" },
    transports: ['websocket', 'polling']
});

// Track collaborative sessions
const collaborativeSessions = new Map();

io.on('connection', (socket) => {
    socket.on('join:collaboration', (data) => {
        const { innovationId, participant } = data;
        socket.join(`collaboration:${innovationId}`);
        
        if (!collaborativeSessions.has(innovationId)) {
            collaborativeSessions.set(innovationId, new Map());
        }
        
        collaborativeSessions.get(innovationId).set(socket.id, {
            participant,
            joinedAt: new Date().toISOString()
        });
        
        socket.to(`collaboration:${innovationId}`).emit('collaborator:joined', {
            participant,
            activeCollaborators: collaborativeSessions.get(innovationId).size,
            timestamp: new Date().toISOString()
        });
    });
    
    socket.on('share:insight', (data) => {
        const { innovationId, insight } = data;
        const savedInsight = thoraxLab.addCollaborativeInsight({
            innovationId,
            type: insight.type,
            content: insight.content,
            contributor: insight.contributor,
            context: insight.context,
            references: insight.references,
            supportingData: insight.supportingData,
            perspectives: insight.perspectives,
            impactAreas: insight.impactAreas,
            confidence: insight.confidence
        });
        
        io.to(`collaboration:${innovationId}`).emit('insight:shared', {
            insight: savedInsight,
            innovationId,
            timestamp: new Date().toISOString()
        });
    });
    
    socket.on('make:decision', (data) => {
        const { innovationId, decision } = data;
        const savedDecision = thoraxLab.makeCollaborativeDecision({
            innovationId,
            context: decision.context,
            options: decision.options,
            recommendation: decision.recommendation,
            criteria: decision.criteria,
            tradeoffs: decision.tradeoffs,
            rationale: decision.rationale,
            participants: decision.participants,
            dissentingViews: decision.dissentingViews,
            actions: decision.actions,
            timeline: decision.timeline,
            owners: decision.owners,
            recordedBy: decision.recordedBy
        });
        
        io.to(`collaboration:${innovationId}`).emit('decision:made', {
            decision: savedDecision,
            innovationId,
            timestamp: new Date().toISOString()
        });
    });
    
    socket.on('disconnect', () => {
        collaborativeSessions.forEach((sessions, innovationId) => {
            if (sessions.has(socket.id)) {
                sessions.delete(socket.id);
                if (sessions.size === 0) {
                    collaborativeSessions.delete(innovationId);
                }
            }
        });
    });
});

// ==================== COLLABORATIVE API ====================
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        platform: 'ThoraxLab Collaborative Innovation',
        timestamp: new Date().toISOString(),
        metrics: thoraxLab.metrics
    });
});

app.get('/api/innovations/pipeline', (req, res) => {
    try {
        const pipeline = thoraxLab.getCollaborativePipeline();
        res.json({
            success: true,
            data: pipeline,
            metrics: thoraxLab.metrics,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load innovation pipeline' });
    }
});

app.post('/api/innovations', (req, res) => {
    try {
        const { title, challenge, hypothesis, stage, collaborators } = req.body;
        
        if (!title || !challenge || !hypothesis) {
            return res.status(400).json({
                success: false,
                error: 'Title, challenge, and hypothesis are required'
            });
        }
        
        const innovation = thoraxLab.createCollaborativeInnovation({
            title,
            challenge,
            hypothesis,
            stage,
            collaborators
        });
        
        res.status(201).json({
            success: true,
            data: innovation,
            message: 'Collaborative innovation started successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to create innovation' });
    }
});

app.get('/api/innovations/:id/collaboration', (req, res) => {
    try {
        const collaboration = thoraxLab.getInnovationCollaboration(req.params.id);
        
        if (!collaboration) {
            return res.status(404).json({ success: false, error: 'Innovation not found' });
        }
        
        res.json({
            success: true,
            data: collaboration,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load collaboration' });
    }
});

app.post('/api/insights', (req, res) => {
    try {
        const { innovationId, type, content, contributor, context, references, supportingData } = req.body;
        
        if (!innovationId || !type || !content || !contributor) {
            return res.status(400).json({
                success: false,
                error: 'Missing required insight fields'
            });
        }
        
        const insight = thoraxLab.addCollaborativeInsight({
            innovationId,
            type,
            content,
            contributor,
            context,
            references,
            supportingData
        });
        
        res.status(201).json({
            success: true,
            data: insight,
            message: 'Insight shared successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to share insight' });
    }
});

app.post('/api/decisions', (req, res) => {
    try {
        const { innovationId, context, options, recommendation, rationale, participants, actions } = req.body;
        
        if (!innovationId || !context || !recommendation || !rationale) {
            return res.status(400).json({
                success: false,
                error: 'Missing required decision fields'
            });
        }
        
        const decision = thoraxLab.makeCollaborativeDecision({
            innovationId,
            context,
            options,
            recommendation,
            rationale,
            participants,
            actions
        });
        
        res.status(201).json({
            success: true,
            data: decision,
            message: 'Decision recorded successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to record decision' });
    }
});

app.get('/api/metrics', (req, res) => {
    try {
        res.json({
            success: true,
            data: thoraxLab.metrics,
            activities: thoraxLab.activities.slice(0, 50),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load metrics' });
    }
});

// SPA fallback
app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ success: false, error: 'API endpoint not found' });
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
    console.error('ThoraxLab error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        timestamp: new Date().toISOString()
    });
});

// ==================== START PLATFORM ====================
server.listen(PORT, () => {
    console.log(`
🏥 THORAXLAB COLLABORATIVE INNOVATION
=======================================
📡 Platform running on port ${PORT}
🎯 Collaborative Innovation Active

🔬 PLATFORM STATUS:
   • Active Innovations: ${thoraxLab.innovations.size}
   • Collaborative Insights: ${thoraxLab.insights.size}
   • Real-time Sessions: Ready
   • Platform Metrics: Active

🚀 READY FOR COLLABORATION:
   • Multi-disciplinary framework
   • Real-time knowledge sharing
   • Evidence-based decision making
   • Collaborative progress tracking

🌟 Transforming healthcare through collaboration!
    `);
});
