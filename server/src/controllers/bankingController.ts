import { Request, Response } from 'express';
import { BankReconciliationService } from '../banking/BankReconciliationService';

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
}
