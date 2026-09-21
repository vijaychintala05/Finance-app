import { db } from '../database/db';
import PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';
import type { WorkspaceReportResult } from './ReportWorkspaceService';
import { formatCurrencyAmount, formatIndianNumber } from '../utils/money';

export interface ReportExportMetadata {
  orgName: string;
  reportName: string;
  reportingPeriod: string;
  appliedFilters: Record<string, any>;
  generatedAt: string;
  generatedBy: string;
  currencySymbol: string;
}

export class ReportExportService {
  public static async getExportMetadata(
    orgId: string,
    userId: string,
    reportName: string,
    periodLabel: string,
    filters: Record<string, any> = {}
  ): Promise<ReportExportMetadata> {
    const orgRes = await db.query(
      `SELECT name, currency_symbol FROM organizations WHERE id = $1`,
      [orgId]
    );
    if (orgRes.rows.length !== 1) throw new Error('Organization not found');
    const orgName = String(orgRes.rows[0].name || '').trim();
    const currencySymbol = String(orgRes.rows[0].currency_symbol || '').trim();
    if (!orgName || !currencySymbol) throw new Error('Organization report metadata is incomplete');

    const userRes = await db.query(
      `SELECT full_name, email FROM users WHERE id = $1`,
      [userId]
    );
    if (userRes.rows.length !== 1) throw new Error('Report generator identity was not found');
    const generatedBy = String(userRes.rows[0].full_name || userRes.rows[0].email || '').trim();
    if (!generatedBy) throw new Error('Report generator identity is incomplete');

    return {
      orgName,
      reportName,
      reportingPeriod: periodLabel,
      appliedFilters: filters,
      generatedAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
      generatedBy,
      currencySymbol,
    };
  }

  public static sanitizeCsvValue(val: string): string {
    if (!val) return '';
    // CWE-1236: Prevent CSV Formula Injection in spreadsheet applications (Excel, Calc)
    if (/^[=+\-@\t\r]/.test(val)) {
      return `'${val}`;
    }
    return val;
  }

  public static convertToCSV(dataRows: any[], headers?: string[]): string {
    if (!dataRows || dataRows.length === 0) return '';
    const cols = headers || Object.keys(dataRows[0]);
    const headerLine = cols.join(',');

    const rowLines = dataRows.map((row) =>
      cols
        .map((col) => {
          const raw = row[col] !== undefined && row[col] !== null ? String(row[col]) : '';
          const sanitized = this.sanitizeCsvValue(raw);
          const escaped = sanitized.replace(/"/g, '""');
          return `"${escaped}"`;
        })
        .join(',')
    );

    return [headerLine, ...rowLines].join('\n');
  }

  private static displayValue(value: unknown, type?: string, currencySymbol = ''): string {
    if (value === null || value === undefined || value === '') return '';
    if (type === 'money') {
      return formatCurrencyAmount(Number(value), currencySymbol);
    }
    if (type === 'percent') return `${formatIndianNumber(Number(value), 2)}%`;
    if (type === 'number') return formatIndianNumber(Number(value), 2);
    return String(value).replace(/[\r\n\t]+/g, ' ').trim();
  }

  public static exportWorkspaceReport(
    report: WorkspaceReportResult,
    metadata: ReportExportMetadata,
    format: 'csv' | 'xlsx' | 'pdf',
    selectedColumns?: string[],
  ): Promise<Buffer> | Buffer {
    const allowedColumns = new Set(selectedColumns || report.columns.map((column) => column.key));
    const columns = report.columns.filter((column) => allowedColumns.has(column.key));
    if (columns.length === 0) throw new Error('Select at least one report column');

    const rows = report.rows.map((row) => Object.fromEntries(columns.map((column) => [
      column.label,
      this.displayValue(row[column.key], column.type, metadata.currencySymbol),
    ])));

    if (format === 'csv') {
      const csv = this.convertToCSV(rows, columns.map((column) => column.label));
      return Buffer.from(`\uFEFF${csv}`, 'utf8');
    }

    if (format === 'xlsx') {
      const workbook = XLSX.utils.book_new();
      const heading = [
        [metadata.orgName],
        [metadata.reportName],
        [metadata.reportingPeriod],
        [`Generated ${metadata.generatedAt} by ${metadata.generatedBy}`],
        [],
      ];
      const worksheet = XLSX.utils.aoa_to_sheet(heading);
      XLSX.utils.sheet_add_json(worksheet, rows, { origin: 'A6' });
      worksheet['!cols'] = columns.map((column) => ({ wch: Math.min(42, Math.max(14, column.label.length + 2)) }));
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');
      return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    }

    return new Promise<Buffer>((resolve, reject) => {
      const landscape = columns.length > 6;
      const doc = new PDFDocument({ size: 'A4', layout: landscape ? 'landscape' : 'portrait', margin: 34, bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      doc.on('error', reject);
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      const pageWidth = doc.page.width - 68;
      const amount = (value: number, type: string) => this.displayValue(value, type, metadata.currencySymbol);
      const text = (value: unknown) => String(value ?? '').replace(/[^\x20-\x7E\xA0-\xFF]/g, '').replace(/[\r\n\t]+/g, ' ').trim();

      doc.font('Helvetica-Bold').fontSize(10).fillColor('#2563eb').text(text(metadata.orgName));
      doc.font('Helvetica-Bold').fontSize(20).fillColor('#0f172a').text(text(metadata.reportName), { continued: false });
      doc.font('Helvetica').fontSize(9).fillColor('#64748b').text(text(metadata.reportingPeriod));
      doc.moveDown(0.35);

      if (report.summary.length) {
        const cardWidth = pageWidth / Math.min(4, report.summary.length);
        report.summary.slice(0, 4).forEach((item, index) => {
          const x = 34 + index * cardWidth;
          const y = doc.y;
          doc.font('Helvetica').fontSize(7).fillColor('#64748b').text(text(item.label).toUpperCase(), x, y, { width: cardWidth - 10 });
          doc.font('Helvetica-Bold').fontSize(11).fillColor('#0f172a').text(amount(item.value, item.type), x, y + 12, { width: cardWidth - 10 });
        });
        doc.y += 36;
      }

      const columnWidth = pageWidth / columns.length;
      const drawHeader = () => {
        const y = doc.y;
        doc.rect(34, y, pageWidth, 22).fill('#eff6ff');
        columns.forEach((column, index) => {
          doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#334155').text(text(column.label).toUpperCase(), 38 + index * columnWidth, y + 7, { width: columnWidth - 8, ellipsis: true });
        });
        doc.y = y + 22;
      };
      drawHeader();

      for (const row of report.rows) {
        if (doc.y > doc.page.height - 58) {
          doc.addPage();
          drawHeader();
        }
        const y = doc.y;
        columns.forEach((column, index) => {
          doc.font('Helvetica').fontSize(7).fillColor('#334155').text(
            text(this.displayValue(row[column.key], column.type, metadata.currencySymbol)),
            38 + index * columnWidth,
            y + 6,
            { width: columnWidth - 8, height: 20, ellipsis: true, align: column.align === 'right' ? 'right' : 'left' },
          );
        });
        doc.moveTo(34, y + 24).lineTo(34 + pageWidth, y + 24).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
        doc.y = y + 25;
      }

      if (report.rows.length === 0) {
        doc.font('Helvetica').fontSize(9).fillColor('#64748b').text('No records matched the selected filters.', 34, doc.y + 18, { align: 'center', width: pageWidth });
      }

      const range = doc.bufferedPageRange();
      for (let page = range.start; page < range.start + range.count; page += 1) {
        doc.switchToPage(page);
        doc.font('Helvetica').fontSize(7).fillColor('#94a3b8').text(
          `Generated ${text(metadata.generatedAt)} by ${text(metadata.generatedBy)}  |  Page ${page + 1} of ${range.count}`,
          34,
          doc.page.height - 28,
          { width: pageWidth, align: 'center' },
        );
      }
      doc.end();
    });
  }
}
