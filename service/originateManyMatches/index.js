const { createManyMatches } = require("./../../dao")

const originateManyMatches = async (matchesToBePlayed) => {
    return await createManyMatches(matchesToBePlayed)
}

module.exports = originateManyMatches
