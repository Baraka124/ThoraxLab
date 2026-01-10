// ============================================
// ThoraxLab Pro - Clinical Innovation Platform
// Enhanced Professional Design with Modern UX
// ============================================

class ThoraxLabPro {
    constructor() {
        // User data
        this.user = this.loadJSON('thoraxlab_user') || null;
        this.isVisitor = this.loadJSON('thoraxlab_visitor') || false;
        
        // Application state
        this.currentProject = null;
        this.currentDiscussion = null;
        this.selectedTags = new Set();
        this.activityFilter = 'all';
        this.projectSort = 'recent';
        
        // Initialize
        this.initialize();
    }
    
    // ========== INITIALIZATION ==========
    
    initialize() {
        this.initializeDemoData();
        this.setupEventListeners();
        this.setupRouter();
        this.checkAuth();
        this.setupQuickActions();
    }
    
    // ========== JSON DATA MANAGEMENT ==========
    
    loadJSON(key) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error(`Error loading ${key}:`, error);
            return null;
        }
    }
    
    saveJSON(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (error) {
            console.error(`Error saving ${key}:`, error);
        }
    }
    
    // ========== DEMO DATA ==========
    
    initializeDemoData() {
        // Initialize projects if not exists
        if (!this.loadJSON('thoraxlab_projects')) {
            const demoProjects = [
                {
                    id: 'proj_1',
                    title: 'AI-Powered COPD Exacerbation Prediction',
                    description: 'Developing machine learning models to predict COPD exacerbations 48 hours in advance using patient vitals, spirometry data, and environmental factors. This innovation aims to reduce hospital readmissions by enabling early intervention.',
                    tags: ['AI', 'COPD', 'prediction', 'machine learning', 'pulmonary'],
                    ownerId: 'demo_user_1',
                    ownerName: 'Dr. Sarah Chen',
                    ownerType: 'clinical',
                    ownerPosition: 'Principal Investigator',
                    institution: 'Cambridge University Hospitals',
                    teamMembers: [
                        { id: 'member_1', name: 'Dr. Michael Johnson', type: 'clinical', position: 'Co-Investigator' },
                        { id: 'member_2', name: 'Dr. Lisa Wang', type: 'academic', position: 'Data Scientist' }
                    ],
                    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
                    updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
                    discussions: [
                        {
                            id: 'disc_1',
                            title: 'Which clinical features are most predictive?',
                            content: 'We need to decide on the most important clinical features for our prediction model. Should we prioritize spirometry data, patient-reported symptoms, or environmental factors? Clinical relevance and statistical significance both need consideration.',
                            type: 'brainstorm',
                            tags: ['clinical features', 'spirometry', 'patient-reported outcomes'],
                            authorId: 'demo_user_1',
                            authorName: 'Dr. Sarah Chen',
                            authorType: 'clinical',
                            createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
                            likes: 24,
                            comments: 12,
                            views: 156,
                            commentsList: [
                                {
                                    id: 'comment_1',
                                    content: 'Based on our preliminary analysis, spirometry data shows the highest correlation with exacerbation events. The FEV1/FVC ratio appears particularly significant.',
                                    type: 'analysis',
                                    authorName: 'Dr. Michael Johnson',
                                    authorType: 'clinical',
                                    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
                                    likes: 8
                                }
                            ]
                        }
                    ]
                },
                {
                    id: 'proj_2',
                    title: 'Genomic Biomarkers for Immunotherapy Response in NSCLC',
                    description: 'Identifying genomic signatures that predict response to immune checkpoint inhibitors in non-small cell lung cancer. Multi-center collaboration with genomic sequencing data from 500+ patients across 12 institutions.',
                    tags: ['genomics', 'oncology', 'immunotherapy', 'biomarkers', 'NSCLC'],
                    ownerId: 'demo_user_2',
                    ownerName: 'Prof. Robert Kim',
                    ownerType: 'academic',
                    ownerPosition: 'Principal Investigator',
                    institution: 'Oxford University',
                    teamMembers: [
                        { id: 'member_3', name: 'Dr. Emma Davis', type: 'industry', position: 'Genomics Specialist' }
                    ],
                    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
                    updatedAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
                    discussions: [
                        {
                            id: 'disc_2',
                            title: 'Tumor Mutational Burden vs PD-L1 Expression',
                            content: 'We need to determine which biomarker shows stronger predictive value for immunotherapy response in our cohort. Both TMB and PD-L1 have shown promise, but their relative importance needs clarification.',
                            type: 'question',
                            tags: ['biomarkers', 'immunotherapy', 'predictive analytics'],
                            authorId: 'demo_user_2',
                            authorName: 'Prof. Robert Kim',
                            authorType: 'academic',
                            createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
                            likes: 18,
                            comments: 9,
                            views: 89,
                            commentsList: []
                        }
                    ]
                }
            ];
            
            this.saveJSON('thoraxlab_projects', demoProjects);
        }
        
        // Initialize activity if not exists
        if (!this.loadJSON('thoraxlab_activity')) {
            const demoActivity = [
                {
                    id: 'act_1',
                    type: 'project_created',
                    title: 'New Project Created',
                    description: 'Dr. Sarah Chen initiated "AI-Powered COPD Exacerbation Prediction"',
                    timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
                    userId: 'demo_user_1',
                    projectId: 'proj_1'
                },
                {
                    id: 'act_2',
                    type: 'discussion_started',
                    title: 'Discussion Started',
                    description: 'Dr. Sarah Chen asked "Which clinical features are most predictive?"',
                    timestamp: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
                    userId: 'demo_user_1',
                    discussionId: 'disc_1'
                },
                {
                    id: 'act_3',
                    type: 'comment_added',
                    title: 'Expert Insight Added',
                    description: 'Dr. Michael Johnson contributed to the COPD prediction discussion',
                    timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
                    userId: 'demo_user_1',
                    discussionId: 'disc_1'
                }
            ];
            
            this.saveJSON('thoraxlab_activity', demoActivity);
        }
        
        // Initialize tags if not exists
        if (!this.loadJSON('thoraxlab_tags')) {
            const demoTags = {
                'AI': { count: 15, frequency: 'high' },
                'COPD': { count: 8, frequency: 'medium' },
                'machine learning': { count: 12, frequency: 'high' },
                'genomics': { count: 10, frequency: 'high' },
                'oncology': { count: 9, frequency: 'medium' },
                'immunotherapy': { count: 7, frequency: 'medium' },
                'digital health': { count: 6, frequency: 'medium' },
                'biomarkers': { count: 8, frequency: 'medium' },
                'pulmonary': { count: 6, frequency: 'low' }
            };
            
            this.saveJSON('thoraxlab_tags', demoTags);
        }
        
        // Initialize likes if not exists
        if (!this.loadJSON('thoraxlab_likes')) {
            this.saveJSON('thoraxlab_likes', {});
        }
    }
    
    // ========== AUTHENTICATION ==========
    
    checkAuth() {
        if (this.user) {
            this.showApp();
            this.updateUserDisplay();
            this.loadDashboard();
        } else {
            this.showAuth();
        }
    }
    
    showAuth() {
        document.getElementById('authScreen')?.classList.remove('hidden');
        document.getElementById('mainApp')?.classList.add('hidden');
    }
    
    showApp() {
        document.getElementById('authScreen')?.classList.add('hidden');
        document.getElementById('mainApp')?.classList.remove('hidden');
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
        this.loadDashboard();
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
        this.loadDashboard();
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
        const createMyProjectBtn = document.getElementById('createMyProjectBtn');
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
        
        if (createMyProjectBtn) {
            createMyProjectBtn.classList.toggle('hidden', this.isVisitor);
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
        
        const page = parts[0];
        this.showPage(page);
        
        if (page === 'project' && parts[1]) {
            this.loadProjectDetail(parts[1]);
        } else if (page === 'discussion' && parts[1]) {
            this.loadDiscussionDetail(parts[1]);
        }
        
        this.updateNavigation(page);
    }
    
    showPage(page) {
        // Hide all pages
        document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
        
        // Show requested page
        const pageElement = document.getElementById(`${page}Page`);
        if (pageElement) {
            pageElement.classList.remove('hidden');
            
            // Load page-specific content
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
        if (!this.user) return;
        
        if (this.isVisitor) {
            const container = document.getElementById('userStats');
            if (container) {
                container.innerHTML = `
                    <div class="stats-grid">
                        <div class="stat-card">
                            <div class="stat-icon">
                                <i class="fas fa-eye"></i>
                            </div>
                            <div class="stat-content">
                                <div class="stat-number">Guest</div>
                                <div class="stat-label">Viewing Mode</div>
                            </div>
                        </div>
                    </div>
                `;
            }
            return;
        }
        
        const projects = this.getProjects();
        const userProjects = projects.filter(p => p.ownerId === this.user?.id);
        const userDiscussions = projects.reduce((count, project) => {
            if (project.discussions) {
                return count + project.discussions.filter(d => d.authorId === this.user?.id).length;
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
            filteredActivities = activities.filter(act => act.type && act.type.includes(this.activityFilter));
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
                        institution: project.institution
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
        
        // Apply tag filters
        if (this.selectedTags.size > 0) {
            projects = projects.filter(project => 
                project.tags && project.tags.some(tag => this.selectedTags.has(tag))
            );
        }
        
        // Apply search filter
        const searchQuery = document.getElementById('projectSearch')?.value.toLowerCase() || '';
        if (searchQuery) {
            projects = projects.filter(project => 
                project.title.toLowerCase().includes(searchQuery) ||
                project.description.toLowerCase().includes(searchQuery) ||
                (project.tags && project.tags.some(tag => tag.toLowerCase().includes(searchQuery))) ||
                project.institution.toLowerCase().includes(searchQuery)
            );
        }
        
        // Apply sorting
        switch(this.projectSort) {
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
        const myProjects = projects.filter(p => p.ownerId === this.user?.id);
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
                        institution: project.institution
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
    
    // ========== RENDERING METHODS ==========
    
    renderProjects(projects, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        if (!projects.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📁</div>
                    <div class="empty-title">No projects found</div>
                    <p class="text-muted">${containerId === 'myProjectsList' ? 'Create your first research project' : 'Be the first to create a project'}</p>
                    ${containerId === 'myProjectsList' && !this.isVisitor ? `
                        <button class="btn btn-primary mt-4" onclick="app.showModal('newProjectModal')">
                            <i class="fas fa-plus"></i>
                            Create First Project
                        </button>
                    ` : ''}
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
                        ${(project.tags || []).slice(0, 3).map(tag => `
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
            const isFeatured = engagementScore >= 15;
            
            return `
                <div class="discussion-card" data-discussion-id="${disc.id}" data-project-id="${disc.projectId}">
                    <div class="discussion-header">
                        <div class="discussion-type type-${disc.type}">
                            <i class="${this.getDiscussionIcon(disc.type)}"></i>
                            <span>${disc.type}</span>
                        </div>
                        ${isFeatured ? `
                            <div class="featured-badge">
                                <i class="fas fa-star"></i>
                                Featured
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
                                <div class="author-institution">${this.escapeHtml(disc.institution || '')}</div>
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
        const isOwner = !this.isVisitor && project.ownerId === this.user?.id;
        const discussionCount = project.discussions ? project.discussions.length : 0;
        const teamCount = project.teamMembers ? project.teamMembers.length : 0;
        const isTeamMember = project.teamMembers?.some(member => member.id === this.user?.id) || isOwner;
        const canStartDiscussion = !this.isVisitor && (isOwner || isTeamMember);
        
        container.innerHTML = `
            <div class="page-header">
                <button class="btn btn-secondary mb-4" onclick="app.navigateTo('projects')">
                    <i class="fas fa-arrow-left"></i>
                    Back to Projects
                </button>
                <div class="flex items-start justify-between">
                    <div>
                        <h1 class="page-title">${this.escapeHtml(project.title)}</h1>
                        <p class="page-subtitle">${this.escapeHtml(project.institution || '')} • Led by ${this.escapeHtml(project.ownerName)}</p>
                    </div>
                    ${isOwner ? `
                        <div class="flex gap-2">
                            <button class="btn btn-outline" onclick="app.showEditProjectModal('${project.id}')">
                                <i class="fas fa-edit"></i>
                                Edit
                            </button>
                            <button class="btn btn-outline" onclick="app.showAddTeamMemberModal('${project.id}')">
                                <i class="fas fa-user-plus"></i>
                                Add Member
                            </button>
                        </div>
                    ` : ''}
                </div>
            </div>
            
            <div class="dashboard-grid">
                <div class="col-span-8">
                    <div class="card">
                        <div class="card-header">
                            <h2 class="card-title">
                                <i class="card-icon fas fa-book-open"></i>
                                Project Overview
                            </h2>
                            ${canStartDiscussion ? `
                                <button class="btn btn-primary btn-sm" onclick="app.showNewDiscussionModal('${project.id}')">
                                    <i class="fas fa-plus"></i>
                                    New Discussion
                                </button>
                            ` : ''}
                        </div>
                        
                        <div class="mb-6">
                            <h3 class="mb-2">Description</h3>
                            <p class="text-lead">${this.escapeHtml(project.description)}</p>
                        </div>
                        
                        <div class="mb-6">
                            <h3 class="mb-2">Research Domains</h3>
                            <div class="project-tags">
                                ${(project.tags || []).map(tag => `
                                    <span class="project-tag">${this.escapeHtml(tag)}</span>
                                `).join('')}
                            </div>
                        </div>
                        
                        <div>
                            <h3 class="mb-2">Project Team</h3>
                            <div class="space-y-3">
                                <div class="flex items-center gap-3 p-3 bg-surface rounded-lg">
                                    <div class="author-avatar-small">${project.ownerName.substring(0, 2).toUpperCase()}</div>
                                    <div>
                                        <div class="author-name">${this.escapeHtml(project.ownerName)}</div>
                                        <div class="text-muted">${project.ownerPosition} • Project Lead</div>
                                    </div>
                                </div>
                                ${(project.teamMembers || []).map(member => `
                                    <div class="flex items-center gap-3 p-3 bg-surface rounded-lg">
                                        <div class="author-avatar-small">${member.name.substring(0, 2).toUpperCase()}</div>
                                        <div>
                                            <div class="author-name">${this.escapeHtml(member.name)}</div>
                                            <div class="text-muted">${member.position}</div>
                                        </div>
                                        ${isOwner ? `
                                            <button class="ml-auto text-muted hover:text-error" onclick="app.removeTeamMember('${project.id}', '${member.id}')">
                                                <i class="fas fa-times"></i>
                                            </button>
                                        ` : ''}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="col-span-4">
                    <div class="card">
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
                                <div class="font-semibold">${discussionCount}</div>
                            </div>
                            <div>
                                <div class="text-muted">Team Members</div>
                                <div class="font-semibold">${teamCount + 1}</div>
                            </div>
                        </div>
                    </div>
                    
                    ${!isOwner && !isTeamMember && !this.isVisitor ? `
                        <div class="card mt-4">
                            <h3 class="mb-3">Join this Project</h3>
                            <p class="text-sm text-muted mb-3">Request to join as a collaborator</p>
                            <button class="btn btn-outline w-full" onclick="app.requestToJoinProject('${project.id}')">
                                <i class="fas fa-user-plus"></i>
                                Request to Join
                            </button>
                        </div>
                    ` : ''}
                </div>
            </div>
            
            ${discussionCount > 0 ? `
                <div class="mt-8">
                    <h2 class="mb-4">Discussions (${discussionCount})</h2>
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
            ` : `
                <div class="mt-8 text-center">
                    <div class="empty-icon">💬</div>
                    <h3 class="mb-2">No discussions yet</h3>
                    <p class="text-muted mb-4">Be the first to start a discussion in this project</p>
                    ${canStartDiscussion ? `
                        <button class="btn btn-primary" onclick="app.showNewDiscussionModal('${project.id}')">
                            <i class="fas fa-plus"></i>
                            Start First Discussion
                        </button>
                    ` : ''}
                </div>
            `}
        `;
        
        container.querySelectorAll('.discussion-card').forEach(card => {
            card.addEventListener('click', () => {
                const discussionId = card.dataset.discussionId;
                this.navigateTo(`discussion/${discussionId}`);
            });
        });
    }
    
    renderDiscussionDetail() {
        const container = document.getElementById('discussionDetailPage');
        if (!container || !this.currentDiscussion) return;
        
        const discussion = this.currentDiscussion;
        const isAuthor = !this.isVisitor && discussion.authorId === this.user?.id;
        const canComment = !this.isVisitor;
        const liked = this.hasLikedDiscussion(discussion.id);
        
        container.innerHTML = `
            <div class="page-header">
                <button class="btn btn-secondary mb-4" onclick="app.navigateTo('project/${discussion.projectId}')">
                    <i class="fas fa-arrow-left"></i>
                    Back to Project
                </button>
                <h1 class="page-title">${this.escapeHtml(discussion.title)}</h1>
                <p class="page-subtitle">${this.escapeHtml(discussion.projectTitle)} • ${this.formatDate(discussion.createdAt)}</p>
            </div>
            
            <div class="dashboard-grid">
                <div class="col-span-8">
                    <div class="card">
                        <div class="discussion-header">
                            <div class="discussion-type type-${discussion.type}">
                                <i class="${this.getDiscussionIcon(discussion.type)}"></i>
                                <span>${discussion.type}</span>
                            </div>
                            <div class="flex items-center gap-4">
                                <span class="text-muted">
                                    <i class="fas fa-eye"></i> ${discussion.views || 0} views
                                </span>
                                <button class="btn btn-ghost btn-sm ${liked ? 'text-red-500' : ''}" 
                                        onclick="app.toggleDiscussionLike('${discussion.id}')">
                                    <i class="fas fa-heart ${liked ? 'fas' : 'far'}"></i> ${discussion.likes || 0}
                                </button>
                            </div>
                        </div>
                        
                        <div class="mb-6">
                            <div class="author-info mb-4">
                                <div class="author-avatar">${discussion.authorName.substring(0, 2).toUpperCase()}</div>
                                <div>
                                    <div class="author-name">${this.escapeHtml(discussion.authorName)}</div>
                                    <div class="author-institution">${this.escapeHtml(discussion.institution || '')}</div>
                                </div>
                            </div>
                            
                            <div class="prose max-w-none">
                                ${this.escapeHtml(discussion.content).replace(/\n/g, '<br>')}
                            </div>
                        </div>
                        
                        <div class="discussion-meta">
                            <div class="text-muted">
                                Started ${this.formatTimeAgo(discussion.createdAt)}
                            </div>
                            ${isAuthor ? `
                                <div class="flex gap-2">
                                    <button class="btn btn-outline btn-sm" onclick="app.showEditDiscussionModal('${discussion.id}')">
                                        <i class="fas fa-edit"></i>
                                        Edit
                                    </button>
                                    <button class="btn btn-outline btn-sm text-error" onclick="app.deleteDiscussion('${discussion.id}')">
                                        <i class="fas fa-trash"></i>
                                        Delete
                                    </button>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                    
                    <div class="mt-8">
                        <h2 class="mb-4">Comments (${discussion.comments || 0})</h2>
                        
                        ${(discussion.commentsList && discussion.commentsList.length > 0) ? `
                            <div class="space-y-4">
                                ${discussion.commentsList.map(comment => {
                                    const commentLiked = this.hasLikedComment(comment.id);
                                    return `
                                        <div class="card">
                                            <div class="author-info mb-3">
                                                <div class="author-avatar">${comment.authorName.substring(0, 2).toUpperCase()}</div>
                                                <div>
                                                    <div class="author-name">${this.escapeHtml(comment.authorName)}</div>
                                                    <div class="author-institution">${this.escapeHtml(comment.authorInstitution || '')}</div>
                                                </div>
                                            </div>
                                            <p>${this.escapeHtml(comment.content)}</p>
                                            <div class="discussion-meta mt-3">
                                                <div class="text-muted">
                                                    ${this.formatTimeAgo(comment.createdAt)}
                                                </div>
                                                <button class="btn btn-ghost btn-sm ${commentLiked ? 'text-red-500' : ''}" 
                                                        onclick="app.toggleCommentLike('${comment.id}')">
                                                    <i class="fas fa-heart ${commentLiked ? 'fas' : 'far'}"></i> ${comment.likes || 0}
                                                </button>
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        ` : `
                            <div class="text-center py-8">
                                <div class="empty-icon">💬</div>
                                <h3 class="mb-2">No comments yet</h3>
                                <p class="text-muted">Be the first to contribute to this discussion</p>
                            </div>
                        `}
                        
                        ${canComment ? `
                            <div class="mt-6">
                                <div class="card">
                                    <h3 class="mb-3">Add Your Insight</h3>
                                    <div class="form-group">
                                        <textarea id="quickComment" class="form-input form-textarea" 
                                                  placeholder="Share your expert perspective, analysis, or recommendation..."
                                                  rows="3" maxlength="1000"></textarea>
                                        <div class="char-counter" id="quickCommentCounter">0/1000</div>
                                    </div>
                                    <button class="btn btn-primary mt-2" onclick="app.addQuickComment('${discussion.id}')">
                                        <i class="fas fa-paper-plane"></i>
                                        Post Comment
                                    </button>
                                </div>
                            </div>
                        ` : `
                            <div class="mt-6 p-4 bg-warning-50 border border-warning-200 rounded-lg text-center">
                                <i class="fas fa-info-circle text-warning-500 mr-2"></i>
                                <span class="text-warning-700">Guest researchers can view but cannot contribute to discussions</span>
                            </div>
                        `}
                    </div>
                </div>
                
                <div class="col-span-4">
                    <div class="card">
                        <div class="card-header">
                            <h2 class="card-title">
                                <i class="card-icon fas fa-info-circle"></i>
                                Discussion Info
                            </h2>
                        </div>
                        
                        <div class="space-y-4">
                            <div>
                                <div class="text-muted">Project</div>
                                <div class="font-semibold">${this.escapeHtml(discussion.projectTitle)}</div>
                            </div>
                            <div>
                                <div class="text-muted">Type</div>
                                <div class="discussion-type type-${discussion.type} inline-flex">
                                    <i class="${this.getDiscussionIcon(discussion.type)}"></i>
                                    <span>${discussion.type}</span>
                                </div>
                            </div>
                            <div>
                                <div class="text-muted">Started</div>
                                <div class="font-semibold">${this.formatDate(discussion.createdAt)}</div>
                            </div>
                            <div>
                                <div class="text-muted">Engagement</div>
                                <div class="flex items-center gap-4">
                                    <span><i class="fas fa-heart text-red-500"></i> ${discussion.likes || 0}</span>
                                    <span><i class="fas fa-comment text-primary"></i> ${discussion.comments || 0}</span>
                                    <span><i class="fas fa-eye text-muted"></i> ${discussion.views || 0}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Update view count
        this.incrementDiscussionViews(discussion.id);
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
        
        // Add activity
        this.addActivity({
            type: 'project_created',
            description: `${this.user.name} started "${title}"`,
            projectId: project.id
        });
        
        // Update tags
        this.updateTagsCount(tags);
        
        this.showToast('Project created successfully!', 'success');
        this.hideModal('newProjectModal');
        this.navigateTo(`project/${project.id}`);
    }
    
    createDiscussion() {
        const projectId = document.getElementById('discussionProjectId').value;
        const title = document.getElementById('discussionTitle').value.trim();
        const content = document.getElementById('discussionContent').value.trim();
        const type = document.querySelector('.discussion-type-btn.active')?.dataset.type || 'brainstorm';
        
        if (!title || !content) {
            this.showToast('Topic and description are required', 'error');
            return;
        }
        
        if (content.length > 5000) {
            this.showToast('Description must be 5000 characters or less', 'error');
            return;
        }
        
        const discussion = {
            id: `disc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            title: title,
            content: content,
            type: type,
            authorId: this.user.id,
            authorName: this.user.name,
            authorType: this.user.type,
            createdAt: new Date().toISOString(),
            likes: 0,
            comments: 0,
            views: 0,
            commentsList: []
        };
        
        const projects = this.getProjects();
        const projectIndex = projects.findIndex(p => p.id === projectId);
        
        if (projectIndex === -1) {
            this.showToast('Project not found', 'error');
            return;
        }
        
        if (!projects[projectIndex].discussions) {
            projects[projectIndex].discussions = [];
        }
        
        projects[projectIndex].discussions.push(discussion);
        projects[projectIndex].updatedAt = new Date().toISOString();
        this.saveJSON('thoraxlab_projects', projects);
        
        // Add activity
        this.addActivity({
            type: 'discussion_started',
            description: `${this.user.name} started discussion "${title}"`,
            projectId: projectId,
            discussionId: discussion.id
        });
        
        this.showToast('Discussion started successfully!', 'success');
        this.hideModal('newDiscussionModal');
        this.navigateTo(`discussion/${discussion.id}`);
    }
    
    addComment() {
        const discussionId = document.getElementById('commentDiscussionId').value;
        const content = document.getElementById('commentContent').value.trim();
        
        if (!content) {
            this.showToast('Comment content is required', 'error');
            return;
        }
        
        this.addCommentToDiscussion(discussionId, content);
    }
    
    addQuickComment(discussionId) {
        const content = document.getElementById('quickComment').value.trim();
        
        if (!content) {
            this.showToast('Comment content is required', 'error');
            return;
        }
        
        if (content.length > 1000) {
            this.showToast('Comment must be 1000 characters or less', 'error');
            return;
        }
        
        this.addCommentToDiscussion(discussionId, content);
        document.getElementById('quickComment').value = '';
        document.getElementById('quickCommentCounter').textContent = '0/1000';
    }
    
    addCommentToDiscussion(discussionId, content) {
        const comment = {
            id: `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            content: content,
            authorId: this.user.id,
            authorName: this.user.name,
            authorType: this.user.type,
            authorInstitution: this.user.institution,
            createdAt: new Date().toISOString(),
            likes: 0
        };
        
        const projects = this.getProjects();
        let discussionUpdated = false;
        
        for (const project of projects) {
            if (project.discussions) {
                const discussionIndex = project.discussions.findIndex(d => d.id === discussionId);
                if (discussionIndex !== -1) {
                    if (!project.discussions[discussionIndex].commentsList) {
                        project.discussions[discussionIndex].commentsList = [];
                    }
                    project.discussions[discussionIndex].commentsList.push(comment);
                    project.discussions[discussionIndex].comments = (project.discussions[discussionIndex].comments || 0) + 1;
                    project.discussions[discussionIndex].updatedAt = new Date().toISOString();
                    project.updatedAt = new Date().toISOString();
                    discussionUpdated = true;
                    break;
                }
            }
        }
        
        if (discussionUpdated) {
            this.saveJSON('thoraxlab_projects', projects);
            
            // Add activity
            this.addActivity({
                type: 'comment_added',
                description: `${this.user.name} added insight to a discussion`,
                discussionId: discussionId
            });
            
            this.showToast('Insight added successfully!', 'success');
            this.hideModal('commentModal');
            this.loadDiscussionDetail(discussionId);
        } else {
            this.showToast('Discussion not found', 'error');
        }
    }
    
    // ========== INTERACTION METHODS ==========
    
    toggleDiscussionLike(discussionId) {
        if (this.isVisitor) {
            this.showToast('Guests cannot like discussions', 'warning');
            return;
        }
        
        const liked = this.toggleLike('discussion', discussionId);
        const projects = this.getProjects();
        
        for (const project of projects) {
            if (project.discussions) {
                const discussionIndex = project.discussions.findIndex(d => d.id === discussionId);
                if (discussionIndex !== -1) {
                    if (liked) {
                        project.discussions[discussionIndex].likes = (project.discussions[discussionIndex].likes || 0) + 1;
                    } else {
                        project.discussions[discussionIndex].likes = Math.max(0, (project.discussions[discussionIndex].likes || 0) - 1);
                    }
                    project.updatedAt = new Date().toISOString();
                    break;
                }
            }
        }
        
        this.saveJSON('thoraxlab_projects', projects);
        this.loadDiscussionDetail(discussionId);
    }
    
    toggleCommentLike(commentId) {
        if (this.isVisitor) {
            this.showToast('Guests cannot like comments', 'warning');
            return;
        }
        
        this.toggleLike('comment', commentId);
        this.loadDiscussionDetail(this.currentDiscussion.id);
    }
    
    toggleLike(type, id) {
        const likes = this.loadJSON('thoraxlab_likes') || {};
        const key = `${type}_${id}`;
        
        if (!likes[this.user.id]) {
            likes[this.user.id] = {};
        }
        
        const hasLiked = likes[this.user.id][key];
        
        if (hasLiked) {
            delete likes[this.user.id][key];
        } else {
            likes[this.user.id][key] = true;
        }
        
        this.saveJSON('thoraxlab_likes', likes);
        return !hasLiked;
    }
    
    hasLikedDiscussion(discussionId) {
        const likes = this.loadJSON('thoraxlab_likes') || {};
        return likes[this.user?.id]?.[`discussion_${discussionId}`] || false;
    }
    
    hasLikedComment(commentId) {
        const likes = this.loadJSON('thoraxlab_likes') || {};
        return likes[this.user?.id]?.[`comment_${commentId}`] || false;
    }
    
    incrementDiscussionViews(discussionId) {
        const projects = this.getProjects();
        
        for (const project of projects) {
            if (project.discussions) {
                const discussionIndex = project.discussions.findIndex(d => d.id === discussionId);
                if (discussionIndex !== -1) {
                    project.discussions[discussionIndex].views = (project.discussions[discussionIndex].views || 0) + 1;
                    project.updatedAt = new Date().toISOString();
                    break;
                }
            }
        }
        
        this.saveJSON('thoraxlab_projects', projects);
    }
    
    // ========== DATA MANAGEMENT ==========
    
    getProjects() {
        return this.loadJSON('thoraxlab_projects') || [];
    }
    
    getActivities() {
        return this.loadJSON('thoraxlab_activity') || [];
    }
    
    getTags() {
        return this.loadJSON('thoraxlab_tags') || {};
    }
    
    addActivity(activity) {
        const activities = this.getActivities();
        activities.unshift({
            id: `act_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            ...activity,
            timestamp: new Date().toISOString(),
            userId: this.user?.id
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
    
    // ========== UTILITY METHODS ==========
    
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
    
    showNewDiscussionModal(projectId) {
        document.getElementById('discussionProjectId').value = projectId;
        this.showModal('newDiscussionModal');
    }
    
    showCommentModal(discussionId) {
        document.getElementById('commentDiscussionId').value = discussionId;
        this.showModal('commentModal');
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
    
    // ========== TEAM MANAGEMENT ==========
    
    removeTeamMember(projectId, memberId) {
        if (!confirm('Are you sure you want to remove this team member?')) return;
        
        const projects = this.getProjects();
        const projectIndex = projects.findIndex(p => p.id === projectId);
        
        if (projectIndex !== -1 && projects[projectIndex].teamMembers) {
            projects[projectIndex].teamMembers = projects[projectIndex].teamMembers.filter(m => m.id !== memberId);
            projects[projectIndex].updatedAt = new Date().toISOString();
            this.saveJSON('thoraxlab_projects', projects);
            
            this.showToast('Team member removed', 'success');
            this.loadProjectDetail(projectId);
        }
    }
    
    requestToJoinProject(projectId) {
        const projects = this.getProjects();
        const project = projects.find(p => p.id === projectId);
        
        if (project) {
            this.showToast(`Join request sent to ${project.ownerName}`, 'info');
            
            // In a real app, this would send a notification to the project owner
            this.addActivity({
                type: 'join_request',
                description: `${this.user.name} requested to join "${project.title}"`,
                projectId: projectId
            });
        }
    }
    
    // ========== QUICK ACTIONS ==========
    
    setupQuickActions() {
        const quickActionsBtn = document.getElementById('quickActionsMainBtn');
        const quickActionsDropdown = document.getElementById('quickActionsDropdown');
        
        if (quickActionsBtn && quickActionsDropdown) {
            quickActionsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                quickActionsDropdown.classList.toggle('active');
            });
            
            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (!quickActionsBtn.contains(e.target) && !quickActionsDropdown.contains(e.target)) {
                    quickActionsDropdown.classList.remove('active');
                }
            });
            
            // Setup action items
            document.querySelectorAll('.quick-action-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    const action = e.currentTarget.dataset.action;
                    this.handleQuickAction(action);
                    quickActionsDropdown.classList.remove('active');
                });
            });
        }
    }
    
    handleQuickAction(action) {
        switch(action) {
            case 'new-project':
                if (this.isVisitor) {
                    this.showToast('Guests cannot create projects', 'warning');
                } else {
                    this.showModal('newProjectModal');
                }
                break;
            case 'new-discussion':
                if (this.isVisitor) {
                    this.showToast('Guests cannot start discussions', 'warning');
                } else {
                    this.showToast('Navigate to a project to start a discussion', 'info');
                }
                break;
            case 'request-review':
                this.showToast('Expert review request feature coming soon', 'info');
                break;
        }
    }
    
    // ========== EVENT LISTENERS ==========
    
    setupEventListeners() {
        // Auth buttons
        document.getElementById('professionalLoginBtn')?.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('professionalForm').classList.remove('hidden');
            document.getElementById('visitorForm').classList.add('hidden');
            document.querySelectorAll('.auth-choice-btn').forEach(btn => btn.classList.remove('active'));
            e.currentTarget.classList.add('active');
        });
        
        document.getElementById('visitorLoginBtn')?.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('visitorForm').classList.remove('hidden');
            document.getElementById('professionalForm').classList.add('hidden');
            document.querySelectorAll('.auth-choice-btn').forEach(btn => btn.classList.remove('active'));
            e.currentTarget.classList.add('active');
        });
        
        document.getElementById('professionalForm')?.addEventListener('submit', (e) => this.loginAsProfessional(e));
        document.getElementById('visitorForm')?.addEventListener('submit', (e) => this.loginAsVisitor(e));
        
        // Logout
        document.getElementById('logoutBtn')?.addEventListener('click', () => this.logout());
        
        // New project buttons
        document.getElementById('newProjectBtn')?.addEventListener('click', () => this.showModal('newProjectModal'));
        document.getElementById('createMyProjectBtn')?.addEventListener('click', () => this.showModal('newProjectModal'));
        
        // Forms
        document.getElementById('projectForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.createProject();
        });
        
        document.getElementById('discussionForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.createDiscussion();
        });
        
        document.getElementById('commentForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.addComment();
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
        this.setupCharacterCounter('projectDescription', 'descCounter', 2000);
        this.setupCharacterCounter('discussionContent', 'discussionCounter', 5000);
        this.setupCharacterCounter('commentContent', 'commentCounter', 1000);
        this.setupCharacterCounter('quickComment', 'quickCommentCounter', 1000);
        
        // Discussion type buttons
        document.querySelectorAll('.discussion-type-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.discussion-type-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
            });
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
                document.getElementById('quickActionsDropdown')?.classList.remove('active');
            }
        });
    }
    
    setupCharacterCounter(inputId, counterId, maxLength) {
        const input = document.getElementById(inputId);
        const counter = document.getElementById(counterId);
        
        if (input && counter) {
            input.addEventListener('input', (e) => {
                counter.textContent = `${e.target.value.length}/${maxLength}`;
                counter.classList.toggle('near-limit', e.target.value.length > maxLength * 0.9);
                counter.classList.toggle('over-limit', e.target.value.length > maxLength);
            });
        }
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
