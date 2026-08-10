import { Router } from 'express';
import { OrganizationController } from '../controllers/organizationController';
import { requirePermission } from '../middleware/organizationIsolation.middleware';

const router = Router();

router.post('/', OrganizationController.create);
router.get('/', OrganizationController.listMyOrganizations);
router.post('/switch', OrganizationController.switchOrganization);
router.get('/:id/members', OrganizationController.listMembers);
router.post('/:id/members', requirePermission('members.manage'), OrganizationController.addMember);

export default router;
