// ============================================
// Thorax Lab Pro - Clinical Research & Innovation Platform
// Enhanced Version with All Improvements
// ============================================

class ThoraxLabPro {
    constructor() {
        this.user = JSON.parse(localStorage.getItem('thoraxlab_user') || 'null');
        this.isVisitor = JSON.parse(localStorage.getItem('thoraxlab_visitor') || 'false');
        this.currentProject = null;
        this.currentDiscussion = null;
        this.selectedTags = new Set();
        this.activityFilter = 'all';
        this.analyticsPeriod = '30d';
        this.quickActionsOpen = false;
        this.initialize();
    }
    
    // ========== INITIALIZATION ==========
    
    initialize() {
        this.setupEventListeners();
        this.setupRouter();
        this.checkAuth();
        this.initializeData();
        this.setupKeyboardShortcuts();
    }
    
    initializeData() {
        if (!localStorage.getItem('thoraxlab_projects')) {
            this.initializeDemoData();
        }
        
        if (!localStorage.getItem('thoraxlab_tags')) {
            this.initializeTagsData();
        }
        
        if (!localStorage.getItem('thoraxlab_activity')) {
            this.initializeActivityData();
        }
    }
    
    initializeDemoData() {
        const demoProjects = [
            {
                id: 'proj_1',
                title: 'AI-Powered COPD Exacerbation Prediction',
                description: 'Developing machine learning models to predict COPD exacerbations 48 hours in advance using patient vitals, spirometry data, and environmental factors. This innovation aims to reduce hospital readmissions by enabling early intervention.',
                tags: ['AI', 'COPD', 'machine-learning', 'prediction-models', 'pulmonary'],
                phase: 'analysis',
                ownerId: 'demo_user',
                ownerName: 'Dr. Sarah Chen',
                ownerRole: 'clinical-investigator',
                institution: 'Cambridge University Hospitals',
                teamMembers: ['Dr. Michael Johnson', 'Dr. Lisa Wang', 'Prof. James Wilson'],
                requiredExpertise: ['clinical-oncology', 'machine-learning', 'biostatistics'],
                createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
                updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
                discussions: [
                    {
                        id: 'disc_1',
                        title: 'Which clinical features are most predictive?',
                        content: 'We need to decide on the most important clinical features for our prediction model. Should we prioritize spirometry data, patient-reported symptoms, or environmental factors? Clinical relevance and statistical significance both need consideration.',
                        type: 'brainstorm',
                        tags: ['spirometry', 'patient-reported-outcomes', 'environmental-factors'],
                        authorId: 'demo_user',
                        authorName: 'Dr. Sarah Chen',
                        authorInstitution: 'Cambridge University Hospitals',
                        authorRole: 'clinical-investigator',
                        createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
                        likes: 24,
                        comments: 12,
                        views: 156,
                        commentsList: [
                            {
                                id: 'comment_1',
                                content: 'Based on our preliminary analysis, spirometry data shows the highest correlation with exacerbation events. The FEV1/FVC ratio appears particularly significant (p < 0.001).',
                                type: 'analysis',
                                authorName: 'Dr. Michael Johnson',
                                authorInstitution: 'Massachusetts General Hospital',
                                authorRole: 'data-analyst',
                                createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
                                likes: 8
                            },
                            {
                                id: 'comment_2',
                                content: 'Patient-reported symptoms might provide early warning signals before objective measures change. We should consider integrating PROs into our model, as suggested in the recent JAMA article.',
                                type: 'clinical',
                                authorName: 'Dr. Lisa Wang',
                                authorInstitution: 'Stanford Medicine',
                                authorRole: 'clinical-investigator',
                                createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
                                likes: 6
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
                phase: 'data-collection',
                ownerId: 'demo_user_2',
                ownerName: 'Prof. Robert Kim',
                ownerRole: 'principal-investigator',
                institution: 'Oxford University',
                teamMembers: ['Dr. Emma Davis', 'Prof. Alex Thompson'],
                requiredExpertise: ['genomics', 'bioinformatics', 'clinical-oncology'],
                createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
                updatedAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
                discussions: [
                    {
                        id: 'disc_3',
                        title: 'Tumor Mutational Burden vs PD-L1 Expression as Predictive Biomarkers',
                        content: 'We need to determine which biomarker shows stronger predictive value for immunotherapy response in our cohort. Both TMB and PD-L1 have shown promise, but their relative importance in our specific population needs clarification.',
                        type: 'decision',
                        tags: ['TMB', 'PD-L1', 'biomarkers', 'predictive-analytics'],
                        authorId: 'demo_user_2',
                        authorName: 'Prof. Robert Kim',
                        authorInstitution: 'Oxford University',
                        authorRole: 'principal-investigator',
                        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
                        likes: 31,
                        comments: 18,
                        views: 289,
                        commentsList: []
                    }
                ]
            }
        ];
        
        localStorage.setItem('thoraxlab_projects', JSON.stringify(demoProjects));
        localStorage.setItem('thoraxlab_discussion_likes', JSON.stringify({}));
        localStorage.setItem('thoraxlab_comment_likes', JSON.stringify({}));
        localStorage.setItem('thoraxlab_user_projects', JSON.stringify(['proj_1']));
    }
    
    initializeTagsData() {
        const tags = {
            'oncology': { count: 42, frequency: 'high' },
            'cardiology': { count: 28, frequency: 'medium' },
            'pulmonary': { count: 35, frequency: 'high' },
            'clinical-trials': { count: 56, frequency: 'high' },
            'genomics': { count: 39, frequency: 'high' },
            'AI': { count: 47, frequency: 'high' },
            'machine-learning': { count: 45, frequency: 'high' },
            'biomarkers': { count: 32, frequency: 'medium' },
            'immunotherapy': { count: 29, frequency: 'medium' },
            'bioinformatics': { count: 27, frequency: 'medium' },
            'biostatistics': { count: 31, frequency: 'medium' },
            'precision-medicine': { count: 26, frequency: 'medium' },
            'digital-health': { count: 23, frequency: 'low' },
            'wearables': { count: 18, frequency: 'low' },
            'real-world-evidence': { count: 21, frequency: 'low' }
        };
        
        localStorage.setItem('thoraxlab_tags', JSON.stringify(tags));
    }
    
    initializeActivityData() {
        const activities = [
            {
                id: 'act_1',
                type: 'project-created',
                title: 'New Research Project Started',
                description: 'Dr. Sarah Chen initiated "AI-Powered COPD Exacerbation Prediction"',
                timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
                userId: 'demo_user',
                projectId: 'proj_1'
            },
            {
                id: 'act_2',
                type: 'discussion-started',
                title: 'New Research Discussion',
                description: 'Dr. Michael Johnson contributed to "Which clinical features are most predictive?"',
                timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
                userId: 'demo_user',
                discussionId: 'disc_1'
            },
            {
                id: 'act_3',
                type: 'collaboration-request',
                title: 'Collaboration Request',
                description: 'Prof. James Wilson requested to join "AI-Powered COPD Exacerbation Prediction"',
                timestamp: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
                userId: 'demo_user_3',
                projectId: 'proj_1'
            },
            {
                id: 'act_4',
                type: 'project-created',
                title: 'New Research Project Started',
                description: 'Prof. Robert Kim initiated "Genomic Biomarkers for Immunotherapy Response"',
                timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
                userId: 'demo_user_2',
                projectId: 'proj_2'
            }
        ];
        
        localStorage.setItem('thoraxlab_activity', JSON.stringify(activities));
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
        this.updateBreadcrumb('dashboard');
    }
    
    loginAsResearcher(e) {
        if (e) e.preventDefault();
        
        const name = document.getElementById('creatorName').value.trim();
        const role = document.getElementById('creatorRole').value;
        const institution = document.getElementById('creatorInstitution').value.trim();
        const specialty = document.getElementById('creatorSpecialty').value.trim();
        
        if (!name || !role) {
            this.showToast('Name and role are required', 'error');
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
            role: role,
            institution: institution || 'Not specified',
            specialty: specialty || 'Not specified',
            avatar_initials: initials,
            createdAt: new Date().toISOString(),
            lastActive: new Date().toISOString()
        };
        
        this.isVisitor = false;
        
        localStorage.setItem('thoraxlab_user', JSON.stringify(this.user));
        localStorage.setItem('thoraxlab_visitor', 'false');
        
        // Track activity
        this.trackActivity('user-login', `${name} joined the platform`);
        
        this.showApp();
        this.updateUserDisplay();
        this.showToast(`Welcome to Thorax Lab Pro, ${name.split(' ')[0]}!`, 'success');
    }
    
    loginAsGuest(e) {
        if (e) e.preventDefault();
        
        const name = document.getElementById('visitorName').value.trim();
        const affiliation = document.getElementById('visitorAffiliation').value.trim();
        
        this.user = {
            id: `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: name || 'Guest Researcher',
            role: 'guest',
            institution: affiliation || 'Viewing Only',
            specialty: 'Not specified',
            avatar_initials: 'G',
            createdAt: new Date().toISOString(),
            lastActive: new Date().toISOString()
        };
        
        this.isVisitor = true;
        
        localStorage.setItem('thoraxlab_user', JSON.stringify(this.user));
        localStorage.setItem('thoraxlab_visitor', 'true');
        
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
        const welcome = document.getElementById('welcomeMessage');
        const newProjectBtn = document.getElementById('newProjectBtn');
        
        if (avatar) {
            avatar.textContent = this.user.avatar_initials || '??';
            if (this.isVisitor) {
                avatar.style.background = 'linear-gradient(135deg, #64748B, #475569)';
            }
        }
        
        if (name) {
            name.textContent = this.user.name;
        }
        
        if (role) {
            const roleTitles = {
                'clinical-investigator': 'Clinical Investigator',
                'principal-investigator': 'Principal Investigator',
                'research-coordinator': 'Research Coordinator',
                'data-scientist': 'Data Scientist',
                'biostatistician': 'Biostatistician',
                'clinical-fellow': 'Clinical Fellow',
                'research-nurse': 'Research Nurse',
                'guest': 'Guest Researcher'
            };
            role.textContent = roleTitles[this.user.role] || 'Research Professional';
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
        
        if (newProjectBtn) {
            newProjectBtn.classList.toggle('hidden', this.isVisitor);
        }
    }
    
    // ========== ENHANCED ROUTER ==========
    
    setupRouter() {
        window.addEventListener('hashchange', () => this.handleRoute());
        this.handleRoute();
    }
    
    handleRoute() {
        const hash = window.location.hash.substring(1) || 'dashboard';
        const parts = hash.split('/');
        
        this.showPage(parts[0]);
        
        if (parts[0] === 'project' && parts[1]) {
            this.loadProject(parts[1]);
        } else if (parts[0] === 'discussion' && parts[1]) {
            this.loadDiscussion(parts[1]);
        }
        
        this.updateNavigation(parts[0]);
        this.updateBreadcrumb(parts[0], parts[1]);
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
                case 'discussions':
                    this.loadAllDiscussions();
                    break;
                case 'analytics':
                    this.loadAnalytics();
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
    
    updateBreadcrumb(page, id = null) {
        const breadcrumb = document.getElementById('breadcrumb');
        const breadcrumbNav = document.getElementById('breadcrumbNav');
        
        if (!breadcrumb || !breadcrumbNav) return;
        
        breadcrumbNav.classList.toggle('hidden', page === 'dashboard');
        
        const breadcrumbs = {
            'dashboard': [{ name: 'Dashboard', href: '#dashboard' }],
            'projects': [
                { name: 'Dashboard', href: '#dashboard' },
                { name: 'Research Projects', href: '#projects' }
            ],
            'myprojects': [
                { name: 'Dashboard', href: '#dashboard' },
                { name: 'My Projects', href: '#myprojects' }
            ],
            'discussions': [
                { name: 'Dashboard', href: '#dashboard' },
                { name: 'Discussions', href: '#discussions' }
            ],
            'analytics': [
                { name: 'Dashboard', href: '#dashboard' },
                { name: 'Analytics', href: '#analytics' }
            ],
            'project': [
                { name: 'Dashboard', href: '#dashboard' },
                { name: 'Projects', href: '#projects' },
                { name: id ? 'Project Details' : 'Project', href: id ? `#project/${id}` : '#projects' }
            ],
            'discussion': [
                { name: 'Dashboard', href: '#dashboard' },
                { name: 'Discussions', href: '#discussions' },
                { name: id ? 'Discussion Details' : 'Discussion', href: id ? `#discussion/${id}` : '#discussions' }
            ]
        };
        
        const crumbs = breadcrumbs[page] || breadcrumbs.dashboard;
        breadcrumb.innerHTML = crumbs.map((crumb, index) => `
            <div class="breadcrumb-item">
                ${index > 0 ? '<span class="breadcrumb-separator">/</span>' : ''}
                <a href="${crumb.href}" class="breadcrumb-link">${crumb.name}</a>
            </div>
        `).join('');
    }
    
    navigateTo(page) {
        window.location.hash = page;
    }
    
    // ========== SMART DASHBOARD FEATURES ==========
    
    loadDashboard() {
        this.loadResearchOverview();
        this.loadActivityFeed();
        this.loadTagsCloud();
        this.loadFeaturedDiscussions();
        this.loadRecentProjects();
    }
    
    loadResearchOverview() {
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
                            <div class="stat-label">Active Projects</div>
                            <div class="stat-trend trend-up">
                                <i class="fas fa-arrow-up"></i>
                                <span>12% from last month</span>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-comments"></i>
                        </div>
                        <div class="stat-content">
                            <div class="stat-number">${userDiscussions}</div>
                            <div class="stat-label">Discussions</div>
                            <div class="stat-trend trend-up">
                                <i class="fas fa-arrow-up"></i>
                                <span>8% engagement increase</span>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-users"></i>
                        </div>
                        <div class="stat-content">
                            <div class="stat-number">${userProjects.reduce((sum, p) => sum + (p.teamMembers?.length || 0), 0)}</div>
                            <div class="stat-label">Collaborators</div>
                            <div class="stat-trend trend-up">
                                <i class="fas fa-user-plus"></i>
                                <span>3 new this month</span>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-chart-line"></i>
                        </div>
                        <div class="stat-content">
                            <div class="stat-number">${this.calculateResearchImpact(userProjects)}</div>
                            <div class="stat-label">Research Impact</div>
                            <div class="stat-trend trend-up">
                                <i class="fas fa-trending-up"></i>
                                <span>Growing influence</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
    }
    
    loadActivityFeed() {
        const activities = JSON.parse(localStorage.getItem('thoraxlab_activity') || '[]');
        
        // Filter activities based on selected filter
        let filteredActivities = activities;
        if (this.activityFilter !== 'all') {
            filteredActivities = activities.filter(act => act.type.includes(this.activityFilter));
        }
        
        // Sort by timestamp (newest first)
        filteredActivities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        const container = document.getElementById('activityFeed');
        if (!container) return;
        
        if (!filteredActivities.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📊</div>
                    <h3 class="mb-2">No recent activity</h3>
                    <p class="text-muted">Start a project or join a discussion to see activity here</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = filteredActivities.slice(0, 8).map(activity => {
            const icon = this.getActivityIcon(activity.type);
            const timeAgo = this.formatTimeAgo(activity.timestamp);
            
            return `
                <div class="activity-item" data-activity-id="${activity.id}">
                    <div class="activity-icon">${icon}</div>
                    <div class="activity-content">
                        <div class="activity-text">
                            <strong>${activity.title}</strong> - ${activity.description}
                        </div>
                        <div class="activity-meta">
                            <span>${timeAgo}</span>
                            <span>•</span>
                            <span>${this.getActivityTypeLabel(activity.type)}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    loadTagsCloud() {
        const tags = JSON.parse(localStorage.getItem('thoraxlab_tags') || '{}');
        const container = document.getElementById('tagsCloud');
        
        if (!container) return;
        
        // Convert to array and sort by frequency
        const tagsArray = Object.entries(tags)
            .map(([tag, data]) => ({ tag, ...data }))
            .sort((a, b) => b.count - a.count);
        
        container.innerHTML = tagsArray.map(({ tag, count, frequency }) => {
            const sizeClass = this.getTagSizeClass(frequency);
            const isActive = this.selectedTags.has(tag);
            
            return `
                <span class="tag-item ${sizeClass} ${isActive ? 'active' : ''}" 
                      data-tag="${tag}" data-count="${count}">
                    ${tag}
                    <span class="tag-frequency">(${count})</span>
                </span>
            `;
        }).join('');
        
        // Add click handlers
        container.querySelectorAll('.tag-item').forEach(tagEl => {
            tagEl.addEventListener('click', (e) => {
                const tag = e.currentTarget.dataset.tag;
                this.toggleTagFilter(tag);
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
        
        // Sort by engagement score
        allDiscussions.sort((a, b) => {
            const engagementA = this.calculateDiscussionEngagement(a);
            const engagementB = this.calculateDiscussionEngagement(b);
            return engagementB - engagementA;
        });
        
        const featured = allDiscussions.slice(0, 4);
        this.renderFeaturedDiscussions(featured);
    }
    
    loadRecentProjects() {
        const projects = this.getProjects();
        projects.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        const recent = projects.slice(0, 3);
        this.renderRecentProjects(recent);
    }
    
    // ========== INTELLIGENT TAGS SYSTEM ==========
    
    toggleTagFilter(tag) {
        if (this.selectedTags.has(tag)) {
            this.selectedTags.delete(tag);
        } else {
            this.selectedTags.add(tag);
        }
        
        // Update UI
        document.querySelectorAll(`[data-tag="${tag}"]`).forEach(el => {
            el.classList.toggle('active', this.selectedTags.has(tag));
        });
        
        // Filter content if on relevant pages
        if (window.location.hash.includes('projects') || window.location.hash.includes('dashboard')) {
            this.loadAllProjects();
        }
    }
    
    getTagSizeClass(frequency) {
        switch(frequency) {
            case 'high': return 'text-lg';
            case 'medium': return 'text-base';
            case 'low': return 'text-sm';
            default: return 'text-base';
        }
    }
    
    // ========== RESEARCH PROJECTS ==========
    
    loadAllProjects() {
        let projects = this.getProjects();
        
        // Apply tag filters
        if (this.selectedTags.size > 0) {
            projects = projects.filter(project => 
                project.tags.some(tag => this.selectedTags.has(tag.toLowerCase()))
            );
        }
        
        // Apply search filter
        const searchQuery = document.getElementById('projectSearch')?.value || '';
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            projects = projects.filter(project => 
                project.title.toLowerCase().includes(query) ||
                project.description.toLowerCase().includes(query) ||
                project.tags.some(tag => tag.toLowerCase().includes(query)) ||
                project.institution.toLowerCase().includes(query) ||
                project.ownerName.toLowerCase().includes(query)
            );
        }
        
        // Apply phase filters
        const activeFilter = document.querySelector('.filter-chip.active')?.dataset.filter;
        if (activeFilter && activeFilter !== 'all') {
            projects = projects.filter(project => project.phase === activeFilter);
        }
        
        // Sort based on selected criteria
        projects.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        
        this.renderAllProjects(projects);
    }
    
    loadMyProjects() {
        if (this.isVisitor) {
            this.showToast('Guests cannot create projects', 'warning');
            this.navigateTo('dashboard');
            return;
        }
        
        const projects = this.getProjects();
        const myProjects = projects.filter(p => p.ownerId === this.user.id);
        this.renderMyProjects(myProjects);
    }
    
    createProject() {
        const title = document.getElementById('projectTitle').value.trim();
        const description = document.getElementById('projectDescription').value.trim();
        const tagsInput = document.getElementById('projectTags').value.trim();
        const institution = document.getElementById('projectInstitution').value.trim();
        const phase = document.getElementById('projectPhase').value;
        
        if (!title || !description) {
            this.showToast('Title and description are required', 'error');
            return;
        }
        
        if (description.length > 3000) {
            this.showToast('Description must be 3000 characters or less', 'error');
            return;
        }
        
        const tags = tagsInput ? 
            tagsInput.split(',').map(t => t.trim()).filter(t => t) : [];
        
        // Get selected expertise tags
        const expertiseTags = Array.from(document.querySelectorAll('.tag-item[data-expertise].active'))
            .map(el => el.dataset.expertise);
        
        const project = {
            id: `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            title: title,
            description: description,
            tags: tags,
            phase: phase,
            institution: institution || this.user.institution,
            ownerId: this.user.id,
            ownerName: this.user.name,
            ownerRole: this.user.role,
            teamMembers: [],
            requiredExpertise: expertiseTags,
            discussions: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        const projects = this.getProjects();
        projects.push(project);
        this.saveProjects(projects);
        
        this.addToUserProjects(project.id);
        
        // Track activity
        this.trackActivity('project-created', `${this.user.name} started "${title}"`);
        
        // Update tags cloud
        this.updateTagsCount(tags);
        
        this.showToast('Research project created successfully!', 'success');
        this.hideModal('newProjectModal');
        this.navigateTo(`project/${project.id}`);
    }
    
    // ========== ENHANCED DISCUSSION SYSTEM ==========
    
    createDiscussion() {
        const projectId = document.getElementById('discussionProjectId').value;
        const title = document.getElementById('discussionTitle').value.trim();
        const content = document.getElementById('discussionContent').value.trim();
        const tagsInput = document.getElementById('discussionTags')?.value.trim() || '';
        const type = document.querySelector('.discussion-type-btn.active').dataset.type;
        
        if (!title || !content) {
            this.showToast('Topic and description are required', 'error');
            return;
        }
        
        if (content.length > 5000) {
            this.showToast('Description must be 5000 characters or less', 'error');
            return;
        }
        
        const tags = tagsInput ? 
            tagsInput.split(',').map(t => t.trim()).filter(t => t) : [];
        
        const discussion = {
            id: `disc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            title: title,
            content: content,
            type: type,
            tags: tags,
            authorId: this.user.id,
            authorName: this.user.name,
            authorInstitution: this.user.institution,
            authorRole: this.user.role,
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
        this.saveProjects(projects);
        
        // Track activity
        this.trackActivity('discussion-started', `${this.user.name} started "${title}"`);
        
        // Update tags cloud
        this.updateTagsCount(tags);
        
        this.showToast('Discussion started successfully!', 'success');
        this.hideModal('newDiscussionModal');
        this.navigateTo(`discussion/${discussion.id}`);
    }
    
    // ========== ENHANCED COMMENT SYSTEM ==========
    
    addComment() {
        const discussionId = document.getElementById('commentDiscussionId').value;
        const content = document.getElementById('commentContent').value.trim();
        const type = document.querySelector('.insight-type-btn.active')?.dataset.type || 'analysis';
        
        if (!content) {
            this.showToast('Comment content is required', 'error');
            return;
        }
        
        if (content.length > 2000) {
            this.showToast('Comment must be 2000 characters or less', 'error');
            return;
        }
        
        const comment = {
            id: `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            content: content,
            type: type,
            authorId: this.user.id,
            authorName: this.user.name,
            authorInstitution: this.user.institution,
            authorRole: this.user.role,
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
            this.saveProjects(projects);
            
            // Track activity
            this.trackActivity('comment-added', `${this.user.name} added insight to a discussion`);
            
            this.showToast('Insight added successfully!', 'success');
            this.hideModal('commentModal');
            this.loadDiscussion(discussionId);
        } else {
            this.showToast('Discussion not found', 'error');
        }
    }
    
    // ========== RESEARCH ANALYTICS ==========
    
    loadAnalytics() {
        const container = document.getElementById('analyticsContent');
        if (!container) return;
        
        const projects = this.getProjects();
        const userProjects = projects.filter(p => p.ownerId === this.user.id);
        
        // Calculate metrics
        const totalProjects = userProjects.length;
        const activeDiscussions = userProjects.reduce((sum, p) => 
            sum + (p.discussions?.length || 0), 0
        );
        const totalCollaborators = userProjects.reduce((sum, p) => 
            sum + (p.teamMembers?.length || 0), 0
        );
        const researchImpact = this.calculateResearchImpact(userProjects);
        
        container.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="research-card">
                    <div class="card-header">
                        <h2 class="card-title">
                            <i class="card-icon fas fa-chart-bar"></i>
                            Research Metrics Overview
                        </h2>
                    </div>
                    <div class="stats-grid">
                        <div class="stat-card">
                            <div class="stat-icon">
                                <i class="fas fa-project-diagram"></i>
                            </div>
                            <div class="stat-content">
                                <div class="stat-number">${totalProjects}</div>
                                <div class="stat-label">Total Projects</div>
                            </div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">
                                <i class="fas fa-comments"></i>
                            </div>
                            <div class="stat-content">
                                <div class="stat-number">${activeDiscussions}</div>
                                <div class="stat-label">Active Discussions</div>
                            </div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">
                                <i class="fas fa-users"></i>
                            </div>
                            <div class="stat-content">
                                <div class="stat-number">${totalCollaborators}</div>
                                <div class="stat-label">Collaborators</div>
                            </div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">
                                <i class="fas fa-trophy"></i>
                            </div>
                            <div class="stat-content">
                                <div class="stat-number">${researchImpact}</div>
                                <div class="stat-label">Research Impact</div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="research-card">
                    <div class="card-header">
                        <h2 class="card-title">
                            <i class="card-icon fas fa-tags"></i>
                            Research Domains Distribution
                        </h2>
                    </div>
                    <div id="domainsChart">
                        <!-- Domain distribution visualization -->
                        <div class="tags-cloud mt-4">
                            ${this.generateDomainTags(userProjects)}
                        </div>
                    </div>
                </div>
                
                <div class="research-card">
                    <div class="card-header">
                        <h2 class="card-title">
                            <i class="card-icon fas fa-calendar-alt"></i>
                            Project Timeline
                        </h2>
                    </div>
                    <div class="stage-timeline mt-4">
                        ${this.generateProjectTimeline(userProjects)}
                    </div>
                </div>
                
                <div class="research-card">
                    <div class="card-header">
                        <h2 class="card-title">
                            <i class="card-icon fas fa-chart-line"></i>
                            Engagement Trends
                        </h2>
                    </div>
                    <div class="mt-4">
                        <p class="text-muted">Discussion engagement over time</p>
                        <div class="engagement-chart">
                            ${this.generateEngagementChart(userProjects)}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    // ========== QUICK ACTIONS SYSTEM ==========
    
    setupQuickActions() {
        const quickActionsBtn = document.getElementById('quickActionsMainBtn');
        const quickActionsDropdown = document.getElementById('quickActionsDropdown');
        
        if (quickActionsBtn && quickActionsDropdown) {
            quickActionsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.quickActionsOpen = !this.quickActionsOpen;
                quickActionsDropdown.classList.toggle('active', this.quickActionsOpen);
            });
            
            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (!quickActionsBtn.contains(e.target) && !quickActionsDropdown.contains(e.target)) {
                    this.quickActionsOpen = false;
                    quickActionsDropdown.classList.remove('active');
                }
            });
            
            // Setup action items
            document.querySelectorAll('.quick-action-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    const action = e.currentTarget.dataset.action;
                    this.handleQuickAction(action);
                });
            });
        }
    }
    
    handleQuickAction(action) {
        switch(action) {
            case 'new-project':
                this.showModal('newProjectModal');
                break;
            case 'new-discussion':
                this.showModal('newDiscussionModal');
                break;
            case 'request-review':
                this.showToast('Clinical review request feature coming soon', 'info');
                break;
            case 'data-analysis':
                this.showToast('Data analysis request feature coming soon', 'info');
                break;
            case 'brainstorm-session':
                this.showToast('Brainstorm scheduling feature coming soon', 'info');
                break;
        }
        
        this.quickActionsOpen = false;
        document.getElementById('quickActionsDropdown').classList.remove('active');
    }
    
    // ========== EVENT LISTENERS SETUP ==========
    
    setupEventListeners() {
        // Auth buttons
        document.getElementById('creatorLoginBtn')?.addEventListener('click', () => {
            document.getElementById('creatorForm').classList.remove('hidden');
            document.getElementById('visitorForm').classList.add('hidden');
            document.querySelectorAll('.auth-choice-btn').forEach(btn => btn.classList.remove('active'));
            event.currentTarget.classList.add('active');
        });
        
        document.getElementById('visitorLoginBtn')?.addEventListener('click', () => {
            document.getElementById('visitorForm').classList.remove('hidden');
            document.getElementById('creatorForm').classList.add('hidden');
            document.querySelectorAll('.auth-choice-btn').forEach(btn => btn.classList.remove('active'));
            event.currentTarget.classList.add('active');
        });
        
        document.getElementById('creatorForm')?.addEventListener('submit', (e) => this.loginAsResearcher(e));
        document.getElementById('visitorForm')?.addEventListener('submit', (e) => this.loginAsGuest(e));
        
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
        
        // Discussion form
        document.getElementById('discussionForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.createDiscussion();
        });
        
        // Comment form
        document.getElementById('commentForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.addComment();
        });
        
        // Search and filters
        document.getElementById('projectSearch')?.addEventListener('input', () => this.loadAllProjects());
        document.getElementById('discussionSearch')?.addEventListener('input', () => this.loadFeaturedDiscussions());
        document.getElementById('globalSearch')?.addEventListener('input', (e) => this.handleGlobalSearch(e.target.value));
        
        // Activity filters
        document.querySelectorAll('.activity-filter').forEach(filter => {
            filter.addEventListener('click', (e) => {
                document.querySelectorAll('.activity-filter').forEach(f => f.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.activityFilter = e.currentTarget.dataset.filter;
                this.loadActivityFeed();
            });
        });
        
        // Project phase filters
        document.querySelectorAll('.filter-chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.loadAllProjects();
            });
        });
        
        // Analytics period
        document.getElementById('analyticsPeriod')?.addEventListener('change', (e) => {
            this.analyticsPeriod = e.target.value;
            this.loadAnalytics();
        });
        
        // Modal close buttons
        document.querySelectorAll('.modal-close, .btn-outline[data-action="cancel"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.currentTarget.closest('.modal');
                if (modal) {
                    this.hideModal(modal.id);
                }
            });
        });
        
        // Close modal on outside click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideModal(modal.id);
                }
            });
        });
        
        // Setup quick actions
        this.setupQuickActions();
        
        // Character counters
        this.setupCharacterCounters();
    }
    
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + K for search
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                document.getElementById('globalSearch')?.focus();
            }
            
            // Ctrl/Cmd + N for new project
            if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
                e.preventDefault();
                if (!this.isVisitor) {
                    this.showModal('newProjectModal');
                }
            }
            
            // Escape to close modals
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal.active').forEach(modal => {
                    this.hideModal(modal.id);
                });
            }
            
            // ? for keyboard shortcuts help
            if (e.key === '?') {
                this.showKeyboardShortcuts();
            }
        });
    }
    
    setupCharacterCounters() {
        const setupCounter = (textareaId, counterId, maxLength) => {
            const textarea = document.getElementById(textareaId);
            const counter = document.getElementById(counterId);
            
            if (textarea && counter) {
                textarea.addEventListener('input', () => {
                    const length = textarea.value.length;
                    counter.textContent = `${length}/${maxLength}`;
                    
                    counter.classList.remove('near-limit', 'over-limit');
                    if (length > maxLength * 0.9) {
                        counter.classList.add('near-limit');
                    }
                    if (length > maxLength) {
                        counter.classList.add('over-limit');
                    }
                });
            }
        };
        
        setupCounter('projectDescription', 'descCounter', 3000);
        setupCounter('discussionContent', 'discussionCounter', 5000);
        setupCounter('commentContent', 'commentCounter', 2000);
    }
    
    // ========== UTILITY METHODS ==========
    
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
            if (form) {
                form.reset();
                form.querySelectorAll('.char-counter').forEach(counter => {
                    counter.textContent = '0/' + counter.dataset.max;
                    counter.classList.remove('near-limit', 'over-limit');
                });
            }
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
                <div class="toast-title">${type.charAt(0).toUpperCase() + type.slice(1)}</div>
                <div class="toast-message">${this.escapeHtml(message)}</div>
            </div>
            <button class="toast-close">&times;</button>
        `;
        
        container.appendChild(toast);
        
        toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
        
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 5000);
    }
    
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
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
    
    calculateDiscussionEngagement(discussion) {
        return (discussion.likes || 0) * 2 + (discussion.comments || 0) * 3 + (discussion.views || 0) * 0.1;
    }
    
    calculateResearchImpact(projects) {
        let impact = 0;
        projects.forEach(project => {
            // Base impact from project age (newer projects get more weight)
            const ageDays = (new Date() - new Date(project.createdAt)) / (1000 * 60 * 60 * 24);
            impact += Math.max(0, 100 - ageDays);
            
            // Add impact from discussions
            if (project.discussions) {
                project.discussions.forEach(disc => {
                    impact += this.calculateDiscussionEngagement(disc) / 10;
                });
            }
            
            // Add impact from team size
            impact += (project.teamMembers?.length || 0) * 5;
        });
        
        return Math.round(impact);
    }
    
    getActivityIcon(type) {
        const icons = {
            'project-created': '<i class="fas fa-project-diagram"></i>',
            'discussion-started': '<i class="fas fa-comments"></i>',
            'comment-added': '<i class="fas fa-comment-medical"></i>',
            'collaboration-request': '<i class="fas fa-user-plus"></i>',
            'user-login': '<i class="fas fa-sign-in-alt"></i>'
        };
        return icons[type] || '<i class="fas fa-bell"></i>';
    }
    
    getActivityTypeLabel(type) {
        const labels = {
            'project-created': 'Project',
            'discussion-started': 'Discussion',
            'comment-added': 'Comment',
            'collaboration-request': 'Collaboration',
            'user-login': 'Login'
        };
        return labels[type] || 'Activity';
    }
    
    trackActivity(type, description) {
        const activities = JSON.parse(localStorage.getItem('thoraxlab_activity') || '[]');
        activities.unshift({
            id: `act_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: type,
            title: description.split(' ').slice(0, 4).join(' ') + '...',
            description: description,
            timestamp: new Date().toISOString(),
            userId: this.user?.id
        });
        
        // Keep only last 100 activities
        if (activities.length > 100) {
            activities.length = 100;
        }
        
        localStorage.setItem('thoraxlab_activity', JSON.stringify(activities));
    }
    
    updateTagsCount(newTags) {
        const tags = JSON.parse(localStorage.getItem('thoraxlab_tags') || '{}');
        
        newTags.forEach(tag => {
            const normalizedTag = tag.toLowerCase();
            if (tags[normalizedTag]) {
                tags[normalizedTag].count += 1;
            } else {
                tags[normalizedTag] = { count: 1, frequency: 'low' };
            }
        });
        
        localStorage.setItem('thoraxlab_tags', JSON.stringify(tags));
    }
    
    handleGlobalSearch(query) {
        if (!query.trim()) return;
        
        // Implement global search functionality
        const projects = this.getProjects();
        const results = projects.filter(project => 
            project.title.toLowerCase().includes(query.toLowerCase()) ||
            project.description.toLowerCase().includes(query.toLowerCase()) ||
            project.tags.some(tag => tag.toLowerCase().includes(query.toLowerCase()))
        );
        
        if (results.length > 0) {
            // Show search results in a dropdown or navigate to projects page with filtered results
            this.navigateTo('projects');
            document.getElementById('projectSearch').value = query;
            this.loadAllProjects();
        }
    }
    
    showKeyboardShortcuts() {
        const shortcuts = [
            { key: 'Ctrl/Cmd + K', action: 'Focus search' },
            { key: 'Ctrl/Cmd + N', action: 'New project' },
            { key: 'Esc', action: 'Close modal' },
            { key: '?', action: 'Show shortcuts' }
        ];
        
        const shortcutsHtml = shortcuts.map(shortcut => `
            <div class="flex justify-between py-2 border-b">
                <span class="font-mono text-sm">${shortcut.key}</span>
                <span class="text-sm text-muted">${shortcut.action}</span>
            </div>
        `).join('');
        
        const modalContent = `
            <div class="modal-header">
                <h2 class="modal-title">
                    <i class="fas fa-keyboard"></i>
                    Keyboard Shortcuts
                </h2>
                <button class="modal-close">&times;</button>
            </div>
            <div class="py-4">
                ${shortcutsHtml}
            </div>
        `;
        
        // Create or update a modal for shortcuts
        let shortcutsModal = document.getElementById('shortcutsModal');
        if (!shortcutsModal) {
            shortcutsModal = document.createElement('div');
            shortcutsModal.id = 'shortcutsModal';
            shortcutsModal.className = 'modal';
            shortcutsModal.innerHTML = `
                <div class="modal-content" style="max-width: 400px;">
                    ${modalContent}
                </div>
            `;
            document.getElementById('app').appendChild(shortcutsModal);
        }
        
        this.showModal('shortcutsModal');
    }
    
    // ========== DATA STORAGE METHODS ==========
    
    getProjects() {
        return JSON.parse(localStorage.getItem('thoraxlab_projects') || '[]');
    }
    
    saveProjects(projects) {
        localStorage.setItem('thoraxlab_projects', JSON.stringify(projects));
    }
    
    getUserProjects() {
        return JSON.parse(localStorage.getItem('thoraxlab_user_projects') || '[]');
    }
    
    addToUserProjects(projectId) {
        const userProjects = this.getUserProjects();
        if (!userProjects.includes(projectId)) {
            userProjects.push(projectId);
            localStorage.setItem('thoraxlab_user_projects', JSON.stringify(userProjects));
        }
    }
    
    // ========== RENDERING METHODS (simplified for brevity) ==========
    
    renderFeaturedDiscussions(discussions) {
        // Implementation would go here
    }
    
    renderRecentProjects(projects) {
        // Implementation would go here
    }
    
    renderAllProjects(projects) {
        // Implementation would go here
    }
    
    renderMyProjects(projects) {
        // Implementation would go here
    }
    
    generateDomainTags(projects) {
        // Count tags across projects
        const tagCounts = {};
        projects.forEach(project => {
            project.tags.forEach(tag => {
                tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            });
        });
        
        // Convert to array and sort
        const tagsArray = Object.entries(tagCounts)
            .map(([tag, count]) => ({ tag, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);
        
        return tagsArray.map(({ tag, count }) => `
            <span class="tag-item">
                ${tag} <span class="tag-frequency">(${count})</span>
            </span>
        `).join('');
    }
    
    generateProjectTimeline(projects) {
        // Simplified timeline visualization
        const phases = ['planning', 'recruiting', 'data-collection', 'analysis', 'publishing', 'completed'];
        const phaseCounts = {};
        
        projects.forEach(project => {
            phaseCounts[project.phase] = (phaseCounts[project.phase] || 0) + 1;
        });
        
        return phases.map(phase => {
            const count = phaseCounts[phase] || 0;
            const width = count > 0 ? Math.max(20, count * 20) : 0;
            
            return `
                <div class="stage-item ${phase} ${count > 0 ? 'active' : ''}" style="width: ${width}px">
                    <span class="stage-label">${phase.replace('-', ' ')}</span>
                </div>
            `;
        }).join('');
    }
    
    generateEngagementChart(projects) {
        // Simplified engagement chart
        let totalEngagement = 0;
        projects.forEach(project => {
            if (project.discussions) {
                project.discussions.forEach(disc => {
                    totalEngagement += this.calculateDiscussionEngagement(disc);
                });
            }
        });
        
        const engagementLevel = Math.min(100, totalEngagement / 10);
        
        return `
            <div class="relative h-4 bg-ui-border rounded-full overflow-hidden">
                <div class="absolute top-0 left-0 h-full bg-gradient-to-r from-status-info to-status-success rounded-full" 
                     style="width: ${engagementLevel}%"></div>
            </div>
            <div class="text-sm text-muted mt-2">Engagement score: ${Math.round(engagementLevel)}/100</div>
        `;
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
