const crypto = require("node:crypto")
const { RATING_CONFIG } = require("../../config/ratings")
const defaultTeamRatings = require("../../data/teamRatings.json")
const { canonicalStringify } = require("./canonicalJson")
const {
    RATINGS_ENGINE_VERSION,
    RATINGS_STORE_SCHEMA_VERSION,
} = require("./constants")

// Huella de todo lo que, además de los partidos, determina lo que calcula el
// motor: los parámetros de rating (incluida `version`), los overalls y
// ediciones de equipos, la versión del motor y la del esquema guardado.
//
// NO depende de `computedAt` ni de los partidos. Tampoco del modelo de empate
// (config/drawModel.js): es de predicción y no alimenta al motor, por eso no se
// lo requiere acá.
//
// Si cambia, todo lo persistido quedó desactualizado: hay que re-correr
// `npm run recompute:ratings -- --apply`.
const computeFingerprint = ({
    config = RATING_CONFIG,
    teamRatings = defaultTeamRatings,
    engineVersion = RATINGS_ENGINE_VERSION,
    schemaVersion = RATINGS_STORE_SCHEMA_VERSION,
} = {}) =>
    crypto
        .createHash("sha256")
        .update(
            canonicalStringify({
                schemaVersion,
                engineVersion,
                config,
                teamRatings,
            })
        )
        .digest("hex")

module.exports = { computeFingerprint }
