const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS middleware (if needed for future API calls)
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// API Routes

// 1. Get all projects with stats
app.get('/api/projects', async (req, res) => {
    try {
        const db = await getDB();
        
        const projects = await db.all(`
            SELECT p.*, 
                   u.name as creator_name,
                   COUNT(DISTINCT d.id) as discussion_count,
                   COUNT(DISTINCT i.id) as interaction_count,
                   SUM(CASE WHEN i.type = 'like' THEN 1 ELSE 0 END) as like_count,
                   SUM(CASE WHEN i.type = 'comment' THEN 1 ELSE 0 END) as comment_count
            FROM projects p
            LEFT JOIN users u ON p.created_by = u.id
            LEFT JOIN discussions d ON p.id = d.project_id
            LEFT JOIN interactions i ON p.id = i.project_id
            GROUP BY p.id
            ORDER BY p.updated_at DESC
        `);
        
        // Calculate pulse score (simplified: based on recent activity)
        const projectsWithPulse = projects.map(project => {
            const baseScore = 50;
            const activityBonus = Math.min(project.interaction_count * 2, 30);
            const recencyBonus = project.discussion_count > 0 ? 20 : 0;
            const pulse = baseScore + activityBonus + recencyBonus;
            
            return {
                ...project,
                pulse_score: Math.min(pulse, 100)
            };
        });
        
        res.json(projectsWithPulse);
    } catch (error) {
        console.error('Error fetching projects:', error);
        res.status(500).json({ error: 'Failed to fetch projects' });
    }
});

// 2. Get single project
app.get('/api/projects/:id', async (req, res) => {
    try {
        const db = await getDB();
        const { id } = req.params;
        
        const project = await db.get(`
            SELECT p.*, u.name as creator_name
            FROM projects p
            LEFT JOIN users u ON p.created_by = u.id
            WHERE p.id = ?
        `, [id]);
        
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        
        // Get project stats
        const stats = await db.get(`
            SELECT 
                COUNT(DISTINCT d.id) as discussion_count,
                COUNT(DISTINCT i.id) as interaction_count,
                SUM(CASE WHEN i.type = 'like' THEN 1 ELSE 0 END) as like_count,
                SUM(CASE WHEN i.type = 'view' THEN 1 ELSE 0 END) as view_count
            FROM projects p
            LEFT JOIN discussions d ON p.id = d.project_id
            LEFT JOIN interactions i ON p.id = i.project_id
            WHERE p.id = ?
            GROUP BY p.id
        `, [id]);
        
        res.json({
            ...project,
            ...stats,
            pulse_score: project.pulse_score || 50
        });
    } catch (error) {
        console.error('Error fetching project:', error);
        res.status(500).json({ error: 'Failed to fetch project' });
    }
});

// 3. Create new project
app.post('/api/projects', async (req, res) => {
    try {
        const { title, description, stage = 'ideation', department = 'Pneumology' } = req.body;
        
        if (!title || !description) {
            return res.status(400).json({ error: 'Title and description are required' });
        }
        
        const db = await getDB();
        const projectId = uuidv4();
        const timestamp = new Date().toISOString();
        
        // Get or create admin user
        let admin = await db.get("SELECT id FROM users WHERE email = 'admin@thoraxlab.local'");
        if (!admin) {
            const adminId = uuidv4();
            await db.run(
                `INSERT INTO users (id, email, name, role, department) 
                 VALUES (?, ?, ?, ?, ?)`,
                [adminId, 'admin@thoraxlab.local', 'Digital Innovation Lead', 'admin', 'Pneumology']
            );
            admin = { id: adminId };
        }
        
        await db.run(
            `INSERT INTO projects (id, title, description, stage, department, created_by, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [projectId, title, description, stage, department, admin.id, timestamp, timestamp]
        );
        
        // Add creator as project member
        await db.run(
            `INSERT INTO project_members (project_id, user_id, role) 
             VALUES (?, ?, ?)`,
            [projectId, admin.id, 'admin']
        );
        
        // Record creation as interaction
        await db.run(
            `INSERT INTO interactions (project_id, user_id, type, content) 
             VALUES (?, ?, ?, ?)`,
            [projectId, admin.id, 'comment', 'Project created']
        );
        
        res.json({ 
            success: true, 
            id: projectId,
            message: 'Project created successfully'
        });
    } catch (error) {
        console.error('Error creating project:', error);
        res.status(500).json({ error: 'Failed to create project' });
    }
});

// 4. Get project discussions
app.get('/api/projects/:id/discussions', async (req, res) => {
    try {
        const db = await getDB();
        const { id } = req.params;
        
        const discussions = await db.all(`
            SELECT d.*, u.name as user_name
            FROM discussions d
            LEFT JOIN users u ON d.user_id = u.id
            WHERE d.project_id = ?
            ORDER BY d.created_at DESC
        `, [id]);
        
        res.json(discussions);
    } catch (error) {
        console.error('Error fetching discussions:', error);
        res.status(500).json({ error: 'Failed to fetch discussions' });
    }
});

// 5. Create discussion
app.post('/api/discussions', async (req, res) => {
    try {
        const { project_id, content, type = 'comment' } = req.body;
        
        if (!project_id || !content) {
            return res.status(400).json({ error: 'Project ID and content are required' });
        }
        
        const db = await getDB();
        const timestamp = new Date().toISOString();
        
        // Get admin user for now (replace with auth later)
        const admin = await db.get("SELECT id FROM users WHERE email = 'admin@thoraxlab.local'");
        if (!admin) {
            return res.status(500).json({ error: 'Admin user not found' });
        }
        
        await db.run(
            `INSERT INTO discussions (project_id, user_id, content, type, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [project_id, admin.id, content, type, timestamp, timestamp]
        );
        
        // Record as interaction
        await db.run(
            `INSERT INTO interactions (project_id, user_id, type, content) 
             VALUES (?, ?, ?, ?)`,
            [project_id, admin.id, 'comment', 'Posted discussion']
        );
        
        // Update project's last activity
        await db.run(
            `UPDATE projects SET updated_at = ? WHERE id = ?`,
            [timestamp, project_id]
        );
        
        res.json({ success: true, message: 'Discussion posted successfully' });
    } catch (error) {
        console.error('Error posting discussion:', error);
        res.status(500).json({ error: 'Failed to post discussion' });
    }
});

// 6. Record interaction (like, view, etc.)
app.post('/api/interactions', async (req, res) => {
    try {
        const { project_id, discussion_id, type = 'like', content = '' } = req.body;
        
        if (!project_id) {
            return res.status(400).json({ error: 'Project ID is required' });
        }
        
        const db = await getDB();
        const timestamp = new Date().toISOString();
        
        // Get admin user for now
        const admin = await db.get("SELECT id FROM users WHERE email = 'admin@thoraxlab.local'");
        if (!admin) {
            return res.status(500).json({ error: 'Admin user not found' });
        }
        
        await db.run(
            `INSERT INTO interactions (project_id, discussion_id, user_id, type, content, created_at) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [project_id, discussion_id || null, admin.id, type, content, timestamp]
        );
        
        // Update project's pulse score
        await updatePulseScore(db, project_id);
        
        // Update project's last activity
        await db.run(
            `UPDATE projects SET updated_at = ? WHERE id = ?`,
            [timestamp, project_id]
        );
        
        res.json({ success: true, message: 'Interaction recorded' });
    } catch (error) {
        console.error('Error recording interaction:', error);
        res.status(500).json({ error: 'Failed to record interaction' });
    }
});

// 7. Get recent activities
app.get('/api/activities', async (req, res) => {
    try {
        const db = await getDB();
        
        const activities = await db.all(`
            SELECT 
                i.*,
                u.name as user_name,
                p.title as project_title,
                CASE 
                    WHEN i.type = 'like' THEN 'liked'
                    WHEN i.type = 'comment' THEN 'commented on'
                    WHEN i.type = 'view' THEN 'viewed'
                    ELSE 'interacted with'
                END as action,
                datetime(i.created_at) as timestamp
            FROM interactions i
            LEFT JOIN users u ON i.user_id = u.id
            LEFT JOIN projects p ON i.project_id = p.id
            ORDER BY i.created_at DESC
            LIMIT 20
        `);
        
        // Format for frontend
        const formattedActivities = activities.map(activity => ({
            user: activity.user_name || 'Clinician',
            content: `${activity.action} ${activity.project_title}`,
            timestamp: formatTimeAgo(activity.created_at)
        }));
        
        res.json(formattedActivities);
    } catch (error) {
        console.error('Error fetching activities:', error);
        res.status(500).json({ error: 'Failed to fetch activities' });
    }
});

// 8. Get project stats
app.get('/api/stats', async (req, res) => {
    try {
        const db = await getDB();
        
        const stats = await db.get(`
            SELECT 
                COUNT(DISTINCT p.id) as total_projects,
                COUNT(DISTINCT CASE WHEN p.stage = 'active' THEN p.id END) as active_projects,
                COUNT(DISTINCT i.id) as total_interactions,
                COUNT(DISTINCT u.id) as total_users,
                AVG(p.pulse_score) as avg_pulse_score
            FROM projects p
            LEFT JOIN interactions i ON p.id = i.project_id
            LEFT JOIN users u ON p.created_by = u.id
        `);
        
        res.json({
            activeProjects: stats.active_projects || 0,
            totalInteractions: stats.total_interactions || 0,
            avgPulse: Math.round(stats.avg_pulse_score || 50),
            clinicians: stats.total_users || 1
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// Helper function to update pulse score
async function updatePulseScore(db, projectId) {
    try {
        // Calculate new pulse score based on recent interactions
        const recentInteractions = await db.get(`
            SELECT COUNT(*) as count,
                   MAX(created_at) as last_interaction
            FROM interactions 
            WHERE project_id = ? 
            AND created_at > datetime('now', '-7 days')
        `, [projectId]);
        
        const interactionCount = recentInteractions?.count || 0;
        const hasRecentActivity = recentInteractions?.last_interaction ? 
            (new Date() - new Date(recentInteractions.last_interaction)) < 24 * 60 * 60 * 1000 : false;
        
        // Simple pulse calculation
        let newPulse = 50; // Base
        newPulse += Math.min(interactionCount * 3, 30); // Interaction bonus
        newPulse += hasRecentActivity ? 20 : 0; // Recency bonus
        
        // Cap at 100
        newPulse = Math.min(newPulse, 100);
        
        await db.run(
            `UPDATE projects SET pulse_score = ? WHERE id = ?`,
            [newPulse, projectId]
        );
        
        return newPulse;
    } catch (error) {
        console.error('Error updating pulse score:', error);
    }
}

// Helper function to format time ago
function formatTimeAgo(timestamp) {
    if (!timestamp) return 'Recently';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
}

// Serve frontend routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/project', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'project.html'));
});

// Health check endpoint for Railway
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Initialize database and start server
async function startServer() {
    try {
        // Initialize database
        const db = await getDB();
        console.log('✅ Database initialized');
        
        // Start server
        app.listen(PORT, () => {
            console.log(`🚀 ThoraxLab server running on port ${PORT}`);
            console.log(`🌐 Open http://localhost:${PORT} in your browser`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
