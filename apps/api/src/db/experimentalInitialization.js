import { initializeDatabaseIndexes } from './databaseIndexes.js';
import { seedGameLibrary } from './gameLibraryRepository.js';
import { seedLearningPath } from './learningPathRepository.js';
import { seedSystemRoles } from './roleRepository.js';

export const EXPERIMENTAL_DATABASE_NAME = 'harf_experimental';

export function assertExperimentalInitializationTarget({ mode, nodeEnv, databaseName }) {
  if (mode !== 'experimental') {
    throw new Error('Database initialization requires the explicit --mode=experimental option.');
  }
  if (nodeEnv === 'production') {
    throw new Error('Experimental database initialization is disabled in production mode.');
  }
  if (databaseName !== EXPERIMENTAL_DATABASE_NAME) {
    throw new Error(`Experimental initialization requires MONGODB_DATABASE=${EXPERIMENTAL_DATABASE_NAME}.`);
  }
}

export async function initializeExperimentalDatabase(options) {
  assertExperimentalInitializationTarget(options);
  await initializeDatabaseIndexes();
  await seedSystemRoles();
  await seedGameLibrary();
  await seedLearningPath();
}
