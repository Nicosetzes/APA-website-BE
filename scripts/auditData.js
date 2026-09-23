require("dotenv").config()

const { connectMongo, disconnectMongo } = require("../database")
const usersModel = require("../dao/models/users")
const tournamentsModel = require("../dao/models/tournaments")
const matchesModel = require("../dao/models/matches")
const editsModel = require("../dao/models/edits")

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

const auditTournaments = (tournaments) => ({
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
        (tournament) => !tournament.players?.length || !tournament.teams?.length
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
                (player) => !hasId(player) || typeof player.name !== "string"
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
})

const auditMatches = (matches, tournamentIds) => {
    const playoffSlots = matches
        .filter(
            (match) =>
                match.type === "playoff" &&
                Number.isInteger(match.playoff_id) &&
                match.tournament?.id !== undefined
        )
        .map((match) => `${match.tournament.id}:${match.playoff_id}`)

    return {
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
        duplicatePlayoffSlots: countDuplicateKeys(playoffSlots),
        legacyPlayerP3P4Present: matches.filter(
            (match) =>
                match.playerP3 !== undefined || match.playerP4 !== undefined
        ).length,
        missingTimestamps: matches.filter(
            (match) => !isDate(match.createdAt) || !isDate(match.updatedAt)
        ).length,
    }
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

const run = async () => {
    await connectMongo()

    const [users, tournaments, matches, edits] = await Promise.all([
        usersModel.find({}).select("email +password nickname role date").lean(),
        tournamentsModel.find({}).lean(),
        matchesModel.find({}).lean(),
        editsModel.find({}).lean(),
    ])

    const userIds = new Set(users.map((user) => String(user._id)))
    const tournamentIds = new Set(
        tournaments.map((tournament) => String(tournament._id))
    )

    console.log(
        JSON.stringify(
            {
                readOnly: true,
                users: auditUsers(users),
                tournaments: auditTournaments(tournaments),
                matches: auditMatches(matches, tournamentIds),
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
