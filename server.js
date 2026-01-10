// ============================================
// [THØRAX][LAB] PRO - Frontend Platform
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
        // Only create demo data if none exists
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
                    teamMembers: ['Dr. Mike Johnson', 'Dr. Lisa Wang', 'Prof. James Wilson'],
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
                            authorRole: 'clinical',
                            createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
                            likes: 15,
                            comments: 8,
                            views: 42,
                            commentsList: [
                                {
                                    id: 'comment_1',
                                    content: 'Based on our preliminary analysis, spirometry data shows the highest correlation with exacerbation events.',
                                    authorName: 'Dr. Mike Johnson',
                                    authorRole: 'technical',
                                    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
                                    likes: 5
                                },
                                {
                                    id: 'comment_2',
                                    content: 'Patient-reported symptoms might provide early warning signals before objective measures change.',
                                    authorName: 'Dr. Lisa Wang',
                                    authorRole: 'clinical',
                                    createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
                                    likes: 3
                                }
                            ]
                        },
                        {
                            id: 'disc_2',
                            title: 'Data privacy considerations',
                            content: 'How do we ensure patient data privacy while training our models? Should we use federated learning or differential privacy techniques?',
                            type: 'question',
                            authorId: 'demo_user_2',
                            authorName: 'Dr. Mike Johnson',
                            authorRole: 'technical',
                            createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
                            likes: 12,
                            comments: 6,
                            views: 38,
                            commentsList: []
                        }
                    ]
                },
                {
                    id: 'proj_2',
                    title: 'Tele-Rehabilitation for Cardiac Patients',
                    description: 'Creating a remote monitoring platform for cardiac rehabilitation patients using wearable sensors and mobile apps. Focus on improving adherence and outcomes through personalized exercise programs.',
                    tags: ['telemedicine', 'cardiology', 'wearables', 'rehabilitation'],
                    ownerId: 'demo_user_2',
                    ownerName: 'Dr. Robert Kim',
                    ownerRole: 'both',
                    teamMembers: ['Dr. Emma Davis', 'Prof. Alex Thompson'],
                    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
                    updatedAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
                    discussions: [
                        {
                            id: 'disc_3',
                            title: 'Best sensors for heart rate monitoring',
                            content: 'We need to select the most accurate and comfortable wearable sensors for continuous heart rate monitoring during rehabilitation exercises.',
                            type: 'decision',
                            authorId: 'demo_user_2',
                            authorName: 'Dr. Robert Kim',
                            authorRole: 'both',
                            createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
                            likes: 18,
                            comments: 10,
                            views: 56,
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
        const teamMembersInput = document.getElementById('teamMembers').value.trim();
        
        if (!name || !role) {
            this.showToast('Name and role are required', 'error');
            return;
        }
        
        // Generate avatar initials
        const initials = name.split(' ')
            .map(n => n[0])
            .join('')
            .toUpperCase()
            .substring(0, 2);
        
        // Parse team members
        const teamMembers = teamMembersInput ? 
            teamMembersInput.split(',').map(m => m.trim()).filter(m => m) : [];
        
        this.user = {
            id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: name,
            role: role,
            avatar_initials: initials,
            teamMembers: teamMembers,
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
            name: name || 'Anonymous Visitor',
            role: 'visitor',
            avatar_initials: 'V',
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
        }
        
        if (name) {
            name.textContent = this.user.name;
        }
        
        if (role) {
            role.textContent = this.isVisitor ? 'Visitor' : 
                this.user.role === 'clinical' ? 'Clinical Professional' :
                this.user.role === 'technical' ? 'Technical Professional' :
                this.user.role === 'both' ? 'Clinical & Technical' : this.user.role;
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
        
        // Update active nav
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
                        projectTags: project.tags
                    });
                });
            }
        });
        
        // Sort by engagement (likes + comments)
        allDiscussions.sort((a, b) => {
            const engagementA = (a.likes || 0) + (a.comments || 0);
            const engagementB = (b.likes || 0) + (b.comments || 0);
            return engagementB - engagementA;
        });
        
        // Take top 3
        const featured = allDiscussions.slice(0, 3);
        this.renderFeaturedDiscussions(featured);
    }
    
    loadRecentProjects() {
        const projects = this.getProjects();
        
        // Sort by recent activity
        projects.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        
        // Take recent 4
        const recent = projects.slice(0, 4);
        this.renderRecentProjects(recent);
    }
    
    loadAllProjects() {
        let projects = this.getProjects();
        
        // Apply search filter if any
        if (this.searchQuery) {
            const query = this.searchQuery.toLowerCase();
            projects = projects.filter(project => 
                project.title.toLowerCase().includes(query) ||
                project.description.toLowerCase().includes(query) ||
                project.tags.some(tag => tag.toLowerCase().includes(query))
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
            case 'alphabetical':
                projects.sort((a, b) => a.title.localeCompare(b.title));
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
                        projectOwnerId: project.ownerId
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
        
        // Get team members from UI
        const teamMembers = [];
        document.querySelectorAll('#teamMembersList .team-member').forEach(item => {
            const name = item.dataset.name;
            if (name) teamMembers.push(name);
        });
        
        const project = {
            id: `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            title: title,
            description: description,
            tags: tags,
            ownerId: this.user.id,
            ownerName: this.user.name,
            ownerRole: this.user.role,
            teamMembers: teamMembers,
            discussions: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        // Save to localStorage
        const projects = this.getProjects();
        projects.push(project);
        this.saveProjects(projects);
        
        // Add to user's project list
        this.addToUserProjects(project.id);
        
        this.showToast('Project created successfully!', 'success');
        this.hideModal('newProjectModal');
        this.navigateTo(`project/${project.id}`);
    }
    
    editProject(projectId) {
        // For now, just show a message
        this.showToast('Edit feature coming soon!', 'info');
        
        // Future implementation:
        // 1. Load project data into form
        // 2. Show edit modal
        // 3. Update project in localStorage
    }
    
    deleteProject(projectId) {
        if (!confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
            return;
        }
        
        const projects = this.getProjects();
        const projectIndex = projects.findIndex(p => p.id === projectId);
        
        if (projectIndex !== -1) {
            // Check if user is owner
            if (projects[projectIndex].ownerId !== this.user.id) {
                this.showToast('Only project owners can delete projects', 'error');
                return;
            }
            
            projects.splice(projectIndex, 1);
            this.saveProjects(projects);
            this.removeFromUserProjects(projectId);
            
            this.showToast('Project deleted successfully', 'success');
            this.navigateTo('myprojects');
        }
    }
    
    joinProject(projectId) {
        const projects = this.getProjects();
        const project = projects.find(p => p.id === projectId);
        
        if (!project) {
            this.showToast('Project not found', 'error');
            return;
        }
        
        // Check if already in team
        if (project.teamMembers.includes(this.user.name)) {
            this.showToast('You are already in this project team', 'info');
            return;
        }
        
        // Add to team
        project.teamMembers.push(this.user.name);
        project.updatedAt = new Date().toISOString();
        this.saveProjects(projects);
        
        // Add to user's joined projects
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
        
        // Check if user is owner
        if (project.ownerId === this.user.id) {
            this.showToast('Project owners cannot leave their own project', 'error');
            return;
        }
        
        // Remove from team
        const memberIndex = project.teamMembers.indexOf(this.user.name);
        if (memberIndex !== -1) {
            project.teamMembers.splice(memberIndex, 1);
            project.updatedAt = new Date().toISOString();
            this.saveProjects(projects);
            
            // Remove from user's project list
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
            authorRole: this.user.role,
            createdAt: new Date().toISOString(),
            likes: 0,
            comments: 0,
            views: 0,
            commentsList: []
        };
        
        // Save to project
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
    
    deleteDiscussion(discussionId) {
        if (!confirm('Are you sure you want to delete this discussion?')) {
            return;
        }
        
        const projects = this.getProjects();
        
        for (const project of projects) {
            if (project.discussions) {
                const discussionIndex = project.discussions.findIndex(d => d.id === discussionId);
                if (discussionIndex !== -1) {
                    // Check if user is author or project owner
                    if (project.discussions[discussionIndex].authorId !== this.user.id && 
                        project.ownerId !== this.user.id) {
                        this.showToast('Only discussion authors or project owners can delete discussions', 'error');
                        return;
                    }
                    
                    project.discussions.splice(discussionIndex, 1);
                    project.updatedAt = new Date().toISOString();
                    this.saveProjects(projects);
                    
                    this.showToast('Discussion deleted', 'success');
                    this.navigateTo(`project/${project.id}`);
                    return;
                }
            }
        }
        
        this.showToast('Discussion not found', 'error');
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
            authorRole: this.user.role,
            createdAt: new Date().toISOString(),
            likes: 0
        };
        
        // Find and update discussion
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
    
    deleteComment(commentId, discussionId) {
        const projects = this.getProjects();
        
        for (const project of projects) {
            if (project.discussions) {
                const discussion = project.discussions.find(d => d.id === discussionId);
                if (discussion && discussion.commentsList) {
                    const commentIndex = discussion.commentsList.findIndex(c => c.id === commentId);
                    if (commentIndex !== -1) {
                        // Check if user is comment author
                        if (discussion.commentsList[commentIndex].authorId !== this.user.id) {
                            this.showToast('Only comment authors can delete comments', 'error');
                            return;
                        }
                        
                        discussion.commentsList.splice(commentIndex, 1);
                        discussion.comments = Math.max(0, (discussion.comments || 0) - 1);
                        discussion.updatedAt = new Date().toISOString();
                        project.updatedAt = new Date().toISOString();
                        this.saveProjects(projects);
                        
                        this.showToast('Comment deleted', 'success');
                        this.loadDiscussion(discussionId);
                        return;
                    }
                }
            }
        }
        
        this.showToast('Comment not found', 'error');
    }
    
    // ========== ENGAGEMENT FEATURES ==========
    
    toggleDiscussionLike(discussionId) {
        const likedDiscussions = JSON.parse(localStorage.getItem('thoraxlab_discussion_likes') || '{}');
        
        if (likedDiscussions[discussionId]) {
            // Unlike
            delete likedDiscussions[discussionId];
            this.updateDiscussionLikes(discussionId, -1);
        } else {
            // Like
            likedDiscussions[discussionId] = true;
            this.updateDiscussionLikes(discussionId, 1);
        }
        
        localStorage.setItem('thoraxlab_discussion_likes', JSON.stringify(likedDiscussions));
        this.loadDashboard(); // Refresh featured discussions
    }
    
    toggleCommentLike(commentId) {
        const likedComments = JSON.parse(localStorage.getItem('thoraxlab_comment_likes') || '{}');
        
        if (likedComments[commentId]) {
            // Unlike
            delete likedComments[commentId];
            this.updateCommentLikes(commentId, -1);
        } else {
            // Like
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
        
        // Update UI if on discussion detail page
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
                            
                            // Update current discussion if needed
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
    
    incrementDiscussionViews(discussionId) {
        const projects = this.getProjects();
        
        for (const project of projects) {
            if (project.discussions) {
                const discussion = project.discussions.find(d => d.id === discussionId);
                if (discussion) {
                    discussion.views = (discussion.views || 0) + 1;
                    this.saveProjects(projects);
                    break;
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
            const engagementPercentage = Math.min(100, engagementScore * 5);
            const isPopular = engagementScore >= 10;
            
            return `
                <div class="discussion-card" data-discussion-id="${disc.id}" data-project-id="${disc.projectId}">
                    <div class="flex items-start justify-between mb-3">
                        <div class="flex items-center gap-2">
                            <span class="discussion-type type-${disc.type}">
                                ${this.getDiscussionIcon(disc.type)} ${disc.type}
                            </span>
                            ${isPopular ? `
                                <span class="popular-badge">
                                    <i class="fas fa-fire"></i>
                                    Popular
                                </span>
                            ` : ''}
                        </div>
                        <span class="text-sm text-muted">
                            ${this.formatDate(disc.createdAt)}
                        </span>
                    </div>
                    <h3 class="mb-2">${this.escapeHtml(disc.title)}</h3>
                    <p class="text-muted mb-3">
                        ${this.escapeHtml(disc.content.substring(0, 150))}${disc.content.length > 150 ? '...' : ''}
                    </p>
                    <div class="flex items-center justify-between text-sm">
                        <div class="flex items-center gap-4">
                            <span class="flex items-center gap-1">
                                <i class="fas fa-user-md"></i>
                                ${this.escapeHtml(disc.authorName)}
                            </span>
                            <span class="flex items-center gap-1">
                                <i class="fas fa-folder"></i>
                                ${this.escapeHtml(disc.projectTitle)}
                            </span>
                        </div>
                        <div class="flex items-center gap-3">
                            <span class="flex items-center gap-1">
                                <i class="fas fa-heart"></i>
                                ${disc.likes || 0}
                            </span>
                            <span class="flex items-center gap-1">
                                <i class="fas fa-comment"></i>
                                ${disc.comments || 0}
                            </span>
                        </div>
                    </div>
                    <div class="engagement-indicator">
                        <div class="engagement-fill" style="width: ${engagementPercentage}%"></div>
                    </div>
                </div>
            `;
        }).join('');
        
        // Add click handlers
        container.querySelectorAll('.discussion-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (!e.target.closest('.action-btn')) {
                    const discussionId = e.currentTarget.dataset.discussionId;
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
                <div class="project-card" data-project-id="${project.id}">
                    <div class="flex items-start justify-between mb-3">
                        <div>
                            <h3 class="mb-1">${this.escapeHtml(project.title)}</h3>
                            <p class="text-sm text-muted">
                                By ${this.escapeHtml(project.ownerName)} • 
                                ${this.formatDate(project.createdAt)}
                            </p>
                        </div>
                        <span class="engagement-score">
                            <i class="fas fa-chart-line"></i>
                            ${totalEngagement}
                        </span>
                    </div>
                    <p class="text-muted mb-4">
                        ${this.escapeHtml(project.description.substring(0, 180))}${project.description.length > 180 ? '...' : ''}
                    </p>
                    <div class="flex items-center justify-between">
                        <div class="flex flex-wrap gap-1">
                            ${project.tags.map(tag => `
                                <span class="tag">${this.escapeHtml(tag)}</span>
                            `).join('')}
                        </div>
                        <div class="text-sm text-muted">
                            ${discussionCount} discussion${discussionCount !== 1 ? 's' : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        // Add click handlers
        container.querySelectorAll('.project-card').forEach(card => {
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
                    <div class="empty-icon">📁</div>
                    <h3 class="mb-2">No projects found</h3>
                    <p class="text-muted">${this.searchQuery ? 'Try a different search term' : 'Be the first to create a clinical innovation project!'}</p>
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
                <div class="project-card" data-project-id="${project.id}">
                    <div class="flex items-start justify-between mb-3">
                        <div>
                            <h3 class="mb-1">${this.escapeHtml(project.title)}</h3>
                            <p class="text-sm text-muted">
                                By ${this.escapeHtml(project.ownerName)} • 
                                ${this.formatDate(project.createdAt)}
                                ${isOwner ? ' • <span class="text-thorax-blue">(Your Project)</span>' : 
                                  isMember ? ' • <span class="text-thorax-green">(Member)</span>' : ''}
                            </p>
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="engagement-score">
                                <i class="fas fa-chart-line"></i>
                                ${totalEngagement}
                            </span>
                            ${!this.isVisitor && !isOwner && !isMember ? `
                                <button class="btn btn-sm btn-secondary join-project-btn" data-project-id="${project.id}">
                                    <i class="fas fa-plus"></i>
                                    Join
                                </button>
                            ` : isMember && !isOwner ? `
                                <button class="btn btn-sm btn-error leave-project-btn" data-project-id="${project.id}">
                                    <i class="fas fa-sign-out-alt"></i>
                                    Leave
                                </button>
                            ` : ''}
                        </div>
                    </div>
                    <p class="text-muted mb-4">
                        ${this.escapeHtml(project.description.substring(0, 200))}${project.description.length > 200 ? '...' : ''}
                    </p>
                    <div class="flex items-center justify-between">
                        <div class="flex flex-wrap gap-1">
                            ${project.tags.slice(0, 3).map(tag => `
                                <span class="tag">${this.escapeHtml(tag)}</span>
                            `).join('')}
                            ${project.tags.length > 3 ? `<span class="tag">+${project.tags.length - 3}</span>` : ''}
                        </div>
                        <div class="text-sm text-muted">
                            ${discussionCount} discussion${discussionCount !== 1 ? 's' : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        // Add click handlers
        container.querySelectorAll('.project-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (!e.target.closest('.join-project-btn') && !e.target.closest('.leave-project-btn')) {
                    const projectId = card.dataset.projectId;
                    this.navigateTo(`project/${projectId}`);
                }
            });
        });
        
        // Join project buttons
        container.querySelectorAll('.join-project-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const projectId = btn.dataset.projectId;
                this.joinProject(projectId);
            });
        });
        
        // Leave project buttons
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
                <div class="empty-state">
                    <div class="empty-icon">📁</div>
                    <h3 class="mb-2">No projects yet</h3>
                    <p class="text-muted">Create your first clinical innovation project!</p>
                    <button class="btn btn-primary mt-4" id="createFirstProjectBtn">
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
                <div class="project-card" data-project-id="${project.id}">
                    <div class="flex items-start justify-between mb-3">
                        <div>
                            <h3 class="mb-1">${this.escapeHtml(project.title)}</h3>
                            <p class="text-sm text-muted">
                                Created ${this.formatDate(project.createdAt)} • 
                                Last updated ${this.formatDate(project.updatedAt)}
                            </p>
                        </div>
                        <div class="flex gap-2">
                            <button class="btn btn-sm btn-error delete-project-btn" data-project-id="${project.id}">
                                <i class="fas fa-trash"></i>
                            </button>
                            <button class="btn btn-sm btn-secondary edit-project-btn" data-project-id="${project.id}">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-sm btn-primary" onclick="app.navigateTo('project/${project.id}')">
                                Open
                            </button>
                        </div>
                    </div>
                    <p class="text-muted mb-4">
                        ${this.escapeHtml(project.description.substring(0, 180))}${project.description.length > 180 ? '...' : ''}
                    </p>
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-4">
                            <div class="flex flex-wrap gap-1">
                                ${project.tags.map(tag => `
                                    <span class="tag">${this.escapeHtml(tag)}</span>
                                `).join('')}
                            </div>
                            <span class="engagement-score">
                                <i class="fas fa-chart-line"></i>
                                ${totalEngagement}
                            </span>
                        </div>
                        <div class="text-sm text-muted">
                            ${discussionCount} discussion${discussionCount !== 1 ? 's' : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        // Edit project buttons
        container.querySelectorAll('.edit-project-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const projectId = btn.dataset.projectId;
                this.editProject(projectId);
            });
        });
        
        // Delete project buttons
        container.querySelectorAll('.delete-project-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const projectId = btn.dataset.projectId;
                this.deleteProject(projectId);
            });
        });
        
        // Project click handlers
        container.querySelectorAll('.project-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (!e.target.closest('.edit-project-btn') && !e.target.closest('.delete-project-btn') && !e.target.closest('button')) {
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
        
        // Sort discussions by popularity
        const sortedDiscussions = [...discussions].sort((a, b) => {
            const engagementA = (a.likes || 0) + (a.comments || 0);
            const engagementB = (b.likes || 0) + (b.comments || 0);
            return engagementB - engagementA;
        });
        
        container.innerHTML = `
            <div class="mb-6">
                <div class="flex items-center justify-between mb-4">
                    <div>
                        <h1>${this.escapeHtml(project.title)}</h1>
                        <p class="text-muted">
                            By ${this.escapeHtml(project.ownerName)} • 
                            ${this.formatDate(project.createdAt)}
                        </p>
                    </div>
                    <div class="flex gap-2">
                        <button class="btn btn-secondary" id="backToProjectsBtn">
                            <i class="fas fa-arrow-left"></i>
                            Back
                        </button>
                        ${isOwner ? `
                            <button class="btn btn-primary" id="addDiscussionBtn">
                                <i class="fas fa-plus"></i>
                                New Discussion
                            </button>
                        ` : !this.isVisitor && !isMember ? `
                            <button class="btn btn-primary" id="joinThisProjectBtn">
                                <i class="fas fa-user-plus"></i>
                                Join Project
                            </button>
                        ` : isMember && !isOwner ? `
                            <button class="btn btn-error" id="leaveThisProjectBtn">
                                <i class="fas fa-sign-out-alt"></i>
                                Leave Project
                            </button>
                        ` : ''}
                    </div>
                </div>
                
                <div class="card mb-6">
                    <h3 class="mb-4">Project Description</h3>
                    <p class="mb-4">${this.escapeHtml(project.description)}</p>
                    
                    <div class="flex flex-wrap gap-2 mb-4">
                        ${project.tags.map(tag => `
                            <span class="tag">${this.escapeHtml(tag)}</span>
                        `).join('')}
                    </div>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                        <div>
                            <h4 class="mb-2">Team Members</h4>
                            <div class="space-y-2">
                                <div class="flex items-center gap-2">
                                    <div class="user-avatar">${project.ownerName.substring(0, 2).toUpperCase()}</div>
                                    <div>
                                        <div class="font-medium">${this.escapeHtml(project.ownerName)}</div>
                                        <div class="text-sm text-muted">Project Lead</div>
                                    </div>
                                </div>
                                ${project.teamMembers.map(member => `
                                    <div class="flex items-center gap-2">
                                        <div class="user-avatar" style="background: var(--ui-mid);">
                                            ${member.substring(0, 2).toUpperCase()}
                                        </div>
                                        <div class="font-medium">${this.escapeHtml(member)}</div>
                                    </div>
                                `).join('')}
                                ${isOwner ? `
                                    <button class="btn btn-sm btn-secondary mt-2" id="inviteTeamMemberBtn">
                                        <i class="fas fa-user-plus"></i>
                                        Invite Team Member
                                    </button>
                                ` : ''}
                            </div>
                        </div>
                        <div>
                            <h4 class="mb-2">Project Stats</h4>
                            <div class="space-y-3">
                                <div>
                                    <div class="text-sm text-muted">Total Discussions</div>
                                    <div class="text-2xl font-bold">${discussions.length}</div>
                                </div>
                                <div>
                                    <div class="text-sm text-muted">Total Engagement</div>
                                    <div class="text-2xl font-bold">
                                        ${this.calculateProjectEngagement(project)}
                                    </div>
                                </div>
                                <div>
                                    <div class="text-sm text-muted">Last Activity</div>
                                    <div class="font-medium">${this.formatDate(project.updatedAt)}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="card">
                    <div class="flex items-center justify-between mb-6">
                        <h2>Discussions (${discussions.length})</h2>
                        ${isOwner || isMember ? `
                            <button class="btn btn-primary btn-sm" id="startDiscussionBtn">
                                <i class="fas fa-plus"></i>
                                Start Discussion
                            </button>
                        ` : ''}
                    </div>
                    
                    <div id="projectDiscussions">
                        ${sortedDiscussions.length > 0 ? sortedDiscussions.map(disc => {
                            const engagementScore = (disc.likes || 0) + (disc.comments || 0);
                            const engagementPercentage = Math.min(100, engagementScore * 5);
                            const isPopular = engagementScore >= 10;
                            const isDiscussionOwner = !this.isVisitor && disc.authorId === this.user.id;
                            const canDelete = isDiscussionOwner || isOwner;
                            
                            return `
                                <div class="discussion-card mb-4" data-discussion-id="${disc.id}">
                                    <div class="flex items-start justify-between mb-3">
                                        <div class="flex items-center gap-2">
                                            <span class="discussion-type type-${disc.type}">
                                                ${this.getDiscussionIcon(disc.type)} ${disc.type}
                                            </span>
                                            ${isPopular ? `
                                                <span class="popular-badge">
                                                    <i class="fas fa-fire"></i>
                                                    Popular
                                                </span>
                                            ` : ''}
                                        </div>
                                        <div class="flex items-center gap-2">
                                            ${canDelete ? `
                                                <button class="btn btn-xs btn-error delete-discussion-btn" 
                                                        data-discussion-id="${disc.id}"
                                                        style="padding: 2px 6px;">
                                                    <i class="fas fa-trash"></i>
                                                </button>
                                            ` : ''}
                                            <span class="text-sm text-muted">
                                                ${this.formatDate(disc.createdAt)}
                                            </span>
                                        </div>
                                    </div>
                                    <h3 class="mb-2">${this.escapeHtml(disc.title)}</h3>
                                    <p class="text-muted mb-3">
                                        ${this.escapeHtml(disc.content.substring(0, 200))}${disc.content.length > 200 ? '...' : ''}
                                    </p>
                                    <div class="flex items-center justify-between">
                                        <div class="flex items-center gap-4">
                                            <div class="flex items-center gap-2">
                                                <div class="user-avatar" style="width: 24px; height: 24px; font-size: 10px;">
                                                    ${disc.authorName.substring(0, 2).toUpperCase()}
                                                </div>
                                                <span class="text-sm">${this.escapeHtml(disc.authorName)}</span>
                                            </div>
                                            <div class="flex items-center gap-3">
                                                <button class="action-btn like-btn ${this.hasLikedDiscussion(disc.id) ? 'liked' : ''}" 
                                                        data-discussion-id="${disc.id}">
                                                    <i class="fas fa-heart"></i>
                                                    <span>${disc.likes || 0}</span>
                                                </button>
                                                <button class="action-btn comment-btn" data-discussion-id="${disc.id}">
                                                    <i class="fas fa-comment"></i>
                                                    <span>${disc.comments || 0}</span>
                                                </button>
                                            </div>
                                        </div>
                                        <span class="text-sm text-muted">
                                            Click to view discussion
                                        </span>
                                    </div>
                                    <div class="engagement-indicator">
                                        <div class="engagement-fill" style="width: ${engagementPercentage}%"></div>
                                    </div>
                                </div>
                            `;
                        }).join('') : `
                            <div class="empty-state">
                                <div class="empty-icon">💬</div>
                                <h3 class="mb-2">No discussions yet</h3>
                                <p class="text-muted">Start the first discussion!</p>
                            </div>
                        `}
                    </div>
                </div>
            </div>
        `;
        
        // Increment view count for project
        this.incrementProjectViews(project.id);
        
        // Add event listeners
        this.setupProjectDetailListeners();
    }
    
    renderDiscussionDetail() {
        const container = document.getElementById('discussionDetailPage');
        if (!this.currentDiscussion) return;
        
        const discussion = this.currentDiscussion;
        const isOwner = !this.isVisitor && discussion.authorId === this.user.id;
        const hasLiked = this.hasLikedDiscussion(discussion.id);
        
        // Increment view count
        this.incrementDiscussionViews(discussion.id);
        
        container.innerHTML = `
            <div class="mb-6">
                <div class="flex items-center justify-between mb-4">
                    <div>
                        <h1>${this.escapeHtml(discussion.title)}</h1>
                        <p class="text-muted">
                            In project: <a href="#project/${discussion.projectId}" class="text-thorax-blue">
                                ${this.escapeHtml(discussion.projectTitle)}
                            </a>
                        </p>
                    </div>
                    <div class="flex gap-2">
                        ${isOwner ? `
                            <button class="btn btn-error btn-sm" id="deleteDiscussionBtn">
                                <i class="fas fa-trash"></i>
                            </button>
                        ` : ''}
                        <button class="btn btn-secondary" id="backToProjectBtn">
                            <i class="fas fa-arrow-left"></i>
                            Back to Project
                        </button>
                        ${!this.isVisitor ? `
                            <button class="btn btn-primary" id="addCommentBtn">
                                <i class="fas fa-comment"></i>
                                Add Comment
                            </button>
                        ` : ''}
                    </div>
                </div>
                
                <div class="card mb-6">
                    <div class="flex items-start justify-between mb-4">
                        <div class="flex items-center gap-3">
                            <div class="user-avatar">${discussion.authorName.substring(0, 2).toUpperCase()}</div>
                            <div>
                                <div class="font-medium">${this.escapeHtml(discussion.authorName)}</div>
                                <div class="text-sm text-muted">
                                    ${this.formatDate(discussion.createdAt)} • 
                                    <span class="discussion-type type-${discussion.type}">
                                        ${discussion.type}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            <button class="action-btn like-btn ${hasLiked ? 'liked' : ''}" 
                                    data-discussion-id="${discussion.id}">
                                <i class="fas fa-heart"></i>
                                <span>${discussion.likes || 0}</span>
                            </button>
                            <span class="text-sm text-muted">
                                ${discussion.views || 0} views
                            </span>
                        </div>
                    </div>
                    
                    <div class="mb-6">
                        <p>${this.escapeHtml(discussion.content)}</p>
                    </div>
                    
                    <div class="engagement-indicator">
                        <div class="engagement-fill" style="width: ${Math.min(100, ((discussion.likes || 0) + (discussion.comments || 0)) * 5)}%"></div>
                    </div>
                </div>
                
                <div class="card">
                    <h3 class="mb-4">Comments (${discussion.comments || 0})</h3>
                    <div id="commentsSection">
                        <!-- Comments loaded dynamically -->
                    </div>
                    ${!this.isVisitor ? `
                        <div class="mt-4">
                            <button class="btn btn-primary w-full" id="addNewCommentBtn">
                                <i class="fas fa-plus"></i>
                                Add a Comment
                            </button>
                        </div>
                    ` : `
                        <div class="text-center py-4 text-muted">
                            <i class="fas fa-info-circle"></i>
                            Visitors can view but cannot comment
                        </div>
                    `}
                </div>
            </div>
        `;
        
        // Load comments
        this.loadComments();
        
        // Add event listeners
        this.setupDiscussionDetailListeners();
    }
    
    loadComments() {
        const container = document.getElementById('commentsSection');
        if (!container) return;
        
        const comments = this.currentDiscussion.commentsList || [];
        
        if (!comments.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">💭</div>
                    <h3 class="mb-2">No comments yet</h3>
                    <p class="text-muted">Be the first to share your thoughts!</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = comments.map(comment => {
            const hasLiked = this.hasLikedComment(comment.id);
            const isCommentOwner = !this.isVisitor && comment.authorId === this.user.id;
            
            return `
                <div class="comment">
                    <div class="comment-header">
                        <div class="user-avatar" style="width: 32px; height: 32px; font-size: 12px;">
                            ${comment.authorName.substring(0, 2).toUpperCase()}
                        </div>
                        <div class="flex-1">
                            <div class="flex items-center justify-between">
                                <div>
                                    <div class="font-medium">${this.escapeHtml(comment.authorName)}</div>
                                    <div class="text-sm text-muted">${this.formatDate(comment.createdAt)}</div>
                                </div>
                                ${isCommentOwner ? `
                                    <button class="btn btn-xs btn-error delete-comment-btn" 
                                            data-comment-id="${comment.id}"
                                            data-discussion-id="${this.currentDiscussion.id}">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                    <p class="mb-3">${this.escapeHtml(comment.content)}</p>
                    <div class="engagement-actions" style="border: none; padding: 0;">
                        <button class="action-btn comment-like-btn ${hasLiked ? 'liked' : ''}" 
                                data-comment-id="${comment.id}">
                            <i class="fas fa-heart"></i>
                            <span>${comment.likes || 0}</span>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        
        // Add like handlers for comments
        container.querySelectorAll('.comment-like-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (this.isVisitor) {
                    this.showToast('Visitors cannot like comments', 'warning');
                    return;
                }
                const commentId = e.currentTarget.dataset.commentId;
                this.toggleCommentLike(commentId);
            });
        });
        
        // Add delete handlers for comments
        container.querySelectorAll('.delete-comment-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const commentId = e.currentTarget.dataset.commentId;
                const discussionId = e.currentTarget.dataset.discussionId;
                this.deleteComment(commentId, discussionId);
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
        
        // Team member management
        document.getElementById('addTeamMemberBtn')?.addEventListener('click', () => {
            const input = document.getElementById('teamMemberInput');
            const name = input.value.trim();
            
            if (name) {
                this.addTeamMember(name);
                input.value = '';
            }
        });
        
        // Character counters
        const projectDesc = document.getElementById('projectDescription');
        if (projectDesc) {
            projectDesc.addEventListener('input', (e) => {
                const counter = document.getElementById('descCounter');
                if (counter) {
                    const length = e.target.value.length;
                    counter.textContent = `${length}/2000`;
                    counter.classList.toggle('near-limit', length > 1800);
                    counter.classList.toggle('over-limit', length > 2000);
                }
            });
        }
        
        // Discussion type selection
        document.querySelectorAll('.discussion-type-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.discussion-type-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
            });
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
        const projectSearch = document.getElementById('projectSearch');
        if (projectSearch) {
            projectSearch.addEventListener('input', (e) => {
                this.searchQuery = e.target.value;
                this.loadAllProjects();
            });
        }
        
        // Sort projects
        document.getElementById('sortProjectsBtn')?.addEventListener('click', () => {
            this.showProjectSortOptions();
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
        
        document.getElementById('inviteTeamMemberBtn')?.addEventListener('click', () => {
            this.showModal('inviteTeamModal');
        });
        
        // Discussion like buttons
        document.querySelectorAll('.like-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.isVisitor) {
                    this.showToast('Visitors cannot like discussions', 'warning');
                    return;
                }
                const discussionId = e.currentTarget.dataset.discussionId;
                this.toggleDiscussionLike(discussionId);
            });
        });
        
        // Comment buttons
        document.querySelectorAll('.comment-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const discussionId = e.currentTarget.dataset.discussionId;
                this.navigateTo(`discussion/${discussionId}`);
            });
        });
        
        // Delete discussion buttons
        document.querySelectorAll('.delete-discussion-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const discussionId = e.currentTarget.dataset.discussionId;
                this.deleteDiscussion(discussionId);
            });
        });
        
        // Discussion click handlers
        document.querySelectorAll('#projectDiscussions .discussion-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (!e.target.closest('.action-btn') && !e.target.closest('.delete-discussion-btn')) {
                    const discussionId = card.dataset.discussionId;
                    this.navigateTo(`discussion/${discussionId}`);
                }
            });
        });
    }
    
    setupDiscussionDetailListeners() {
        document.getElementById('backToProjectBtn')?.addEventListener('click', () => {
            this.navigateTo(`project/${this.currentDiscussion.projectId}`);
        });
        
        document.getElementById('addCommentBtn')?.addEventListener('click', () => {
            document.getElementById('commentDiscussionId').value = this.currentDiscussion.id;
            this.showModal('commentModal');
        });
        
        document.getElementById('addNewCommentBtn')?.addEventListener('click', () => {
            document.getElementById('commentDiscussionId').value = this.currentDiscussion.id;
            this.showModal('commentModal');
        });
        
        document.getElementById('deleteDiscussionBtn')?.addEventListener('click', () => {
            this.deleteDiscussion(this.currentDiscussion.id);
        });
        
        // Discussion like button
        document.querySelector('.like-btn')?.addEventListener('click', (e) => {
            if (this.isVisitor) {
                this.showToast('Visitors cannot like discussions', 'warning');
                return;
            }
            const discussionId = e.currentTarget.dataset.discussionId;
            this.toggleDiscussionLike(discussionId);
        });
    }
    
    // ========== UTILITY METHODS ==========
    
    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
        }
    }
    
    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
            
            // Reset forms
            const form = modal.querySelector('form');
            if (form) {
                form.reset();
                
                // Reset character counters
                const counter = modal.querySelector('.char-counter');
                if (counter) {
                    counter.textContent = '0/...';
                    counter.className = 'char-counter';
                }
            }
            
            // Clear team members list
            if (modalId === 'newProjectModal') {
                const teamList = document.getElementById('teamMembersList');
                if (teamList) teamList.innerHTML = '';
                
                const tagsContainer = document.getElementById('tagsContainer');
                if (tagsContainer) tagsContainer.innerHTML = '';
            }
        }
    }
    
    addTeamMember(name) {
        const container = document.getElementById('teamMembersList');
        if (!container) return;
        
        const memberDiv = document.createElement('div');
        memberDiv.className = 'flex items-center justify-between p-2 bg-ui-bg rounded team-member';
        memberDiv.dataset.name = name;
        memberDiv.innerHTML = `
            <div class="flex items-center gap-2">
                <div class="user-avatar" style="width: 24px; height: 24px; font-size: 10px; background: var(--ui-mid);">
                    ${name.substring(0, 2).toUpperCase()}
                </div>
                <span>${this.escapeHtml(name)}</span>
            </div>
            <button type="button" class="text-sm text-error remove-member-btn">&times;</button>
        `;
        
        // Add remove listener
        memberDiv.querySelector('.remove-member-btn').addEventListener('click', () => {
            memberDiv.remove();
        });
        
        container.appendChild(memberDiv);
    }
    
    showProjectSortOptions() {
        // Create sort options menu
        const menu = document.createElement('div');
        menu.className = 'absolute bg-ui-card border border-ui-border rounded shadow-md p-2 mt-1 z-50';
        menu.innerHTML = `
            <div class="text-xs font-semibold text-muted mb-2 px-2">Sort by:</div>
            <button class="block w-full text-left px-3 py-2 hover:bg-ui-hover rounded ${this.projectSort === 'recent' ? 'text-thorax-blue bg-thorax-blue-light' : ''}" 
                    onclick="app.setProjectSort('recent')">
                Most Recent
            </button>
            <button class="block w-full text-left px-3 py-2 hover:bg-ui-hover rounded ${this.projectSort === 'popular' ? 'text-thorax-blue bg-thorax-blue-light' : ''}" 
                    onclick="app.setProjectSort('popular')">
                Most Popular
            </button>
            <button class="block w-full text-left px-3 py-2 hover:bg-ui-hover rounded ${this.projectSort === 'alphabetical' ? 'text-thorax-blue bg-thorax-blue-light' : ''}" 
                    onclick="app.setProjectSort('alphabetical')">
                Alphabetical
            </button>
        `;
        
        // Remove existing menu
        const existingMenu = document.querySelector('.sort-menu');
        if (existingMenu) {
            existingMenu.remove();
        }
        
        menu.classList.add('sort-menu');
        
        const button = document.getElementById('sortProjectsBtn');
        if (button) {
            button.parentElement.style.position = 'relative';
            button.parentElement.appendChild(menu);
            
            // Close menu when clicking outside
            setTimeout(() => {
                const closeMenu = (e) => {
                    if (!button.contains(e.target) && !menu.contains(e.target)) {
                        menu.remove();
                        document.removeEventListener('click', closeMenu);
                    }
                };
                document.addEventListener('click', closeMenu);
            }, 100);
        }
    }
    
    setProjectSort(sortType) {
        this.projectSort = sortType;
        this.loadAllProjects();
        
        // Update button text
        const button = document.getElementById('sortProjectsBtn');
        if (button) {
            const icons = {
                'recent': 'fa-clock',
                'popular': 'fa-fire',
                'alphabetical': 'fa-sort-alpha-down'
            };
            button.innerHTML = `<i class="fas ${icons[sortType]}"></i> ${sortType.charAt(0).toUpperCase() + sortType.slice(1)}`;
        }
    }
    
    // ========== DATA STORAGE HELPERS ==========
    
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
    
    incrementProjectViews(projectId) {
        // Optional: Implement project view tracking
        // This could be stored in localStorage
    }
    
    // ========== UI HELPER METHODS ==========
    
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
            <i class="fas ${icons[type] || 'fa-info-circle'}"></i>
            <span>${this.escapeHtml(message)}</span>
            <button class="ml-auto text-sm" onclick="this.parentElement.remove()">&times;</button>
        `;
        
        container.appendChild(toast);
        
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, 4000);
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
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        }
    }
    
    getDiscussionIcon(type) {
        const icons = {
            'brainstorm': '💡',
            'question': '❓',
            'decision': '🤔',
            'insight': '🔍'
        };
        return icons[type] || '💬';
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new ThoraxLabPro();
    
    // Global helper functions
    window.showModal = (modalId) => window.app.showModal(modalId);
    window.hideModal = (modalId) => window.app.hideModal(modalId);
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            const search = document.getElementById('projectSearch');
            if (search) {
                search.focus();
            }
        }
        
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal.active').forEach(modal => {
                window.app.hideModal(modal.id);
            });
        }
    });
});
