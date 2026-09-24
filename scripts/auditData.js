require("dotenv").config()

const mongoose = require("mongoose")

mongoose.set("autoIndex", false)
mongoose.set("autoCreate", false)

const { connectMongo, disconnectMongo } = require("../database")
const usersModel = require("../dao/models/users")
const tournamentsModel = require("../dao/models/tournaments")
const matchesModel = require("../dao/models/matches")
const editsModel = require("../dao/models/edits")
const { getFinalPlayoffId } = require("../config/playoffFormats")

const FORMATS = new Set([
    "champions_league",
    "league",
    "league_playin_playoff",
    "playoff",
    "super_cup",
    "world_cup",
    "world_cup_2026",
])
const MATCH_TYPES = new Set(["regular", "playin", "playoff"])
const ROLES = new Set(["user", "superadmin"])
const ERA_CUTOFF = new Date("2021-01-01T00:00:00.000Z")
const ERA_CATEGORIES = ["pre2021", "from2021", "unknown"]
const DUPLICATE_ERA_CATEGORIES = [...ERA_CATEGORIES, "mixed"]
const FINAL_SLOT_CATEGORIES = [
    "onFinalSlot",
    "onEarlierRound",
    "unknownTournament",
]
const SCHEMA_CATEGORIES = ["v1", "unversioned", "unsupported"]
const DATE_SOURCE_CATEGORIES = ["createdAt", "objectId", "unknown"]
const ENVIRONMENT_CATEGORIES = new Set([
    "production",
    "preview",
    "development",
    "test",
    "local",
])

const isObject = (value) =>
    value !== null && typeof value === "object" && !Array.isArray(value)
const hasId = (value) => isObject(value) && value.id !== undefined
const isDate = (value) =>
    value instanceof Date && !Number.isNaN(value.valueOf())
const isValidScore = (value) =>
    Number.isInteger(value) && value >= 0 && value <= 24
const countDuplicateKeys = (values) => {
    const counts = new Map()
    values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1))
    return [...counts.values()].filter((count) => count > 1).length
}
const createCounts = (categories) =>
    Object.fromEntries(categories.map((category) => [category, 0]))
const createCountsByEra = (categories) =>
    Object.fromEntries(
        ERA_CATEGORIES.map((era) => [era, createCounts(categories)])
    )
const increment = (counts, category) => {
    counts[category] += 1
}
const schemaCohort = (document) => {
    if (document.schemaVersion === 1) return "v1"
    if (document.schemaVersion === undefined) return "unversioned"
    return "unsupported"
}
const objectIdTimestamp = (document) => {
    if (!(document._id instanceof mongoose.Types.ObjectId)) return undefined

    const timestamp = document._id.getTimestamp()
    return isDate(timestamp) ? timestamp : undefined
}
const dateEvidence = (document) => {
    if (isDate(document.createdAt)) {
        return { date: document.createdAt, source: "createdAt" }
    }

    const timestamp = objectIdTimestamp(document)
    if (timestamp) return { date: timestamp, source: "objectId" }

    return { date: undefined, source: "unknown" }
}
const eraCohort = (document) => {
    const { date } = dateEvidence(document)
    if (!date) return "unknown"
    return date < ERA_CUTOFF ? "pre2021" : "from2021"
}
const buildCohorts = (documents) => {
    const schema = createCounts(SCHEMA_CATEGORIES)
    const era = createCounts(ERA_CATEGORIES)
    const dateSource = createCounts(DATE_SOURCE_CATEGORIES)

    documents.forEach((document) => {
        increment(schema, schemaCohort(document))
        increment(era, eraCohort(document))
        increment(dateSource, dateEvidence(document).source)
    })

    return { schema, era, dateSource }
}
const buildMissingTimestampDetails = (documents) => {
    const details = {
        bothValid: 0,
        onlyCreatedValid: 0,
        onlyUpdatedValid: 0,
        neitherValid: 0,
        objectIdTimestampAvailable: 0,
    }

    documents.forEach((document) => {
        const createdValid = isDate(document.createdAt)
        const updatedValid = isDate(document.updatedAt)

        if (createdValid && updatedValid) details.bothValid += 1
        else if (createdValid) details.onlyCreatedValid += 1
        else if (updatedValid) details.onlyUpdatedValid += 1
        else details.neitherValid += 1

        if ((!createdValid || !updatedValid) && objectIdTimestamp(document)) {
            details.objectIdTimestampAvailable += 1
        }
    })

    return details
}
const assertExclusiveTotal = (label, total, details, categories) => {
    const sum = categories.reduce(
        (count, category) => count + details[category],
        0
    )
    if (sum !== total) throw new Error(`${label} reconciliation failed`)
}

const auditUsers = (users) => {
    const normalizedEmails = users
        .filter((user) => typeof user.email === "string")
        .map((user) => user.email.trim().toLowerCase())

    return {
        total: users.length,
        missingCore: users.filter(
            (user) => !user.email || !user.password || !user.nickname
        ).length,
        invalidRole: users.filter((user) => !ROLES.has(user.role)).length,
        nonCanonicalEmail: users.filter(
            (user) =>
                typeof user.email !== "string" ||
                user.email !== user.email.trim().toLowerCase()
        ).length,
        duplicateNormalizedEmailKeys: countDuplicateKeys(normalizedEmails),
        nonBcryptPassword: users.filter(
            (user) =>
                typeof user.password !== "string" ||
                !/^\$2[aby]\$\d{2}\$.{53}$/.test(user.password)
        ).length,
    }
}

const auditTournaments = (tournaments) => {
    const emptyCategories = ["playersOnly", "teamsOnly", "both"]
    const outcomeCategories = [
        "missingOrInvalidOutcome",
        "missingChampionOnly",
        "missingFinalistOnly",
        "missingBoth",
    ]
    const formatCategories = ["clubWorldCup", "missing", "nonString", "other"]
    const emptyPlayersOrTeamsDetails = {
        ...createCounts(emptyCategories),
        byEra: createCountsByEra(emptyCategories),
    }
    const finalizedWithoutOutcomeDetails = {
        ...createCounts(outcomeCategories),
        byEra: createCountsByEra(outcomeCategories),
    }
    const unsupportedFormatDetails = {
        ...createCounts(formatCategories),
        byEra: createCountsByEra(formatCategories),
    }
    const legacyFlagCounts = {
        true: 0,
        false: 0,
        missingOrInvalid: 0,
    }

    tournaments.forEach((tournament) => {
        const era = eraCohort(tournament)
        const playersEmpty = !tournament.players?.length
        const teamsEmpty = !tournament.teams?.length

        if (playersEmpty || teamsEmpty) {
            const category =
                playersEmpty && teamsEmpty
                    ? "both"
                    : playersEmpty
                    ? "playersOnly"
                    : "teamsOnly"
            increment(emptyPlayersOrTeamsDetails, category)
            increment(emptyPlayersOrTeamsDetails.byEra[era], category)
        }

        if (tournament.ongoing === false) {
            let category
            if (!isObject(tournament.outcome)) {
                category = "missingOrInvalidOutcome"
            } else {
                const missingChampion = !tournament.outcome.champion
                const missingFinalist = !tournament.outcome.finalist
                if (missingChampion && missingFinalist) category = "missingBoth"
                else if (missingChampion) category = "missingChampionOnly"
                else if (missingFinalist) category = "missingFinalistOnly"
            }

            if (category) {
                increment(finalizedWithoutOutcomeDetails, category)
                increment(finalizedWithoutOutcomeDetails.byEra[era], category)
            }
        }

        if (!FORMATS.has(tournament.format)) {
            let category = "other"
            if (tournament.format === "club_world_cup") {
                category = "clubWorldCup"
            } else if (tournament.format === undefined) {
                category = "missing"
            } else if (typeof tournament.format !== "string") {
                category = "nonString"
            }
            increment(unsupportedFormatDetails, category)
            increment(unsupportedFormatDetails.byEra[era], category)
        }

        if (tournament.legacy === true) legacyFlagCounts.true += 1
        else if (tournament.legacy === false) legacyFlagCounts.false += 1
        else legacyFlagCounts.missingOrInvalid += 1
    })

    const result = {
        total: tournaments.length,
        versionedV1: tournaments.filter(
            (tournament) => tournament.schemaVersion === 1
        ).length,
        unversionedLegacy: tournaments.filter(
            (tournament) => tournament.schemaVersion === undefined
        ).length,
        unsupportedSchemaVersion: tournaments.filter(
            (tournament) =>
                tournament.schemaVersion !== undefined &&
                tournament.schemaVersion !== 1
        ).length,
        missingCore: tournaments.filter(
            (tournament) =>
                typeof tournament.name !== "string" ||
                !tournament.name.trim() ||
                !Array.isArray(tournament.players) ||
                !Array.isArray(tournament.teams)
        ).length,
        emptyPlayersOrTeams: tournaments.filter(
            (tournament) =>
                !tournament.players?.length || !tournament.teams?.length
        ).length,
        invalidFormat: tournaments.filter(
            (tournament) => !FORMATS.has(tournament.format)
        ).length,
        invalidStateTypes: tournaments.filter(
            (tournament) =>
                (tournament.ongoing !== undefined &&
                    typeof tournament.ongoing !== "boolean") ||
                (tournament.valid !== undefined &&
                    typeof tournament.valid !== "boolean") ||
                (tournament.legacy !== undefined &&
                    typeof tournament.legacy !== "boolean")
        ).length,
        finalizedWithoutOutcome: tournaments.filter(
            (tournament) =>
                tournament.ongoing === false &&
                (!isObject(tournament.outcome) ||
                    !tournament.outcome.champion ||
                    !tournament.outcome.finalist)
        ).length,
        malformedParticipants: tournaments.filter(
            (tournament) =>
                !Array.isArray(tournament.players) ||
                tournament.players.some(
                    (player) =>
                        !hasId(player) || typeof player.name !== "string"
                ) ||
                !Array.isArray(tournament.teams) ||
                tournament.teams.some(
                    (entry) => !hasId(entry?.team) || !hasId(entry?.player)
                )
        ).length,
        malformedDailyRecap: tournaments.filter(
            (tournament) =>
                tournament.daily_recap !== undefined &&
                !isObject(tournament.daily_recap)
        ).length,
        missingTimestamps: tournaments.filter(
            (tournament) =>
                !isDate(tournament.createdAt) || !isDate(tournament.updatedAt)
        ).length,
        cohorts: buildCohorts(tournaments),
        legacyFlagCounts,
        emptyPlayersOrTeamsDetails,
        finalizedWithoutOutcomeDetails,
        unsupportedFormatDetails,
        missingTimestampDetails: buildMissingTimestampDetails(tournaments),
    }

    assertExclusiveTotal(
        "empty players or teams",
        result.emptyPlayersOrTeams,
        emptyPlayersOrTeamsDetails,
        emptyCategories
    )
    assertExclusiveTotal(
        "finalized outcome",
        result.finalizedWithoutOutcome,
        finalizedWithoutOutcomeDetails,
        outcomeCategories
    )
    assertExclusiveTotal(
        "unsupported format",
        result.invalidFormat,
        unsupportedFormatDetails,
        formatCategories
    )

    return result
}

const groupDuplicatePlayoffSlots = (matches) => {
    const groups = new Map()

    matches.forEach((match) => {
        if (
            match.type !== "playoff" ||
            !Number.isInteger(match.playoff_id) ||
            match.tournament?.id === undefined
        ) {
            return
        }

        const key = `${String(match.tournament.id)}:${match.playoff_id}`
        const group = groups.get(key) || []
        group.push(match)
        groups.set(key, group)
    })

    return [...groups.values()].filter((group) => group.length > 1)
}
const groupEraCohort = (documents) => {
    const eras = new Set(documents.map(eraCohort))
    return eras.size === 1 ? [...eras][0] : "mixed"
}

const finalSlotCohort = (group, formatByTournamentId) => {
    const tournamentId = String(group[0].tournament.id)

    if (!formatByTournamentId.has(tournamentId)) return "unknownTournament"

    const format = formatByTournamentId.get(tournamentId)

    return group[0].playoff_id === getFinalPlayoffId(format)
        ? "onFinalSlot"
        : "onEarlierRound"
}

const buildDuplicatePlayoffSlotDetails = (
    duplicateGroups,
    formatByTournamentId
) => {
    const details = {
        duplicateGroups: duplicateGroups.length,
        documentsInGroups: 0,
        excessDocuments: 0,
        multiplicity: createCounts(["exactly2", "exactly3", "fourOrMore"]),
        schemaCohort: createCounts(["v1", "unversioned", "mixedOrUnsupported"]),
        byEra: createCounts(DUPLICATE_ERA_CATEGORIES),
        byFinalSlot: createCounts(FINAL_SLOT_CATEGORIES),
    }

    duplicateGroups.forEach((group) => {
        details.documentsInGroups += group.length
        details.excessDocuments += group.length - 1
        increment(
            details.byFinalSlot,
            finalSlotCohort(group, formatByTournamentId)
        )

        if (group.length === 2) details.multiplicity.exactly2 += 1
        else if (group.length === 3) details.multiplicity.exactly3 += 1
        else details.multiplicity.fourOrMore += 1

        const schemas = new Set(group.map(schemaCohort))
        const schema =
            schemas.size === 1 && schemas.has("v1")
                ? "v1"
                : schemas.size === 1 && schemas.has("unversioned")
                ? "unversioned"
                : "mixedOrUnsupported"
        increment(details.schemaCohort, schema)
        increment(details.byEra, groupEraCohort(group))
    })

    return details
}

const auditMatches = (matches, tournamentIds, formatByTournamentId) => {
    const routingCategories = [
        "invalidType",
        "missingTournamentId",
        "nonBooleanPlayed",
        "multipleReasons",
        "documentsWithBaselineIssues",
        "nullTournamentIdOutsideBaseline",
    ]
    const missingRoutingFieldsDetails = {
        ...createCounts(routingCategories),
        byEra: createCountsByEra(routingCategories),
    }
    const orphanTournamentReferenceDetails = {
        distinctTournamentReferences: 0,
        byEra: createCounts(ERA_CATEGORIES),
        byType: createCounts([
            "regular",
            "playin",
            "playoff",
            "missing",
            "other",
        ]),
        byPlayedState: createCounts(["true", "false", "other"]),
    }
    const orphanReferences = new Set()

    matches.forEach((match) => {
        const era = eraCohort(match)
        const routingReasons = []
        if (!MATCH_TYPES.has(match.type)) routingReasons.push("invalidType")
        if (match.tournament?.id === undefined) {
            routingReasons.push("missingTournamentId")
        }
        if (typeof match.played !== "boolean") {
            routingReasons.push("nonBooleanPlayed")
        }
        routingReasons.forEach((reason) => {
            increment(missingRoutingFieldsDetails, reason)
            increment(missingRoutingFieldsDetails.byEra[era], reason)
        })
        if (routingReasons.length > 1) {
            missingRoutingFieldsDetails.multipleReasons += 1
            missingRoutingFieldsDetails.byEra[era].multipleReasons += 1
        }
        if (routingReasons.length > 0) {
            missingRoutingFieldsDetails.documentsWithBaselineIssues += 1
            missingRoutingFieldsDetails.byEra[
                era
            ].documentsWithBaselineIssues += 1
        }
        if (match.tournament?.id === null) {
            missingRoutingFieldsDetails.nullTournamentIdOutsideBaseline += 1
            missingRoutingFieldsDetails.byEra[
                era
            ].nullTournamentIdOutsideBaseline += 1
        }

        if (
            match.tournament?.id !== undefined &&
            !tournamentIds.has(String(match.tournament.id))
        ) {
            orphanReferences.add(String(match.tournament.id))
            increment(orphanTournamentReferenceDetails.byEra, era)

            const type =
                match.type === undefined
                    ? "missing"
                    : MATCH_TYPES.has(match.type)
                    ? match.type
                    : "other"
            increment(orphanTournamentReferenceDetails.byType, type)

            const playedState =
                match.played === true
                    ? "true"
                    : match.played === false
                    ? "false"
                    : "other"
            increment(
                orphanTournamentReferenceDetails.byPlayedState,
                playedState
            )
        }
    })

    orphanTournamentReferenceDetails.distinctTournamentReferences =
        orphanReferences.size

    const duplicateGroups = groupDuplicatePlayoffSlots(matches)
    const duplicatePlayoffSlotDetails = buildDuplicatePlayoffSlotDetails(
        duplicateGroups,
        formatByTournamentId
    )

    const result = {
        total: matches.length,
        versionedV1: matches.filter((match) => match.schemaVersion === 1)
            .length,
        unversionedLegacy: matches.filter(
            (match) => match.schemaVersion === undefined
        ).length,
        unsupportedSchemaVersion: matches.filter(
            (match) =>
                match.schemaVersion !== undefined && match.schemaVersion !== 1
        ).length,
        missingRoutingFields: matches.filter(
            (match) =>
                !MATCH_TYPES.has(match.type) ||
                match.tournament?.id === undefined ||
                typeof match.played !== "boolean"
        ).length,
        invalidStateTypes: matches.filter(
            (match) =>
                match.valid !== undefined && typeof match.valid !== "boolean"
        ).length,
        playedWithInvalidPayload: matches.filter(
            (match) =>
                match.played === true &&
                (!hasId(match.playerP1) ||
                    !hasId(match.playerP2) ||
                    !hasId(match.teamP1) ||
                    !hasId(match.teamP2) ||
                    !isValidScore(match.scoreP1) ||
                    !isValidScore(match.scoreP2) ||
                    !isObject(match.outcome))
        ).length,
        scoreOutsideContract: matches.filter(
            (match) =>
                (match.scoreP1 !== undefined && !isValidScore(match.scoreP1)) ||
                (match.scoreP2 !== undefined && !isValidScore(match.scoreP2))
        ).length,
        nonDrawMissingOutcomeReferences: matches.filter(
            (match) =>
                match.played === true &&
                match.outcome?.draw === false &&
                (!hasId(match.outcome.playerThatWon) ||
                    !hasId(match.outcome.playerThatLost) ||
                    !hasId(match.outcome.teamThatWon) ||
                    !hasId(match.outcome.teamThatLost))
        ).length,
        knockoutWithoutPlayoffId: matches.filter(
            (match) =>
                ["playin", "playoff"].includes(match.type) &&
                !Number.isInteger(match.playoff_id)
        ).length,
        orphanTournamentReference: matches.filter(
            (match) =>
                match.tournament?.id !== undefined &&
                !tournamentIds.has(String(match.tournament.id))
        ).length,
        duplicatePlayoffSlots: duplicateGroups.length,
        legacyPlayerP3P4Present: matches.filter(
            (match) =>
                match.playerP3 !== undefined || match.playerP4 !== undefined
        ).length,
        missingTimestamps: matches.filter(
            (match) => !isDate(match.createdAt) || !isDate(match.updatedAt)
        ).length,
        cohorts: buildCohorts(matches),
        missingRoutingFieldsDetails,
        orphanTournamentReferenceDetails,
        duplicatePlayoffSlotDetails,
        missingTimestampDetails: buildMissingTimestampDetails(matches),
    }

    if (
        missingRoutingFieldsDetails.documentsWithBaselineIssues !==
        result.missingRoutingFields
    ) {
        throw new Error("missing routing fields reconciliation failed")
    }

    const sumCounts = (counts) =>
        Object.values(counts).reduce((total, count) => total + count, 0)

    if (
        duplicatePlayoffSlotDetails.duplicateGroups !==
            result.duplicatePlayoffSlots ||
        duplicatePlayoffSlotDetails.documentsInGroups -
            duplicatePlayoffSlotDetails.duplicateGroups !==
            duplicatePlayoffSlotDetails.excessDocuments ||
        sumCounts(duplicatePlayoffSlotDetails.multiplicity) !==
            duplicatePlayoffSlotDetails.duplicateGroups ||
        sumCounts(duplicatePlayoffSlotDetails.schemaCohort) !==
            duplicatePlayoffSlotDetails.duplicateGroups ||
        sumCounts(duplicatePlayoffSlotDetails.byEra) !==
            duplicatePlayoffSlotDetails.duplicateGroups ||
        sumCounts(duplicatePlayoffSlotDetails.byFinalSlot) !==
            duplicatePlayoffSlotDetails.duplicateGroups
    ) {
        throw new Error("duplicate playoff slot reconciliation failed")
    }

    return result
}

const auditEdits = (edits, userIds) => ({
    total: edits.length,
    invalidShape: edits.filter(
        (edit) =>
            !edit.user ||
            typeof edit.url !== "string" ||
            !edit.url ||
            typeof edit.public_id !== "string" ||
            !edit.public_id ||
            !isDate(edit.createdAt) ||
            !isDate(edit.updatedAt)
    ).length,
    orphanUserReference: edits.filter(
        (edit) => edit.user && !userIds.has(String(edit.user))
    ).length,
    duplicatePublicIdKeys: countDuplicateKeys(
        edits
            .filter((edit) => typeof edit.public_id === "string")
            .map((edit) => edit.public_id)
    ),
})

const environmentCategory = () => {
    const environment =
        process.env.VERCEL_ENV || process.env.NODE_ENV || "local"
    return ENVIRONMENT_CATEGORIES.has(environment) ? environment : "other"
}

const run = async () => {
    await connectMongo()

    const [users, tournaments, matches, edits] = await Promise.all([
        usersModel.find({}).select("email +password nickname role").lean(),
        tournamentsModel
            .find({})
            .select(
                "schemaVersion name players.id players.name teams.team.id teams.player.id outcome.champion outcome.finalist ongoing format valid legacy daily_recap createdAt updatedAt"
            )
            .lean(),
        matchesModel
            .find({})
            .select(
                "schemaVersion type tournament.id played valid playerP1.id playerP2.id teamP1.id teamP2.id scoreP1 scoreP2 outcome.draw outcome.playerThatWon.id outcome.playerThatLost.id outcome.teamThatWon.id outcome.teamThatLost.id playoff_id playerP3 playerP4 createdAt updatedAt"
            )
            .lean(),
        editsModel
            .find({})
            .select("-_id user url public_id createdAt updatedAt")
            .lean(),
    ])

    const userIds = new Set(users.map((user) => String(user._id)))
    const tournamentIds = new Set(
        tournaments.map((tournament) => String(tournament._id))
    )
    const formatByTournamentId = new Map(
        tournaments.map((tournament) => [
            String(tournament._id),
            tournament.format,
        ])
    )

    console.log(
        JSON.stringify(
            {
                readOnly: true,
                target: {
                    database: mongoose.connection.name,
                    environment: environmentCategory(),
                },
                users: auditUsers(users),
                tournaments: auditTournaments(tournaments),
                matches: auditMatches(
                    matches,
                    tournamentIds,
                    formatByTournamentId
                ),
                edits: auditEdits(edits, userIds),
            },
            null,
            2
        )
    )
}

run()
    .catch((error) => {
        console.error(`Data audit failed: ${error.name}`)
        process.exitCode = 1
    })
    .finally(disconnectMongo)
