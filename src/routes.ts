import { Router, Request, Response } from 'express';
import { webhookQueue } from './queue';
import { listEdgeFunctions, buildEdgeFunctionTarget } from './supabase';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// ──────────────────────────────────────────────
// POST /api/jobs — Crear un nuevo trabajo
// Soporta dos modos:
//   1. Supabase: enviar { supabase: { url, key, functionSlug }, payload }
//   2. Manual:   enviar { target: { url, method, headers, body } }
// ──────────────────────────────────────────────
router.post('/jobs', async (req: Request, res: Response): Promise<any> => {
  try {
    const { name, target, supabase, payload, schedule, retryPolicy } = req.body;

    let resolvedTarget;

    // Modo Supabase: construir target automáticamente
    if (supabase && supabase.url && supabase.key && supabase.functionSlug) {
      resolvedTarget = buildEdgeFunctionTarget(
        supabase.url,
        supabase.key,
        supabase.functionSlug,
        payload
      );
    } else if (target && target.url && target.method) {
      // Modo manual: usar el target tal cual viene
      resolvedTarget = target;
    } else {
      return res.status(400).json({
        error: 'Debes proveer "supabase" (url, key, functionSlug) o "target" (url, method)'
      });
    }

    // Calcular retraso o configuración CRON
    let delay = 0;
    let repeat = undefined;
    
    if (schedule) {
      if (schedule.type === 'delay' && schedule.delaySeconds) {
        delay = schedule.delaySeconds * 1000;
      } else if (schedule.type === 'cron' && schedule.expression) {
        repeat = { pattern: schedule.expression };
      }
    }

    // Configurar la política de reintentos
    const attempts = retryPolicy?.maxRetries || 3;
    const backoff = retryPolicy?.backoff === 'exponential' 
      ? { type: 'exponential', delay: (retryPolicy.initialDelaySeconds || 2) * 1000 } 
      : undefined;

    // Inyectar el trabajo a la cola de Redis
    const job = await webhookQueue.add(name || 'Tarea SupaCron', {
      target: resolvedTarget
    }, {
      delay,
      attempts,
      backoff,
      repeat
    });

    res.status(201).json({
      status: 'success',
      jobId: job.id,
      message: 'Tarea encolada exitosamente'
    });
  } catch (error: any) {
    console.error('Error al encolar tarea:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ──────────────────────────────────────────────
// GET /api/jobs/stats — Métricas de la cola
// Waiting/Active de BullMQ, Completed/Failed de Prisma
// ──────────────────────────────────────────────
router.get('/jobs/stats', async (_req: Request, res: Response): Promise<any> => {
  try {
    // Métricas de Redis (BullMQ)
    const queueCounts = await webhookQueue.getJobCounts('waiting', 'active', 'delayed');

    // Métricas de Prisma (histórico)
    const [completedCount, failedCount] = await Promise.all([
      prisma.jobLog.count({ where: { status: 'success' } }),
      prisma.jobLog.count({ where: { status: 'failed' } })
    ]);

    res.json({
      waiting: (queueCounts.waiting || 0) + (queueCounts.delayed || 0),
      active: queueCounts.active || 0,
      completed: completedCount,
      failed: failedCount
    });
  } catch (error: any) {
    console.error('Error al obtener stats:', error.message);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

// ──────────────────────────────────────────────
// GET /api/jobs/logs — Historial de ejecuciones
// Retorna los últimos 50 registros de JobLog
// ──────────────────────────────────────────────
router.get('/jobs/logs', async (_req: Request, res: Response): Promise<any> => {
  try {
    const logs = await prisma.jobLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    res.json(logs);
  } catch (error: any) {
    console.error('Error al obtener logs:', error.message);
    res.status(500).json({ error: 'Error al obtener historial' });
  }
});

// ──────────────────────────────────────────────
// GET /api/supabase/functions — Listar Edge Functions
// Requiere query params: supabaseUrl, serviceRoleKey
// ──────────────────────────────────────────────
router.get('/supabase/functions', async (req: Request, res: Response): Promise<any> => {
  try {
    const supabaseUrl = req.query.supabaseUrl as string;
    const serviceRoleKey = req.query.serviceRoleKey as string;

    if (!supabaseUrl || !serviceRoleKey) {
      return res.status(400).json({
        error: 'Se requieren los parámetros: supabaseUrl y serviceRoleKey'
      });
    }

    const functions = await listEdgeFunctions(supabaseUrl, serviceRoleKey);

    res.json({ functions });
  } catch (error: any) {
    console.error('Error al listar funciones de Supabase:', error.message);
    res.status(502).json({ error: error.message });
  }
});

// ──────────────────────────────────────────────
// GET /api/jobs/active — Listar tareas vigentes (Cron y Delay pendientes)
// ──────────────────────────────────────────────
router.get('/jobs/active', async (_req: Request, res: Response): Promise<any> => {
  try {
    const activeJobs: any[] = [];

    // 1. Obtener tareas repetitivas (Cron)
    const repeatableJobs = await webhookQueue.getRepeatableJobs();
    repeatableJobs.forEach((rj) => {
      activeJobs.push({
        id: rj.key,
        name: rj.name,
        type: 'cron',
        detail: rj.pattern, // Ej: "*/5 * * * *"
        targetUrl: rj.next ? new Date(rj.next).toLocaleString('es-MX') : '—', // Próxima ejecución
        rawId: rj.id
      });
    });

    // 2. Obtener tareas con delay que todavía no se disparan
    const delayedJobs = await webhookQueue.getJobs(['delayed']);
    delayedJobs.forEach((dj) => {
      // Evitar meter los jobs internos de repetición de BullMQ (tienen parent o repeatJobKey)
      if (dj.opts?.repeat) return;
      
      const timeLeft = dj.timestamp + (dj.opts.delay || 0) - Date.now();
      const secondsLeft = Math.max(0, Math.round(timeLeft / 1000));

      activeJobs.push({
        id: dj.id,
        name: dj.name,
        type: 'delay',
        detail: `${secondsLeft}s restantes`,
        targetUrl: dj.data?.target?.url || '—',
        rawId: dj.id
      });
    });

    res.json(activeJobs);
  } catch (error: any) {
    console.error('Error al obtener tareas activas:', error.message);
    res.status(500).json({ error: 'Error al obtener tareas activas' });
  }
});

// ──────────────────────────────────────────────
// DELETE /api/jobs/:id — Cancelar/Eliminar una tarea vigente
// ──────────────────────────────────────────────
router.delete('/jobs/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    const id = req.params.id;

    // 1. Intentar borrar si es una tarea repetitiva (Cron) usando el key
    if (id.startsWith('repeat:')) {
      const deleted = await webhookQueue.removeRepeatableByKey(id);
      if (deleted) {
        return res.json({ status: 'success', message: 'Cron cancelado correctamente' });
      }
    }

    // 2. Intentar buscar como job regular (Delay)
    const job = await webhookQueue.getJob(id);
    if (job) {
      await job.remove();
      return res.json({ status: 'success', message: 'Tarea cancelada correctamente' });
    }

    res.status(404).json({ error: 'No se encontró la tarea vigente especificada' });
  } catch (error: any) {
    console.error('Error al cancelar tarea:', error.message);
    res.status(500).json({ error: 'Error interno al cancelar la tarea' });
  }
});

// ──────────────────────────────────────────────
// GET /api/jobs/reports — Estadísticas para el módulo de Reportes
// ──────────────────────────────────────────────
router.get('/jobs/reports', async (_req: Request, res: Response): Promise<any> => {
  try {
    const total = await prisma.jobLog.count();
    const successful = await prisma.jobLog.count({ where: { status: 'success' } });
    const failed = await prisma.jobLog.count({ where: { status: 'failed' } });
    
    // Ejecuciones de hoy (desde la medianoche)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayTotal = await prisma.jobLog.count({ where: { createdAt: { gte: today } } });
    const todayFailed = await prisma.jobLog.count({ where: { status: 'failed', createdAt: { gte: today } } });

    res.json({
      historical: { total, successful, failed },
      today: { total: todayTotal, failed: todayFailed }
    });
  } catch (error: any) {
    console.error('Error al obtener reportes:', error.message);
    res.status(500).json({ error: 'Error al obtener reportes' });
  }
});

export default router;
