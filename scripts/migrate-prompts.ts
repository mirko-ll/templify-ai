import { PrismaClient } from '@prisma/client';
import { promptTypes } from '../src/app/utils/promptTypes';

const prisma = new PrismaClient();

async function main() {

  // First, let's check if we have any admin users
  const adminUsers = await prisma.user.findMany({
    where: {
      isAdmin: true
    }
  });

  // Get the first admin user or create a system identifier
  const createdBy = adminUsers[0]?.id || 'system-migration';

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

    } catch (error) {
      console.error(`❌ Failed to migrate ${promptType.name}:`, error);
    }
  }
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });