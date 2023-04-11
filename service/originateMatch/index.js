const { createMatch } = require("./../../dao")

const originateMatch = async (match) => {
    return await createMatch(match)
}

module.exports = originateMatch
