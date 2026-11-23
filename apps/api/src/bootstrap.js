import path from 'node:path';
import { createApp } from './app.js';
import { connectMongo, getDatabaseState } from './db/mongo.js';
import { createAuthRepository } from './db/authRepository.js';
import { createChildRepository } from './db/childRepository.js';
import { AuthService } from './services/authService.js';
import { createEmailService } from './services/emailService.js';
import { ChildService } from './services/childService.js';
import { createGameRepository } from './db/gameRepository.js';
import { GameService } from './services/gameService.js';
import { GameLibraryService } from './services/gameLibraryService.js';
import { MediaAssetService } from './services/mediaAssetService.js';
import { createGameLibraryRepository } from './db/gameLibraryRepository.js';
import { createLearningPathRepository } from './db/learningPathRepository.js';
import { createSubscriptionRepository } from './db/subscriptionRepository.js';
import { createPaymentRepository } from './db/paymentRepository.js';
import { LearningPathService } from './services/learningPathService.js';
import { SubscriptionService } from './services/subscriptionService.js';
import { PaymentReceiptService } from './services/paymentReceiptService.js';
import { createAppointmentRepository } from './db/appointmentRepository.js';
import { AppointmentService } from './services/appointmentService.js';
import { JitsiIframeAdapter, VideoProviderService } from './services/videoProviderService.js';
import { createNotificationRepository } from './db/notificationRepository.js';
import { NotificationService } from './services/notificationService.js';
import { createReportRepository } from './db/reportRepository.js';
import { ReportService } from './services/reportService.js';
import { SpecialistDocumentService } from './services/specialistDocumentService.js';
import { createPlatformSettingsRepository } from './db/platformSettingsRepository.js';
import { PlatformSettingsService } from './services/platformSettingsService.js';
import { createTestimonialRepository } from './db/testimonialRepository.js';
import { TestimonialService } from './services/testimonialService.js';
import { createAdminVideoTestRepository } from './db/adminVideoTestRepository.js';
import { AdminVideoTestService } from './services/adminVideoTestService.js';
import { createSessionPaymentRepository } from './db/sessionPaymentRepository.js';
import { SessionPaymentService } from './services/sessionPaymentService.js';
import { createRoleRepository } from './db/roleRepository.js';
import { RoleService } from './services/roleService.js';
import { GamificationService } from './services/gamificationService.js';
import { BlobStorageService } from './services/blobStorageService.js';

export async function createApplication({ config, logger, initializeStorage = true }) {
  const databaseConnected = await connectMongo(config.mongodbUri, {
    isProduction: config.isProduction,
    logger,
    databaseName: config.mongodbDatabase
  });

  const repository = createAuthRepository();
  const blobStorage = config.isProduction || process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN
    ? new BlobStorageService()
    : null;
  const roleService = new RoleService({
    repository: createRoleRepository(),
    authRepository: repository
  });
  const specialistDocumentService = new SpecialistDocumentService({
    storageDirectory: path.join(config.mediaStorageDir, 'specialist-verification'),
    blobStorage
  });
  if (initializeStorage) await specialistDocumentService.initialize();
  const childRepository = createChildRepository();
  const childService = new ChildService({ repository: childRepository });
  const emailService = createEmailService(config.smtp);
  const notificationService = new NotificationService({
    repository: createNotificationRepository(),
    authRepository: repository,
    emailService,
    logger
  });
  const testimonialService = new TestimonialService({
    repository: createTestimonialRepository(),
    authRepository: repository,
    notificationService,
    logger
  });
  const reportService = new ReportService({ repository: createReportRepository() });
  const videoProviderService = new VideoProviderService({
    adapter: new JitsiIframeAdapter({ domain: config.jitsi.domain })
  });
  const appointmentRepository = createAppointmentRepository();
  const paymentRepository = createPaymentRepository();
  const sessionPaymentRepository = createSessionPaymentRepository();
  const appointmentService = new AppointmentService({
    repository: appointmentRepository,
    authRepository: repository,
    childService,
    videoProviderService,
    notificationService,
    sessionPaymentRepository,
    paymentRepository,
    logger,
    specialistDocumentService,
    meetingRules: config.jitsi
  });
  const adminVideoTestService = new AdminVideoTestService({
    repository: createAdminVideoTestRepository(),
    videoProviderService,
    authRepository: repository,
    lifetimeMinutes: config.videoTestLifetimeMinutes
  });
  const gameLibraryRepository = createGameLibraryRepository();
  const mediaAssetService = new MediaAssetService({
    repository: gameLibraryRepository,
    storageDirectory: config.mediaStorageDir,
    blobStorage
  });
  if (initializeStorage) await mediaAssetService.initialize();
  const authService = new AuthService({
    repository,
    emailService,
    notificationService,
    logger,
    appOrigin: config.appOrigin,
    specialistDocumentService
  });
  const platformSettingsService = new PlatformSettingsService({
    repository: createPlatformSettingsRepository(),
    authService,
    mediaAssetService
  });
  const subscriptionReceiptService = new PaymentReceiptService({
    storageDirectory: path.join(config.mediaStorageDir, 'payment-receipts'),
    blobStorage
  });
  const subscriptionService = new SubscriptionService({
    repository: createSubscriptionRepository(),
    paymentRepository,
    authRepository: repository,
    childRepository,
    notificationService,
    logger,
    receiptService: subscriptionReceiptService
  });
  if (initializeStorage) await subscriptionReceiptService.initialize();
  const sessionPaymentReceiptService = new PaymentReceiptService({
    storageDirectory: path.join(config.mediaStorageDir, 'session-payment-receipts'),
    blobStorage
  });
  const sessionPaymentService = new SessionPaymentService({
    repository: sessionPaymentRepository,
    paymentRepository,
    authRepository: repository,
    receiptService: sessionPaymentReceiptService,
    appointmentService,
    notificationService,
    logger
  });
  if (initializeStorage) await sessionPaymentReceiptService.initialize();
  const gameRepository = createGameRepository();
  const learningPathService = new LearningPathService({
    repository: createLearningPathRepository(),
    gameRepository,
    childService,
    subscriptionService,
    authService,
    notificationService,
    logger
  });
  const gamificationService = new GamificationService({
    childService,
    notificationService,
    logger
  });
  const gameLibraryService = new GameLibraryService({
    repository: gameLibraryRepository,
    mediaAssetService,
    authService
  });
  const gameService = new GameService({
    repository: gameRepository,
    childService,
    gameLibraryService: databaseConnected ? gameLibraryService : null,
    learningPathService: databaseConnected ? learningPathService : null,
    gamificationService: databaseConnected ? gamificationService : null,
    subscriptionService: databaseConnected ? subscriptionService : null,
    appointmentService: databaseConnected ? appointmentService : null
  });
  const app = createApp({
    config,
    logger,
    getDatabaseState,
    authService,
    repository,
    notificationService,
    reportService,
    testimonialService: databaseConnected ? testimonialService : null,
    childService,
    gameService,
    gameLibraryService: databaseConnected ? gameLibraryService : null,
    learningPathService: databaseConnected ? learningPathService : null,
    gamificationService: databaseConnected ? gamificationService : null,
    subscriptionService: databaseConnected ? subscriptionService : null,
    appointmentService: databaseConnected ? appointmentService : null,
    specialistDocumentService,
    platformSettingsService: databaseConnected ? platformSettingsService : null,
    adminVideoTestService: databaseConnected ? adminVideoTestService : null,
    sessionPaymentService: databaseConnected ? sessionPaymentService : null,
    roleService
  });

  return {
    app,
    appointmentService,
    databaseConnected
  };
}
