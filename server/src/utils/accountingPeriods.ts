export interface DateRange {
  startInclusive: string;
  endExclusive: string;
}

export class AccountingPeriods {
  /**
   * Returns range for month (1-12) as [YYYY-MM-01, YYYY-NEXT_MM-01)
   */
  public static getMonthRange(year: number, month: number): DateRange {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1));
    return {
      startInclusive: start.toISOString().split('T')[0],
      endExclusive: end.toISOString().split('T')[0],
    };
  }

  /**
   * Returns range for Quarter (Q1: Jan-Mar, Q2: Apr-Jun, Q3: Jul-Sep, Q4: Oct-Dec or FY Q1-Q4)
   * Standard calendar quarter 1-4.
   */
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

  /**
   * Returns range for Indian/Standard Financial Year starting April 1st of startYear to April 1st of startYear+1
   */
  public static getFinancialYearRange(startYear: number): DateRange {
    const start = new Date(Date.UTC(startYear, 3, 1)); // April 1
    const end = new Date(Date.UTC(startYear + 1, 3, 1)); // April 1 next year
    return {
      startInclusive: start.toISOString().split('T')[0],
      endExclusive: end.toISOString().split('T')[0],
    };
  }

  /**
   * Returns a half-open date range given start and end date strings.
   * End date is made exclusive by adding 1 day.
   */
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
