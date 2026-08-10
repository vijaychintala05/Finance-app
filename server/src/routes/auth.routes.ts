import { Router } from 'express';
import { AuthController } from '../controllers/authController';
import { authMiddleware } from '../middleware/organizationIsolation.middleware';

const router = Router();

router.post('/register', AuthController.register);
router.post('/login', AuthController.login);
router.post('/logout', AuthController.logout);
router.get('/me', authMiddleware, AuthController.me);
router.post('/refresh', authMiddleware, AuthController.refresh);
router.post('/change-password', authMiddleware, AuthController.changePassword);
router.post('/forgot-password', AuthController.forgotPassword);

export default router;
