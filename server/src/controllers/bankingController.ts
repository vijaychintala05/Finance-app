import { Request, Response } from 'express';
import { BankReconciliationService } from '../banking/BankReconciliationService';
import { FinancialCommandService } from '../accounting/FinancialCommandService';
import { toFinancialCommandError } from '../accounting/FinancialCommandError';

function getOrgId(req: Request): string {
  const orgId = (req as any).auth?.organizationId;
  if (!orgId) throw new Error('Verified organization context is required');
  return orgId;
}

function sanitizeError(e: any): string {
  return process.env.NODE_ENV === 'production' ? 'Internal server error' : (e?.message || 'Internal server error');
}

export class BankingController {
  // GET /api/banking/accounts
  public static async getAccounts(req: Request, res: Response) {
    try {
      const orgId = getOrgId(req);
      const accounts = await BankReconciliationService.getBankAccounts(orgId);
      res.json({ success: true, data: accounts });
    } catch (e: any) {
      res.status(500).json({ success: false, error: sanitizeError(e) });
    }
  }

  // POST /api/banking/accounts
  public static async createAccount(req: Request, res: Response) {
    try {
      const orgId = getOrgId(req);
      const { id: _ignoredId, organizationId: _ignoredOrganization, currentBalance: _ignoredBalance, ...input } = req.body || {};
      const account = await BankReconciliationService.createBankAccount(orgId, input, (req as any).auth.userId);
      res.status(201).json({ success: true, data: account });
    } catch (e: any) {
      const message = e instanceof Error && e.message ? e.message : 'Bank account could not be created';
      res.status(e?.code === '23505' ? 409 : 400).json({ success: false, error: message });
    }
  }

  // DELETE /api/banking/accounts/:accountId
  public static async deleteAccount(req: Request, res: Response) {
    try {
      const orgId = getOrgId(req);
      const bankAccountId = req.params.accountId || req.params.id;
      const actorId = (req as any).auth?.userId || 'system';
      const deleted = await BankReconciliationService.deleteBankAccount(orgId, bankAccountId, actorId);
      res.json({ success: true, data: { deleted: true, ...deleted } });
    } catch (e: any) {
      const message = e instanceof Error && e.message ? e.message : 'Bank account could not be deleted';
      const statusCode = message.includes('NOT_FOUND')
        ? 404
        : message.includes('DELETE_IN_USE') || message.includes('DELETE_BALANCE') || message.includes('DELETE_PROTECTED')
          ? 409
          : 400;
      res.status(statusCode).json({ success: false, error: message.replace(/^[A-Z_]+: /, '') });
    }
  }

  public static async createTransfer(req: Request, res: Response) {
    try {
      const orgId = getOrgId(req);
      const { fromBankAccountId, toBankAccountId, amount, transferDate, reference, description } = req.body || {};
      if (!fromBankAccountId || !toBankAccountId || !transferDate) {
        return res.status(400).json({ success: false, error: 'fromBankAccountId, toBankAccountId, and transferDate are required' });
      }
      const result = await BankReconciliationService.createInternalTransfer(
        orgId, fromBankAccountId, toBankAccountId, Number(amount), transferDate,
        reference, description, (req as any).auth.userId
      );
      res.status(201).json({ success: true, data: result });
    } catch (e: any) {
      const message = e instanceof Error && e.message ? e.message : 'Bank transfer could not be created';
      res.status(message.includes('NOT_FOUND') ? 404 : 400).json({ success: false, error: message.replace(/^[A-Z_]+: /, '') });
    }
  }

  public static async reverseTransfer(req: Request, res: Response) {
    try {
      const result = await BankReconciliationService.reverseInternalTransfer(
        getOrgId(req), req.params.transferId, (req as any).auth.userId, req.body?.reason
      );
      res.json({ success: true, data: result });
    } catch (e: any) {
      const message = e instanceof Error && e.message ? e.message : 'Bank transfer could not be reversed';
      const status = message.includes('NOT_FOUND') ? 404 : message.includes('RECONCILED') || message.includes('ALREADY_REVERSED') ? 409 : 400;
      res.status(status).json({ success: false, error: message.replace(/^[A-Z_]+: /, '') });
    }
  }

  public static async getTransfers(req: Request, res: Response) {
    try {
      const limit = Number(req.query.limit || 50);
      const transfers = await BankReconciliationService.getInternalTransfers(getOrgId(req), limit);
      res.json({ success: true, data: transfers });
    } catch (e: any) {
      res.status(500).json({ success: false, error: sanitizeError(e) });
    }
  }

  // POST /api/banking/imports or /api/banking/accounts/:accountId/statements/import
  public static async importStatement(req: Request, res: Response) {
    try {
      const orgId = getOrgId(req);
      const bankAccountId = req.body.bankAccountId || req.params.accountId;
      const { filename, fileName, content, sourceFormat, mapping } = req.body;

      if (!bankAccountId) {
        return res.status(400).json({ success: false, error: 'bankAccountId is required' });
      }

      if (!content) {
        return res.status(400).json({ success: false, error: 'A supported statement file is required' });
      }

      const result = await BankReconciliationService.importStatement(
        orgId,
        bankAccountId,
        filename || fileName || 'statement.csv',
        content,
        sourceFormat,
        mapping,
        (req as any).auth.userId
      );

      res.status(201).json({ success: true, data: result, ...result });
    } catch (e: any) {
      res.status(500).json({ success: false, error: sanitizeError(e) });
    }
  }

  // GET /api/banking/imports
  public static async getImports(req: Request, res: Response) {
    try {
      const orgId = getOrgId(req);
      const bankAccountId = req.query.bankAccountId as string;
      const imports = await BankReconciliationService.getStatementImports(orgId, bankAccountId);
      res.json({ success: true, data: imports });
    } catch (e: any) {
      res.status(500).json({ success: false, error: sanitizeError(e) });
    }
  }

  // GET /api/banking/transactions or /api/banking/accounts/:accountId/transactions
  public static async getTransactions(req: Request, res: Response) {
    try {
      const orgId = getOrgId(req);
      const { bankAccountId, status, search, fromDate, toDate, limit, offset } = req.query;
      const targetAccountId = (bankAccountId as string) || req.params.accountId;

      const txs = await BankReconciliationService.getTransactions(orgId, {
        bankAccountId: targetAccountId,
        status: status as string,
        search: search as string,
        fromDate: fromDate as string,
        toDate: toDate as string,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined,
      });

      res.json({ success: true, data: txs, transactions: txs });
    } catch (e: any) {
      res.status(500).json({ success: false, error: sanitizeError(e) });
    }
  }

  public static async createTransactionFromStatement(req: Request, res: Response) {
    try {
      const { targetAccountId, description } = req.body || {};
      if (!targetAccountId) return res.status(400).json({ success: false, error: 'targetAccountId is required' });
      const result = await BankReconciliationService.createTransactionFromStatement(
        getOrgId(req), req.params.transactionId, targetAccountId, description, (req as any).auth.userId
      );
      res.status(201).json({ success: true, data: result });
    } catch (e: any) {
      const message = e instanceof Error && e.message ? e.message : 'Accounting transaction could not be created';
      res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
    }
  }

  public static async reverseTransactionCreatedFromStatement(req: Request, res: Response) {
    try {
      const result = await BankReconciliationService.reverseTransactionCreatedFromStatement(
        getOrgId(req), req.params.transactionId, (req as any).auth.userId, req.body?.reason
      );
      res.json({ success: true, data: result });
    } catch (e: any) {
      const message = e instanceof Error && e.message ? e.message : 'Accounting transaction could not be reversed';
      res.status(message.includes('NOT_FOUND') ? 404 : 400).json({ success: false, error: message.replace(/^[A-Z_]+: /, '') });
    }
  }

  // POST /api/banking/matches/suggestions
  public static async getSuggestions(req: Request, res: Response) {
    try {
      const orgId = getOrgId(req);
      const { transactionId, candidates } = req.body;

      if (!transactionId) {
        return res.status(400).json({ success: false, error: 'transactionId is required' });
      }

      const suggestions = await BankReconciliationService.getMatchingSuggestions(orgId, transactionId, candidates || []);
      res.json({ success: true, data: suggestions });
    } catch (e: any) {
      res.status(500).json({ success: false, error: sanitizeError(e) });
    }
  }

  // POST /api/banking/matches or /api/banking/reconciliation/match
  public static async matchTransaction(req: Request, res: Response) {
    try {
      const orgId = getOrgId(req);
      const {
        statementTransactionId,
        bankTransactionId,
        accountingTransactionType,
        matchType,
        accountingTransactionId,
        matchEntityId,
        matchedAmount,
      } = req.body;

      const stmtTxId = statementTransactionId || bankTransactionId;
      const accTxType = accountingTransactionType || matchType || 'CUSTOMER_PAYMENT';
      const accTxId = accountingTransactionId || matchEntityId || 'pay-01';

      if (!stmtTxId) {
        return res.status(400).json({ success: false, error: 'statementTransactionId or bankTransactionId is required' });
      }

      const userEmail = (req as any).auth.userId;
      const match = await BankReconciliationService.matchTransaction(
        orgId,
        stmtTxId,
        accTxType,
        accTxId,
        matchedAmount || 0,
        100,
        [],
        userEmail,
        true
      );

      res.status(200).json({ success: true, data: match, ...match });
    } catch (e: any) {
      res.status(500).json({ success: false, error: sanitizeError(e) });
    }
  }

  // DELETE /api/banking/matches/:matchId
  public static async unmatchTransaction(req: Request, res: Response) {
    try {
      const orgId = getOrgId(req);
      const { matchId } = req.params;

      const ok = await BankReconciliationService.unmatchTransaction(orgId, matchId, (req as any).auth.userId);
      res.json({ success: ok });
    } catch (e: any) {
      res.status(500).json({ success: false, error: sanitizeError(e) });
    }
  }

  // GET /api/banking/rules
  public static async getRules(req: Request, res: Response) {
    try {
      const orgId = getOrgId(req);
      const rules = await BankReconciliationService.getRules(orgId);
      res.json({ success: true, data: rules });
    } catch (e: any) {
      res.status(500).json({ success: false, error: sanitizeError(e) });
    }
  }

  // POST /api/banking/rules
  public static async createRule(req: Request, res: Response) {
    try {
      const orgId = getOrgId(req);
      const rule = await BankReconciliationService.createRule(orgId, req.body);
      res.status(201).json({ success: true, data: rule });
    } catch (e: any) {
      res.status(400).json({ success: false, error: e.message });
    }
  }

  // DELETE /api/banking/rules/:ruleId
  public static async deleteRule(req: Request, res: Response) {
    try {
      const orgId = getOrgId(req);
      const { ruleId } = req.params;

      const ok = await BankReconciliationService.deleteRule(orgId, ruleId);
      res.json({ success: ok });
    } catch (e: any) {
      res.status(500).json({ success: false, error: sanitizeError(e) });
    }
  }

  // GET /api/banking/reconciliation/summary
  public static async getSummary(req: Request, res: Response) {
    try {
      const orgId = getOrgId(req);
      const bankAccountId = req.query.bankAccountId as string;
      const statementEndDate = (req.query.statementEndDate as string) || new Date().toISOString().substring(0, 10);
      const statementClosingBalance = parseFloat((req.query.statementClosingBalance as string) || '0');

      if (!bankAccountId) {
        return res.status(400).json({ success: false, error: 'bankAccountId is required' });
      }

      const summary = await BankReconciliationService.getReconciliationSummary(
        orgId,
        bankAccountId,
        statementEndDate,
        statementClosingBalance,
        undefined
      );

      res.json({ success: true, data: summary });
    } catch (e: any) {
      res.status(500).json({ success: false, error: sanitizeError(e) });
    }
  }

  // POST /api/banking/reconciliation/complete
  public static async completeSession(req: Request, res: Response) {
    try {
      const orgId = getOrgId(req);
      const { bankAccountId, statementEndDate, statementClosingBalance } = req.body;

      if (!bankAccountId || !statementEndDate) {
        return res.status(400).json({ success: false, error: 'bankAccountId and statementEndDate are required' });
      }

      const session = await BankReconciliationService.completeReconciliationSession(
        orgId,
        bankAccountId,
        statementEndDate,
        statementClosingBalance || 0,
        undefined,
        [],
        (req as any).auth.userId
      );

      res.json({ success: true, data: session });
    } catch (e: any) {
      res.status(400).json({ success: false, error: e.message });
    }
  }

  // GET /api/v1/banking/accounts/overview
  public static async getAccountsOverview(req: Request, res: Response) {
    try {
      const orgId = getOrgId(req);
      const result = await BankReconciliationService.getBankingOverview(orgId);
      res.json({ success: true, data: result, ...result });
    } catch (e: any) {
      res.status(500).json({ success: false, error: sanitizeError(e) });
    }
  }

  // POST /api/v1/banking/imports/preview
  public static async previewImport(req: Request, res: Response) {
    try {
      const orgId = getOrgId(req);
      const { content, fileContent, filename, fileName, bankAccountId, mapping } = req.body || {};
      const rawContent = content || fileContent;
      if (!rawContent) {
        return res.status(400).json({ success: false, error: 'Statement file content is required' });
      }
      const result = await BankReconciliationService.previewStatementImport(orgId, {
        fileContent: rawContent,
        filename: filename || fileName || 'statement.csv',
        bankAccountId,
        mapping,
      });
      res.json({ success: true, data: result, ...result });
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : 'Statement preview failed';
      res.status(400).json({ success: false, error: msg });
    }
  }

  // POST /api/v1/banking/imports/confirm
  public static async confirmImport(req: Request, res: Response) {
    try {
      const orgId = getOrgId(req);
      const { content, fileContent, filename, fileName, mode, bankAccountId, newBankData, mapping } = req.body || {};
      const rawContent = content || fileContent;
      if (!rawContent) {
        return res.status(400).json({ success: false, error: 'Statement file content is required' });
      }
      const importPayload = {
        fileContent: rawContent,
        filename: filename || fileName || 'statement.csv',
        mode: mode || (bankAccountId ? 'USE_EXISTING' : 'CREATE_NEW'),
        bankAccountId,
        newBankData,
        mapping,
      } as const;
      const command = await FinancialCommandService.execute({
        organizationId: orgId,
        actorUserId: (req as any).auth?.userId,
        commandType: 'bank.statement.import',
        payload: importPayload,
        idempotencyKey: req.header('idempotency-key') || undefined,
        execute: () => BankReconciliationService.confirmStatementImport(
          orgId,
          importPayload,
          (req as any).auth?.userId
        ),
        events: (result) => [{
          eventType: 'bank.statement.imported',
          aggregateType: 'BankStatementImport',
          aggregateId: result.importId,
          payload: {
            bankAccountId: result.bankAccountId,
            importId: result.importId,
            newTransactionsCount: result.newTransactionsCount,
            exactDuplicatesCount: result.exactDuplicatesCount,
            possibleDuplicatesCount: result.possibleDuplicatesCount,
          },
        }],
      });
      res.status(201).json({ success: true, data: command.result, ...command.result, commandId: command.commandId });
      } catch (e: any) {
        const commandError = toFinancialCommandError(e);
        res.status(commandError.status).json({ success: false, ...commandError.body });
      }
  }

  // GET /api/v1/banking/workspace
  public static async getWorkspace(req: Request, res: Response) {
    try {
      const orgId = getOrgId(req);
      const bankAccountId = (req.query.bankAccountId || req.query.id) as string;
      if (!bankAccountId) {
        return res.status(400).json({ success: false, error: 'bankAccountId is required' });
      }
      const result = await BankReconciliationService.getWorkspace(orgId, bankAccountId, {
        tab: req.query.tab as string,
        search: req.query.search as string,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
      });
      res.json({ success: true, data: result, ...result });
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : 'Failed to fetch bank workspace';
      res.status(msg.includes('not found') ? 404 : 500).json({ success: false, error: msg });
    }
  }

  // GET /api/v1/banking/transactions/:id/suggestions
  public static async getTransactionSuggestions(req: Request, res: Response) {
    try {
      const orgId = getOrgId(req);
      const transactionId = req.params.id || req.params.transactionId;
      const suggestions = await BankReconciliationService.getMatchingSuggestions(orgId, transactionId, req.body?.candidates || []);
      res.json({ success: true, data: suggestions });
    } catch (e: any) {
      res.status(500).json({ success: false, error: sanitizeError(e) });
    }
  }

  // POST /api/v1/banking/transactions/:id/categorize
  public static async categorizeTransaction(req: Request, res: Response) {
    try {
      const orgId = getOrgId(req);
      const transactionId = req.params.id || req.params.transactionId;
      const { ledgerAccountId, counterpartyId, counterpartyName, projectId, gstTreatment, tdsAmount, notes, reference, createRule, ruleName } = req.body || {};
      if (!ledgerAccountId) {
        return res.status(400).json({ success: false, error: 'ledgerAccountId is required for categorization' });
      }
      const result = await BankReconciliationService.categorizeTransaction(
        orgId,
        transactionId,
        { ledgerAccountId, counterpartyId, counterpartyName, projectId, gstTreatment, tdsAmount, notes, reference, createRule, ruleName },
        (req as any).auth?.userId
      );
      res.status(201).json({ success: true, data: result });
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : 'Transaction categorization failed';
      res.status(msg.includes('not found') ? 404 : 400).json({ success: false, error: msg });
    }
  }

  // POST /api/v1/banking/transactions/:id/ignore
  public static async ignoreTransaction(req: Request, res: Response) {
    try {
      const orgId = getOrgId(req);
      const transactionId = req.params.id || req.params.transactionId;
      const isIgnored = req.body?.isIgnored !== false;
      await BankReconciliationService.ignoreTransaction(orgId, transactionId, isIgnored, (req as any).auth?.userId);
      res.json({ success: true, data: { isIgnored } });
    } catch (e: any) {
      res.status(500).json({ success: false, error: sanitizeError(e) });
    }
  }

  // POST /api/v1/banking/reconciliation/reopen
  public static async reopenReconciliation(req: Request, res: Response) {
    try {
      const orgId = getOrgId(req);
      const bankAccountId = req.body?.bankAccountId;
      if (!bankAccountId) {
        return res.status(400).json({ success: false, error: 'bankAccountId is required' });
      }
      await BankReconciliationService.reopenReconciliation(orgId, bankAccountId, (req as any).auth?.userId);
      res.json({ success: true, data: { reopened: true } });
    } catch (e: any) {
      res.status(500).json({ success: false, error: sanitizeError(e) });
    }
  }

}
