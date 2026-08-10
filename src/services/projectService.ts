import { Invoice, Project, ProjectFinancialSummary, TimeEntry } from '../types';

export class ProjectService {
  /**
   * Computes financial summary for a project
   */
  static calculateProjectSummary(
    project: Project,
    timeEntries: TimeEntry[],
    invoices: Invoice[]
  ): ProjectFinancialSummary {
    const projectTimeEntries = timeEntries.filter((t) => t.projectId === project.id);
    const projectInvoices = invoices.filter((i) => i.projectId === project.id && i.status !== 'Void');

    let totalLoggedHours = 0;
    let unbilledHoursAmount = 0;

    projectTimeEntries.forEach((t) => {
      totalLoggedHours += t.hours;
      if (!t.isBilled) {
        unbilledHoursAmount += t.hours * t.hourlyRate;
      }
    });

    const totalInvoiced = projectInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
    const totalCollected = projectInvoices.reduce((sum, inv) => sum + inv.paidAmount, 0);

    const netProfit = totalInvoiced - unbilledHoursAmount;
    const margin = totalInvoiced > 0 ? Math.round(((totalInvoiced - unbilledHoursAmount) / totalInvoiced) * 100) : 100;
    const budgetUsedPercent = project.totalBudget > 0 ? Math.round((totalInvoiced / project.totalBudget) * 100) : 0;

    return {
      projectId: project.id,
      totalInvoiced: Math.round(totalInvoiced * 100) / 100,
      totalCollected: Math.round(totalCollected * 100) / 100,
      directExpenses: 0,
      unbilledHoursAmount: Math.round(unbilledHoursAmount * 100) / 100,
      totalLoggedHours,
      netProfit: Math.round(netProfit * 100) / 100,
      profitMarginPercent: margin,
      budgetUsedPercent,
    };
  }
}
