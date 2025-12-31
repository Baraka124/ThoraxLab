const { database } = require('../database.js');

async function seedDatabase() {
  try {
    await database.connect();
    
    console.log('🌱 Seeding database with sample data...');
    
    // Create sample users
    const users = [
      {
        email: 'alex.chen@hospital.org',
        name: 'Dr. Alex Chen',
        organization: 'Massachusetts General Hospital',
        role: 'clinician',
        specialty: 'Pulmonology'
      },
      {
        email: 'emma.rodriguez@techmed.com',
        name: 'Emma Rodriguez',
        organization: 'TechMed Solutions',
        role: 'industry',
        specialty: 'AI/ML Engineering'
      },
      {
        email: 'sarah.johnson@research.edu',
        name: 'Dr. Sarah Johnson',
        organization: 'Harvard Medical School',
        role: 'lead',
        specialty: 'Clinical Research'
      }
    ];
    
    for (const userData of users) {
      let user = await database.findUserByEmail(userData.email);
      if (!user) {
        user = await database.createUser(userData);
        console.log(`✅ Created user: ${user.name}`);
      }
    }
    
    // Create sample project
    const projectData = {
      title: "COPD Early Detection Algorithm",
      description: "Development and validation of a machine learning algorithm for early detection of COPD exacerbations using wearable sensor data.",
      type: "collaborative",
      objectives: {
        clinical: [
          "Define clinical validation criteria",
          "Establish patient inclusion/exclusion criteria",
          "Validate algorithm against gold-standard diagnosis"
        ],
        industry: [
          "Develop scalable cloud infrastructure",
          "Optimize algorithm for real-time processing",
          "Ensure HIPAA compliance"
        ],
        shared: [
          "Achieve 90% sensitivity in detection",
          "Complete pilot study with 50 patients",
          "Prepare joint publication"
        ]
      },
      methodology: "Prospective cohort study with wearable sensors"
    };
    
    const adminUser = await database.findUserByEmail('alex.chen@hospital.org');
    if (adminUser) {
      const project = await database.createProject(projectData, adminUser.id);
      console.log(`✅ Created project: ${project.title}`);
      
      // Add team members
      const emma = await database.findUserByEmail('emma.rodriguez@techmed.com');
      const sarah = await database.findUserByEmail('sarah.johnson@research.edu');
      
      if (emma) {
        await database.addTeamMember(project.id, emma.id, 'industry', emma.organization);
      }
      if (sarah) {
        await database.addTeamMember(project.id, sarah.id, 'lead', sarah.organization);
      }
      
      console.log('✅ Added team members to project');
    }
    
    console.log('🎉 Database seeding completed successfully!');
    await database.close();
    
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase };
