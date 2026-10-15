// Mutex con coalescing, en proceso, para las sincronizaciones de ratings.
//
// - Nunca corren dos `run` a la vez.
// - Si llegan pedidos mientras hay una corrida activa, todos comparten UNA sola
//   corrida posterior (no una por pedido). La corrida en curso pudo haber leído
//   antes de la escritura que motivó el pedido, por eso no se les devuelve su
//   resultado: hace falta una lectura nueva.
// - Nunca rechaza: un error de `run` se convierte en un resultado `error`.
//
// Solo cubre una instancia (proceso). Entre instancias serverless no hay
// exclusión: lo detecta el chequeo de frescura y `npm run verify:ratings`.
const zeroSection = () => ({ insert: 0, update: 0, delete: 0 })

// Solo el nombre del error: el mensaje de un error del driver puede traer la URI.
const errorOutcome = (error) => ({
    result: "error",
    reason: (error && error.name) || "Error",
    changes: { events: zeroSection(), players: zeroSection() },
    ratedMatches: null,
    passes: 0,
})

// Tope propio de una corrida. Si `run` nunca terminara (una consulta colgada),
// sin esto `active` no se limpiaría y todos los pedidos siguientes de la
// instancia quedarían encolados detrás. La corrida abandonada puede seguir
// escribiendo; es seguro porque solo aplica diffs idempotentes y la frescura lo
// detecta si algo queda a medias.
const DEFAULT_MAX_RUN_MS = 30000

const deadlineOutcome = () => ({
    result: "timeout",
    reason: "run_deadline",
    changes: { events: zeroSection(), players: zeroSection() },
    ratedMatches: null,
    passes: 0,
})

const createRatingSyncCoordinator = ({
    run,
    maxRunMs = DEFAULT_MAX_RUN_MS,
}) => {
    let active = null
    let queued = null

    const withDeadline = (promise) => {
        if (!(maxRunMs > 0)) return promise
        let timer
        const deadline = new Promise((resolve) => {
            timer = setTimeout(() => resolve(deadlineOutcome()), maxRunMs)
            if (typeof timer.unref === "function") timer.unref()
        })
        return Promise.race([promise, deadline]).finally(() =>
            clearTimeout(timer)
        )
    }

    const launch = () => {
        const promise = withDeadline(
            (async () => {
                try {
                    return await run()
                } catch (error) {
                    return errorOutcome(error)
                }
            })()
        )
        active = promise
        promise.then(() => {
            if (active === promise) active = null
        })
        return promise
    }

    const request = () => {
        if (active === null) return launch()
        if (queued === null) {
            queued = active.then(() => {
                queued = null
                return launch()
            })
        }
        return queued
    }

    return { request }
}

module.exports = { createRatingSyncCoordinator, errorOutcome }
