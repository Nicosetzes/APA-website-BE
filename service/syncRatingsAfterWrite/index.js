const mongoose = require("mongoose")
const { getRatingSyncSettings } = require("../../config/ratingSync")
const applyRatingDiff = require("../../dao/applyRatingDiff")
const findRatingMatches = require("../../dao/findRatingMatches")
const findRatingSourceStats = require("../../dao/findRatingSourceStats")
const findStoredRatingDocuments = require("../../dao/findStoredRatingDocuments")
const logger = require("../../utils/logger")
const {
    createRatingSyncCoordinator,
    createRatingSyncHook,
    createRatingsSyncRunner,
} = require("../ratingsSync")

// Cableado REAL de la actualización de ratings al escribir un resultado
// (etapa 3). Es el único módulo que conecta el pipeline puro (service/ratingsSync)
// con los DAOs y mongoose.
//
// NO se exporta desde service/index.js ni dao/index.js a propósito: la lectura
// de la app no debe cargar el camino de escritura de los ratings (lo exige
// test/ratingsStoreScripts.test.js). Los controllers de resultados lo importan
// por ruta directa.
//
// Las lecturas van DIRECTO a la base (dao/findRatingMatches), nunca por
// service/retrieveRatingMatches: ese caché en memoria puede tener datos previos
// a la escritura hasta que termina la respuesta (middleware
// invalidateRatingCache).
const defaultDependencies = Object.freeze({
    loadSourceStats: findRatingSourceStats,
    loadMatches: findRatingMatches,
    findStored: findStoredRatingDocuments,
    // Sin `session` (no hay transacción entre colecciones) y sin crear índices
    // en runtime: eso lo hace `npm run recompute:ratings -- --apply`.
    applyDiff: applyRatingDiff,
    isDatabaseReady: () => mongoose.connection.readyState === 1,
    getSettings: getRatingSyncSettings,
    logger,
})

const coordinator = createRatingSyncCoordinator({
    run: createRatingsSyncRunner({
        loadSourceStats: defaultDependencies.loadSourceStats,
        loadMatches: defaultDependencies.loadMatches,
        findStored: defaultDependencies.findStored,
        applyDiff: defaultDependencies.applyDiff,
        getSettings: defaultDependencies.getSettings,
    }),
})

// Singleton del proceso: el mutex con coalescing vale por instancia.
const syncRatingsAfterWrite = createRatingSyncHook({
    coordinator,
    getSettings: defaultDependencies.getSettings,
    logger: defaultDependencies.logger,
    isDatabaseReady: defaultDependencies.isDatabaseReady,
})

// Llamada de los controllers: nunca lanza, aunque el hook inyectado lo haga
// (red de seguridad: la escritura del usuario ya se confirmó).
const triggerRatingSync = async (syncRatings, trigger) => {
    try {
        await syncRatings({ trigger })
    } catch {
        // Ignorado a propósito: ver la política de fallos en ratingsSync/hook.
    }
}

module.exports = {
    defaultDependencies,
    syncRatingsAfterWrite,
    triggerRatingSync,
}
