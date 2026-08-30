import { Router } from 'express';
import { AuthController } from '../controllers/authController';
import { authMiddleware } from '../middleware/organizationIsolation.middleware';
import { protectAsyncRoutes } from './asyncRouter';
import { persistentRateLimit } from '../middleware/rateLimit.middleware';

const router = Router();
const isIsolatedTestDatabase = process.env.NODE_ENV === 'test' || process.env.DATABASE_MODE === 'memory' || process.env.USE_PG_MEM === 'true';
const registrationLimitPerHour = isIsolatedTestDatabase ? 1000 : 20;

// Keep a production IP-wide ceiling to contain automated tenant creation. The
// elevated test-only ceiling lets the integration suite provision isolated
// tenants without weakening any deployed environment.
router.post('/register', persistentRateLimit('register', registrationLimitPerHour, 60 * 60), AuthController.register);
router.post('/login', AuthController.login);
router.post('/mfa/verify', AuthController.verifyMfaLogin);
router.post('/logout', authMiddleware, AuthController.logout);
router.get('/me', authMiddleware, AuthController.me);
router.post('/refresh', authMiddleware, AuthController.refresh);
router.post('/change-password', authMiddleware, AuthController.changePassword);
router.post('/forgot-password', persistentRateLimit('forgot-password', 5, 60 * 60), AuthController.forgotPassword);

export default protectAsyncRoutes(router);
