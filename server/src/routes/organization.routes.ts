import { Router } from 'express';
import { OrganizationController } from '../controllers/organizationController';
import { requirePermission } from '../middleware/organizationIsolation.middleware';
import { protectAsyncRoutes } from './asyncRouter';

const router = Router();

router.get('/current', OrganizationController.getCurrent);
router.patch('/current', OrganizationController.updateCurrent);
router.post('/', OrganizationController.create);
router.get('/', OrganizationController.listMyOrganizations);
router.post('/switch', OrganizationController.switchOrganization);
router.get('/:id/members', requirePermission('settings.manage_users'), OrganizationController.listMembers);
router.post('/:id/members', requirePermission('settings.manage_users'), OrganizationController.addMember);

export default protectAsyncRoutes(router);
