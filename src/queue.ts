import { Queue } from 'bullmq';
import IORedis from 'ioredis';

// Conexión a Redis (usando los puertos por defecto de Docker)
const connection = new IORedis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null // Requisito estricto de BullMQ
});

// Crear la cola de trabajos principal
export const webhookQueue = new Queue('webhooks', {
  connection,
  defaultJobOptions: {
    removeOnComplete: true, // Limpiar trabajos exitosos de Redis para ahorrar memoria
    removeOnFail: false,    // Dejar los fallidos para analizarlos luego en DB
  }
});

console.log('✅ Cola de BullMQ "webhooks" inicializada y conectada a Redis');
