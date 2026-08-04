const SUSCRIPCION_CACHE_MS = 45_000;
const suscripcionCachePorUsuario = new Map();

function invalidarCacheSuscripcion(usuarioId) {
  if (!usuarioId) return;
  suscripcionCachePorUsuario.delete(usuarioId);
}

function leerCacheSuscripcion(usuarioId) {
  if (!usuarioId) return undefined;
  const cached = suscripcionCachePorUsuario.get(usuarioId);
  if (!cached) return undefined;
  if (cached.expiresAt <= Date.now()) {
    suscripcionCachePorUsuario.delete(usuarioId);
    return undefined;
  }
  return cached.value;
}

function guardarCacheSuscripcion(usuarioId, value) {
  if (!usuarioId) return;
  suscripcionCachePorUsuario.set(usuarioId, {
    value,
    expiresAt: Date.now() + SUSCRIPCION_CACHE_MS,
  });
}

module.exports = {
  SUSCRIPCION_CACHE_MS,
  invalidarCacheSuscripcion,
  leerCacheSuscripcion,
  guardarCacheSuscripcion,
};
