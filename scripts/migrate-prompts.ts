import { PrismaClient } from '@prisma/client';
import { promptTypes } from '../src/app/utils/promptTypes';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Starting prompt migration...');

  // First, let's check if we have any admin users
  const adminUsers = await prisma.user.findMany({
    where: {
      isAdmin: true
    }
  });

  if (adminUsers.length === 0) {
    console.log('⚠️  No admin users found. Creating system admin...');
    // For migration purposes, we'll use system as creator
    // In production, you should update this to a real admin user ID
  }

  // Get the first admin user or create a system identifier
  const createdBy = adminUsers[0]?.id || 'system-migration';

  console.log('📝 Migrating existing prompts from promptTypes.ts...');

  const migratedPrompts = [];

  // Define colors for each prompt type
  const promptColors: Record<string, string> = {
    'Professional': '#3b82f6', // Blue
    'Promotional': '#ef4444', // Red
    'Landing Page': '#f97316', // Orange
    'Minimal': '#6b7280', // Gray
    'Elegant & Sophisticated': '#d97706', // Amber
    'Modern & Sleek': '#10b981', // Emerald
    'Text-Only': '#6366f1', // Indigo
    'Blog': '#06b6d4', // Cyan
    'Multi-Product Landing': '#a855f7', // Purple
  };

  for (let i = 0; i < promptTypes.length; i++) {
    const promptType = promptTypes[i];
    const color = promptColors[promptType.name] || '#6366f1'; // Default to indigo

    try {
      const prompt = await prisma.prompt.create({
        data: {
          name: promptType.name,
          description: promptType.description,
          color: color,
          systemPrompt: promptType.system,
          userPrompt: promptType.user,
          designEngine: 'CLAUDE', // Current system uses Claude
          templateType: promptType.name === 'Multi-Product Landing' ? 'MULTI_PRODUCT' : 'SINGLE_PRODUCT',
          status: 'ACTIVE',
          isDefault: true, // Mark existing prompts as default
          version: '1.0.0',
          createdBy: createdBy,
          usageCount: 0
        }
      });

      migratedPrompts.push(prompt);
      console.log(`✅ Migrated: ${promptType.name}`);

    } catch (error) {
      console.error(`❌ Failed to migrate ${promptType.name}:`, error);
    }
  }

  console.log(`\n🎉 Migration complete! Migrated ${migratedPrompts.length} prompts:`);
  migratedPrompts.forEach((prompt, index) => {
    console.log(`${index + 1}. ${prompt.name} (${prompt.color})`);
  });

  console.log('\n📊 Migration Summary:');
  console.log(`   Total prompts: ${migratedPrompts.length}`);
  console.log(`   All prompts set as ACTIVE and default`);
  console.log(`   All prompts use CLAUDE engine by default`);

  console.log('\n🎯 Next steps:');
  console.log('1. Update an existing user to admin: UPDATE User SET isAdmin = true WHERE email = "your-email@domain.com"');
  console.log('2. Update prompt creators: UPDATE Prompt SET createdBy = "actual-admin-user-id" WHERE createdBy = "system-migration"');
  console.log('3. Access the admin panel at /admin/prompts');
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });