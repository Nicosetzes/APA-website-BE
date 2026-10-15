// Caché en memoria de un único valor, con tres reglas:
//
// - Vence a los `ttlMs` (milisegundos). Con `ttlMs <= 0` no cachea nada y cada
//   `get` lee de nuevo.
// - Pedidos simultáneos comparten una sola lectura en curso en lugar de hacer una
//   cada uno.
// - `invalidate()` descarta el valor y la lectura en curso. Si una escritura
//   ocurre mientras se estaba leyendo, el resultado de esa lectura (que pudo
//   empezar antes de la escritura) se devuelve a quienes ya lo esperaban pero no
//   se guarda.
//
// Una lectura que falla no se guarda y no deja nada "en curso": el siguiente
// `get` vuelve a intentar. `now` se inyecta en los tests.
const createSingleFlightCache = ({ read, ttlMs, now = Date.now }) => {
    let entry = null
    let inFlight = null
    let generation = 0

    const get = async () => {
        if (!(ttlMs > 0)) return read()
        if (entry && now() < entry.expiresAt) return entry.value
        if (inFlight) return inFlight

        const startedAt = generation
        const pending = Promise.resolve()
            .then(read)
            .then((value) => {
                if (generation === startedAt) {
                    entry = { value, expiresAt: now() + ttlMs }
                }
                return value
            })
            .finally(() => {
                if (inFlight === pending) inFlight = null
            })

        inFlight = pending
        return pending
    }

    const invalidate = () => {
        generation += 1
        entry = null
        inFlight = null
    }

    return { get, invalidate }
}

module.exports = { createSingleFlightCache }
