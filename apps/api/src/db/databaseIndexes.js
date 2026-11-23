import { ensureAdminVideoTestIndexes } from './adminVideoTestRepository.js';
import { ensureAppointmentIndexes } from './appointmentRepository.js';
import { ensureAuthIndexes } from './authRepository.js';
import { ensureChildIndexes } from './childRepository.js';
import { ensureGameIndexes } from './gameRepository.js';
import { ensureLearningPathIndexes } from './learningPathRepository.js';
import { ensureNotificationIndexes } from './notificationRepository.js';
import { ensurePaymentIndexes } from './paymentRepository.js';
import { ensurePlatformSettingsIndexes } from './platformSettingsRepository.js';
import { ensureRoleIndexes } from './roleRepository.js';
import { ensureSessionPaymentIndexes } from './sessionPaymentRepository.js';
import { ensureSubscriptionIndexes } from './subscriptionRepository.js';
import { ensureTestimonialIndexes } from './testimonialRepository.js';
import { ensureGamificationIndexes } from '../services/gamificationService.js';

export async function initializeDatabaseIndexes() {
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
}
