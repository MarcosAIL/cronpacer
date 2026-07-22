# Cronpacer 🚀

Este es un proyecto pensado para programar y despachar webhooks de forma automatica y facil. La idea es que puedas encolar tareas para que se ejecuten despues de unos segundos (delay) o de forma repetitiva usando expresiones CRON.

Usa **Express** para recibir las peticiones, **BullMQ** (con Redis) para la cola de tareas en segundo plano, y **Prisma** (con Postgres) para guardar el historial (logs) de lo que pasa.

## Como funciona?

El poryecto tiene dos partes corriendo al mismo tiempo:
1. **API (Gateway):** Un servidor de Express que recibe los JSON con las tareas que quieres programar.
2. **Worker:** El que se encarga de procesar la cola, hacer las peticiones HTTP (los webhooks) y guardar si salio bien o mal en la base de datos.

---

## Requisitos 🛠️

Para correr esto necesitas tener instalado:
* **Node.js** (v18 o superior recomendado)
* **Docker** y **Docker Compose** (para levantar Redis y Postgres rapido)

---

## Comenzar a usar (Setup) 🚀

1. **Instalar dependencias:**
   ```bash
   npm install
   ```

2. **Levantar base de datos y Redis con Docker:**
   Tenemos un archivo `docker-compose.yml` listo. Solo corre:
   ```bash
   docker compose up -d
   ```

3. **Variables de entorno:**
   Crea un archivo `.env` en la raiz y pon la conexion de Postgres (puedes guiarte de las credenciales de docker-compose):
   ```env
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/cronpacer?schema=public"
   REDIS_HOST="127.0.0.1"
   REDIS_PORT="6379"
   ```

4. **Correr las migraciones de Prisma:**
   Para crear la tabla `JobLog` en tu base de datos:
   ```bash
   npx prisma db push
   ```

5. **Correr en modo desarrollo:**
   ```bash
   npm run dev
   ```

---

## Ejemplos de uso (API Endpoints) 📝

### 1. Encolar un webhook para ejecución inmediata o retrasada (Delay)

Haz un `POST` a `http://localhost:3000/api/jobs` con este payload:

```json
{
  "name": "Enviar reporte por slack",
  "target": {
    "url": "https://httpbin.org/post",
    "method": "POST",
    "headers": {
      "Content-Type": "application/json"
    },
    "body": {
      "message": "Hola! Reporte completado."
    }
  },
  "schedule": {
    "type": "delay",
    "delaySeconds": 10
  },
  "retryPolicy": {
    "maxRetries": 3,
    "backoff": "exponential",
    "initialDelaySeconds": 2
  }
}
```

### 2. Programar una tarea repetitiva (CRON)

Para que se ejecute, por ejemplo, cada minuto:

```json
{
  "name": "Checkear estado del servidor",
  "target": {
    "url": "https://httpbin.org/get",
    "method": "GET"
  },
  "schedule": {
    "type": "cron",
    "expression": "* * * * *"
  }
}
```

---

## Estructura del codigo 📁

* `src/index.ts`: Punto de entrada que inicializa Express y el worker.
* `src/routes.ts`: Definicion de las rutas para recibir y programar trabajos.
* `src/queue.ts`: Configuracion de la cola de BullMQ y conexion a Redis.
* `src/worker.ts`: El worker que ejecuta los webhooks (hace fetch) y guarda los logs con Prisma en Postgres.
* `prisma/schema.prisma`: Esquema de la base de datos (modelo `JobLog`).
