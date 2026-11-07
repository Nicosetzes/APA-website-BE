"use strict"

// Fixtures de los tests de `GET /api/ratings/history`. Reutilizan los modelos y
// DAOs falsos de `ratingsPeriod.js` (sin modificarlo): la misma historia y
// ventana se responde por el camino en vivo y por el guardado.
const {
    createGetRatingsHistory,
} = require("../../controller/getRatingsHistory")
const {
    createRetrieveStoredPeriod,
} = require("../../service/ratingsReadModel/createRetrieveStoredPeriod")
const findRatingEventsInRange = require("../../dao/findRatingEventsInRange")
const {
    DEFAULT_USERS,
    createResponse,
    fakeRangeModel,
    makeLogger,
    periodDaos,
} = require("./ratingsPeriod")
const { storedDocsFrom } = require("./ratingsReadModel")

// Los DAOs falsos de `periodDaos` ignoran el cuarto argumento de la consulta A;
// el historial lo usa para pedir los datos del partido (`includeHistory`), así
// que acá se reenvía a la implementación real sobre el modelo falso.
const historyDaos = (docs, options) => {
    const daos = periodDaos(docs, options)
    return {
        ...daos,
        findRatingEventsInRange: (version, start, end, extra) => {
            options?.calls?.push({
                dao: "findRatingEventsInRange",
                args: [version, start, end],
                ...(extra && { extra }),
            })
            return findRatingEventsInRange(version, start, end, {
                model: fakeRangeModel(docs),
                ...extra,
            })
        },
    }
}
const bothHistoryResponses = async ({
    matches,
    users = DEFAULT_USERS,
    dateFrom,
    dateTo,
    players,
    docs = storedDocsFrom(matches),
    overrides = {},
    retrieveOptions = {},
    dependencies = {},
}) => {
    const query = { dateFrom, dateTo, ...(players && { players }) }

    const live = createResponse()
    await createGetRatingsHistory({
        retrieveAllMatches: async () => matches,
        retrieveAllUsers: async () => users,
        ...dependencies,
    })({ query }, live)

    let liveReads = 0
    const calls = []
    const logger = makeLogger()
    const retrieve = createRetrieveStoredPeriod(
        historyDaos(docs, { calls, ...retrieveOptions })
    )
    const fromStored = createResponse()
    await createGetRatingsHistory({
        retrieveAllMatches: async () => {
            liveReads += 1
            return matches
        },
        retrieveAllUsers: async () => users,
        retrieveStoredPeriod: retrieve,
        readModelEnabled: () => true,
        logger,
        ...dependencies,
        ...overrides,
    })({ query }, fromStored)

    return {
        live: live.body,
        stored: fromStored.body,
        liveReads,
        logger,
        calls,
        docs,
    }
}

module.exports = { bothHistoryResponses, historyDaos }
