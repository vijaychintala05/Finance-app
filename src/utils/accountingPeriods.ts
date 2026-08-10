export interface DateRange {
  startInclusive: string;
  endExclusive: string;
}

export class AccountingPeriods {
  public static getMonthRange(year: number, month: number): DateRange {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1));
    return {
      startInclusive: start.toISOString().split('T')[0],
      endExclusive: end.toISOString().split('T')[0],
    };
  }

  public static getQuarterRange(year: number, quarter: 1 | 2 | 3 | 4): DateRange {
    const startMonth = (quarter - 1) * 3 + 1;
    const start = new Date(Date.UTC(year, startMonth - 1, 1));
    const endMonth = startMonth + 3;
    const endYear = endMonth > 12 ? year + 1 : year;
    const normEndMonth = endMonth > 12 ? endMonth - 12 : endMonth;
    const end = new Date(Date.UTC(endYear, normEndMonth - 1, 1));

    return {
      startInclusive: start.toISOString().split('T')[0],
      endExclusive: end.toISOString().split('T')[0],
    };
  }

  public static getFinancialYearRange(startYear: number): DateRange {
    const start = new Date(Date.UTC(startYear, 3, 1));
    const end = new Date(Date.UTC(startYear + 1, 3, 1));
    return {
      startInclusive: start.toISOString().split('T')[0],
      endExclusive: end.toISOString().split('T')[0],
    };
  }

  public static getDateRange(startDateStr: string, endDateStr: string): DateRange {
    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);
    endDate.setDate(endDate.getDate() + 1);

    return {
      startInclusive: startDate.toISOString().split('T')[0],
      endExclusive: endDate.toISOString().split('T')[0],
    };
  }
}
