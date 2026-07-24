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
  
  let friendlyJobId = job.id as string;
  
  // Si es un trabajo repetitivo, tiene un ID como: "repeat:HASH:TIMESTAMP"
  if (friendlyJobId.startsWith('repeat:')) {
    const parts = friendlyJobId.split(':');
    // Tomamos el hash o key del job repetitivo (suele ser el segundo elemento)
    const repeatKey = parts[1] || 'rep';
    // Generamos un ID base más corto para mostrar fuera del paréntesis (ej. primeros 6 caracteres del hash)
    const baseId = repeatKey.substring(0, 6);
    
    // Contamos cuántas ejecuciones de este Job repetitivo ya tenemos registradas en la DB
    const count = await prisma.jobLog.count({
      where: {
        jobName: job.name,
        targetUrl: job.data.target.url,
        jobId: { startsWith: `${baseId}(` }
      }
    });
    
    friendlyJobId = `${baseId}(${count + 1})`;
  } else {
    // Si no es repetitivo, podemos quedarnos con los primeros 8 caracteres del UUID para que sea más estético
    friendlyJobId = friendlyJobId.substring(0, 8);
  }

  await prisma.jobLog.create({
    data: {
      jobId: friendlyJobId,
      jobName: job.name,
      status: 'success',
      targetUrl: job.data.target.url,
      message: 'Ejecución exitosa'
    }
  });
});

webhookWorker.on('failed', async (job, err) => {
  // Si el trabajo fue removido por el usuario manualmente, BullMQ dispara este evento con "job removed"
  // No queremos guardar esto como un error en Postgres
  if (err.message === 'job removed') {
    console.log(`➡️ [Job ${job?.id}] fue removido manualmente por el usuario. Omitiendo registro de error.`);
    return;
  }

  console.log(`➡️ [Job ${job?.id}] HA FALLADO (Intentos agotados). Guardando en Postgres...`);
  if (job) {
    let friendlyJobId = job.id as string;
    
    if (friendlyJobId.startsWith('repeat:')) {
      const parts = friendlyJobId.split(':');
      const repeatKey = parts[1] || 'rep';
      const baseId = repeatKey.substring(0, 6);
      
      const count = await prisma.jobLog.count({
        where: {
          jobName: job.name,
          targetUrl: job.data.target.url,
          jobId: { startsWith: `${baseId}(` }
        }
      });
      
      friendlyJobId = `${baseId}(${count + 1})`;
    } else {
      friendlyJobId = friendlyJobId.substring(0, 8);
    }

    await prisma.jobLog.create({
      data: {
        jobId: friendlyJobId,
        jobName: job.name,
        status: 'failed',
        targetUrl: job.data.target.url,
        message: err.message
      }
    });
  }
});
