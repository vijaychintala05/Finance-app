import type { NavigationTab } from '../types';
import { AUTHORITATIVE_REPORTS } from '../services/authoritativeReportService';
import { WORKSPACE_REPORT_IDS } from '../services/reportWorkspaceService';
import { FINANCE_NAVIGATION_SECTIONS } from './financeNavigation';

export interface FinanceReportRouteState {
  reportId: string;
  fromDate?: string;
  toDate?: string;
  projectId?: string;
  customerId?: string;
  vendorId?: string;
  accountId?: string;
  status?: string;
  search?: string;
  page?: number;
  focusType?: string;
  focusId?: string;
}

export interface FinanceReturnRoute {
  tab: Exclude<NavigationTab, 'customer_portal'>;
  entityId?: string;
  report?: FinanceReportRouteState;
}

export interface FinanceHashRoute extends Omit<FinanceReturnRoute, 'tab'> {
  tab: NavigationTab;
  back?: FinanceReturnRoute;
}

const ALIASES: readonly NavigationTab[] = [
  'projects_overview', 'banking_overview', 'accounting_overview', 'reports_overview',
  'settings_overview', 'sales_overview', 'purchases_overview', 'accounting',
];
const TAB_IDS = new Set<string>([
  ...FINANCE_NAVIGATION_SECTIONS.flatMap((section) => section.subItems.map((item) => item.id)),
  ...ALIASES,
  'dashboard',
]);
const REPORT_IDS = new Set<string>([
  ...Object.keys(AUTHORITATIVE_REPORTS),
  ...WORKSPACE_REPORT_IDS,
]);
export const FINANCE_REPORT_SOURCE_ROUTES = { invoice: 'invoices', expense: 'expenses', bill: 'bills', payment_received: 'payments_received', payment_made: 'payments_made', journal: 'journals', bank_transaction: 'banking' } as const satisfies Record<string, NavigationTab>;
const SOURCE_TYPES = new Set(Object.keys(FINANCE_REPORT_SOURCE_ROUTES));
const STATUSES = new Set(['POSTED', 'PAID', 'PARTIALLY PAID', 'UNPAID', 'MATCHED', 'UNMATCHED', 'ACTIVE']);
const MAX_HASH_LENGTH = 4096;
const MAX_RETURN_HASH_LENGTH = 1800;
const MAX_ID_LENGTH = 200;
const MAX_SEARCH_LENGTH = 120;
const MAX_PAGE = 100_000;

function bounded(value: string | null, max: number): string | undefined {
  return value && value.length <= max ? value : undefined;
}

function validDate(value: string | null): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? value : undefined;
}

function parseReportState(params: URLSearchParams): FinanceReportRouteState | undefined {
  const reportId = params.get('report');
  if (!reportId || !REPORT_IDS.has(reportId)) return undefined;
  const fromDate = validDate(params.get('from'));
  const toDate = validDate(params.get('to'));
  const rangeIsValid = !fromDate || !toDate || fromDate <= toDate;
  const rawStatus = params.get('status');
  const rawPage = params.get('page');
  const page = rawPage && /^\d{1,6}$/.test(rawPage) ? Number(rawPage) : undefined;
  const focusType = params.get('focusType');
  const focusId = bounded(params.get('focusId'), MAX_ID_LENGTH);
  return {
    reportId,
    ...(rangeIsValid && fromDate ? { fromDate } : {}),
    ...(rangeIsValid && toDate ? { toDate } : {}),
    ...(bounded(params.get('project'), MAX_ID_LENGTH) ? { projectId: bounded(params.get('project'), MAX_ID_LENGTH) } : {}),
    ...(bounded(params.get('customer'), MAX_ID_LENGTH) ? { customerId: bounded(params.get('customer'), MAX_ID_LENGTH) } : {}),
    ...(bounded(params.get('vendor'), MAX_ID_LENGTH) ? { vendorId: bounded(params.get('vendor'), MAX_ID_LENGTH) } : {}),
    ...(bounded(params.get('account'), MAX_ID_LENGTH) ? { accountId: bounded(params.get('account'), MAX_ID_LENGTH) } : {}),
    ...(rawStatus && STATUSES.has(rawStatus) ? { status: rawStatus } : {}),
    ...(bounded(params.get('q'), MAX_SEARCH_LENGTH) ? { search: bounded(params.get('q'), MAX_SEARCH_LENGTH) } : {}),
    ...(page && page >= 1 && page <= MAX_PAGE ? { page } : {}),
    ...(focusType && SOURCE_TYPES.has(focusType) && focusId ? { focusType, focusId } : {}),
  };
}

function parseFinanceHashInternal(hash: string, allowBack: boolean): FinanceHashRoute {
  if (hash.length > MAX_HASH_LENGTH) return { tab: 'dashboard' };
  const normalized = hash.trim().replace(/^#?\/?/, '');
  if (!normalized) return { tab: 'dashboard' };
  const queryIndex = normalized.indexOf('?');
  const rawTab = (queryIndex < 0 ? normalized : normalized.slice(0, queryIndex)).trim();
  if (!TAB_IDS.has(rawTab)) return { tab: 'dashboard' };
  const tab = rawTab as NavigationTab;
  const params = new URLSearchParams(queryIndex < 0 ? '' : normalized.slice(queryIndex + 1));
  const entityId = bounded(params.get('id'), MAX_ID_LENGTH);
  const route: FinanceHashRoute = {
    tab,
    ...(entityId ? { entityId } : {}),
    ...(tab === 'reports' ? { report: parseReportState(params) } : {}),
  };
  if (allowBack && tab !== 'reports') {
    const rawBack = bounded(params.get('back'), MAX_RETURN_HASH_LENGTH);
    if (rawBack) {
      const rawBackPath = rawBack.trim().replace(/^#?\/?/, '');
      const rawBackTab = rawBackPath.split('?')[0].trim();
      const back = parseFinanceHashInternal(rawBack, false);
      if (TAB_IDS.has(rawBackTab) && rawBackTab !== 'customer_portal' && ((back.tab !== 'reports') || back.report)) {
        route.back = {
          tab: back.tab as Exclude<NavigationTab, 'customer_portal'>,
          ...(back.entityId ? { entityId: back.entityId } : {}),
          ...(back.tab === 'reports' && back.report ? { report: back.report } : {}),
        };
      }
    }
  }
  return route;
}

export function parseFinanceLocation(hash: string, search: string): FinanceHashRoute {
  if (new URLSearchParams(search).has('portal_token')) return { tab: 'customer_portal' };
  return parseFinanceHash(hash);
}
export function parseFinanceHash(hash: string): FinanceHashRoute {
  return parseFinanceHashInternal(hash, true);
}

function buildFinanceHashInternal(route: FinanceHashRoute, allowCoreRouteFallback: boolean): string {
  const tab = TAB_IDS.has(route.tab) ? route.tab : 'dashboard';
  if (route.entityId && route.entityId.length > MAX_ID_LENGTH) throw new RangeError('Finance route entity ID exceeds the supported length.');
  if (route.back) {
    const backTab = route.back.tab as NavigationTab;
    if (!TAB_IDS.has(backTab) || backTab === 'customer_portal') throw new RangeError('Finance return route must target an internal navigation tab.');
    if (route.back.entityId && route.back.entityId.length > MAX_ID_LENGTH) throw new RangeError('Finance return route entity ID exceeds the supported length.');
    if (route.back.tab === 'reports' && (!route.back.report || !REPORT_IDS.has(route.back.report.reportId))) throw new RangeError('Finance report return route requires a supported report.');
  }
  const params = new URLSearchParams();
  const entityId = route.entityId;
  if (entityId) params.set('id', entityId);
  if (tab === 'reports' && route.report && REPORT_IDS.has(route.report.reportId)) {
    const report = route.report;
    params.set('report', report.reportId);
    const fromDate = validDate(report.fromDate || null);
    const toDate = validDate(report.toDate || null);
    if (!fromDate || !toDate || fromDate <= toDate) {
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
    }
    for (const [key, value] of [['project', report.projectId], ['customer', report.customerId], ['vendor', report.vendorId], ['account', report.accountId]] as const) {
      if (value && value.length <= MAX_ID_LENGTH) params.set(key, value);
    }
    if (report.status && STATUSES.has(report.status)) params.set('status', report.status);
    if (report.search && report.search.length <= MAX_SEARCH_LENGTH) params.set('q', report.search);
    if (Number.isInteger(report.page) && report.page! >= 1 && report.page! <= MAX_PAGE) params.set('page', String(report.page));
    if (report.focusType && SOURCE_TYPES.has(report.focusType) && report.focusId && report.focusId.length <= MAX_ID_LENGTH) {
      params.set('focusType', report.focusType);
      params.set('focusId', report.focusId);
    }
  } else if (tab !== 'reports' && route.back && TAB_IDS.has(route.back.tab)) {
    const back = route.back;
    const backRoute: FinanceHashRoute = {
      tab: back.tab,
      ...(back.entityId && back.entityId.length <= MAX_ID_LENGTH ? { entityId: back.entityId } : {}),
      ...(back.tab === 'reports' && back.report && REPORT_IDS.has(back.report.reportId) ? { report: back.report } : {}),
    };
    if (back.tab !== 'reports' || backRoute.report) {
      const serializedBack = buildFinanceHashInternal(backRoute, false);
      if (serializedBack.length > MAX_RETURN_HASH_LENGTH) throw new RangeError('Finance return route exceeds the supported length and cannot preserve its destination.');
      params.set('back', serializedBack);
    }
  }
  const query = params.toString();
  const result = `#/${tab}${query ? `?${query}` : ''}`;
  if (result.length > MAX_HASH_LENGTH) {
    if (route.back || !allowCoreRouteFallback || (tab === 'reports' && route.report)) throw new RangeError('Finance route exceeds the supported length and cannot preserve its destination.');
    return '#/' + tab + (entityId ? '?id=' + encodeURIComponent(entityId) : '');
  }
  return result;
}


export function buildFinanceHash(route: FinanceHashRoute): string {
  return buildFinanceHashInternal(route, true);
}
