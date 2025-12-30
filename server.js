const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
const helmet = require('helmet');
const compression = require('compression');
const { getDB, calculatePulseScore } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Security & Performance
app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP completely
    frameguard: { action: 'deny' },
    hsts: { maxAge: 31536000, includeSubDomains: true },
    noSniff: true,
    xssFilter: true,
    hidePoweredBy: true,
    ieNoOpen: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));
app.use(compression());
app.use(express.static('public', {
    maxAge: '1h',
    setHeaders: (res, filePath) => {
        if (path.extname(filePath) === '.html') {
            res.setHeader('Cache-Control', 'no-cache');
        }
    }
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// WebSocket Server
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

const connectedClients = new Map();

wss.on('connection', (ws, req) => {
    const clientId = uuidv4();
    connectedClients.set(clientId, ws);
    
    ws.on('message', async (data) => {
        try {
            const message = JSON.parse(data.toString());
            
            switch (message.type) {
                case 'heartbeat':
                    ws.send(JSON.stringify({ type: 'heartbeat_ack', timestamp: Date.now() }));
                    break;
                    
                case 'subscribe_project':
                    ws.projectSubscriptions = ws.projectSubscriptions || new Set();
                    ws.projectSubscriptions.add(message.projectId);
                    break;
                    
                case 'interaction':
                    await handleInteraction(message);
                    broadcastProjectUpdate(message.projectId);
                    break;
            }
        } catch (error) {
            console.error('WebSocket error:', error);
        }
    });
    
    ws.on('close', () => {
        connectedClients.delete(clientId);
    });
    
    // Send welcome with connection ID
    ws.send(JSON.stringify({
        type: 'connected',
        clientId,
        timestamp: new Date().toISOString()
    }));
});

// Broadcast to all clients subscribed to a project
function broadcastProjectUpdate(projectId) {
    const updateMsg = JSON.stringify({
        type: 'project_updated',
        projectId,
        timestamp: new Date().toISOString()
    });
    
    connectedClients.forEach((ws, clientId) => {
        if (ws.readyState === WebSocket.OPEN && ws.projectSubscriptions && ws.projectSubscriptions.has(projectId)) {
            ws.send(updateMsg);
        }
    });
}

async function handleInteraction(data) {
    const db = await getDB();
    const timestamp = new Date().toISOString();
    
    try {
        // Get admin user for now
        const admin = await db.get("SELECT id FROM users WHERE email = 'admin@thoraxlab.local'");
        
        // Record interaction
        await db.run(
            `INSERT INTO interactions (project_id, user_id, type, metadata, created_at) 
             VALUES (?, ?, ?, ?, ?)`,
            [data.projectId, admin.id, data.interactionType, JSON.stringify(data.metadata || {}), timestamp]
        );
        
        // Log activity
        await db.run(
            `INSERT INTO activity_log (user_id, action, entity_type, entity_id, metadata) 
             VALUES (?, ?, ?, ?, ?)`,
            [admin.id, data.interactionType, 'project', data.projectId, JSON.stringify(data.metadata || {})]
        );
        
        // Update project pulse
        const newPulse = await calculatePulseScore(db, data.projectId);
        await db.run(
            `UPDATE projects SET pulse_score = ?, last_calculated = ?, updated_at = ? WHERE id = ?`,
            [newPulse, timestamp, timestamp, data.projectId]
        );
        
        return newPulse;
    } catch (error) {
        console.error('Interaction error:', error);
        throw error;
    }
}

// API Routes
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        clients: connectedClients.size
    });
});

app.get('/api/projects', async (req, res) => {
    try {
        const db = await getDB();
        const projects = await db.all(`
            SELECT 
                p.*,
                u.name as creator_name,
                u.avatar_color as creator_color,
                COUNT(DISTINCT pm.user_id) as team_size,
                COUNT(DISTINCT d.id) as discussion_count,
                COUNT(DISTINCT i.id) as interaction_count,
                MAX(i.created_at) as last_activity_at
            FROM projects p
            LEFT JOIN users u ON p.created_by = u.id
            LEFT JOIN project_members pm ON p.id = pm.project_id
            LEFT JOIN discussions d ON p.id = d.project_id
            LEFT JOIN interactions i ON p.id = i.project_id
            GROUP BY p.id
            ORDER BY p.updated_at DESC
        `);
        
        res.json({
            success: true,
            data: projects,
            count: projects.length,
            serverTime: new Date().toISOString()
        });
    } catch (error) {
        console.error('Projects fetch error:', error);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

app.get('/api/projects/:id', async (req, res) => {
    try {
        const db = await getDB();
        const { id } = req.params;
        
        const project = await db.get(`
            SELECT 
                p.*,
                u.name as creator_name,
                u.avatar_color as creator_color
            FROM projects p
            LEFT JOIN users u ON p.created_by = u.id
            WHERE p.id = ?
        `, [id]);
        
        if (!project) {
            return res.status(404).json({ success: false, error: 'Project not found' });
        }
        
        // Get detailed stats
        const stats = await db.get(`
            SELECT 
                COUNT(DISTINCT pm.user_id) as team_size,
                COUNT(DISTINCT d.id) as discussion_count,
                COUNT(DISTINCT i.id) as interaction_count,
                COUNT(DISTINCT CASE WHEN i.type = 'like' THEN i.id END) as like_count,
                COUNT(DISTINCT CASE WHEN i.type = 'comment' THEN i.id END) as comment_count,
                COUNT(DISTINCT CASE WHEN i.type = 'view' THEN i.id END) as view_count,
                MAX(i.created_at) as last_interaction_at
            FROM projects p
            LEFT JOIN project_members pm ON p.id = pm.project_id
            LEFT JOIN discussions d ON p.id = d.project_id
            LEFT JOIN interactions i ON p.id = i.project_id
            WHERE p.id = ?
            GROUP BY p.id
        `, [id]);
        
        // Get team members
        const team = await db.all(`
            SELECT u.id, u.name, u.role, u.department, u.avatar_color, pm.role as project_role
            FROM project_members pm
            JOIN users u ON pm.user_id = u.id
            WHERE pm.project_id = ?
            ORDER BY pm.joined_at
        `, [id]);
        
        // Get recent discussions
        const discussions = await db.all(`
            SELECT d.*, u.name as user_name, u.avatar_color
            FROM discussions d
            JOIN users u ON d.user_id = u.id
            WHERE d.project_id = ?
            ORDER BY d.created_at DESC
            LIMIT 20
        `, [id]);
        
        // Get activity timeline
        const timeline = await db.all(`
            SELECT 
                al.action,
                al.entity_type,
                al.metadata,
                u.name as user_name,
                u.avatar_color,
                al.created_at
            FROM activity_log al
            LEFT JOIN users u ON al.user_id = u.id
            WHERE al.entity_id = ?
            ORDER BY al.created_at DESC
            LIMIT 30
        `, [id]);
        
        res.json({
            success: true,
            data: {
                ...project,
                stats: stats || {},
                team,
                discussions,
                timeline
            }
        });
    } catch (error) {
        console.error('Project fetch error:', error);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

app.post('/api/projects', async (req, res) => {
    try {
        const { title, description, stage = 'idea', department = 'Pneumology', targetDate } = req.body;
        
        if (!title || !description) {
            return res.status(400).json({ 
                success: false, 
                error: 'Title and description are required' 
            });
        }
        
        const db = await getDB();
        const projectId = `proj_${uuidv4()}`;
        const timestamp = new Date().toISOString();
        
        // Get admin
        const admin = await db.get("SELECT id FROM users WHERE email = 'admin@thoraxlab.local'");
        
        // Create project
        await db.run(
            `INSERT INTO projects (id, title, description, stage, department, created_by, target_date, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [projectId, title, description, stage, department, admin.id, targetDate, timestamp, timestamp]
        );
        
        // Add creator as admin member
        await db.run(
            `INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)`,
            [projectId, admin.id, 'admin']
        );
        
        // Log creation
        await db.run(
            `INSERT INTO activity_log (user_id, action, entity_type, entity_id, metadata) 
             VALUES (?, ?, ?, ?, ?)`,
            [admin.id, 'project_create', 'project', projectId, JSON.stringify({ title, stage })]
        );
        
        // Initial interaction
        await db.run(
            `INSERT INTO interactions (project_id, user_id, type, metadata) 
             VALUES (?, ?, ?, ?)`,
            [projectId, admin.id, 'view', JSON.stringify({ source: 'creation' })]
        );
        
        // Calculate initial pulse
        const initialPulse = await calculatePulseScore(db, projectId);
        await db.run(
            `UPDATE projects SET pulse_score = ?, last_calculated = ? WHERE id = ?`,
            [initialPulse, timestamp, projectId]
        );
        
        // Broadcast creation
        broadcastProjectUpdate(projectId);
        
        res.json({
            success: true,
            data: {
                id: projectId,
                title,
                stage,
                pulse_score: initialPulse,
                created_at: timestamp
            },
            message: 'Project created successfully'
        });
    } catch (error) {
        console.error('Project creation error:', error);
        res.status(500).json({ success: false, error: 'Creation failed' });
    }
});

app.post('/api/interactions', async (req, res) => {
    try {
        const { projectId, type, metadata = {} } = req.body;
        
        if (!projectId || !type) {
            return res.status(400).json({ 
                success: false, 
                error: 'Project ID and interaction type required' 
            });
        }
        
        const newPulse = await handleInteraction({
            projectId,
            interactionType: type,
            metadata
        });
        
        res.json({
            success: true,
            data: {
                projectId,
                pulseScore: newPulse,
                interactionType: type,
                timestamp: new Date().toISOString()
            },
            message: 'Interaction recorded'
        });
    } catch (error) {
        console.error('Interaction error:', error);
        res.status(500).json({ success: false, error: 'Interaction failed' });
    }
});

app.post('/api/discussions', async (req, res) => {
    try {
        const { projectId, content } = req.body;
        
        if (!projectId || !content?.trim()) {
            return res.status(400).json({ 
                success: false, 
                error: 'Project ID and content required' 
            });
        }
        
        const db = await getDB();
        const timestamp = new Date().toISOString();
        const admin = await db.get("SELECT id FROM users WHERE email = 'admin@thoraxlab.local'");
        
        // Create discussion
        const result = await db.run(
            `INSERT INTO discussions (project_id, user_id, content, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?)`,
            [projectId, admin.id, content.trim(), timestamp, timestamp]
        );
        
        // Record as interaction
        await db.run(
            `INSERT INTO interactions (project_id, user_id, type, metadata) 
             VALUES (?, ?, ?, ?)`,
            [projectId, admin.id, 'comment', JSON.stringify({ discussionId: result.lastID })]
        );
        
        // Update project
        await db.run(
            `UPDATE projects SET updated_at = ? WHERE id = ?`,
            [timestamp, projectId]
        );
        
        // Recalculate pulse
        const newPulse = await calculatePulseScore(db, projectId);
        await db.run(
            `UPDATE projects SET pulse_score = ?, last_calculated = ? WHERE id = ?`,
            [newPulse, timestamp, projectId]
        );
        
        // Broadcast update
        broadcastProjectUpdate(projectId);
        
        res.json({
            success: true,
            data: {
                id: result.lastID,
                projectId,
                content: content.trim(),
                user_name: 'Digital Innovation Lead',
                avatar_color: '#1A365D',
                created_at: timestamp
            },
            message: 'Discussion posted'
        });
    } catch (error) {
        console.error('Discussion error:', error);
        res.status(500).json({ success: false, error: 'Post failed' });
    }
});

app.get('/api/stats', async (req, res) => {
    try {
        const db = await getDB();
        
        const stats = await db.get(`
            SELECT 
                COUNT(DISTINCT p.id) as total_projects,
                COUNT(DISTINCT CASE WHEN p.stage = 'active' THEN p.id END) as active_projects,
                COUNT(DISTINCT i.id) as total_interactions,
                COUNT(DISTINCT u.id) as total_users,
                ROUND(AVG(p.pulse_score), 1) as avg_pulse,
                COUNT(DISTINCT d.id) as total_discussions,
                MAX(p.created_at) as latest_project_date
            FROM projects p
            LEFT JOIN interactions i ON p.id = i.project_id
            LEFT JOIN users u ON p.created_by = u.id
            LEFT JOIN discussions d ON p.id = d.project_id
            WHERE p.status = 'active'
        `);
        
        // 24h activity
        const dailyActivity = await db.get(`
            SELECT COUNT(*) as interactions_24h
            FROM interactions 
            WHERE created_at > datetime('now', '-1 day')
        `);
        
        res.json({
            success: true,
            data: {
                ...stats,
                ...dailyActivity,
                webSocketClients: connectedClients.size,
                serverTime: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ success: false, error: 'Stats unavailable' });
    }
});

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/project', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'project.html'));
});

// Start server
server.listen(PORT, async () => {
    console.log(`🚀 THORAXLAB Enterprise v2.0`);
    console.log(`   Port: ${PORT}`);
    console.log(`   WebSocket: Ready (${wss.options.port})`);
    console.log(`   Database: Initializing...`);
    
    // Initialize database
    await getDB();
    
    console.log(`   Status: Ready for €10M competition`);
    console.log(`   URL: http://localhost:${PORT}`);
    
    // Periodic WebSocket heartbeat
    setInterval(() => {
        connectedClients.forEach((ws, clientId) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'heartbeat',
                    timestamp: Date.now()
                }));
            }
        });
    }, 30000);
});
