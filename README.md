# SupaCron 🚀

Este es un proyecto pensado para programar y despachar webhooks y **Supabase Edge Functions** de forma automatica y facil. La idea es que puedas encolar tareas para que se ejecuten despues de unos segundos (delay) o de forma repetitiva usando expresiones CRON.

Usa **Express** para recibir las peticiones, **BullMQ** (con Redis) para la cola de tareas en segundo plano, y **Prisma** (con Postgres) para guardar el historial (logs) de lo que pasa.

## Como funciona?

El poryecto tiene dos partes corriendo al mismo tiempo:
1. **API (Gateway):** Un servidor de Express que recibe los JSON con las tareas que quieres programar (ya sea apuntando a cualquier URL o integrándose con Supabase).
2. **Worker:** El que se encarga de procesar la cola, hacer las peticiones HTTP (los webhooks / Edge Functions) y guardar si salio bien o mal en la base de datos.

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
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/supacron?schema=public"
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

Aquí tienes la lista completa de rutas para administrar tus colas y tareas programadas:

### 1. Encolar o Programar una Tarea (`POST /api/jobs`)
Soporta dos formas de ejecución (Modo Manual y Modo Supabase Edge Functions):

#### Modo Manual (Cualquier endpoint HTTP)
Para pegarle a cualquier URL externa con el método y payload que quieras:
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

#### Modo Supabase Edge Functions
Si usas Supabase, SupaCron puede invocar tu Edge Function de forma automática resolviendo la URL y cabeceras de autorización por ti:
```json
{
  "name": "Procesar suscripciones",
  "supabase": {
    "url": "https://tu-proyecto.supabase.co",
    "key": "tu-service-role-key-secreta",
    "functionSlug": "process-subscriptions"
  },
  "payload": {
    "month": "July"
  },
  "schedule": {
    "type": "cron",
    "expression": "0 0 1 * *"
  }
}
```

---

### 2. Obtener Estadísticas de la Cola (`GET /api/jobs/stats`)
Obtiene un conteo rápido de tareas activas/esperando en Redis (BullMQ) e históricas en base de datos (Prisma):
* **Ejemplo de Respuesta:**
```json
{
  "waiting": 3,
  "active": 1,
  "completed": 150,
  "failed": 2
}
```

---

### 3. Listar Tareas Activas (`GET /api/jobs/active`)
Te devuelve un listado de todos los CRONs activos y delays pendientes de ejecución:
* **Ejemplo de Respuesta:**
```json
[
  {
    "id": "repeat:webhooks:Tarea SupaCron:cron:0 0 1 * *",
    "name": "Procesar suscripciones",
    "type": "cron",
    "detail": "0 0 1 * *",
    "targetUrl": "01/08/2026 00:00:00",
    "rawId": "Tarea SupaCron"
  },
  {
    "id": "15",
    "name": "Enviar reporte por slack",
    "type": "delay",
    "detail": "8s restantes",
    "targetUrl": "https://httpbin.org/post",
    "rawId": "15"
  }
]
```

---

### 4. Cancelar / Eliminar una Tarea Activa (`DELETE /api/jobs/:id`)
Puedes cancelar un delay pendiente usando su `id` o apagar un CRON usando su `id` de tipo `repeat:...` (obtenidos de `/api/jobs/active`):
* **Para un Delay regular:** `DELETE http://localhost:3000/api/jobs/15`
* **Para una tarea CRON:** `DELETE http://localhost:3000/api/jobs/repeat:webhooks:Tarea SupaCron:cron:0 0 1 * *`
* **Respuesta exitosa:**
```json
{
  "status": "success",
  "message": "Tarea cancelada correctamente"
}
```

---

### 5. Ver Historial de Ejecuciones (Logs) (`GET /api/jobs/logs`)
Retorna los últimos 50 registros de ejecución guardados en base de datos (con detalles del éxito o del error si falló):
* **Ejemplo de Respuesta:**
```json
[
  {
    "id": "c1a01c38-8fa1-4560-a292-2a7e4b9e6fa9",
    "jobId": "15",
    "jobName": "Enviar reporte por slack",
    "status": "success",
    "targetUrl": "https://httpbin.org/post",
    "message": "Ejecución exitosa",
    "createdAt": "2026-07-24T21:10:00.000Z"
  }
]
```

---

### 6. Listar Funciones de Supabase (`GET /api/supabase/functions`)
Consulta la lista de Edge Functions creadas en tu proyecto de Supabase:
* **Query Params obligatorios:** `supabaseUrl`, `serviceRoleKey`
* **Petición:** `GET http://localhost:3000/api/supabase/functions?supabaseUrl=https://xxx.supabase.co&serviceRoleKey=ey...`
```json
{
  "functions": [
    {
      "id": "893c52a0-4bfa-4c6e-82b2-659a22db345a",
      "slug": "process-subscriptions",
      "name": "process-subscriptions",
      "status": "ACTIVE"
    }
  ]
}
```

## Casos de Uso Reales 💡

Para entender mejor para que sirve SupaCron, aqui tienes tres escenarios reales bien explicados:

### Caso 1: Reintentos de pago con Stripe (Webhook tolerante a fallos)
Imaginate que vendes algo y Stripe te manda un webhook para avisar que el pago se completo. Si tu servidor esta caido por 5 minutos, vas a perder ese webhook y no le vas a entregar el producto al cliente.
Con SupaCron, Stripe le pega a SupaCron, y SupaCron intenta pegarle a tu backend. Si tu backend falla (retorna 500 o 404), SupaCron reintenta la peticion usando la politica de reintentos exponencial (por ejemplo, reintentar despues de 2s, luego 4s, luego 8s).

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

## Casos de Uso por Métodos HTTP (GET, POST, PUT, PATCH, DELETE, OPTIONS) 🛠️

El worker de SupaCron usa el `fetch` nativo de Node.js, lo que significa que puedes configurar **cualquier método HTTP** en el campo `target.method`. Aquí tienes ejemplos de para qué sirve cada método y cómo mandarlo en el payload:

### 1. GET (Monitoreo y Consultas)
Se usa para consultar información de un servidor de forma periódica (como un ping de monitoreo para ver si un sitio web sigue vivo).
* **Caso de uso:** Chequear si la API pública sigue online cada 5 minutos.
* **Payload:**
```json
{
  "name": "Healthcheck API Externa",
  "target": {
    "url": "https://api.tuservicio.com/health",
    "method": "GET"
  },
  "schedule": {
    "type": "cron",
    "expression": "*/5 * * * *"
  }
}
```

### 2. POST (Creación de recursos y disparadores)
Se usa para crear nuevos datos en otra plataforma o disparar una acción (es el más común en Webhooks).
* **Caso de uso:** Mandar un mensaje a un canal de Slack (webhook de Slack) inmediatamente.
* **Payload:**
```json
{
  "name": "Alerta Slack",
  "target": {
    "url": "https://hooks.slack.com/services/T00/B00/X00",
    "method": "POST",
    "headers": {
      "Content-Type": "application/json"
    },
    "body": {
      "text": "Se ha detectado un nuevo registro en la app."
    }
  }
}
```

### 3. PUT (Reemplazo o actualización completa)
Se usa para sobreescribir o actualizar por completo un recurso en un servidor externo.
* **Caso de uso:** Actualizar un archivo de configuración o reporte completo en un servidor CDN todos los días a medianoche.
* **Payload:**
```json
{
  "name": "Sincronizar Configuracion CDN",
  "target": {
    "url": "https://api.cdn.com/v1/configs/global",
    "method": "PUT",
    "headers": {
      "Content-Type": "application/json",
      "Authorization": "Bearer cdn_token_123"
    },
    "body": {
      "maintenance_mode": false,
      "allowed_ips": ["192.168.1.1"],
      "last_updated": "2026-07-22"
    }
  },
  "schedule": {
    "type": "cron",
    "expression": "0 0 * * *"
  }
}
```

### 4. PATCH (Actualización parcial de recursos)
Se usa para modificar solo una pequeña parte de un registro sin tocar todo lo demás.
* **Caso de uso:** Desactivar temporalmente una cuenta de usuario suspendida 30 días después de su creación.
* **Payload:**
```json
{
  "name": "Suspender usuario inactivo",
  "target": {
    "url": "https://mi-crm.com/api/users/usr_882",
    "method": "PATCH",
    "headers": {
      "Content-Type": "application/json"
    },
    "body": {
      "status": "suspended",
      "suspendedReason": "Falta de pago"
    }
  },
  "schedule": {
    "type": "delay",
    "delaySeconds": 2592000
  }
}
```

### 5. DELETE (Eliminación de recursos y limpieza)
Se usa para destruir o remover un recurso de forma programada en un backend.
* **Caso de uso:** Borrar un token temporal de descarga que expira en 1 hora.
* **Payload:**
```json
{
  "name": "Expira Token de Descarga - token_abc123",
  "target": {
    "url": "https://mi-api.com/tokens/token_abc123",
    "method": "DELETE",
    "headers": {
      "Authorization": "Bearer admin_secret"
    }
  },
  "schedule": {
    "type": "delay",
    "delaySeconds": 3600
  }
}
```

### 6. OPTIONS (Verificación de CORS o Capacidades)
Se usa para hacer peticiones de "pre-vuelo" (preflight) para ver qué métodos y cabeceras soporta el servidor de destino antes de hacer operaciones pesadas.
* **Caso de uso:** Validar los métodos aceptados por un endpoint antes de sincronizar datos grandes.
* **Payload:**
```json
{
  "name": "Preflight Check en Endpoint",
  "target": {
    "url": "https://api-socia.com/v2/bulk-import",
    "method": "OPTIONS",
    "headers": {
      "Origin": "https://supacron.com",
      "Access-Control-Request-Method": "POST"
    }
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
