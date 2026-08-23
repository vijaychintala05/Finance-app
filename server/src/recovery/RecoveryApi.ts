import type { Request, Response } from 'express';
import { RecoveryError } from './errors';
import type { RecoveryArtifactService } from './RecoveryArtifactService';
import { db } from '../database/db';
import { SessionSecurity } from '../auth/SessionSecurity';

interface RecoveryAuth {
  userId: string;
  organizationId: string;
}

function auth(req: Request): RecoveryAuth {
  const value = (req as Request & { auth?: RecoveryAuth }).auth;
  if (!value?.userId || !value.organizationId) throw new RecoveryError('RECOVERY_OWNER_REQUIRED', 'Verified organization context is required', 401);
  return value;
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof RecoveryError) {
    res.status(error.status).json({ success: false, error: { code: error.code, message: error.message, details: error.details } });
    return;
  }
  res.status(500).json({ success: false, error: { code: 'RECOVERY_INTERNAL_ERROR', message: 'Recovery operation failed safely' } });
}

// Route mounting and authentication middleware remain owned by the main API.
export class RecoveryApi {
  constructor(private readonly service: RecoveryArtifactService) {}

  public listArtifacts = async (req: Request, res: Response): Promise<void> => {
    try { const context = auth(req); res.json({ success: true, data: await this.service.listArtifacts(context.organizationId) }); }
    catch (error) { sendError(res, error); }
  };

  public listJobs = async (req: Request, res: Response): Promise<void> => {
    try { const context = auth(req); res.json({ success: true, data: await this.service.listJobs(context.organizationId) }); }
    catch (error) { sendError(res, error); }
  };

  public downloadArtifact = async (req: Request, res: Response): Promise<void> => {
    try {
      const context = auth(req);
      const artifact = await this.service.downloadArtifact(req.params.artifactId, context.organizationId);
      res.setHeader('Content-Disposition', `attachment; filename="firmbooks-${artifact.id}.json"`);
      res.json(artifact);
    } catch (error) { sendError(res, error); }
  };

  public createArtifact = async (req: Request, res: Response): Promise<void> => {
    try {
      const context = auth(req);
      const artifact = await this.service.createArtifact(context.organizationId, context.userId);
      res.status(201).json({ success: true, data: { id: artifact.id, manifest: artifact.envelope.manifest } });
    } catch (error) { sendError(res, error); }
  };

  public stageRestore = async (req: Request, res: Response): Promise<void> => {
    try {
      const context = auth(req);
      const job = await this.service.stageRestore({ artifactId: req.params.artifactId, targetOrganizationId: context.organizationId, requestedBy: context.userId });
      res.status(202).json({ success: true, data: job });
    } catch (error) { sendError(res, error); }
  };

  public promoteRestore = async (req: Request, res: Response): Promise<void> => {
    try {
      const context = auth(req);
      const password = String(req.body?.password || '');
      const user = await db.query('SELECT password_hash FROM users WHERE id = $1', [context.userId]);
      if (!password || user.rows.length !== 1 || !(await SessionSecurity.verifyPassword(password, user.rows[0].password_hash || ''))) {
        throw new RecoveryError('RECOVERY_RECENT_AUTH_REQUIRED', 'Current owner password is required to promote a recovery', 401);
      }
      const job = await this.service.promoteRestore({
        jobId: req.params.jobId,
        targetOrganizationId: context.organizationId,
        actorUserId: context.userId,
        authenticatedAt: new Date().toISOString(),
        confirmation: String(req.body?.confirmation || ''),
      });
      res.status(200).json({ success: true, data: job });
    } catch (error) { sendError(res, error); }
  };
}
