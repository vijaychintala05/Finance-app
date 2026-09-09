import { ApprovalEntityType, isApprovalEntityType } from './ApprovalRegistry';
import { ApprovalWorkflowService } from './ApprovalWorkflowService';

export interface LifecycleDatabaseClient {
  query: (text: string, params?: any[]) => Promise<any>;
}

export class DocumentLifecycleHelper {
  /**
   * Universal hook invoked whenever an entity is edited or mutated after creation/submission.
   * Invalidates active approval requests (SUBMITTED or APPROVED) so altered documents cannot be posted without re-approval.
   */
  public static async onDocumentModified(
    organizationId: string,
    entityType: ApprovalEntityType,
    entityId: string,
    client?: LifecycleDatabaseClient,
    customReason?: string
  ): Promise<void> {
    this.assertValidEntityType(entityType);
    const reason = customReason
      ? `DOCUMENT_MODIFIED: ${customReason}`
      : 'DOCUMENT_MODIFIED: Document modified after submission/approval';

    await ApprovalWorkflowService.invalidateApproval(organizationId, entityType, entityId, client, reason);
  }

  /**
   * Universal hook invoked whenever an entity is voided.
   */
  public static async onDocumentVoided(
    organizationId: string,
    entityType: ApprovalEntityType,
    entityId: string,
    client?: LifecycleDatabaseClient,
    customReason?: string
  ): Promise<void> {
    this.assertValidEntityType(entityType);
    const detail = customReason ? `: ${customReason}` : '';
    const reason = `DOCUMENT_VOIDED: Document voided${detail}`;

    await ApprovalWorkflowService.invalidateApproval(organizationId, entityType, entityId, client, reason);
  }

  /**
   * Universal hook invoked whenever an entity or payment is reversed.
   */
  public static async onDocumentReversed(
    organizationId: string,
    entityType: ApprovalEntityType,
    entityId: string,
    client?: LifecycleDatabaseClient,
    customReason?: string
  ): Promise<void> {
    this.assertValidEntityType(entityType);
    const detail = customReason ? `: ${customReason}` : '';
    const reason = `DOCUMENT_REVERSED: Document voided/reversed${detail}`;

    await ApprovalWorkflowService.invalidateApproval(organizationId, entityType, entityId, client, reason);
  }

  /**
   * Universal hook invoked whenever an entity is cancelled.
   */
  public static async onDocumentCancelled(
    organizationId: string,
    entityType: ApprovalEntityType,
    entityId: string,
    client?: LifecycleDatabaseClient,
    customReason?: string
  ): Promise<void> {
    this.assertValidEntityType(entityType);
    const reason = customReason
      ? `DOCUMENT_CANCELLED: ${customReason}`
      : 'DOCUMENT_CANCELLED: Document has been cancelled';

    await ApprovalWorkflowService.invalidateApproval(organizationId, entityType, entityId, client, reason);
  }

  private static assertValidEntityType(entityType: any): asserts entityType is ApprovalEntityType {
    if (!isApprovalEntityType(entityType)) {
      throw new Error(
        `INVALID_APPROVAL_ENTITY_TYPE: '${entityType}' is not a registered approval entity type.`
      );
    }
  }
}
