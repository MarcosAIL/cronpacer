/**
 * SupaCron — Supabase Integration Helper
 * 
 * Funciones para interactuar con la API de Management de Supabase
 * y construir targets listos para encolar hacia Edge Functions.
 * 
 * Las credenciales (URL + Service Role Key) NUNCA se almacenan en el servidor.
 * Se pasan en cada request desde el cliente.
 */

/**
 * Extrae el "ref" del proyecto a partir de la URL de Supabase.
 * Ejemplo: "https://xyzproject.supabase.co" → "xyzproject"
 */
export function extractProjectRef(supabaseUrl: string): string {
  try {
    const url = new URL(supabaseUrl);
    const hostname = url.hostname; // "xyzproject.supabase.co"
    const ref = hostname.split('.')[0];
    if (!ref) throw new Error('No se pudo extraer el ref del proyecto');
    return ref;
  } catch {
    throw new Error(`URL de Supabase inválida: "${supabaseUrl}". Debe ser algo como https://tuproyecto.supabase.co`);
  }
}

/**
 * Lista las Edge Functions disponibles en el proyecto de Supabase del usuario.
 * Usa la API de Management: GET https://api.supabase.com/v1/projects/{ref}/functions
 */
export async function listEdgeFunctions(
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<{ slug: string; name: string; status: string; created_at: string }[]> {
  const ref = extractProjectRef(supabaseUrl);

  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/functions`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Error al consultar Edge Functions de Supabase (HTTP ${response.status}): ${errorText}`
    );
  }

  const functions = await response.json();
  return functions;
}

/**
 * Construye un objeto "target" listo para ser encolado en BullMQ,
 * apuntando a una Edge Function de Supabase con las cabeceras de autorización.
 */
export function buildEdgeFunctionTarget(
  supabaseUrl: string,
  serviceRoleKey: string,
  functionSlug: string,
  payload?: Record<string, any>
): { url: string; method: string; headers: Record<string, string>; body?: Record<string, any> } {
  const ref = extractProjectRef(supabaseUrl);

  return {
    url: `https://${ref}.supabase.co/functions/v1/${functionSlug}`,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json'
    },
    ...(payload ? { body: payload } : {})
  };
}
