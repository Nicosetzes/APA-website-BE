const {
    diffRatingDocuments,
    docsEqual,
    isEmptyDiff,
    keyOfPlayer,
} = require("./diff")

// Jugadores presentes en ambos lados cuyo `source` guardado falta o difiere del
// calculado. Solo cuenta si el calculado trae `source` (si no, no hay nada que
// comparar). Reusa `docsEqual`: no duplica la comparación del diff.
const countSourceMismatches = (computedPlayers, storedPlayers) => {
    const storedByKey = new Map(
        storedPlayers.map((doc) => [keyOfPlayer(doc), doc])
    )
    let count = 0
    for (const doc of computedPlayers) {
        if (doc.source === undefined || doc.source === null) continue
        const existing = storedByKey.get(keyOfPlayer(doc))
        if (existing === undefined) continue
        if (!docsEqual(doc.source, existing.source)) count += 1
    }
    return count
}

// Detecta si lo guardado difiere de lo que calcula hoy el código. Usa la misma
// `diffRatingDocuments` que recompute (sin duplicar la comparación) y agrega las
// razones en español y la comparación de fingerprints.
const checkRatingsDrift = ({ computed, stored, fingerprint, tolerance }) => {
    const diff = diffRatingDocuments(
        computed,
        stored,
        tolerance === undefined ? undefined : { tolerance }
    )
    const reasons = []
    const describe = (count, text) => {
        if (count > 0) reasons.push(`${count} ${text}`)
    }
    const storedEvents = stored?.events ?? []
    const storedPlayers = stored?.players ?? []
    const computedTotal =
        (computed?.events?.length ?? 0) + (computed?.players?.length ?? 0)
    if (storedEvents.length + storedPlayers.length === 0 && computedTotal > 0) {
        reasons.push("no hay ratings persistidos")
    } else {
        describe(diff.events.insert.length, "eventos faltantes")
        describe(diff.events.delete.length, "eventos huérfanos")
        describe(diff.events.update.length, "eventos con valores distintos")
        describe(diff.players.insert.length, "jugadores faltantes")
        describe(diff.players.delete.length, "jugadores huérfanos")
        describe(diff.players.update.length, "jugadores desincronizados")
        describe(
            countSourceMismatches(computed?.players ?? [], storedPlayers),
            "jugadores sin source o con source distinto"
        )
    }
    const storedFingerprints = [
        ...new Set(
            [...storedEvents, ...storedPlayers]
                .map((doc) => doc.fingerprint)
                .filter((value) => typeof value === "string")
        ),
    ]
    const fingerprintMismatch = storedFingerprints.some(
        (value) => value !== fingerprint
    )
    if (fingerprintMismatch) {
        reasons.push("fingerprint distinto al del código actual")
    }
    return {
        inSync: isEmptyDiff(diff) && !fingerprintMismatch,
        diff,
        reasons,
        storedFingerprints,
    }
}

module.exports = { checkRatingsDrift }
