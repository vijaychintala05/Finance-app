import type { UserRole } from '../auth/RbacService';

export type InvitableRole = Exclude<UserRole, 'Owner'>;

export interface AccessActor {
  userId: string;
  organizationId: string;
  email?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface InvitationSummary {
  id: string;
  organizationId: string;
  email: string;
  role: InvitableRole;
  status: 'Pending' | 'Accepted' | 'Revoked' | 'Expired';
  expiresAt: string;
  createdAt: string;
  invitedByUserId: string;
  acceptedAt: string | null;
  acceptedByUserId: string | null;
  revokedAt: string | null;
}

export interface IssuedInvitation extends InvitationSummary {
  token: string;
}

export interface MembershipResult {
  membershipId: string;
  organizationId: string;
  userId: string;
  role: UserRole;
  status: 'Active' | 'Revoked';
  accessVersion: number;
}

export interface MembershipSummary extends MembershipResult {
  email: string;
  fullName: string;
  joinedAt: string;
}

export interface SessionInvalidation {
  userId: string;
  organizationId: string;
  membershipId: string;
  accessVersion: number;
  invalidatedAt: string;
  reason: 'ROLE_CHANGED' | 'MEMBERSHIP_REVOKED';
  compatibilityMode: 'GLOBAL_TOKEN_REVOCATION';
}

export interface MembershipMutationResult extends MembershipResult {
  sessionInvalidation: SessionInvalidation;
}

export type AccessErrorCode =
  | 'ACCESS_VALIDATION_FAILED'
  | 'ACTOR_MEMBERSHIP_INACTIVE'
  | 'INVITATION_ALREADY_PENDING'
  | 'INVITATION_EMAIL_MISMATCH'
  | 'INVITATION_EXPIRED'
  | 'INVITATION_NOT_FOUND'
  | 'INVITATION_NOT_PENDING'
  | 'MEMBERSHIP_ALREADY_EXISTS'
  | 'MEMBERSHIP_NOT_FOUND'
  | 'MEMBERSHIP_INACTIVE'
  | 'LAST_OWNER_PROTECTED'
  | 'USER_INACTIVE'
  | 'ACCESS_CONFLICT';

export class AccessLifecycleError extends Error {
  public constructor(
    public readonly code: AccessErrorCode,
    message: string,
    public readonly httpStatus: number,
  ) {
    super(message);
    this.name = 'AccessLifecycleError';
  }
}

export interface SessionVersionContract {
  membershipStatus: 'Active' | 'Revoked';
  accessVersion: number;
  accessInvalidatedAt: string | null;
}
