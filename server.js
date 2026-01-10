// ============================================
// [THØRAX][LAB] PRO - Elite Clinical Innovation Platform
// ============================================

class ThoraxLabPro {
    constructor() {
        this.user = JSON.parse(localStorage.getItem('thoraxlab_user') || 'null');
        this.isVisitor = JSON.parse(localStorage.getItem('thoraxlab_visitor') || 'false');
        this.currentProject = null;
        this.currentDiscussion = null;
        this.discussionSort = 'popular';
        this.projectSort = 'recent';
        this.searchQuery = '';
        this.initialize();
    }
    
    // ========== INITIALIZATION ==========
    
    initialize() {
        this.setupEventListeners();
        this.setupRouter();
        this.checkAuth();
        this.initializeDemoData();
    }
    
    initializeDemoData() {
        if (!localStorage.getItem('thoraxlab_projects')) {
            const demoProjects = [
                {
                    id: 'proj_1',
                    title: 'AI-Powered COPD Exacerbation Prediction',
                    description: 'Developing machine learning models to predict COPD exacerbations 48 hours in advance using patient vitals, spirometry data, and environmental factors. This innovation aims to reduce hospital readmissions by enabling early intervention.',
                    tags: ['AI', 'COPD', 'prediction', 'machine learning'],
                    ownerId: 'demo_user',
                    ownerName: 'Dr. Sarah Chen',
                    ownerRole: 'clinical',
                    institution: 'Cambridge University Hospitals',
                    teamMembers: ['Dr. Michael Johnson', 'Dr. Lisa Wang', 'Prof. James Wilson'],
                    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
                    updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
                    discussions: [
                        {
                            id: 'disc_1',
                            title: 'Which clinical features are most predictive?',
                            content: 'We need to decide on the most important clinical features for our prediction model. Should we prioritize spirometry data, patient-reported symptoms, or environmental factors?',
                            type: 'brainstorm',
                            authorId: 'demo_user',
                            authorName: 'Dr. Sarah Chen',
                            authorInstitution: 'Cambridge University Hospitals',
                            authorRole: 'clinical',
                            createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
                            likes: 24,
                            comments: 12,
                            views: 156,
                            commentsList: [
                                {
                                    id: 'comment_1',
                                    content: 'Based on our preliminary analysis, spirometry data shows the highest correlation with exacerbation events. The FEV1/FVC ratio appears particularly significant.',
                                    authorName: 'Dr. Michael Johnson',
                                    authorInstitution: 'Massachusetts General Hospital',
                                    authorRole: 'technical',
                                    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
                                    likes: 8
                                },
                                {
                                    id: 'comment_2',
                                    content: 'Patient-reported symptoms might provide early warning signals before objective measures change. We should consider integrating PROs into our model.',
                                    authorName: 'Dr. Lisa Wang',
                                    authorInstitution: 'Stanford Medicine',
                                    authorRole: 'clinical',
                                    createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
                                    likes: 6
                                }
                            ]
                        }
                    ]
                },
                {
                    id: 'proj_2',
                    title: 'Genomic Biomarkers for Immunotherapy Response',
                    description: 'Identifying genomic signatures that predict response to immune checkpoint inhibitors in non-small cell lung cancer. Multi-center collaboration with genomic sequencing data from 500+ patients.',
                    tags: ['genomics', 'oncology', 'immunotherapy', 'biomarkers'],
                    ownerId: 'demo_user_2',
                    ownerName: 'Prof. Robert Kim',
                    ownerRole: 'both',
                    institution: 'Oxford University',
                    teamMembers: ['Dr. Emma Davis', 'Prof. Alex Thompson'],
                    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
                    updatedAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
                    discussions: [
                        {
                            id: 'disc_3',
                            title: 'Tumor Mutational Burden vs PD-L1 Expression',
                            content: 'We need to determine which biomarker shows stronger predictive value for immunotherapy response in our cohort.',
                            type: 'decision',
                            authorId: 'demo_user_2',
                            authorName: 'Prof. Robert Kim',
                            authorInstitution: 'Oxford University',
                            authorRole: 'both',
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
    
    loginAsCreator(e) {
        if (e) e.preventDefault();
        
        const name = document.getElementById('creatorName').value.trim();
        const role = document.getElementById('creatorRole').value;
        const institution = document.getElementById('creatorInstitution').value.trim();
        
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
            avatar_initials: initials,
            createdAt: new Date().toISOString()
        };
        
        this.isVisitor = false;
        
        localStorage.setItem('thoraxlab_user', JSON.stringify(this.user));
        localStorage.setItem('thoraxlab_visitor', 'false');
        
        this.showApp();
        this.updateUserDisplay();
        this.showToast(`Welcome to [THØRAX][LAB] PRO, ${name.split(' ')[0]}!`, 'success');
    }
    
    loginAsVisitor(e) {
        if (e) e.preventDefault();
        
        const name = document.getElementById('visitorName').value.trim();
        
        this.user = {
            id: `visitor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: name || 'Guest Researcher',
            role: 'visitor',
            institution: 'Viewing Only',
            avatar_initials: 'G',
            createdAt: new Date().toISOString()
        };
        
        this.isVisitor = true;
        
        localStorage.setItem('thoraxlab_user', JSON.stringify(this.user));
        localStorage.setItem('thoraxlab_visitor', 'true');
        
        this.showApp();
        this.updateUserDisplay();
        this.showToast('You are browsing as a visitor', 'info');
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
            role.textContent = this.isVisitor ? 'Guest Researcher' : 
                `${this.user.role.charAt(0).toUpperCase() + this.user.role.slice(1)} Professional`;
        }
        
        if (visitorBadge) {
            visitorBadge.classList.toggle('hidden', !this.isVisitor);
        }
        
        if (newProjectBtn) {
            newProjectBtn.classList.toggle('hidden', this.isVisitor);
        }
        
        const welcome = document.getElementById('welcomeMessage');
        if (welcome && !this.isVisitor) {
            welcome.textContent = `Welcome back, ${this.user.name.split(' ')[0]}`;
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
            this.loadProject(parts[1]);
        } else if (parts[0] === 'discussion' && parts[1]) {
            this.loadDiscussion(parts[1]);
        }
        
        document.querySelectorAll('.nav-link').forEach(link => {
            const linkPage = link.getAttribute('href').substring(1);
            if (linkPage.includes('/')) {
                const linkBase = linkPage.split('/')[0];
                link.classList.toggle('active', linkBase === parts[0]);
            } else {
                link.classList.toggle('active', linkPage === parts[0]);
            }
        });
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
    
    navigateTo(page) {
        window.location.hash = page;
    }
    
    // ========== DATA LOADING ==========
    
    loadDashboard() {
        this.loadFeaturedDiscussions();
        this.loadRecentProjects();
        this.loadUserStats();
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
        this.renderFeaturedDiscussions(featured);
    }
    
    loadRecentProjects() {
        const projects = this.getProjects();
        projects.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        const recent = projects.slice(0, 3);
        this.renderRecentProjects(recent);
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
    
    loadAllProjects() {
        let projects = this.getProjects();
        
        if (this.searchQuery) {
            const query = this.searchQuery.toLowerCase();
            projects = projects.filter(project => 
                project.title.toLowerCase().includes(query) ||
                project.description.toLowerCase().includes(query) ||
                project.tags.some(tag => tag.toLowerCase().includes(query)) ||
                project.institution.toLowerCase().includes(query)
            );
        }
        
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
            case 'institution':
                projects.sort((a, b) => (a.institution || '').localeCompare(b.institution || ''));
                break;
        }
        
        this.renderAllProjects(projects);
    }
    
    loadMyProjects() {
        if (this.isVisitor) {
            this.showToast('Visitors cannot create projects', 'warning');
            this.navigateTo('dashboard');
            return;
        }
        
        const projects = this.getProjects();
        const myProjects = projects.filter(p => p.ownerId === this.user.id);
        this.renderMyProjects(myProjects);
    }
    
    loadProject(projectId) {
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
    
    loadDiscussion(discussionId) {
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
        
        if (!title || !description) {
            this.showToast('Title and description are required', 'error');
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
            ownerRole: this.user.role,
            teamMembers: [],
            discussions: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        const projects = this.getProjects();
        projects.push(project);
        this.saveProjects(projects);
        
        this.addToUserProjects(project.id);
        
        this.showToast('Project created successfully!', 'success');
        this.hideModal('newProjectModal');
        this.navigateTo(`project/${project.id}`);
    }
    
    joinProject(projectId) {
        const projects = this.getProjects();
        const project = projects.find(p => p.id === projectId);
        
        if (!project) {
            this.showToast('Project not found', 'error');
            return;
        }
        
        if (project.teamMembers.includes(this.user.name)) {
            this.showToast('You are already in this project team', 'info');
            return;
        }
        
        project.teamMembers.push(this.user.name);
        project.updatedAt = new Date().toISOString();
        this.saveProjects(projects);
        
        this.addToUserProjects(projectId);
        
        this.showToast(`Joined project: ${project.title}`, 'success');
        this.loadAllProjects();
    }
    
    leaveProject(projectId) {
        const projects = this.getProjects();
        const project = projects.find(p => p.id === projectId);
        
        if (!project) {
            this.showToast('Project not found', 'error');
            return;
        }
        
        if (project.ownerId === this.user.id) {
            this.showToast('Project owners cannot leave their own project', 'error');
            return;
        }
        
        const memberIndex = project.teamMembers.indexOf(this.user.name);
        if (memberIndex !== -1) {
            project.teamMembers.splice(memberIndex, 1);
            project.updatedAt = new Date().toISOString();
            this.saveProjects(projects);
            
            this.removeFromUserProjects(projectId);
            
            this.showToast(`Left project: ${project.title}`, 'success');
            this.loadAllProjects();
        }
    }
    
    // ========== DISCUSSION MANAGEMENT ==========
    
    createDiscussion() {
        const projectId = document.getElementById('discussionProjectId').value;
        const title = document.getElementById('discussionTitle').value.trim();
        const content = document.getElementById('discussionContent').value.trim();
        const type = document.querySelector('.discussion-type-btn.active').dataset.type;
        
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
        
        this.showToast('Discussion started successfully!', 'success');
        this.hideModal('newDiscussionModal');
        this.navigateTo(`discussion/${discussion.id}`);
    }
    
    // ========== COMMENT MANAGEMENT ==========
    
    addComment() {
        const discussionId = document.getElementById('commentDiscussionId').value;
        const content = document.getElementById('commentContent').value.trim();
        
        if (!content) {
            this.showToast('Comment content is required', 'error');
            return;
        }
        
        if (content.length > 1000) {
            this.showToast('Comment must be 1000 characters or less', 'error');
            return;
        }
        
        const comment = {
            id: `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            content: content,
            authorId: this.user.id,
            authorName: this.user.name,
            authorInstitution: this.user.institution,
            authorRole: this.user.role,
            createdAt: new Date().toISOString(),
            likes: 0
        };
        
        // FIXED ERROR HERE: Using commentsList instead of comments
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
            this.showToast('Comment added successfully!', 'success');
            this.hideModal('commentModal');
            this.loadDiscussion(discussionId);
        } else {
            this.showToast('Discussion not found', 'error');
        }
    }
    
    // ========== ENGAGEMENT FEATURES ==========
    
    toggleDiscussionLike(discussionId) {
        const likedDiscussions = JSON.parse(localStorage.getItem('thoraxlab_discussion_likes') || '{}');
        
        if (likedDiscussions[discussionId]) {
            delete likedDiscussions[discussionId];
            this.updateDiscussionLikes(discussionId, -1);
        } else {
            likedDiscussions[discussionId] = true;
            this.updateDiscussionLikes(discussionId, 1);
        }
        
        localStorage.setItem('thoraxlab_discussion_likes', JSON.stringify(likedDiscussions));
        this.loadDashboard();
    }
    
    toggleCommentLike(commentId) {
        const likedComments = JSON.parse(localStorage.getItem('thoraxlab_comment_likes') || '{}');
        
        if (likedComments[commentId]) {
            delete likedComments[commentId];
            this.updateCommentLikes(commentId, -1);
        } else {
            likedComments[commentId] = true;
            this.updateCommentLikes(commentId, 1);
        }
        
        localStorage.setItem('thoraxlab_comment_likes', JSON.stringify(likedComments));
    }
    
    updateDiscussionLikes(discussionId, delta) {
        const projects = this.getProjects();
        
        for (const project of projects) {
            if (project.discussions) {
                const discussion = project.discussions.find(d => d.id === discussionId);
                if (discussion) {
                    discussion.likes = (discussion.likes || 0) + delta;
                    project.updatedAt = new Date().toISOString();
                    break;
                }
            }
        }
        
        this.saveProjects(projects);
        
        if (this.currentDiscussion && this.currentDiscussion.id === discussionId) {
            this.currentDiscussion.likes = (this.currentDiscussion.likes || 0) + delta;
            this.renderDiscussionDetail();
        }
    }
    
    updateCommentLikes(commentId, delta) {
        const projects = this.getProjects();
        
        for (const project of projects) {
            if (project.discussions) {
                for (const discussion of project.discussions) {
                    if (discussion.commentsList) {
                        const comment = discussion.commentsList.find(c => c.id === commentId);
                        if (comment) {
                            comment.likes = (comment.likes || 0) + delta;
                            project.updatedAt = new Date().toISOString();
                            this.saveProjects(projects);
                            
                            if (this.currentDiscussion && this.currentDiscussion.id === discussion.id) {
                                this.loadDiscussion(discussion.id);
                            }
                            return;
                        }
                    }
                }
            }
        }
    }
    
    hasLikedDiscussion(discussionId) {
        const likedDiscussions = JSON.parse(localStorage.getItem('thoraxlab_discussion_likes') || '{}');
        return !!likedDiscussions[discussionId];
    }
    
    hasLikedComment(commentId) {
        const likedComments = JSON.parse(localStorage.getItem('thoraxlab_comment_likes') || '{}');
        return !!likedComments[commentId];
    }
    
    // ========== RENDERING METHODS ==========
    
    renderFeaturedDiscussions(discussions) {
        const container = document.getElementById('featuredDiscussions');
        if (!container) return;
        
        if (!discussions.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">💬</div>
                    <h3 class="mb-2">No discussions yet</h3>
                    <p class="text-muted">Start the first discussion in a project!</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = discussions.map(disc => {
            const engagementScore = (disc.likes || 0) + (disc.comments || 0);
            const engagementPercentage = Math.min(100, engagementScore * 3);
            const isElite = engagementScore >= 20;
            
            return `
                <div class="elite-discussion-card" data-discussion-id="${disc.id}" data-project-id="${disc.projectId}">
                    <div class="discussion-header">
                        <div class="discussion-type-badge type-${disc.type}">
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
                                <div class="author-institution">${this.escapeHtml(disc.authorInstitution || '')}</div>
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
                    
                    <div class="engagement-bar">
                        <div class="engagement-fill" style="width: ${engagementPercentage}%"></div>
                    </div>
                </div>
            `;
        }).join('');
        
        container.querySelectorAll('.elite-discussion-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (!e.target.closest('.action-btn')) {
                    const discussionId = card.dataset.discussionId;
                    this.navigateTo(`discussion/${discussionId}`);
                }
            });
        });
    }
    
    renderRecentProjects(projects) {
        const container = document.getElementById('recentProjects');
        if (!container) return;
        
        if (!projects.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📁</div>
                    <h3 class="mb-2">No projects yet</h3>
                    <p class="text-muted">Create the first clinical innovation project!</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = projects.map(project => {
            const discussionCount = project.discussions ? project.discussions.length : 0;
            const totalEngagement = this.calculateProjectEngagement(project);
            
            return `
                <div class="elite-project-card" data-project-id="${project.id}">
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
                                <i class="fas fa-chart-line"></i>
                                <span>${totalEngagement}</span>
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
        
        container.querySelectorAll('.elite-project-card').forEach(card => {
            card.addEventListener('click', () => {
                const projectId = card.dataset.projectId;
                this.navigateTo(`project/${projectId}`);
            });
        });
    }
    
    renderAllProjects(projects) {
        const container = document.getElementById('allProjectsList');
        if (!container) return;
        
        if (!projects.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🔍</div>
                    <h3 class="mb-2">No projects found</h3>
                    <p class="text-muted">${this.searchQuery ? 'Try a different search term' : 'Be the first to create a project!'}</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = projects.map(project => {
            const discussionCount = project.discussions ? project.discussions.length : 0;
            const totalEngagement = this.calculateProjectEngagement(project);
            const isOwner = !this.isVisitor && project.ownerId === this.user.id;
            const isMember = project.teamMembers && project.teamMembers.includes(this.user?.name);
            
            return `
                <div class="elite-project-card-large" data-project-id="${project.id}">
                    <div class="project-card-header">
                        <div class="institution-badge">
                            <i class="fas fa-university"></i>
                            ${this.escapeHtml(project.institution || 'Leading Institution')}
                        </div>
                        <div class="project-status">
                            ${isOwner ? `
                                <span class="status-owner">Project Lead</span>
                            ` : isMember ? `
                                <span class="status-member">Team Member</span>
                            ` : ''}
                        </div>
                    </div>
                    
                    <h3 class="project-card-title">${this.escapeHtml(project.title)}</h3>
                    
                    <p class="project-card-description">
                        ${this.escapeHtml(project.description.substring(0, 200))}${project.description.length > 200 ? '...' : ''}
                    </p>
                    
                    <div class="project-card-tags">
                        ${project.tags.map(tag => `
                            <span class="project-card-tag">${this.escapeHtml(tag)}</span>
                        `).join('')}
                    </div>
                    
                    <div class="project-card-metrics">
                        <div class="metric-item">
                            <div class="metric-icon">
                                <i class="fas fa-comments"></i>
                            </div>
                            <div class="metric-content">
                                <div class="metric-value">${discussionCount}</div>
                                <div class="metric-label">Discussions</div>
                            </div>
                        </div>
                        <div class="metric-item">
                            <div class="metric-icon">
                                <i class="fas fa-heart"></i>
                            </div>
                            <div class="metric-content">
                                <div class="metric-value">${totalEngagement}</div>
                                <div class="metric-label">Engagement</div>
                            </div>
                        </div>
                        <div class="metric-item">
                            <div class="metric-icon">
                                <i class="fas fa-users"></i>
                            </div>
                            <div class="metric-content">
                                <div class="metric-value">${(project.teamMembers?.length || 0) + 1}</div>
                                <div class="metric-label">Team</div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="project-card-actions">
                        ${!this.isVisitor && !isOwner && !isMember ? `
                            <button class="btn-elite-join join-project-btn" data-project-id="${project.id}">
                                <i class="fas fa-plus-circle"></i>
                                Request to Join
                            </button>
                        ` : isMember && !isOwner ? `
                            <button class="btn-elite-leave leave-project-btn" data-project-id="${project.id}">
                                <i class="fas fa-sign-out-alt"></i>
                                Leave Project
                            </button>
                        ` : ''}
                        <button class="btn-elite-primary" onclick="app.navigateTo('project/${project.id}')">
                            <i class="fas fa-arrow-right"></i>
                            View Project
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        
        container.querySelectorAll('.elite-project-card-large').forEach(card => {
            card.addEventListener('click', (e) => {
                if (!e.target.closest('.join-project-btn') && !e.target.closest('.leave-project-btn') && !e.target.closest('.btn-elite-primary')) {
                    const projectId = card.dataset.projectId;
                    this.navigateTo(`project/${projectId}`);
                }
            });
        });
        
        container.querySelectorAll('.join-project-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const projectId = btn.dataset.projectId;
                this.joinProject(projectId);
            });
        });
        
        container.querySelectorAll('.leave-project-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const projectId = btn.dataset.projectId;
                this.leaveProject(projectId);
            });
        });
    }
    
    renderMyProjects(projects) {
        const container = document.getElementById('myProjectsList');
        if (!container) return;
        
        if (!projects.length) {
            container.innerHTML = `
                <div class="empty-state-elite">
                    <div class="empty-icon-elite">
                        <i class="fas fa-flask"></i>
                    </div>
                    <h3>No Projects Yet</h3>
                    <p class="text-muted">Initiate your first clinical innovation project</p>
                    <button class="btn-elite-primary mt-4" id="createFirstProjectBtn">
                        <i class="fas fa-plus-circle"></i>
                        Create First Project
                    </button>
                </div>
            `;
            
            document.getElementById('createFirstProjectBtn')?.addEventListener('click', () => {
                this.showModal('newProjectModal');
            });
            
            return;
        }
        
        container.innerHTML = projects.map(project => {
            const discussionCount = project.discussions ? project.discussions.length : 0;
            const totalEngagement = this.calculateProjectEngagement(project);
            
            return `
                <div class="elite-project-card-admin" data-project-id="${project.id}">
                    <div class="project-admin-header">
                        <div class="admin-badge">
                            <i class="fas fa-crown"></i>
                            Project Lead
                        </div>
                        <div class="project-admin-actions">
                            <button class="btn-admin-icon" title="Edit Project">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-admin-icon btn-admin-danger" title="Delete Project">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    
                    <h3 class="project-admin-title">${this.escapeHtml(project.title)}</h3>
                    
                    <div class="project-admin-institution">
                        <i class="fas fa-university"></i>
                        ${this.escapeHtml(project.institution || '')}
                    </div>
                    
                    <p class="project-admin-description">
                        ${this.escapeHtml(project.description.substring(0, 180))}${project.description.length > 180 ? '...' : ''}
                    </p>
                    
                    <div class="project-admin-metrics">
                        <div class="admin-metric">
                            <div class="admin-metric-value">${discussionCount}</div>
                            <div class="admin-metric-label">Discussions</div>
                        </div>
                        <div class="admin-metric">
                            <div class="admin-metric-value">${totalEngagement}</div>
                            <div class="admin-metric-label">Engagement</div>
                        </div>
                        <div class="admin-metric">
                            <div class="admin-metric-value">${(project.teamMembers?.length || 0) + 1}</div>
                            <div class="admin-metric-label">Team Size</div>
                        </div>
                    </div>
                    
                    <div class="project-admin-footer">
                        <div class="project-admin-tags">
                            ${project.tags.map(tag => `
                                <span class="admin-tag">${this.escapeHtml(tag)}</span>
                            `).join('')}
                        </div>
                        <button class="btn-admin-primary" onclick="app.navigateTo('project/${project.id}')">
                            <i class="fas fa-arrow-right"></i>
                            Manage Project
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        
        container.querySelectorAll('.elite-project-card-admin').forEach(card => {
            card.addEventListener('click', (e) => {
                if (!e.target.closest('.btn-admin-icon') && !e.target.closest('.btn-admin-primary')) {
                    const projectId = card.dataset.projectId;
                    this.navigateTo(`project/${projectId}`);
                }
            });
        });
    }
    
    renderProjectDetail() {
        const container = document.getElementById('projectDetailPage');
        if (!container || !this.currentProject) return;
        
        const project = this.currentProject;
        const isOwner = !this.isVisitor && project.ownerId === this.user.id;
        const isMember = project.teamMembers && project.teamMembers.includes(this.user?.name);
        const discussions = project.discussions || [];
        
        container.innerHTML = `
            <div class="project-detail-container">
                <div class="project-detail-header">
                    <div>
                        <div class="institution-banner">
                            <i class="fas fa-university"></i>
                            ${this.escapeHtml(project.institution || 'Leading Institution')}
                        </div>
                        <h1 class="project-detail-title">${this.escapeHtml(project.title)}</h1>
                        <div class="project-detail-meta">
                            <div class="meta-item">
                                <i class="fas fa-user-md"></i>
                                <span>Led by ${this.escapeHtml(project.ownerName)}</span>
                            </div>
                            <div class="meta-item">
                                <i class="fas fa-calendar"></i>
                                <span>Initiated ${this.formatDate(project.createdAt)}</span>
                            </div>
                        </div>
                    </div>
                    <div class="project-header-actions">
                        <button class="btn-elite-secondary" id="backToProjectsBtn">
                            <i class="fas fa-arrow-left"></i>
                            Back
                        </button>
                        ${isOwner ? `
                            <button class="btn-elite-primary" id="addDiscussionBtn">
                                <i class="fas fa-plus-circle"></i>
                                New Discussion
                            </button>
                        ` : !this.isVisitor && !isMember ? `
                            <button class="btn-elite-join" id="joinThisProjectBtn">
                                <i class="fas fa-user-plus"></i>
                                Request to Join
                            </button>
                        ` : isMember && !isOwner ? `
                            <button class="btn-elite-leave" id="leaveThisProjectBtn">
                                <i class="fas fa-sign-out-alt"></i>
                                Leave Project
                            </button>
                        ` : ''}
                    </div>
                </div>
                
                <div class="project-detail-content">
                    <div class="project-main-card">
                        <div class="card-header-elite">
                            <h2><i class="fas fa-book-open"></i> Project Overview</h2>
                        </div>
                        <div class="project-description">
                            ${this.escapeHtml(project.description)}
                        </div>
                        
                        <div class="project-tags-section">
                            <h3><i class="fas fa-tags"></i> Research Domains</h3>
                            <div class="tags-container">
                                ${project.tags.map(tag => `
                                    <span class="elite-tag">${this.escapeHtml(tag)}</span>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                    
                    <div class="project-sidebar">
                        <div class="sidebar-card">
                            <h3><i class="fas fa-users"></i> Research Team</h3>
                            <div class="team-list">
                                <div class="team-member-elite lead-member">
                                    <div class="member-avatar">${project.ownerName.substring(0, 2).toUpperCase()}</div>
                                    <div class="member-info">
                                        <div class="member-name">${this.escapeHtml(project.ownerName)}</div>
                                        <div class="member-role">Project Lead</div>
                                    </div>
                                </div>
                                ${project.teamMembers.map(member => `
                                    <div class="team-member-elite">
                                        <div class="member-avatar" style="background: linear-gradient(135deg, #64748B, #475569);">
                                            ${member.substring(0, 2).toUpperCase()}
                                        </div>
                                        <div class="member-info">
                                            <div class="member-name">${this.escapeHtml(member)}</div>
                                            <div class="member-role">Collaborator</div>
                                        </div>
                                    </div>
                                `).join('')}
                                ${isOwner ? `
                                    <button class="btn-elite-secondary btn-sm mt-3" id="inviteTeamMemberBtn">
                                        <i class="fas fa-user-plus"></i>
                                        Invite Collaborator
                                    </button>
                                ` : ''}
                            </div>
                        </div>
                        
                        <div class="sidebar-card">
                            <h3><i class="fas fa-chart-bar"></i> Project Metrics</h3>
                            <div class="metrics-grid">
                                <div class="metric-card">
                                    <div class="metric-icon">
                                        <i class="fas fa-comments"></i>
                                    </div>
                                    <div class="metric-content">
                                        <div class="metric-value">${discussions.length}</div>
                                        <div class="metric-label">Discussions</div>
                                    </div>
                                </div>
                                <div class="metric-card">
                                    <div class="metric-icon">
                                        <i class="fas fa-heart"></i>
                                    </div>
                                    <div class="metric-content">
                                        <div class="metric-value">${this.calculateProjectEngagement(project)}</div>
                                        <div class="metric-label">Engagement</div>
                                    </div>
                                </div>
                                <div class="metric-card">
                                    <div class="metric-icon">
                                        <i class="fas fa-eye"></i>
                                    </div>
                                    <div class="metric-content">
                                        <div class="metric-value">${discussions.reduce((sum, d) => sum + (d.views || 0), 0)}</div>
                                        <div class="metric-label">Views</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="project-discussions-section">
                    <div class="section-header">
                        <h2><i class="fas fa-comments"></i> Research Discussions</h2>
                        ${(isOwner || isMember) && !this.isVisitor ? `
                            <button class="btn-elite-primary" id="startDiscussionBtn">
                                <i class="fas fa-plus-circle"></i>
                                Start Discussion
                            </button>
                        ` : ''}
                    </div>
                    
                    <div id="projectDiscussions">
                        ${discussions.length > 0 ? discussions.map(disc => {
                            const engagementScore = (disc.likes || 0) + (disc.comments || 0);
                            const isElite = engagementScore >= 20;
                            
                            return `
                                <div class="discussion-card-elite" data-discussion-id="${disc.id}">
                                    <div class="discussion-card-header">
                                        <div class="discussion-type-indicator type-${disc.type}">
                                            <i class="${this.getDiscussionIcon(disc.type)}"></i>
                                            <span>${disc.type}</span>
                                        </div>
                                        ${isElite ? `
                                            <div class="elite-discussion-badge">
                                                <i class="fas fa-crown"></i>
                                                Elite Discussion
                                            </div>
                                        ` : ''}
                                    </div>
                                    
                                    <h3 class="discussion-card-title">${this.escapeHtml(disc.title)}</h3>
                                    
                                    <p class="discussion-card-excerpt">
                                        ${this.escapeHtml(disc.content.substring(0, 160))}${disc.content.length > 160 ? '...' : ''}
                                    </p>
                                    
                                    <div class="discussion-card-footer">
                                        <div class="discussion-author">
                                            <div class="author-avatar-small">${disc.authorName.substring(0, 2).toUpperCase()}</div>
                                            <div>
                                                <div class="author-name">${this.escapeHtml(disc.authorName)}</div>
                                                <div class="author-institution">${disc.authorInstitution || ''}</div>
                                            </div>
                                        </div>
                                        
                                        <div class="discussion-engagement">
                                            <div class="engagement-action ${this.hasLikedDiscussion(disc.id) ? 'active' : ''}" 
                                                  data-discussion-id="${disc.id}">
                                                <i class="fas fa-heart"></i>
                                                <span>${disc.likes || 0}</span>
                                            </div>
                                            <div class="engagement-action">
                                                <i class="fas fa-comment"></i>
                                                <span>${disc.comments || 0}</span>
                                            </div>
                                            <div class="engagement-action">
                                                <i class="fas fa-eye"></i>
                                                <span>${disc.views || 0}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('') : `
                            <div class="empty-state-section">
                                <div class="empty-icon-section">
                                    <i class="fas fa-comments"></i>
                                </div>
                                <h3>No Discussions Yet</h3>
                                <p class="text-muted">Start the first research discussion for this project</p>
                            </div>
                        `}
                    </div>
                </div>
            </div>
        `;
        
        this.setupProjectDetailListeners();
    }
    
    renderDiscussionDetail() {
        const container = document.getElementById('discussionDetailPage');
        if (!container || !this.currentDiscussion) return;
        
        const discussion = this.currentDiscussion;
        const hasLiked = this.hasLikedDiscussion(discussion.id);
        
        container.innerHTML = `
            <div class="discussion-detail-container">
                <div class="discussion-detail-header">
                    <div>
                        <div class="discussion-breadcrumb">
                            <a href="#project/${discussion.projectId}" class="breadcrumb-link">
                                <i class="fas fa-arrow-left"></i>
                                Back to Project
                            </a>
                            <span class="breadcrumb-separator">/</span>
                            <span class="breadcrumb-current">Discussion</span>
                        </div>
                        <h1 class="discussion-detail-title">${this.escapeHtml(discussion.title)}</h1>
                        <div class="discussion-detail-meta">
                            <div class="meta-item">
                                <i class="fas fa-user-md"></i>
                                <span>${this.escapeHtml(discussion.authorName)}</span>
                                <span class="meta-institution">${discussion.authorInstitution || ''}</span>
                            </div>
                            <div class="meta-item">
                                <i class="fas fa-calendar"></i>
                                <span>${this.formatDate(discussion.createdAt)}</span>
                            </div>
                            <div class="meta-item">
                                <div class="discussion-type-badge type-${discussion.type}">
                                    <i class="${this.getDiscussionIcon(discussion.type)}"></i>
                                    ${discussion.type}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="discussion-header-actions">
                        <button class="engagement-btn ${hasLiked ? 'active' : ''}" 
                                data-discussion-id="${discussion.id}">
                            <i class="fas fa-heart"></i>
                            <span>${discussion.likes || 0}</span>
                        </button>
                        ${!this.isVisitor ? `
                            <button class="btn-elite-primary" id="addCommentBtn">
                                <i class="fas fa-comment-medical"></i>
                                Add Insight
                            </button>
                        ` : ''}
                    </div>
                </div>
                
                <div class="discussion-detail-content">
                    <div class="discussion-main-card">
                        <div class="discussion-content">
                            ${this.escapeHtml(discussion.content).replace(/\n/g, '<br>')}
                        </div>
                        
                        <div class="discussion-engagement-bar">
                            <div class="engagement-stats">
                                <div class="engagement-stat">
                                    <i class="fas fa-heart"></i>
                                    <span>${discussion.likes || 0} Insights Appreciated</span>
                                </div>
                                <div class="engagement-stat">
                                    <i class="fas fa-comment"></i>
                                    <span>${discussion.comments || 0} Expert Contributions</span>
                                </div>
                                <div class="engagement-stat">
                                    <i class="fas fa-eye"></i>
                                    <span>${discussion.views || 0} Views</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="comments-section">
                        <div class="section-header">
                            <h2><i class="fas fa-comments"></i> Expert Insights (${discussion.comments || 0})</h2>
                        </div>
                        
                        <div id="commentsContainer">
                            <!-- Comments loaded dynamically -->
                        </div>
                        
                        ${!this.isVisitor ? `
                            <div class="add-comment-section">
                                <button class="btn-elite-primary btn-lg" id="addNewCommentBtn">
                                    <i class="fas fa-plus-circle"></i>
                                    Contribute Your Insight
                                </button>
                            </div>
                        ` : `
                            <div class="visitor-notice">
                                <i class="fas fa-info-circle"></i>
                                <span>Guest researchers can view insights but cannot contribute</span>
                            </div>
                        `}
                    </div>
                </div>
            </div>
        `;
        
        this.loadComments();
        this.setupDiscussionDetailListeners();
    }
    
    loadComments() {
        const container = document.getElementById('commentsContainer');
        if (!container) return;
        
        const comments = this.currentDiscussion.commentsList || [];
        
        if (!comments.length) {
            container.innerHTML = `
                <div class="empty-comments">
                    <div class="empty-icon">
                        <i class="fas fa-lightbulb"></i>
                    </div>
                    <h3>No Insights Yet</h3>
                    <p class="text-muted">Be the first to contribute expert insight to this discussion</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = comments.map(comment => {
            const hasLiked = this.hasLikedComment(comment.id);
            
            return `
                <div class="expert-comment">
                    <div class="comment-header">
                        <div class="comment-author">
                            <div class="author-avatar">${comment.authorName.substring(0, 2).toUpperCase()}</div>
                            <div class="author-details">
                                <div class="author-name">${this.escapeHtml(comment.authorName)}</div>
                                <div class="author-credentials">
                                    <span class="author-institution">${comment.authorInstitution || ''}</span>
                                    <span class="author-role">${comment.authorRole ? comment.authorRole.charAt(0).toUpperCase() + comment.authorRole.slice(1) : ''}</span>
                                </div>
                            </div>
                        </div>
                        <div class="comment-meta">
                            <span class="comment-time">${this.formatDate(comment.createdAt)}</span>
                        </div>
                    </div>
                    
                    <div class="comment-content">
                        ${this.escapeHtml(comment.content)}
                    </div>
                    
                    <div class="comment-actions">
                        <button class="comment-action-btn ${hasLiked ? 'active' : ''}" 
                                data-comment-id="${comment.id}">
                            <i class="fas fa-heart"></i>
                            <span>${comment.likes || 0}</span>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        
        container.querySelectorAll('.comment-action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (this.isVisitor) {
                    this.showToast('Guests cannot appreciate insights', 'warning');
                    return;
                }
                const commentId = e.currentTarget.dataset.commentId;
                this.toggleCommentLike(commentId);
            });
        });
    }
    
    // ========== EVENT LISTENERS ==========
    
    setupEventListeners() {
        // Auth buttons
        document.getElementById('creatorLoginBtn')?.addEventListener('click', () => {
            document.getElementById('creatorForm').classList.remove('hidden');
            document.getElementById('visitorForm').classList.add('hidden');
        });
        
        document.getElementById('visitorLoginBtn')?.addEventListener('click', () => {
            document.getElementById('visitorForm').classList.remove('hidden');
            document.getElementById('creatorForm').classList.add('hidden');
        });
        
        document.getElementById('backToChoiceBtn')?.addEventListener('click', () => {
            document.getElementById('creatorForm').classList.add('hidden');
        });
        
        document.getElementById('backToChoiceBtn2')?.addEventListener('click', () => {
            document.getElementById('visitorForm').classList.add('hidden');
        });
        
        document.getElementById('creatorForm')?.addEventListener('submit', (e) => this.loginAsCreator(e));
        document.getElementById('visitorForm')?.addEventListener('submit', (e) => this.loginAsVisitor(e));
        
        // Logout
        document.getElementById('logoutBtn')?.addEventListener('click', () => this.logout());
        
        // New project
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
        
        // Search
        document.getElementById('projectSearch')?.addEventListener('input', (e) => {
            this.searchQuery = e.target.value;
            this.loadAllProjects();
        });
        
        // Modal close buttons
        document.querySelectorAll('.modal .btn-icon, .modal .btn-secondary').forEach(btn => {
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
    }
    
    setupProjectDetailListeners() {
        document.getElementById('backToProjectsBtn')?.addEventListener('click', () => {
            this.navigateTo('projects');
        });
        
        document.getElementById('addDiscussionBtn')?.addEventListener('click', () => {
            if (this.currentProject) {
                document.getElementById('discussionProjectId').value = this.currentProject.id;
                this.showModal('newDiscussionModal');
            }
        });
        
        document.getElementById('startDiscussionBtn')?.addEventListener('click', () => {
            if (this.currentProject) {
                document.getElementById('discussionProjectId').value = this.currentProject.id;
                this.showModal('newDiscussionModal');
            }
        });
        
        document.getElementById('joinThisProjectBtn')?.addEventListener('click', () => {
            if (this.currentProject) {
                this.joinProject(this.currentProject.id);
            }
        });
        
        document.getElementById('leaveThisProjectBtn')?.addEventListener('click', () => {
            if (this.currentProject) {
                this.leaveProject(this.currentProject.id);
            }
        });
        
        // Engagement actions
        document.querySelectorAll('.engagement-action').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (btn.classList.contains('active') || btn.classList.contains('fa-heart')) {
                    const discussionId = btn.dataset.discussionId;
                    if (discussionId && !this.isVisitor) {
                        this.toggleDiscussionLike(discussionId);
                    } else if (this.isVisitor) {
                        this.showToast('Guest researchers cannot appreciate insights', 'warning');
                    }
                }
            });
        });
        
        // Discussion card clicks
        document.querySelectorAll('.discussion-card-elite').forEach(card => {
            card.addEventListener('click', (e) => {
                if (!e.target.closest('.engagement-action')) {
                    const discussionId = card.dataset.discussionId;
                    this.navigateTo(`discussion/${discussionId}`);
                }
            });
        });
    }
    
    setupDiscussionDetailListeners() {
        document.getElementById('addCommentBtn')?.addEventListener('click', () => {
            document.getElementById('commentDiscussionId').value = this.currentDiscussion.id;
            this.showModal('commentModal');
        });
        
        document.getElementById('addNewCommentBtn')?.addEventListener('click', () => {
            document.getElementById('commentDiscussionId').value = this.currentDiscussion.id;
            this.showModal('commentModal');
        });
        
        document.querySelector('.engagement-btn')?.addEventListener('click', (e) => {
            if (this.isVisitor) {
                this.showToast('Guest researchers cannot appreciate insights', 'warning');
                return;
            }
            const discussionId = e.currentTarget.dataset.discussionId;
            this.toggleDiscussionLike(discussionId);
        });
    }
    
    // ========== UTILITY METHODS ==========
    
    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.add('active');
    }
    
    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
            const form = modal.querySelector('form');
            if (form) form.reset();
        }
    }
    
    // ========== DATA STORAGE ==========
    
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
    
    removeFromUserProjects(projectId) {
        const userProjects = this.getUserProjects();
        const index = userProjects.indexOf(projectId);
        if (index !== -1) {
            userProjects.splice(index, 1);
            localStorage.setItem('thoraxlab_user_projects', JSON.stringify(userProjects));
        }
    }
    
    // ========== CALCULATION HELPERS ==========
    
    calculateProjectEngagement(project) {
        if (!project.discussions) return 0;
        return project.discussions.reduce((sum, disc) => {
            return sum + (disc.likes || 0) + (disc.comments || 0);
        }, 0);
    }
    
    // ========== UI HELPER METHODS ==========
    
    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) return;
        
        const toast = document.createElement('div');
        toast.className = `toast-elite toast-${type}`;
        
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };
        
        toast.innerHTML = `
            <i class="fas ${icons[type]}"></i>
            <span>${this.escapeHtml(message)}</span>
            <button class="toast-close">&times;</button>
        `;
        
        container.appendChild(toast);
        
        toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
        
        setTimeout(() => toast.remove(), 4000);
    }
    
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) {
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            if (diffHours === 0) {
                const diffMinutes = Math.floor(diffMs / (1000 * 60));
                return diffMinutes <= 1 ? 'Just now' : `${diffMinutes} minutes ago`;
            }
            return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
        } else if (diffDays === 1) {
            return 'Yesterday';
        } else if (diffDays < 7) {
            return `${diffDays} days ago`;
        } else if (diffDays < 30) {
            const weeks = Math.floor(diffDays / 7);
            return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
        } else {
            return date.toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric', 
                year: 'numeric' 
            });
        }
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
}

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    window.app = new ThoraxLabPro();
    
    // Global helpers
    window.showModal = (modalId) => window.app.showModal(modalId);
    window.hideModal = (modalId) => window.app.hideModal(modalId);
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            document.getElementById('projectSearch')?.focus();
        }
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal.active').forEach(modal => {
                window.app.hideModal(modal.id);
            });
        }
    });
});
