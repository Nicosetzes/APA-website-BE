const { createRatingSyncCoordinator } = require("./coordinator")
const { createRatingSyncHook } = require("./hook")
const { createRatingsSyncRunner } = require("./runRatingsSync")

// Actualización de los ratings persistidos al escribir un resultado (etapa 3).
// Módulos puros con DI: no requieren mongoose, modelos ni DAOs. El cableado real
// (lecturas directas a la base, applyRatingDiff, logger) está en
// service/syncRatingsAfterWrite.
module.exports = {
    createRatingSyncCoordinator,
    createRatingSyncHook,
    createRatingsSyncRunner,
}
