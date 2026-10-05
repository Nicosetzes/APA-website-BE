const mongoose = require("mongoose")
const { isTestDatabaseName } = require("../config/databaseSafety")
const {
    PLAYOFF_LEG_INDEX_FILTER: PARTIAL_FILTER,
    PLAYOFF_LEG_INDEX_KEY: INDEX_KEY,
    PLAYOFF_LEG_INDEX_NAME: INDEX_NAME,
    hasPlayoffLegIndexDefinition: sameDefinition,
} = require("../config/playoffLegIndex")

const redactDuplicate = ({ _id, count }) => ({
    tournament: String(_id.tournament).slice(-6).padStart(6, "*"),
    playoffId: _id.playoffId,
    leg: _id.leg,
    count,
})

const inspectDuplicates = async (collection) => {
    const candidateDuplicates = await collection
        .aggregate([
            { $match: PARTIAL_FILTER },
            {
                $group: {
                    _id: {
                        tournament: "$tournament.id",
                        playoffId: "$playoff_id",
                        leg: "$leg",
                    },
                    count: { $sum: 1 },
                },
            },
            { $match: { count: { $gt: 1 } } },
            { $limit: 20 },
        ])
        .toArray()
    const legacyDuplicates = await collection
        .aggregate([
            {
                $match: {
                    type: "playoff",
                    leg: { $exists: false },
                    playoff_id: { $type: "number" },
                    "tournament.id": { $type: "string" },
                },
            },
            {
                $group: {
                    _id: {
                        tournament: "$tournament.id",
                        playoffId: "$playoff_id",
                    },
                    count: { $sum: 1 },
                },
            },
            { $match: { count: { $gt: 1 } } },
            { $count: "count" },
        ])
        .toArray()
    const candidateCount = await collection.countDocuments(PARTIAL_FILTER)
    return {
        candidateCount,
        candidateDuplicates,
        legacyDuplicateGroups: legacyDuplicates[0]?.count || 0,
    }
}

const run = async () => {
    require("dotenv").config()
    mongoose.set("autoIndex", false)
    mongoose.set("autoCreate", false)

    const uri = process.env.MONGO_URI?.trim()
    if (!uri)
        throw new Error("Missing required environment variable: MONGO_URI")
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 })
    try {
        const collection = mongoose.connection.collection("face-to-face")
        const report = await inspectDuplicates(collection)
        console.log(
            JSON.stringify({
                candidateCount: report.candidateCount,
                candidateDuplicates:
                    report.candidateDuplicates.map(redactDuplicate),
                legacyDuplicateGroups: report.legacyDuplicateGroups,
            })
        )
        if (report.candidateDuplicates.length) {
            process.exitCode = 1
            return
        }

        if (!process.argv.includes("--apply")) return
        if (process.env.APPLY_PLAYOFF_LEG_INDEX !== "true")
            throw new Error("APPLY_PLAYOFF_LEG_INDEX=true is required")
        if (
            !isTestDatabaseName(mongoose.connection.name) &&
            process.env.ALLOW_PRODUCTION_DB !== "true"
        )
            throw new Error("Index apply blocked for a non-test database")

        const indexes = await collection.listIndexes().toArray()
        const named = indexes.find(({ name }) => name === INDEX_NAME)
        if (named && !sameDefinition(named))
            throw new Error(`${INDEX_NAME} exists with a different definition`)
        if (!named) {
            await collection.createIndex(INDEX_KEY, {
                name: INDEX_NAME,
                unique: true,
                partialFilterExpression: PARTIAL_FILTER,
            })
        }
        console.log(`${INDEX_NAME}: ready`)
    } finally {
        await mongoose.disconnect()
    }
}

if (require.main === module) {
    run().catch((error) => {
        console.error(error.message)
        process.exitCode = 1
    })
}
