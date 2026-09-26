import { db, type DbQueryClient } from '../database/db';
import { newId } from '../utils/ids';
import { AuditTrailService } from '../security/AuditTrailService';
import {
  PERMISSIONS_REGISTRY,
  SYSTEM_ROLE_PERMISSIONS,
  LEGACY_TO_GRANULAR_MAP,
  SOD_CONFLICTS,
  detectSodConflicts,
  type PermissionCode,
  type RiskTier,
  type PermissionMetadata,
  type SodConflict,
} from './PermissionRegistry';

export type UserRole =
  | 'Owner'
  | 'Admin'
  | 'Finance Manager'
  | 'Accountant'
  | 'Sales'
  | 'Purchase'
  | 'Viewer'
  | 'Approver'
  | string;

export interface RoleModel {
  id: string;
  organizationId?: string;
  name: string;
  description?: string;
  isSystemRole: boolean;
  permissions: string[];
  assignedUsersCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

// In-memory cache for custom role permissions with 60-second TTL
interface RoleCacheEntry {
  permissions: string[];
  expiresAt: number;
}
const customRoleCache = new Map<string, RoleCacheEntry>();

export class RbacDomainError extends Error {
  constructor(message: string, public readonly statusCode: number, public readonly code: string) {
    super(message);
    this.name = 'RbacDomainError';
  }
}
export class RbacService {
  public static async lockOrganizationRoleMutations(client: DbQueryClient, organizationId: string): Promise<void> {
    const organization = await client.query('SELECT id FROM organizations WHERE id = $1 FOR UPDATE', [organizationId]);
    if (organization.rowCount !== 1) throw new RbacDomainError('Organization not found.', 404, 'ORGANIZATION_NOT_FOUND');
  }

  public static async assertOrganizationRoleExists(client: DbQueryClient, organizationId: string, roleName: string): Promise<void> {
    if (SYSTEM_ROLE_PERMISSIONS[roleName]) return;
    const role = await client.query('SELECT id FROM roles WHERE organization_id = $1 AND name = $2', [organizationId, roleName]);
    if (role.rows.length !== 1) throw new Error('The selected custom role is no longer available in this organization.');
  }
  public static isKnownPermission(permission: string): permission is PermissionCode {
    return permission in PERMISSIONS_REGISTRY || permission in LEGACY_TO_GRANULAR_MAP;
  }

  public static getPermissionMetadata(permission: string): PermissionMetadata | undefined {
    return PERMISSIONS_REGISTRY[permission];
  }

  public static getAllPermissions(): PermissionMetadata[] {
    return Object.values(PERMISSIONS_REGISTRY);
  }

  public static getSodConflicts(permissions: string[]): SodConflict[] {
    return detectSodConflicts(permissions);
  }

  public static getAllRoles(): { role: string; permissions: string[] }[] {
    const roles = ['Owner', 'Admin', 'Finance Manager', 'Accountant', 'Sales', 'Purchase', 'Viewer', 'Approver'];
    return roles.map((role) => ({ role, permissions: this.getPermissionsForRole(role) }));
  }

  /**
   * Synchronous check against system role templates and cached custom roles.
   */
  public static getPermissionsForRole(role: string, orgId?: string): string[] {
    let basePerms: string[] = [];
    if (role === 'Super Admin' || role === 'Owner') {
      basePerms = [...SYSTEM_ROLE_PERMISSIONS.Owner];
    } else if (SYSTEM_ROLE_PERMISSIONS[role]) {
      basePerms = [...SYSTEM_ROLE_PERMISSIONS[role]];
    } else if (orgId) {
      const cacheKey = `${orgId}:${role}`;
      const cached = customRoleCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        basePerms = [...cached.permissions];
      } else {
        basePerms = [...SYSTEM_ROLE_PERMISSIONS.Viewer];
      }
    } else {
      basePerms = [...SYSTEM_ROLE_PERMISSIONS.Viewer];
    }

    const legacyAliases = new Set<string>(basePerms);
    for (const [legacyKey, granularList] of Object.entries(LEGACY_TO_GRANULAR_MAP)) {
      if (granularList.every((g) => basePerms.includes(g))) {
        legacyAliases.add(legacyKey);
      }
    }

    return Array.from(legacyAliases);
  }

  /**
   * Main authorization check supporting both granular and legacy permissions.
   */
  public static hasPermission(role: string, permission: string, orgId?: string): boolean {
    const permissions = this.getPermissionsForRole(role, orgId);

    // Direct match
    if (permissions.includes(permission)) {
      return true;
    }

    // Legacy fallback mapping check
    const mapped = LEGACY_TO_GRANULAR_MAP[permission];
    if (mapped) {
      // A legacy permission represents the complete prior capability, not any one related action.
      return mapped.every((p) => permissions.includes(p));
    }

    // Check if role has a legacy permission that maps to this granular permission
    for (const [legacyCode, granularList] of Object.entries(LEGACY_TO_GRANULAR_MAP)) {
      if (granularList.includes(permission as any) && permissions.includes(legacyCode)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Async database-aware permission check resolving dynamic custom roles.
   */
  public static async hasPermissionAsync(
    orgId: string,
    role: string,
    permission: string,
    fresh = false
  ): Promise<boolean> {
    const permissions = await this.getPermissionsForRoleAsync(orgId, role, fresh);

    if (permissions.includes(permission)) {
      return true;
    }

    const mapped = LEGACY_TO_GRANULAR_MAP[permission];
    if (mapped) {
      return mapped.every((p) => permissions.includes(p));
    }

    return false;
  }

  /**
   * Async retrieval of permissions for a role in an organization.
   */
  public static async getPermissionsForRoleAsync(orgId: string, role: string, fresh = false): Promise<string[]> {
    if (role === 'Super Admin' || role === 'Owner') {
      return [...SYSTEM_ROLE_PERMISSIONS.Owner];
    }

    if (SYSTEM_ROLE_PERMISSIONS[role]) {
      return [...SYSTEM_ROLE_PERMISSIONS[role]];
    }

    const cacheKey = `${orgId}:${role}`;
    const cached = customRoleCache.get(cacheKey);
    if (!fresh && cached && cached.expiresAt > Date.now()) {
      return cached.permissions;
    }

    const res = await db.query(
      `SELECT r.id as role_id, rp.permission_code
         FROM roles r
         LEFT JOIN role_permissions rp ON rp.role_id = r.id
        WHERE (r.organization_id = $1 OR r.organization_id IS NULL) AND r.name = $2
        ORDER BY CASE WHEN r.organization_id = $1 THEN 0 ELSE 1 END`,
      [orgId, role]
    );

    if (res.rows.length > 0) {
      const resolvedRoleId = res.rows[0].role_id;
      const perms = res.rows
        .filter((row) => row.role_id === resolvedRoleId && typeof row.permission_code === 'string')
        .map((row) => row.permission_code as string);
      customRoleCache.set(cacheKey, { permissions: perms, expiresAt: Date.now() + 60000 });
      return perms;
    }

    return [];
  }

  /**
   * List all system and custom roles for an organization.
   */
  public static async listRoles(orgId: string): Promise<RoleModel[]> {
    // 1. Get system roles
    const systemRoles: RoleModel[] = Object.keys(SYSTEM_ROLE_PERMISSIONS).map((name) => ({
      id: `sys-${name.toLowerCase().replace(/\s+/g, '-')}`,
      name,
      description: `Default system role for ${name}`,
      isSystemRole: true,
      permissions: SYSTEM_ROLE_PERMISSIONS[name],
    }));

    // 2. Query database for custom roles and member counts. Let read errors
    // propagate so callers cannot mistake a partial system-only fallback for
    // an authoritative role list (for example, during delete recovery).
    const customRes = await db.query(
      `SELECT r.id, r.organization_id, r.name, r.description, r.is_system_role,
              COALESCE(ARRAY_AGG(rp.permission_code) FILTER (WHERE rp.permission_code IS NOT NULL), '{}') as permissions,
              COUNT(DISTINCT om.user_id) as member_count
         FROM roles r
    LEFT JOIN role_permissions rp ON rp.role_id = r.id
    LEFT JOIN organization_members om ON om.organization_id = r.organization_id AND om.role = r.name
        WHERE r.organization_id = $1
        GROUP BY r.id, r.organization_id, r.name, r.description, r.is_system_role
        ORDER BY r.name ASC`,
      [orgId]
    );

    const customRoles: RoleModel[] = customRes.rows.map((r) => ({
      id: r.id,
      organizationId: r.organization_id,
      name: r.name,
      description: r.description || undefined,
      isSystemRole: Boolean(r.is_system_role),
      permissions: r.permissions || [],
      assignedUsersCount: Number(r.member_count) || 0,
    }));

    // Count members in system roles
    const memberCountsRes = await db.query(
      `SELECT role, COUNT(user_id) as cnt
         FROM organization_members
        WHERE organization_id = $1
        GROUP BY role`,
      [orgId]
    );
    const countMap = new Map<string, number>();
    for (const row of memberCountsRes.rows) {
      countMap.set(row.role, Number(row.cnt));
    }

    for (const sys of systemRoles) {
      sys.assignedUsersCount = countMap.get(sys.name) || 0;
    }

    return [...systemRoles, ...customRoles];
  }
  /**
   * Create a new custom role for an organization.
   */
  public static async createCustomRole(
    orgId: string,
    params: {
      name: string;
      description?: string;
      permissions: string[];
      userId: string;
    }
  ): Promise<RoleModel> {
    const trimmedName = params.name.trim();
    if (!trimmedName || trimmedName.length < 2 || trimmedName.length > 80) {
      throw new Error('Role name must be between 2 and 80 characters.');
    }
    if (SYSTEM_ROLE_PERMISSIONS[trimmedName]) {
      throw new Error('Cannot create custom role with reserved system role name ' + trimmedName + '.');
    }
    const validPerms = params.permissions.filter((permission) => permission in PERMISSIONS_REGISTRY);
    const roleId = newId('role');

    await db.transaction(async (client) => {
      await this.lockOrganizationRoleMutations(client, orgId);
      const existing = await client.query(
        'SELECT id FROM roles WHERE organization_id = $1 AND LOWER(name) = LOWER($2)',
        [orgId, trimmedName]
      );
      if (existing.rows.length > 0) throw new Error('A role named ' + trimmedName + ' already exists in this organization.');

      await client.query(
        'INSERT INTO roles (id, organization_id, name, description, is_system_role) VALUES ($1, $2, $3, $4, FALSE)',
        [roleId, orgId, trimmedName, params.description || null]
      );
      for (const permission of validPerms) {
        await client.query(
          'INSERT INTO role_permissions (role_id, permission_code) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [roleId, permission]
        );
      }
      await AuditTrailService.logAction({
        organizationId: orgId,
        userId: params.userId,
        action: 'CUSTOM_ROLE_CREATED',
        entityType: 'ROLE',
        entityId: roleId,
        afterState: { name: trimmedName, permissionsCount: validPerms.length },
      }, { strict: true });
    }, { organizationId: orgId });

    customRoleCache.delete(orgId + ':' + trimmedName);
    return {
      id: roleId,
      organizationId: orgId,
      name: trimmedName,
      description: params.description,
      isSystemRole: false,
      permissions: validPerms,
      assignedUsersCount: 0,
    };
  }
  /**
   * Clone an existing system or custom role.
   */
  public static async cloneRole(
    orgId: string,
    params: {
      sourceRoleName: string;
      newName: string;
      description?: string;
      userId: string;
    }
  ): Promise<RoleModel> {
    const sourcePerms = await this.getPermissionsForRoleAsync(orgId, params.sourceRoleName);
    return this.createCustomRole(orgId, {
      name: params.newName,
      description: params.description || `Cloned from ${params.sourceRoleName}`,
      permissions: sourcePerms,
      userId: params.userId,
    });
  }

  /**
   * Update an existing custom role's name, description, or permissions.
   */
  public static async updateCustomRole(
    orgId: string,
    roleId: string,
    params: {
      name?: string;
      description?: string;
      permissions?: string[];
      userId: string;
    }
  ): Promise<RoleModel> {
    let currentName = '';
    const newName = params.name?.trim();
    let description = params.description;

    await db.transaction(async (client) => {
      await this.lockOrganizationRoleMutations(client, orgId);
      const roleRes = await client.query(
        'SELECT id, name, is_system_role FROM roles WHERE id = $1 AND organization_id = $2 FOR UPDATE',
        [roleId, orgId]
      );
      if (roleRes.rows.length === 0) throw new RbacDomainError('Custom role not found in this organization.', 404, 'ROLE_NOT_FOUND');
      if (roleRes.rows[0].is_system_role) throw new Error('System roles are protected templates and cannot be directly modified.');
      currentName = roleRes.rows[0].name;
      const resolvedName = newName || currentName;
      description = params.description === undefined ? undefined : params.description;

      if (resolvedName !== currentName) {
        if (SYSTEM_ROLE_PERMISSIONS[resolvedName]) {
          throw new Error('Cannot rename custom role to reserved system role name ' + resolvedName + '.');
        }
        const existing = await client.query(
          'SELECT id FROM roles WHERE organization_id = $1 AND LOWER(name) = LOWER($2) AND id != $3',
          [orgId, resolvedName, roleId]
        );
        if (existing.rows.length > 0) throw new Error('A role named ' + resolvedName + ' already exists in this organization.');
      }

      await client.query(
        'UPDATE roles SET name = $1, description = COALESCE($2, description) WHERE id = $3 AND organization_id = $4',
        [resolvedName, params.description || null, roleId, orgId]
      );
      if (resolvedName !== currentName) {
        await client.query(
          'UPDATE organization_members SET role = $1 WHERE organization_id = $2 AND role = $3',
          [resolvedName, orgId, currentName]
        );
      }
      if (params.permissions) {
        const validPerms = params.permissions.filter((permission) => permission in PERMISSIONS_REGISTRY);
        await client.query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);
        for (const permission of validPerms) {
          await client.query(
            'INSERT INTO role_permissions (role_id, permission_code) VALUES ($1, $2)',
            [roleId, permission]
          );
        }
      }
      await AuditTrailService.logAction({
        organizationId: orgId,
        userId: params.userId,
        action: 'CUSTOM_ROLE_UPDATED',
        entityType: 'ROLE',
        entityId: roleId,
        afterState: { name: resolvedName, permissionsCount: params.permissions?.length },
      }, { strict: true });
    }, { organizationId: orgId });

    const resolvedName = newName || currentName;
    customRoleCache.delete(orgId + ':' + currentName);
    customRoleCache.delete(orgId + ':' + resolvedName);
    const updatedPerms = await this.getPermissionsForRoleAsync(orgId, resolvedName);
    return {
      id: roleId,
      organizationId: orgId,
      name: resolvedName,
      description,
      isSystemRole: false,
      permissions: updatedPerms,
    };
  }
  public static async deleteCustomRole(orgId: string, roleId: string, userId: string): Promise<void> {
    let roleName = '';
    await db.transaction(async (client) => {
      await this.lockOrganizationRoleMutations(client, orgId);
      const roleRes = await client.query(
        'SELECT id, name, is_system_role FROM roles WHERE id = $1 AND organization_id = $2 FOR UPDATE',
        [roleId, orgId]
      );
      if (roleRes.rows.length === 0) throw new RbacDomainError('Custom role not found in this organization.', 404, 'ROLE_NOT_FOUND');
      if (roleRes.rows[0].is_system_role) throw new RbacDomainError('System roles cannot be deleted.', 400, 'SYSTEM_ROLE_PROTECTED');
      roleName = roleRes.rows[0].name;

      const memberCheck = await client.query(
        'SELECT COUNT(id) as cnt FROM organization_members WHERE organization_id = $1 AND role = $2',
        [orgId, roleName]
      );
      if (Number(memberCheck.rows[0]?.cnt || 0) > 0) {
        throw new RbacDomainError('Cannot delete role ' + roleName + ' because ' + memberCheck.rows[0].cnt + ' member(s) are currently assigned to it. Reassign members before deleting.', 409, 'ROLE_ASSIGNED');

      }

      await client.query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);
      const deleted = await client.query('DELETE FROM roles WHERE id = $1 AND organization_id = $2', [roleId, orgId]);
      if (deleted.rowCount !== 1) throw new Error('Custom role could not be deleted.');

      await AuditTrailService.logAction({
        organizationId: orgId,
        userId,
        action: 'CUSTOM_ROLE_DELETED',
        entityType: 'ROLE',
        entityId: roleId,
        beforeState: { name: roleName },
      }, { strict: true });
    }, { organizationId: orgId });

    customRoleCache.delete(orgId + ':' + roleName);
  }
  public static async assignUserRole(
    orgId: string,
    targetUserId: string,
    newRole: string,
    actorUserId: string
  ): Promise<void> {
    let currentRole = '';

    await db.transaction(async (client) => {
      await this.lockOrganizationRoleMutations(client, orgId);
      const memberRes = await client.query(
        'SELECT id, role FROM organization_members WHERE organization_id = $1 AND user_id = $2 FOR UPDATE',
        [orgId, targetUserId]
      );
      if (memberRes.rows.length === 0) throw new Error('User is not a member of this organization.');
      currentRole = memberRes.rows[0].role;

      if (currentRole === 'Owner' && newRole !== 'Owner') {
        const ownerRows = await client.query(
          "SELECT id FROM organization_members WHERE organization_id = $1 AND role = 'Owner' FOR UPDATE",
          [orgId]
        );
        if (ownerRows.rows.length <= 1) throw new Error('Cannot demote or change the role of the sole organization Owner.');
      }

      await this.assertOrganizationRoleExists(client, orgId, newRole);
      await client.query(
        'UPDATE organization_members SET role = $1 WHERE organization_id = $2 AND user_id = $3',
        [newRole, orgId, targetUserId]
      );
      await AuditTrailService.logAction({
        organizationId: orgId,
        userId: actorUserId,
        action: 'MEMBER_ROLE_REASSIGNED',
        entityType: 'USER_MEMBERSHIP',
        entityId: targetUserId,
        beforeState: { role: currentRole },
        afterState: { role: newRole },
      }, { strict: true });
    }, { organizationId: orgId });

    customRoleCache.delete(orgId + ':' + currentRole);
    customRoleCache.delete(orgId + ':' + newRole);
  }
}
