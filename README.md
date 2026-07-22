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

## Casos de Uso Reales 💡

Para entender mejor para que sirve Cronpacer, aqui tienes tres escenarios reales bien explicados:

### Caso 1: Reintentos de pago con Stripe (Webhook tolerante a fallos)
Imaginate que vendes algo y Stripe te manda un webhook para avisar que el pago se completo. Si tu servidor esta caido por 5 minutos, vas a perder ese webhook y no le vas a entregar el producto al cliente.
Con Cronpacer, Stripe le pega a Cronpacer, y Cronpacer intenta pegarle a tu backend. Si tu backend falla (retorna 500 o 404), Cronpacer reintenta la peticion usando la politica de reintentos exponencial (por ejemplo, reintentar despues de 2s, luego 4s, luego 8s).

**Payload a enviar:**
```json
{
  "name": "Procesar Webhook Stripe - Pago #10243",
  "target": {
    "url": "https://mi-backend.com/webhooks/stripe",
    "method": "POST",
    "headers": {
      "Content-Type": "application/json",
      "Stripe-Signature": "t=161488,v1=abcde..."
    },
    "body": {
      "event": "charge.succeeded",
      "amount": 2990,
      "customer": "cus_123"
    }
  },
  "retryPolicy": {
    "maxRetries": 5,
    "backoff": "exponential",
    "initialDelaySeconds": 5
  }
}
```

### Caso 2: Recordatorio de carrito abandonado (Delay de 24 horas)
Cuando un usuario agrega cosas al carrito en tu tienda virtual pero no compra, quieres mandarle un correo de "te extrañamos" exactamente 24 horas despues.
Puedes programar un delay de 86400 segundos. Si en ese transcurso el usuario compra, puedes manejar la logica en tu endpoint destino (o cancelar el job si quisieras implementarlo despues).

**Payload a enviar:**
```json
{
  "name": "Recordatorio Carrito Abandonado - Usuario #992",
  "target": {
    "url": "https://mi-backend.com/api/emails/abandoned-cart",
    "method": "POST",
    "headers": {
      "Content-Type": "application/json"
    },
    "body": {
      "userId": 992,
      "cartItems": [12, 45],
      "discountCode": "TEEXTRAÑAMOS10"
    }
  },
  "schedule": {
    "type": "delay",
    "delaySeconds": 86400
  }
}
```

### Caso 3: Backup diario de la Base de Datos (Cron recurrente)
Quieres que todos los dias a las 3:00 AM (cuando hay menos trafico) se ejecute un script de backup y se suba a AWS S3. Cronpacer puede disparar el webhook de ejecucion de forma automatica cada dia.

**Payload a enviar:**
```json
{
  "name": "Trigger Backup Diario Postgres",
  "target": {
    "url": "https://mi-backend.com/api/maintenance/backup",
    "method": "POST",
    "headers": {
      "X-Admin-Token": "secreto-super-seguro"
    }
  },
  "schedule": {
    "type": "cron",
    "expression": "0 3 * * *"
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
