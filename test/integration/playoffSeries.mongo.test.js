const assert = require("node:assert/strict")
const test = require("node:test")
const mongoose = require("mongoose")
const { isTestDatabaseName } = require("../../config/databaseSafety")
const matchesModel = require("../../dao/models/matches")
const tournamentsModel = require("../../dao/models/tournaments")
const updatePlayoffSeriesMatchResult = require("../../dao/updatePlayoffSeriesMatchResult")
const {
    PLAYOFF_LEG_INDEX_KEY: INDEX_KEY,
    PLAYOFF_LEG_INDEX_NAME: INDEX_NAME,
    PLAYOFF_LEG_INDEX_FILTER: PARTIAL_FILTER,
} = require("../../config/playoffLegIndex")
const {
    buildLegsForTie,
    calculatePhysicalOutcome,
} = require("../../service/playoffSeries")
const {
    createProcessPlayoffSeriesResult,
} = require("../../service/processPlayoffSeriesResult")

const uri = process.env.PLAYOFF_REPLICA_SET_TEST_URI
const prefix = "playoff-series-integration-"
const ref = (id) => ({ id, name: id })
const unit = (id, seed) => ({
    team: ref(`team-${id}`),
    player: ref(`player-${id}`),
    seed,
})
const bodyFor = (match, scoreP1, scoreP2, revision) => ({
    playerP1: match.playerP1,
    teamP1: match.teamP1,
    seedP1: match.seedP1,
    scoreP1,
    playerP2: match.playerP2,
    teamP2: match.teamP2,
    seedP2: match.seedP2,
    scoreP2,
    ...(revision === undefined ? {} : { expectedSeriesRevision: revision }),
})

const createFixture = async (suffix) => {
    const tournamentId = new mongoose.Types.ObjectId()
    const tournament = {
        _id: tournamentId,
        name: `${prefix}${suffix}`,
        format: "playoff",
        playoffMode: "two_legged",
        ongoing: true,
        players: [ref("player-1"), ref("player-2")],
        teams: [],
    }
    await tournamentsModel.collection.insertOne(tournament)
    const legs = buildLegsForTie({
        tournament,
        playoffId: 1,
        unitA: unit(1, "1A"),
        unitB: unit(2, "1B"),
    })
    const inserted = await matchesModel.collection.insertMany(legs)
    return {
        tournament,
        matches: legs.map((leg, index) => ({
            ...leg,
            _id: inserted.insertedIds[index],
        })),
    }
}

test(
    "real series services converge concurrent requests and roll back injected failures",
    { skip: !uri && "PLAYOFF_REPLICA_SET_TEST_URI was not provided" },
    async () => {
        await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 })
        const tournamentIds = []
        try {
            assert(
                isTestDatabaseName(mongoose.connection.name),
                "integration database name must explicitly contain test/dev/qa/staging"
            )
            const collection = matchesModel.collection
            const indexes = await collection.listIndexes().toArray()
            if (!indexes.some(({ name }) => name === INDEX_NAME)) {
                await collection.createIndex(INDEX_KEY, {
                    name: INDEX_NAME,
                    unique: true,
                    partialFilterExpression: PARTIAL_FILTER,
                })
            }

            const concurrent = await createFixture("concurrent")
            tournamentIds.push(concurrent.tournament._id)
            const [first, second] = concurrent.matches
            const firstBody = bodyFor(first, 1, 0)
            first.outcome = calculatePhysicalOutcome({
                match: first,
                body: firstBody,
                decisive: false,
            })
            await createProcessPlayoffSeriesResult()({
                tournamentId: concurrent.tournament._id,
                matchId: first._id,
                body: firstBody,
            })

            const secondBody = bodyFor(second, 0, 1, 1)
            const service = createProcessPlayoffSeriesResult()
            const responses = await Promise.all([
                service({
                    tournamentId: concurrent.tournament._id,
                    matchId: second._id,
                    body: secondBody,
                }),
                service({
                    tournamentId: concurrent.tournament._id,
                    matchId: second._id,
                    body: secondBody,
                }),
            ])
            assert.equal(responses.length, 2)
            assert.equal(
                await collection.countDocuments({
                    "tournament.id": String(concurrent.tournament._id),
                    playoff_id: 17,
                }),
                2
            )

            const rollback = await createFixture("rollback")
            tournamentIds.push(rollback.tournament._id)
            const before = await collection
                .find({ "tournament.id": String(rollback.tournament._id) })
                .sort({ leg: 1 })
                .toArray()
            const failingService = createProcessPlayoffSeriesResult({
                updatePlayoffSeriesMatchResult: async (...args) => {
                    await updatePlayoffSeriesMatchResult(...args)
                    throw new Error("injected after result write")
                },
            })
            await assert.rejects(
                failingService({
                    tournamentId: rollback.tournament._id,
                    matchId: rollback.matches[0]._id,
                    body: bodyFor(rollback.matches[0], 2, 0),
                }),
                /injected after result write/
            )
            const after = await collection
                .find({ "tournament.id": String(rollback.tournament._id) })
                .sort({ leg: 1 })
                .toArray()
            assert.deepEqual(after, before)
        } finally {
            if (tournamentIds.length) {
                await matchesModel.collection.deleteMany({
                    "tournament.id": {
                        $in: tournamentIds.map(String),
                    },
                })
                await tournamentsModel.collection.deleteMany({
                    _id: { $in: tournamentIds },
                    name: { $regex: `^${prefix}` },
                })
            }
            await mongoose.disconnect()
        }
    }
)
