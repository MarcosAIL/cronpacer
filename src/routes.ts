import { Router, Request, Response } from 'express';
import { webhookQueue } from './queue';

const router = Router();

// Endpoint para crear un nuevo trabajo (Webhook Inmediato o Retrasado)
router.post('/jobs', async (req: Request, res: Response): Promise<any> => {
  try {
    const { name, target, schedule, retryPolicy } = req.body;

    // Validación hiper básica del Input
    if (!target || !target.url || !target.method) {
      return res.status(400).json({ error: 'Faltan parámetros obligatorios en target (url, method)' });
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
    const job = await webhookQueue.add(name || 'Tarea Anónima', {
      target // Pasamos el Payload completo para que el Worker sepa qué hacer
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
  } catch (error) {
    console.error('Error al encolar tarea:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
