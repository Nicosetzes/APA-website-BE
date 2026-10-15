"use strict"
// Base en memoria para los tests de extremo a extremo de la actualización de
// ratings al escribir (etapa 3). Todo consistente entre sí:
//
// - `matches`: arreglo mutable de partidos con `updatedAt`.
// - `loadSourceStats` / `loadMatches`: calculados sobre ese arreglo con el mismo
//   filtro que el DAO real (jugado y válido).
// - Modelos falsos `player-ratings` / `rating-events` cuyo `bulkWrite`
//   interpreta `updateOne` + `upsert` + `$set` y `deleteOne`, y registra un log
//   GLOBAL ordenado de llamadas.
// - `findStored`: lee de esos modelos.
// - `applyDiff`: el `dao/applyRatingDiff` REAL contra esos modelos.
const applyRatingDiff = require("../../dao/applyRatingDiff")
const {
    createRetrieveStoredPredictionIndex,
} = require("../../service/ratingsReadModel")
const {
    assessFreshness,
    computeFingerprint,
    computeRatingsState,
} = require("../../service/ratingsStore")
const {
    createRatingSyncCoordinator,
    createRatingSyncHook,
    createRatingsSyncRunner,
} = require("../../service/ratingsSync")
const { leanEvents, leanPlayers } = require("./ratingsReadModel")
const { history, objectId } = require("./ratingsStore")

const NOW = new Date("2026-02-01T00:00:00Z")
const BASE_UPDATED_AT = new Date("2026-01-09T12:00:00Z")

const isRated = (match) => match.played !== false && match.valid !== false

const keyOfFilter = (filter) =>
    Object.entries(filter)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${String(value)}`)
        .join("|")

const createFakeDatabase = ({ matches = history() } = {}) => {
    let tick = 0
    const nextUpdatedAt = () =>
        new Date(Date.UTC(2026, 0, 10, 0, 0, 0) + (tick += 1) * 60_000)
    const db = {
        matches: matches.map((match) => ({
            updatedAt: BASE_UPDATED_AT,
            ...match,
        })),
        // Una entrada por bulkWrite: `{ model, size }`, en orden global.
        log: [],
        reads: { loadSourceStats: 0, loadMatches: 0, findStored: 0 },
        // Ganchos de los tests.
        failOn: null,
        afterBulkWrite: null,
    }

    const makeModel = (name) => {
        const docs = new Map()
        return {
            docs,
            collection: { name },
            bulkWrite: async (operations) => {
                if (db.failOn === name) {
                    const error = new Error(`falló ${name} mongodb://secreto`)
                    error.name = "MongoBulkWriteError"
                    throw error
                }
                db.log.push({ model: name, size: operations.length })
                for (const operation of operations) {
                    if (operation.updateOne) {
                        const { filter, update, upsert } = operation.updateOne
                        assertOk(upsert === true, "se esperaba upsert")
                        docs.set(keyOfFilter(filter), {
                            ...filter,
                            ...structuredClone(update.$set),
                        })
                    } else if (operation.deleteOne) {
                        docs.delete(keyOfFilter(operation.deleteOne.filter))
                    } else {
                        throw new Error("operación de bulkWrite no soportada")
                    }
                }
                if (db.afterBulkWrite) db.afterBulkWrite(name)
            },
        }
    }
    const assertOk = (condition, message) => {
        if (!condition) throw new Error(message)
    }
    db.playersModel = makeModel("player-ratings")
    db.eventsModel = makeModel("rating-events")

    db.currentSourceStats = () => {
        const rated = db.matches.filter(isRated)
        const dates = rated
            .map((match) => match.updatedAt)
            .filter((date) => date instanceof Date)
        return {
            ratedMatches: rated.length,
            maxUpdatedAt: dates.length
                ? new Date(Math.max(...dates.map((date) => date.getTime())))
                : null,
        }
    }
    db.loadSourceStats = async () => {
        db.reads.loadSourceStats += 1
        return db.currentSourceStats()
    }
    db.loadMatches = async () => {
        db.reads.loadMatches += 1
        return db.matches.filter(isRated).map((match) => ({ ...match }))
    }
    db.snapshot = () => ({
        events: [...db.eventsModel.docs.values()].map((doc) => ({ ...doc })),
        players: [...db.playersModel.docs.values()].map((doc) => ({ ...doc })),
    })
    db.findStored = async (ratingVersion) => {
        db.reads.findStored += 1
        const stored = db.snapshot()
        return {
            events: stored.events.filter(
                (doc) => doc.ratingVersion === ratingVersion
            ),
            players: stored.players.filter(
                (doc) => doc.ratingVersion === ratingVersion
            ),
        }
    }
    db.applyDiff = (diff, options = {}) =>
        applyRatingDiff(diff, {
            playersModel: db.playersModel,
            eventsModel: db.eventsModel,
            ...options,
        })
    // Carga documentos ya armados como si los hubiera dejado un sync previo.
    db.seed = (docs) => {
        for (const event of docs.events) {
            db.eventsModel.docs.set(
                keyOfFilter({
                    ratingVersion: event.ratingVersion,
                    matchId: event.matchId,
                }),
                { ...event }
            )
        }
        for (const player of docs.players) {
            db.playersModel.docs.set(
                keyOfFilter({
                    ratingVersion: player.ratingVersion,
                    id: player.id,
                }),
                { ...player }
            )
        }
    }

    // --- "Escrituras de resultado" -----------------------------------------
    db.addResult = (match) => {
        db.matches.push({ updatedAt: nextUpdatedAt(), ...match })
    }
    const find = (n) => {
        const found = db.matches.find(
            (match) => String(match._id) === String(objectId(n))
        )
        if (!found) throw new Error(`no existe el partido ${n}`)
        return found
    }
    db.editResult = (n, patch) => {
        Object.assign(find(n), patch, { updatedAt: nextUpdatedAt() })
    }
    db.removeResult = (n) => {
        Object.assign(
            find(n),
            { played: false },
            { updatedAt: nextUpdatedAt() }
        )
    }

    // --- Lo que ve un lector -------------------------------------------------
    // Estado de frescura de lo guardado contra el origen ACTUAL.
    db.freshness = () => {
        const state = computeRatingsState(db.matches.filter(isRated), {
            now: NOW,
        })
        return assessFreshness({
            players: db.snapshot().players,
            currentFingerprint: state.fingerprint,
            currentSourceStats: db.currentSourceStats(),
            ratingVersion: state.ratingVersion,
        })
    }
    // El lector real de la etapa 2 sobre DAOs de lectura en memoria.
    db.retrieveIndex = (matchIds = []) =>
        createRetrieveStoredPredictionIndex({
            findRatingSourceStats: async () => db.currentSourceStats(),
            findPlayerRatings: async (ratingVersion) =>
                leanPlayers(db.snapshot()).filter(
                    (player) => player.ratingVersion === ratingVersion
                ),
            findRatingEventsByMatchIds: async (ratingVersion, ids) => {
                const wanted = new Set(ids.map(String))
                return leanEvents({
                    events: db
                        .snapshot()
                        .events.filter(
                            (event) =>
                                event.ratingVersion === ratingVersion &&
                                wanted.has(String(event.matchId))
                        ),
                })
            },
            getCurrentFingerprint: () => computeFingerprint(),
        })({ matchIds })
    // Lo que debería quedar guardado según el motor, hoy.
    db.expected = (now = NOW) =>
        computeRatingsState(db.matches.filter(isRated), {
            now,
            sourceStats: db.currentSourceStats(),
        })
    return db
}

// Hook REAL (runner + coordinador + hook) sobre la base falsa.
const createSyncHarness = (db, { settings = {}, clock } = {}) => {
    const config = {
        enabled: true,
        timeoutMs: 5000,
        maxChanges: 300,
        ...settings,
    }
    const logs = []
    const logger = {
        info: (event, fields) => logs.push({ level: "info", event, fields }),
        warn: (event, fields) => logs.push({ level: "warn", event, fields }),
        error: (event, fields) => logs.push({ level: "error", event, fields }),
    }
    const run = createRatingsSyncRunner({
        loadSourceStats: db.loadSourceStats,
        loadMatches: db.loadMatches,
        findStored: db.findStored,
        applyDiff: db.applyDiff,
        getSettings: () => config,
        now: () => NOW,
        ...(clock ? { clock } : {}),
    })
    const coordinator = createRatingSyncCoordinator({ run })
    const hook = createRatingSyncHook({
        coordinator,
        getSettings: () => config,
        logger,
        isDatabaseReady: () => true,
    })
    return { hook, config, logs, run }
}

// Cuenta los bulkWrite del log por modelo desde `from`.
const countWrites = (db, from = 0) => {
    const counts = { "rating-events": 0, "player-ratings": 0 }
    for (const entry of db.log.slice(from)) counts[entry.model] += 1
    return counts
}

// En un tramo del log, ningún player-ratings precede a un rating-events.
const eventsBeforePlayers = (segment) => {
    const firstPlayer = segment.findIndex(
        (entry) => entry.model === "player-ratings"
    )
    if (firstPlayer === -1) return true
    return !segment
        .slice(firstPlayer)
        .some((entry) => entry.model === "rating-events")
}

module.exports = {
    NOW,
    countWrites,
    createFakeDatabase,
    createSyncHarness,
    eventsBeforePlayers,
}
