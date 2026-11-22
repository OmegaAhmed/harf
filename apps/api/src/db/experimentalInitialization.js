import { ensureAdminVideoTestIndexes } from './adminVideoTestRepository.js';
import { ensureAppointmentIndexes } from './appointmentRepository.js';
import { ensureAuthIndexes } from './authRepository.js';
import { ensureChildIndexes } from './childRepository.js';
import { ensureGameIndexes } from './gameRepository.js';
import { seedGameLibrary } from './gameLibraryRepository.js';
import { ensureLearningPathIndexes, seedLearningPath } from './learningPathRepository.js';
import { ensureNotificationIndexes } from './notificationRepository.js';
import { ensurePaymentIndexes } from './paymentRepository.js';
import { ensurePlatformSettingsIndexes } from './platformSettingsRepository.js';
import { ensureRoleIndexes, seedSystemRoles } from './roleRepository.js';
import { ensureSessionPaymentIndexes } from './sessionPaymentRepository.js';
import { ensureSubscriptionIndexes } from './subscriptionRepository.js';
import { ensureTestimonialIndexes } from './testimonialRepository.js';
import { ensureGamificationIndexes } from '../services/gamificationService.js';

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
  await Promise.all([
    ensureAuthIndexes(),
    ensureRoleIndexes(),
    ensureChildIndexes(),
    ensureGameIndexes(),
    ensureSubscriptionIndexes(),
    ensurePaymentIndexes(),
    ensureLearningPathIndexes(),
    ensureGamificationIndexes(),
    ensureAppointmentIndexes(),
    ensureNotificationIndexes(),
    ensurePlatformSettingsIndexes(),
    ensureTestimonialIndexes(),
    ensureAdminVideoTestIndexes(),
    ensureSessionPaymentIndexes()
  ]);
  await seedSystemRoles();
  await seedGameLibrary();
  await seedLearningPath();
}
