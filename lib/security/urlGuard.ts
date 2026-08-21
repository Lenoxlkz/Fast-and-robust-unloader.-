/**
 * Guardas de seguridad para URLs suministradas por el cliente.
 *
 * Las rutas de API hacen fetch() del lado del servidor contra una URL que llega
 * en el body. Sin validación esto es un SSRF: cualquiera puede pedirle al
 * servidor que consulte direcciones internas (localhost, red privada, endpoints
 * de metadata del proveedor cloud) y devolver la respuesta al atacante.
 */

/** Protocolos permitidos para el fetch del lado del servidor. */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/** Hostnames que nunca deben ser consultados desde el servidor. */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
]);

/** Sufijos de dominio reservados para redes internas. */
const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.intranet', '.lan', '.home.arpa'];

function isPrivateIPv4(host: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return false;

  const parts = match.slice(1).map(Number);
  if (parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) return true; // IPv4 malformada

  const [a, b] = parts as [number, number, number, number];

  if (a === 0) return true; // 0.0.0.0/8 "this host"
  if (a === 10) return true; // 10.0.0.0/8 privada
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (metadata AWS/GCP)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 privada
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 privada
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 uso especial IETF
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a >= 224) return true; // multicast y reservado

  return false;
}

function isPrivateIPv6(host: string): boolean {
  // Los literales IPv6 llegan como [::1]; URL.hostname conserva los corchetes.
  const raw = host.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
  if (!raw.includes(':')) return false;

  if (raw === '::' || raw === '::1') return true; // unspecified y loopback
  if (raw.startsWith('fe80')) return true; // link-local
  if (/^f[cd]/.test(raw)) return true; // fc00::/7 unique-local
  if (raw.startsWith('::ffff:')) {
    // IPv4 mapeada a IPv6: validar la parte IPv4.
    const mapped = raw.slice('::ffff:'.length);
    return isPrivateIPv4(mapped);
  }
  return false;
}

export interface SafeUrlResult {
  ok: boolean;
  /** URL normalizada (con protocolo) cuando ok es true. */
  url?: string;
  /** Motivo del rechazo, apto para devolver al cliente. */
  reason?: string;
}

/**
 * Normaliza y valida una URL recibida del cliente antes de hacerle fetch
 * desde el servidor. Devuelve un resultado en vez de lanzar, para que las
 * rutas respondan 400 en lugar de 500.
 */
export function toSafeExternalUrl(input: unknown): SafeUrlResult {
  if (typeof input !== 'string') {
    return { ok: false, reason: 'URL is required' };
  }

  let candidate = input.trim();
  if (!candidate) {
    return { ok: false, reason: 'URL is required' };
  }

  // Límite defensivo: evita payloads gigantes y ReDoS en los parsers de scraping.
  if (candidate.length > 2048) {
    return { ok: false, reason: 'URL is too long' };
  }

  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false, reason: 'Malformed URL' };
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return { ok: false, reason: 'Only http and https URLs are allowed' };
  }

  // Credenciales embebidas (http://user:pass@host) se usan para evadir filtros.
  if (parsed.username || parsed.password) {
    return { ok: false, reason: 'Credentials in the URL are not allowed' };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname) {
    return { ok: false, reason: 'Malformed URL' };
  }

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { ok: false, reason: 'Target host is not allowed' };
  }

  if (BLOCKED_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    return { ok: false, reason: 'Target host is not allowed' };
  }

  if (isPrivateIPv4(hostname) || isPrivateIPv6(parsed.hostname.toLowerCase())) {
    return { ok: false, reason: 'Private and loopback addresses are not allowed' };
  }

  return { ok: true, url: parsed.toString() };
}
