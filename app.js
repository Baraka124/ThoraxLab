// ============================================
// Thorax Lab Pro - Elite Clinical Innovation Platform
// Enhanced with JSON-structured data
// ============================================

class ThoraxLabPro {
    constructor() {
        // User data in JSON format
        this.user = this.loadJSON('thoraxlab_user') || null;
        this.isVisitor = this.loadJSON('thoraxlab_visitor') || false;
        
        // Application state
        this.currentProject = null;
        this.currentDiscussion = null;
        this.selectedTags = new Set();
        this.activityFilter = 'all';
        this.sortBy = 'recent';
        
        // Initialize
        this.initialize();
    }
    
    // ========== INITIALIZATION ==========
    
    initialize() {
        this.initializeDemoData();
        this.setupEventListeners();
        this.setupRouter();
        this.checkAuth();
    }
    
    // ========== JSON DATA MANAGEMENT ==========
    
    loadJSON(key) {
        try {
            return JSON.parse(localStorage.getItem(key));
        } catch (error) {
            console.error(`Error loading ${key}:`, error);
            return null;
        }
    }
    
    saveJSON(key, data) {
        localStorage.setItem(key, JSON.stringify(data));
    }
    
    // ========== DEMO DATA (JSON STRUCTURE) ==========
    
    initializeDemoData() {
        if (!this.loadJSON('thoraxlab_projects')) {
            const demoProjects = [
                {
                    "id": "proj_1",
                    "title": "AI-Powered COPD Exacerbation Prediction",
                    "description": "Developing machine learning models to predict COPD exacerbations 48 hours in advance using patient vitals, spirometry data, and environmental factors.",
                    "tags": ["AI", "COPD", "machine learning", "prediction", "pulmonary"],
                    "ownerId": "demo_user_1",
                    "ownerName": "Dr. Sarah Chen",
                    "ownerType": "clinical",
                    "ownerPosition": "Principal Investigator",
                    "institution": "Cambridge University Hospitals",
                    "teamMembers": [
                        {
                            "id": "member_1",
                            "name": "Dr. Michael Johnson",
                            "type": "clinical",
                            "position": "Co-Investigator"
                        },
                        {
                            "id": "member_2",
                            "name": "Dr. Lisa Wang",
                            "type": "academic",
                            "position": "Data Scientist"
                        }
                    ],
                    "createdAt": "2024-01-15T10:30:00Z",
                    "updatedAt": "2024-01-20T14:45:00Z",
                    "discussions": [
                        {
                            "id": "disc_1",
                            "title": "Which clinical features are most predictive?",
                            "content": "We need to decide on the most important clinical features for our prediction model. Should we prioritize spirometry data, patient-reported symptoms, or environmental factors?",
                            "type": "brainstorm",
                            "tags": ["clinical features", "spirometry", "patient-reported outcomes"],
                            "authorId": "demo_user_1",
                            "authorName": "Dr. Sarah Chen",
                            "authorType": "clinical",
                            "createdAt": "2024-01-16T09:15:00Z",
                            "likes": 24,
                            "comments": 12,
                            "views": 156,
                            "commentsList": [
                                {
                                    "id": "comment_1",
                                    "content": "Based on our preliminary analysis, spirometry data shows the highest correlation with exacerbation events.",
                                    "authorName": "Dr. Michael Johnson",
                                    "authorType": "clinical",
                                    "createdAt": "2024-01-16T14:20:00Z",
                                    "likes": 8
                                }
                            ]
                        }
                    ]
                },
                {
                    "id": "proj_2",
                    "title": "Genomic Biomarkers for Immunotherapy Response",
                    "description": "Identifying genomic signatures that predict response to immune checkpoint inhibitors in non-small cell lung cancer.",
                    "tags": ["genomics", "oncology", "immunotherapy", "biomarkers", "NSCLC"],
                    "ownerId": "demo_user_2",
                    "ownerName": "Prof. Robert Kim",
                    "ownerType": "academic",
                    "ownerPosition": "Principal Investigator",
                    "institution": "Oxford University",
                    "teamMembers": [
                        {
                            "id": "member_3",
                            "name": "Dr. Emma Davis",
                            "type": "industry",
                            "position": "Genomics Specialist"
                        }
                    ],
                    "createdAt": "2024-01-10T08:45:00Z",
                    "updatedAt": "2024-01-18T11:30:00Z",
                    "discussions": [
                        {
                            "id": "disc_2",
                            "title": "Tumor Mutational Burden vs PD-L1 Expression",
                            "content": "Which biomarker shows stronger predictive value for immunotherapy response in our cohort?",
                            "type": "question",
                            "tags": ["biomarkers", "immunotherapy", "predictive value"],
                            "authorId": "demo_user_2",
                            "authorName": "Prof. Robert Kim",
                            "authorType": "academic",
                            "createdAt": "2024-01-12T13:45:00Z",
                            "likes": 18,
                            "comments": 9,
                            "views": 89,
                            "commentsList": []
                        }
                    ]
                },
                {
                    "id": "proj_3",
                    "title": "Digital Health Platform for Remote Patient Monitoring",
                    "description": "Developing a comprehensive digital health platform for remote monitoring of chronic respiratory diseases.",
                    "tags": ["digital health", "remote monitoring", "wearables", "telemedicine"],
                    "ownerId": "demo_user_3",
                    "ownerName": "Dr. Alex Rodriguez",
                    "ownerType": "industry",
                    "ownerPosition": "Technical Lead",
                    "institution": "HealthTech Innovations",
                    "teamMembers": [],
                    "createdAt": "2024-01-05T16:20:00Z",
                    "updatedAt": "2024-01-19T10:15:00Z",
                    "discussions": []
                }
            ];
            
            this.saveJSON('thoraxlab_projects', demoProjects);
        }
        
        if (!this.loadJSON('thoraxlab_activity')) {
            const demoActivity = [
                {
                    "id": "act_1",
                    "type": "project_created",
                    "title": "New Project Created",
                    "description": "Dr. Sarah Chen initiated 'AI-Powered COPD Exacerbation Prediction'",
                    "timestamp": "2024-01-15T10:30:00Z",
                    "userId": "demo_user_1",
                    "projectId": "proj_1"
                },
                {
                    "id": "act_2",
                    "type": "discussion_started",
                    "title": "Discussion Started",
                    "description": "Dr. Sarah Chen asked 'Which clinical features are most predictive?'",
                    "timestamp": "2024-01-16T09:15:00Z",
                    "userId": "demo_user_1",
                    "discussionId": "disc_1"
                },
                {
                    "id": "act_3",
                    "type": "comment_added",
                    "title": "Expert Insight Added",
                    "description": "Dr. Michael Johnson contributed to the COPD prediction discussion",
                    "timestamp": "2024-01-16T14:20:00Z",
                    "userId": "demo_user_1",
                    "discussionId": "disc_1"
                },
                {
                    "id": "act_4",
                    "type": "project_created",
                    "title": "New Project Created",
                    "description": "Prof. Robert Kim started 'Genomic Biomarkers for Immunotherapy Response'",
                    "timestamp": "2024-01-10T08:45:00Z",
                    "userId": "demo_user_2",
                    "projectId": "proj_2"
                }
            ];
            
            this.saveJSON('thoraxlab_activity', demoActivity);
        }
        
        if (!this.loadJSON('thoraxlab_tags')) {
            const demoTags = {
                "AI": { count: 15, frequency: "high" },
                "COPD": { count: 8, frequency: "medium" },
                "machine learning": { count: 12, frequency: "high" },
                "genomics": { count: 10, frequency: "high" },
                "oncology": { count: 9, frequency: "medium" },
                "immunotherapy": { count: 7, frequency: "medium" },
                "digital health": { count: 6, frequency: "medium" },
                "remote monitoring": { count: 5, frequency: "low" },
                "biomarkers": { count: 8, frequency: "medium" },
                "pulmonary": { count: 6, frequency: "low" }
            };
            
            this.saveJSON('thoraxlab_tags', demoTags);
        }
        
        // Initialize like tracking
        if (!this.loadJSON('thoraxlab_likes')) {
            this.saveJSON('thoraxlab_likes', {});
        }
    }
    
    // ========== AUTHENTICATION ==========
    
    checkAuth() {
        if (this.user || this.isVisitor) {
            this.showApp();
            this.updateUserDisplay();
        } else {
            this.showAuth();
        }
    }
    
    showAuth() {
        document.getElementById('authScreen').classList.remove('hidden');
        document.getElementById('mainApp').classList.add('hidden');
    }
    
    showApp() {
        document.getElementById('authScreen').classList.add('hidden');
        document.getElementById('mainApp').classList.remove('hidden');
    }
    
    loginAsProfessional(e) {
        if (e) e.preventDefault();
        
        const name = document.getElementById('professionalName').value.trim();
        const type = document.getElementById('professionalType').value;
        const institution = document.getElementById('professionalInstitution').value.trim();
        
        if (!name || !type) {
            this.showToast('Name and professional type are required', 'error');
            return;
        }
        
        const initials = name.split(' ')
            .map(n => n[0])
            .join('')
            .toUpperCase()
            .substring(0, 2);
        
        this.user = {
            id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: name,
            type: type,
            institution: institution || 'Not specified',
            avatar_initials: initials,
            createdAt: new Date().toISOString()
        };
        
        this.isVisitor = false;
        
        this.saveJSON('thoraxlab_user', this.user);
        this.saveJSON('thoraxlab_visitor', false);
        
        this.showApp();
        this.updateUserDisplay();
        this.showToast(`Welcome to Thorax Lab Pro, ${name.split(' ')[0]}!`, 'success');
    }
    
    loginAsVisitor(e) {
        if (e) e.preventDefault();
        
        const name = document.getElementById('visitorName').value.trim();
        
        this.user = {
            id: `visitor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: name || 'Guest Researcher',
            type: 'visitor',
            institution: 'Viewing Only',
            avatar_initials: 'G',
            createdAt: new Date().toISOString()
        };
        
        this.isVisitor = true;
        
        this.saveJSON('thoraxlab_user', this.user);
        this.saveJSON('thoraxlab_visitor', true);
        
        this.showApp();
        this.updateUserDisplay();
        this.showToast('You are browsing as a guest researcher', 'info');
    }
    
    logout() {
        this.user = null;
        this.isVisitor = false;
        localStorage.removeItem('thoraxlab_user');
        localStorage.removeItem('thoraxlab_visitor');
        this.showAuth();
    }
    
    updateUserDisplay() {
        if (!this.user) return;
        
        const avatar = document.getElementById('userAvatar');
        const name = document.getElementById('userName');
        const role = document.getElementById('userRole');
        const visitorBadge = document.getElementById('visitorBadge');
        const newProjectBtn = document.getElementById('newProjectBtn');
        const welcome = document.getElementById('welcomeMessage');
        
        if (avatar) {
            avatar.textContent = this.user.avatar_initials || '??';
            if (this.isVisitor) {
                avatar.style.background = 'linear-gradient(135deg, #64748B, #475569)';
            }
        }
        
        if (name) name.textContent = this.user.name;
        
        if (role) {
            const typeLabels = {
                'clinical': 'Clinical Professional',
                'academic': 'Academic Professional',
                'industry': 'Industry Professional',
                'other': 'Research Professional',
                'visitor': 'Guest Researcher'
            };
            role.textContent = typeLabels[this.user.type] || 'Research Professional';
        }
        
        if (visitorBadge) {
            visitorBadge.classList.toggle('hidden', !this.isVisitor);
        }
        
        if (newProjectBtn) {
            newProjectBtn.classList.toggle('hidden', this.isVisitor);
        }
        
        if (welcome && !this.isVisitor) {
            const firstName = this.user.name.split(' ')[0];
            const time = new Date().getHours();
            let greeting = 'Good ';
            
            if (time < 12) greeting += 'morning';
            else if (time < 18) greeting += 'afternoon';
            else greeting += 'evening';
            
            welcome.textContent = `${greeting}, ${firstName}`;
        }
    }
    
    // ========== ROUTER ==========
    
    setupRouter() {
        window.addEventListener('hashchange', () => this.handleRoute());
        this.handleRoute();
    }
    
    handleRoute() {
        const hash = window.location.hash.substring(1) || 'dashboard';
        const parts = hash.split('/');
        
        this.showPage(parts[0]);
        
        if (parts[0] === 'project' && parts[1]) {
            this.loadProjectDetail(parts[1]);
        } else if (parts[0] === 'discussion' && parts[1]) {
            this.loadDiscussionDetail(parts[1]);
        }
        
        this.updateNavigation(parts[0]);
    }
    
    showPage(page) {
        document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
        
        const pageElement = document.getElementById(`${page}Page`);
        if (pageElement) {
            pageElement.classList.remove('hidden');
            
            switch(page) {
                case 'dashboard':
                    this.loadDashboard();
                    break;
                case 'projects':
                    this.loadAllProjects();
                    break;
                case 'myprojects':
                    this.loadMyProjects();
                    break;
            }
        }
    }
    
    updateNavigation(page) {
        document.querySelectorAll('.nav-link').forEach(link => {
            const linkPage = link.getAttribute('href').substring(1);
            if (linkPage.includes('/')) {
                const linkBase = linkPage.split('/')[0];
                link.classList.toggle('active', linkBase === page);
            } else {
                link.classList.toggle('active', linkPage === page);
            }
        });
    }
    
    navigateTo(page) {
        window.location.hash = page;
    }
    
    // ========== DASHBOARD ==========
    
    loadDashboard() {
        this.loadUserStats();
        this.loadActivityFeed();
        this.loadTagsCloud();
        this.loadFeaturedDiscussions();
        this.loadRecentProjects();
    }
    
    loadUserStats() {
        if (this.isVisitor) return;
        
        const projects = this.getProjects();
        const userProjects = projects.filter(p => p.ownerId === this.user.id);
        const userDiscussions = projects.reduce((count, project) => {
            if (project.discussions) {
                return count + project.discussions.filter(d => d.authorId === this.user.id).length;
            }
            return count;
        }, 0);
        
        const container = document.getElementById('userStats');
        if (container) {
            container.innerHTML = `
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-project-diagram"></i>
                        </div>
                        <div class="stat-content">
                            <div class="stat-number">${userProjects.length}</div>
                            <div class="stat-label">Projects</div>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-comments"></i>
                        </div>
                        <div class="stat-content">
                            <div class="stat-number">${userDiscussions}</div>
                            <div class="stat-label">Discussions</div>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-users"></i>
                        </div>
                        <div class="stat-content">
                            <div class="stat-number">${userProjects.reduce((sum, p) => sum + (p.teamMembers?.length || 0), 0)}</div>
                            <div class="stat-label">Collaborators</div>
                        </div>
                    </div>
                </div>
            `;
        }
    }
    
    loadActivityFeed() {
        const activities = this.getActivities();
        let filteredActivities = activities;
        
        if (this.activityFilter !== 'all') {
            filteredActivities = activities.filter(act => act.type.includes(this.activityFilter));
        }
        
        filteredActivities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        const container = document.getElementById('activityFeed');
        if (!container) return;
        
        if (!filteredActivities.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📊</div>
                    <div class="empty-title">No recent activity</div>
                    <p class="text-muted">Start a project or join a discussion</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = filteredActivities.slice(0, 5).map(activity => {
            const icon = this.getActivityIcon(activity.type);
            const timeAgo = this.formatTimeAgo(activity.timestamp);
            
            return `
                <div class="activity-item">
                    <div class="activity-icon">${icon}</div>
                    <div class="activity-content">
                        <div class="activity-text">${activity.description}</div>
                        <div class="activity-time">${timeAgo}</div>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    loadTagsCloud() {
        const tags = this.getTags();
        const container = document.getElementById('tagsCloud');
        
        if (!container) return;
        
        const tagsArray = Object.entries(tags)
            .map(([tag, data]) => ({ tag, ...data }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);
        
        container.innerHTML = `
            <div class="tags-cloud">
                ${tagsArray.map(({ tag, count }) => {
                    const isActive = this.selectedTags.has(tag);
                    return `
                        <span class="tag ${isActive ? 'active' : ''}" data-tag="${tag}">
                            ${tag} <span class="text-muted">(${count})</span>
                        </span>
                    `;
                }).join('')}
            </div>
        `;
        
        container.querySelectorAll('.tag').forEach(tagEl => {
            tagEl.addEventListener('click', (e) => {
                const tag = e.currentTarget.dataset.tag;
                this.toggleTag(tag);
            });
        });
    }
    
    loadFeaturedDiscussions() {
        const projects = this.getProjects();
        let allDiscussions = [];
        
        projects.forEach(project => {
            if (project.discussions) {
                project.discussions.forEach(disc => {
                    allDiscussions.push({
                        ...disc,
                        projectId: project.id,
                        projectTitle: project.title,
                        projectTags: project.tags,
                        projectInstitution: project.institution
                    });
                });
            }
        });
        
        allDiscussions.sort((a, b) => {
            const engagementA = (a.likes || 0) + (a.comments || 0);
            const engagementB = (b.likes || 0) + (b.comments || 0);
            return engagementB - engagementA;
        });
        
        const featured = allDiscussions.slice(0, 4);
        this.renderDiscussions(featured, 'featuredDiscussions');
    }
    
    loadRecentProjects() {
        const projects = this.getProjects();
        projects.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        const recent = projects.slice(0, 3);
        this.renderProjects(recent, 'recentProjects');
    }
    
    // ========== PROJECTS ==========
    
    loadAllProjects() {
        let projects = this.getProjects();
        
        if (this.selectedTags.size > 0) {
            projects = projects.filter(project => 
                project.tags.some(tag => this.selectedTags.has(tag))
            );
        }
        
        const searchQuery = document.getElementById('projectSearch')?.value.toLowerCase() || '';
        if (searchQuery) {
            projects = projects.filter(project => 
                project.title.toLowerCase().includes(searchQuery) ||
                project.description.toLowerCase().includes(searchQuery) ||
                project.tags.some(tag => tag.toLowerCase().includes(searchQuery)) ||
                project.institution.toLowerCase().includes(searchQuery)
            );
        }
        
        switch(this.sortBy) {
            case 'recent':
                projects.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
                break;
            case 'popular':
                projects.sort((a, b) => {
                    const engagementA = this.calculateProjectEngagement(a);
                    const engagementB = this.calculateProjectEngagement(b);
                    return engagementB - engagementA;
                });
                break;
            case 'title':
                projects.sort((a, b) => a.title.localeCompare(b.title));
                break;
        }
        
        this.renderProjects(projects, 'allProjectsList');
    }
    
    loadMyProjects() {
        if (this.isVisitor) {
            this.showToast('Visitors cannot create projects', 'warning');
            this.navigateTo('dashboard');
            return;
        }
        
        const projects = this.getProjects();
        const myProjects = projects.filter(p => p.ownerId === this.user.id);
        this.renderProjects(myProjects, 'myProjectsList');
    }
    
    loadProjectDetail(projectId) {
        const projects = this.getProjects();
        const project = projects.find(p => p.id === projectId);
        
        if (!project) {
            this.showToast('Project not found', 'error');
            this.navigateTo('projects');
            return;
        }
        
        this.currentProject = project;
        this.renderProjectDetail();
        this.showPage('projectDetail');
    }
    
    loadDiscussionDetail(discussionId) {
        const projects = this.getProjects();
        
        for (const project of projects) {
            if (project.discussions) {
                const discussion = project.discussions.find(d => d.id === discussionId);
                if (discussion) {
                    this.currentDiscussion = {
                        ...discussion,
                        projectId: project.id,
                        projectTitle: project.title,
                        projectOwnerId: project.ownerId,
                        projectInstitution: project.institution
                    };
                    this.renderDiscussionDetail();
                    this.showPage('discussionDetail');
                    return;
                }
            }
        }
        
        this.showToast('Discussion not found', 'error');
        this.navigateTo('dashboard');
    }
    
    // ========== PROJECT MANAGEMENT ==========
    
    createProject() {
        const title = document.getElementById('projectTitle').value.trim();
        const description = document.getElementById('projectDescription').value.trim();
        const tagsInput = document.getElementById('projectTags').value.trim();
        const institution = document.getElementById('projectInstitution').value.trim();
        const position = document.getElementById('projectPosition').value;
        
        if (!title || !description || !position) {
            this.showToast('Title, description, and position are required', 'error');
            return;
        }
        
        if (description.length > 2000) {
            this.showToast('Description must be 2000 characters or less', 'error');
            return;
        }
        
        const tags = tagsInput ? 
            tagsInput.split(',').map(t => t.trim()).filter(t => t) : [];
        
        const project = {
            id: `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            title: title,
            description: description,
            tags: tags,
            institution: institution || this.user.institution,
            ownerId: this.user.id,
            ownerName: this.user.name,
            ownerType: this.user.type,
            ownerPosition: position,
            teamMembers: [],
            discussions: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        const projects = this.getProjects();
        projects.push(project);
        this.saveJSON('thoraxlab_projects', projects);
        
        this.addActivity('project_created', `${this.user.name} started "${title}"`, project.id);
        this.updateTagsCount(tags);
        
        this.showToast('Project created successfully!', 'success');
        this.hideModal('newProjectModal');
        this.navigateTo(`project/${project.id}`);
    }
    
    // ========== RENDERING ==========
    
    renderProjects(projects, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        if (!projects.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📁</div>
                    <div class="empty-title">No projects found</div>
                    <p class="text-muted">${containerId === 'myProjectsList' ? 'Create your first research project' : 'Be the first to create a project'}</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = projects.map(project => {
            const discussionCount = project.discussions ? project.discussions.length : 0;
            const teamCount = project.teamMembers ? project.teamMembers.length : 0;
            
            return `
                <div class="project-card" data-project-id="${project.id}">
                    <div class="project-header">
                        <div class="project-type">
                            <i class="fas fa-flask"></i>
                            Research Project
                        </div>
                        <div class="project-institution">
                            <i class="fas fa-university"></i>
                            ${this.escapeHtml(project.institution || '')}
                        </div>
                    </div>
                    
                    <h3 class="project-title">${this.escapeHtml(project.title)}</h3>
                    
                    <p class="project-excerpt">
                        ${this.escapeHtml(project.description.substring(0, 150))}${project.description.length > 150 ? '...' : ''}
                    </p>
                    
                    <div class="project-tags">
                        ${project.tags.slice(0, 3).map(tag => `
                            <span class="project-tag">${this.escapeHtml(tag)}</span>
                        `).join('')}
                    </div>
                    
                    <div class="project-footer">
                        <div class="project-stats">
                            <div class="stat">
                                <i class="fas fa-comments"></i>
                                <span>${discussionCount}</span>
                            </div>
                            <div class="stat">
                                <i class="fas fa-users"></i>
                                <span>${teamCount}</span>
                            </div>
                        </div>
                        <div class="project-author">
                            <div class="author-avatar-small">${project.ownerName.substring(0, 2).toUpperCase()}</div>
                            <span>${this.escapeHtml(project.ownerName)}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        container.querySelectorAll('.project-card').forEach(card => {
            card.addEventListener('click', () => {
                const projectId = card.dataset.projectId;
                this.navigateTo(`project/${projectId}`);
            });
        });
    }
    
    renderDiscussions(discussions, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        if (!discussions.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">💬</div>
                    <div class="empty-title">No discussions yet</div>
                    <p class="text-muted">Start the first discussion in a project</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = discussions.map(disc => {
            const engagementScore = (disc.likes || 0) + (disc.comments || 0);
            const isElite = engagementScore >= 20;
            
            return `
                <div class="discussion-card" data-discussion-id="${disc.id}" data-project-id="${disc.projectId}">
                    <div class="discussion-header">
                        <div class="discussion-type type-${disc.type}">
                            <i class="${this.getDiscussionIcon(disc.type)}"></i>
                            <span>${disc.type}</span>
                        </div>
                        ${isElite ? `
                            <div class="elite-badge">
                                <i class="fas fa-crown"></i>
                                Elite Discussion
                            </div>
                        ` : ''}
                    </div>
                    
                    <h3 class="discussion-title">${this.escapeHtml(disc.title)}</h3>
                    
                    <p class="discussion-excerpt">
                        ${this.escapeHtml(disc.content.substring(0, 120))}${disc.content.length > 120 ? '...' : ''}
                    </p>
                    
                    <div class="discussion-meta">
                        <div class="author-info">
                            <div class="author-avatar">${disc.authorName.substring(0, 2).toUpperCase()}</div>
                            <div>
                                <div class="author-name">${this.escapeHtml(disc.authorName)}</div>
                                <div class="author-institution">${this.escapeHtml(disc.projectInstitution || '')}</div>
                            </div>
                        </div>
                        <div class="engagement-metrics">
                            <div class="metric">
                                <i class="fas fa-heart"></i>
                                <span>${disc.likes || 0}</span>
                            </div>
                            <div class="metric">
                                <i class="fas fa-comment"></i>
                                <span>${disc.comments || 0}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        container.querySelectorAll('.discussion-card').forEach(card => {
            card.addEventListener('click', () => {
                const discussionId = card.dataset.discussionId;
                this.navigateTo(`discussion/${discussionId}`);
            });
        });
    }
    
    renderProjectDetail() {
        const container = document.getElementById('projectDetailPage');
        if (!container || !this.currentProject) return;
        
        const project = this.currentProject;
        const isOwner = !this.isVisitor && project.ownerId === this.user.id;
        
        container.innerHTML = `
            <div class="page-header">
                <button class="btn btn-elite-secondary mb-4" onclick="app.navigateTo('projects')">
                    <i class="fas fa-arrow-left"></i>
                    Back to Projects
                </button>
                <h1 class="page-title">${this.escapeHtml(project.title)}</h1>
                <p class="page-subtitle">${this.escapeHtml(project.institution || '')} • Led by ${this.escapeHtml(project.ownerName)}</p>
            </div>
            
            <div class="dashboard-grid">
                <div class="col-span-8">
                    <div class="elite-card">
                        <div class="card-header">
                            <h2 class="card-title">
                                <i class="card-icon fas fa-book-open"></i>
                                Project Overview
                            </h2>
                            ${isOwner ? `
                                <button class="btn btn-elite-primary btn-sm" onclick="app.showModal('newDiscussionModal')">
                                    <i class="fas fa-plus"></i>
                                    New Discussion
                                </button>
                            ` : ''}
                        </div>
                        
                        <div class="mb-6">
                            <h3 class="mb-2">Description</h3>
                            <p>${this.escapeHtml(project.description)}</p>
                        </div>
                        
                        <div class="mb-6">
                            <h3 class="mb-2">Research Domains</h3>
                            <div class="project-tags">
                                ${project.tags.map(tag => `
                                    <span class="project-tag">${this.escapeHtml(tag)}</span>
                                `).join('')}
                            </div>
                        </div>
                        
                        <div>
                            <h3 class="mb-2">Project Team</h3>
                            <div class="space-y-3">
                                <div class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                                    <div class="author-avatar-small">${project.ownerName.substring(0, 2).toUpperCase()}</div>
                                    <div>
                                        <div class="author-name">${this.escapeHtml(project.ownerName)}</div>
                                        <div class="text-muted">${project.ownerPosition} • Project Lead</div>
                                    </div>
                                </div>
                                ${project.teamMembers.map(member => `
                                    <div class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                                        <div class="author-avatar-small">${member.name.substring(0, 2).toUpperCase()}</div>
                                        <div>
                                            <div class="author-name">${this.escapeHtml(member.name)}</div>
                                            <div class="text-muted">${member.position}</div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="col-span-4">
                    <div class="elite-card">
                        <div class="card-header">
                            <h2 class="card-title">
                                <i class="card-icon fas fa-chart-bar"></i>
                                Project Stats
                            </h2>
                        </div>
                        
                        <div class="space-y-4">
                            <div>
                                <div class="text-muted">Created</div>
                                <div class="font-semibold">${this.formatDate(project.createdAt)}</div>
                            </div>
                            <div>
                                <div class="text-muted">Last Updated</div>
                                <div class="font-semibold">${this.formatDate(project.updatedAt)}</div>
                            </div>
                            <div>
                                <div class="text-muted">Discussions</div>
                                <div class="font-semibold">${project.discussions?.length || 0}</div>
                            </div>
                            <div>
                                <div class="text-muted">Team Members</div>
                                <div class="font-semibold">${project.teamMembers?.length || 0}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            ${project.discussions?.length ? `
                <div class="mt-8">
                    <h2 class="mb-4">Discussions (${project.discussions.length})</h2>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        ${project.discussions.map(disc => `
                            <div class="discussion-card" data-discussion-id="${disc.id}">
                                <div class="discussion-type type-${disc.type}">
                                    <i class="${this.getDiscussionIcon(disc.type)}"></i>
                                    ${disc.type}
                                </div>
                                <h3 class="discussion-title">${this.escapeHtml(disc.title)}</h3>
                                <p class="discussion-excerpt">${this.escapeHtml(disc.content.substring(0, 100))}...</p>
                                <div class="discussion-meta">
                                    <div class="author-info">
                                        <div class="author-avatar">${disc.authorName.substring(0, 2).toUpperCase()}</div>
                                        <div class="author-name">${this.escapeHtml(disc.authorName)}</div>
                                    </div>
                                    <div class="engagement-metrics">
                                        <div class="metric">
                                            <i class="fas fa-heart"></i>
                                            <span>${disc.likes || 0}</span>
                                        </div>
                                        <div class="metric">
                                            <i class="fas fa-comment"></i>
                                            <span>${disc.comments || 0}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
        `;
        
        container.querySelectorAll('.discussion-card').forEach(card => {
            card.addEventListener('click', () => {
                const discussionId = card.dataset.discussionId;
                this.navigateTo(`discussion/${discussionId}`);
            });
        });
    }
    
    // ========== UTILITY METHODS ==========
    
    getProjects() {
        return this.loadJSON('thoraxlab_projects') || [];
    }
    
    getActivities() {
        return this.loadJSON('thoraxlab_activity') || [];
    }
    
    getTags() {
        return this.loadJSON('thoraxlab_tags') || {};
    }
    
    addActivity(type, description, projectId = null, discussionId = null) {
        const activities = this.getActivities();
        activities.unshift({
            id: `act_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: type,
            title: type.replace('_', ' ').toUpperCase(),
            description: description,
            timestamp: new Date().toISOString(),
            userId: this.user?.id,
            projectId: projectId,
            discussionId: discussionId
        });
        
        if (activities.length > 100) {
            activities.length = 100;
        }
        
        this.saveJSON('thoraxlab_activity', activities);
    }
    
    updateTagsCount(newTags) {
        const tags = this.getTags();
        
        newTags.forEach(tag => {
            if (tags[tag]) {
                tags[tag].count += 1;
            } else {
                tags[tag] = { count: 1, frequency: 'low' };
            }
        });
        
        this.saveJSON('thoraxlab_tags', tags);
    }
    
    toggleTag(tag) {
        if (this.selectedTags.has(tag)) {
            this.selectedTags.delete(tag);
        } else {
            this.selectedTags.add(tag);
        }
        
        document.querySelectorAll(`[data-tag="${tag}"]`).forEach(el => {
            el.classList.toggle('active', this.selectedTags.has(tag));
        });
        
        if (window.location.hash.includes('projects')) {
            this.loadAllProjects();
        }
    }
    
    calculateProjectEngagement(project) {
        if (!project.discussions) return 0;
        return project.discussions.reduce((sum, disc) => {
            return sum + (disc.likes || 0) + (disc.comments || 0);
        }, 0);
    }
    
    getActivityIcon(type) {
        const icons = {
            'project_created': '<i class="fas fa-project-diagram"></i>',
            'discussion_started': '<i class="fas fa-comments"></i>',
            'comment_added': '<i class="fas fa-comment-medical"></i>',
            'user_joined': '<i class="fas fa-user-plus"></i>'
        };
        return icons[type] || '<i class="fas fa-bell"></i>';
    }
    
    getDiscussionIcon(type) {
        const icons = {
            'brainstorm': 'fas fa-lightbulb',
            'question': 'fas fa-question-circle',
            'decision': 'fas fa-gavel',
            'insight': 'fas fa-eye'
        };
        return icons[type] || 'fas fa-comments';
    }
    
    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric' 
        });
    }
    
    formatTimeAgo(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) {
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            if (diffHours === 0) {
                const diffMinutes = Math.floor(diffMs / (1000 * 60));
                return diffMinutes <= 1 ? 'Just now' : `${diffMinutes}m ago`;
            }
            return diffHours === 1 ? '1 hour ago' : `${diffHours}h ago`;
        } else if (diffDays === 1) {
            return 'Yesterday';
        } else if (diffDays < 7) {
            return `${diffDays}d ago`;
        } else if (diffDays < 30) {
            const weeks = Math.floor(diffDays / 7);
            return `${weeks}w ago`;
        } else {
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
    }
    
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // ========== MODAL MANAGEMENT ==========
    
    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }
    
    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
            
            const form = modal.querySelector('form');
            if (form) form.reset();
        }
    }
    
    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) return;
        
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };
        
        toast.innerHTML = `
            <i class="fas ${icons[type]} toast-icon"></i>
            <div class="toast-content">
                <span>${this.escapeHtml(message)}</span>
            </div>
            <button class="toast-close">&times;</button>
        `;
        
        container.appendChild(toast);
        
        toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
        
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }
    
    // ========== EVENT LISTENERS ==========
    
    setupEventListeners() {
        // Auth buttons
        document.getElementById('professionalLoginBtn')?.addEventListener('click', () => {
            document.getElementById('professionalForm').classList.remove('hidden');
            document.getElementById('visitorForm').classList.add('hidden');
            document.querySelectorAll('.auth-choice-btn').forEach(btn => btn.classList.remove('active'));
            event.currentTarget.classList.add('active');
        });
        
        document.getElementById('visitorLoginBtn')?.addEventListener('click', () => {
            document.getElementById('visitorForm').classList.remove('hidden');
            document.getElementById('professionalForm').classList.add('hidden');
            document.querySelectorAll('.auth-choice-btn').forEach(btn => btn.classList.remove('active'));
            event.currentTarget.classList.add('active');
        });
        
        document.getElementById('professionalForm')?.addEventListener('submit', (e) => this.loginAsProfessional(e));
        document.getElementById('visitorForm')?.addEventListener('submit', (e) => this.loginAsVisitor(e));
        
        // Logout
        document.getElementById('logoutBtn')?.addEventListener('click', () => this.logout());
        
        // New project buttons
        document.getElementById('newProjectBtn')?.addEventListener('click', () => this.showModal('newProjectModal'));
        document.getElementById('createMyProjectBtn')?.addEventListener('click', () => this.showModal('newProjectModal'));
        
        // Project form
        document.getElementById('projectForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.createProject();
        });
        
        // Search and filters
        document.getElementById('projectSearch')?.addEventListener('input', () => this.loadAllProjects());
        document.getElementById('discussionSearch')?.addEventListener('input', () => this.loadFeaturedDiscussions());
        
        // Activity filters
        document.querySelectorAll('.activity-filter').forEach(filter => {
            filter.addEventListener('click', (e) => {
                document.querySelectorAll('.activity-filter').forEach(f => f.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.activityFilter = e.currentTarget.dataset.filter;
                this.loadActivityFeed();
            });
        });
        
        // View all buttons
        document.getElementById('viewAllProjectsBtn')?.addEventListener('click', () => this.navigateTo('projects'));
        
        // Quick actions
        document.getElementById('quickActionsMainBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const menu = document.getElementById('quickActionsDropdown');
            menu.classList.toggle('active');
        });
        
        document.querySelectorAll('.quick-action-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const action = e.currentTarget.dataset.action;
                if (action === 'new-project') {
                    this.showModal('newProjectModal');
                } else if (action === 'new-discussion') {
                    this.showToast('Start discussion from a project page', 'info');
                } else if (action === 'request-review') {
                    this.showToast('Expert review request feature coming soon', 'info');
                }
                document.getElementById('quickActionsDropdown').classList.remove('active');
            });
        });
        
        // Close quick actions when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.quick-actions-menu')) {
                document.getElementById('quickActionsDropdown').classList.remove('active');
            }
        });
        
        // Modal close buttons
        document.querySelectorAll('.modal-close, [id^="cancel"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                if (modal) {
                    this.hideModal(modal.id);
                }
            });
        });
        
        // Close modals on outside click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideModal(modal.id);
                }
            });
        });
        
        // Character counters
        document.getElementById('projectDescription')?.addEventListener('input', (e) => {
            const counter = document.getElementById('descCounter');
            counter.textContent = `${e.target.value.length}/2000`;
            counter.classList.toggle('near-limit', e.target.value.length > 1800);
            counter.classList.toggle('over-limit', e.target.value.length > 2000);
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                document.getElementById('projectSearch')?.focus();
            }
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal.active').forEach(modal => {
                    this.hideModal(modal.id);
                });
                document.getElementById('quickActionsDropdown').classList.remove('active');
            }
        });
    }
}

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    window.app = new ThoraxLabPro();
    
    // Add slideOut animation for toasts
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideOut {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(100%);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);
});
