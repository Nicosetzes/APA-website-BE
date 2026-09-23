const mongoose = require("mongoose")

const withTransaction = async (
    work,
    { startSession = () => mongoose.startSession() } = {}
) => {
    const session = await startSession()
    let result

    try {
        await session.withTransaction(async () => {
            result = await work(session)
        })
        return result
    } finally {
        await session.endSession()
    }
}

module.exports = withTransaction
