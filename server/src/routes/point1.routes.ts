import { Router } from 'express';
import { getFinanceCapabilities } from '../capabilities/financeCapabilities';
import { protectAsyncRoutes } from './asyncRouter';

const router = Router();

router.get('/capabilities', (_req, res) => {
  res.json({ capabilities: getFinanceCapabilities() });
});

export default protectAsyncRoutes(router);
