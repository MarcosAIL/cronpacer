import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Reutilizamos la misma conexión
const connection = new IORedis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null
});

console.log('👷 Iniciando Worker (Ejecutor) de BullMQ...');

export const webhookWorker = new Worker('webhooks', async (job: Job) => {
  console.log(`\n[Job ${job.id}] 🚀 Iniciando ejecución de tarea: "${job.name}"`);
  const { target } = job.data;

  try {
    // Usamos el fetch nativo de Node.js para hacer la "visita"
    const response = await fetch(target.url, {
      method: target.method,
      headers: target.headers || { 'Content-Type': 'application/json' },
      body: target.body ? JSON.stringify(target.body) : undefined
    });

    if (!response.ok) {
      // Si el destino responde con error (ej. 404 o 500), lanzamos una excepción.
      // ¡ESTO ES CLAVE! Al lanzar el error, BullMQ dice: "Oh, falló" y automáticamente
      // lo pone en cola para reintentarlo en el futuro (Exponential Backoff).
      throw new Error(`El servidor destino respondió con código HTTP: ${response.status} ${response.statusText}`);
    }

    const responseData = await response.text();
    console.log(`[Job ${job.id}] ✅ ÉXITO. El destino respondió.`);
    
    return { status: 'success', statusCode: response.status };

  } catch (error: any) {
    console.error(`[Job ${job.id}] ❌ FALLO en la ejecución:`, error.message);
    // Propagamos el error para que BullMQ lo reintente si quedan intentos
    throw error;
  }
}, { 
  connection,
  concurrency: 5 // Podemos ejecutar hasta 5 "visitas" al mismo tiempo
});

// Escuchamos eventos globales del Worker para los Logs en la Base de Datos
webhookWorker.on('completed', async (job) => {
  console.log(`➡️ [Job ${job.id}] marcado como COMPLETADO. Guardando en Postgres...`);
  await prisma.jobLog.create({
    data: {
      jobId: job.id as string,
      jobName: job.name,
      status: 'success',
      targetUrl: job.data.target.url,
      message: 'Ejecución exitosa'
    }
  });
});

webhookWorker.on('failed', async (job, err) => {
  console.log(`➡️ [Job ${job?.id}] HA FALLADO (Intentos agotados). Guardando en Postgres...`);
  if (job) {
    await prisma.jobLog.create({
      data: {
        jobId: job.id as string,
        jobName: job.name,
        status: 'failed',
        targetUrl: job.data.target.url,
        message: err.message
      }
    });
  }
});
