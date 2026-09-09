import { Request, Response } from 'express';
import { db } from '../database/db';

export class MetricsController {
  public static async getMetrics(_req: Request, res: Response): Promise<void> {
    const uptime = process.uptime();
    const mem = process.memoryUsage();
    let dbConnected = 0;
    let dbMemoryMode = 0;

    try {
      const health = await db.checkHealth();
      dbConnected = health.isConnected ? 1 : 0;
      dbMemoryMode = health.isMemoryMode ? 1 : 0;
    } catch {
      dbConnected = 0;
    }

    const lines = [
      '# HELP process_uptime_seconds The process uptime in seconds.',
      '# TYPE process_uptime_seconds gauge',
      `process_uptime_seconds ${uptime.toFixed(3)}`,
      '',
      '# HELP nodejs_heap_size_used_bytes Process heap memory used in bytes.',
      '# TYPE nodejs_heap_size_used_bytes gauge',
      `nodejs_heap_size_used_bytes ${mem.heapUsed}`,
      '',
      '# HELP nodejs_heap_size_total_bytes Process heap memory allocated in bytes.',
      '# TYPE nodejs_heap_size_total_bytes gauge',
      `nodejs_heap_size_total_bytes ${mem.heapTotal}`,
      '',
      '# HELP nodejs_resident_set_size_bytes Resident set size in bytes.',
      '# TYPE nodejs_resident_set_size_bytes gauge',
      `nodejs_resident_set_size_bytes ${mem.rss}`,
      '',
      '# HELP firmbooks_database_connected Flag indicating database connection health (1 = connected, 0 = disconnected).',
      '# TYPE firmbooks_database_connected gauge',
      `firmbooks_database_connected ${dbConnected}`,
      '',
      '# HELP firmbooks_database_memory_mode Flag indicating in-memory database execution (1 = memory, 0 = persistent).',
      '# TYPE firmbooks_database_memory_mode gauge',
      `firmbooks_database_memory_mode ${dbMemoryMode}`,
      '',
    ];

    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.status(200).send(lines.join('\n'));
  }
}
