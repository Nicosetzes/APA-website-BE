const { updateMatchResultToRemoveIt } = require("./../../dao")

const modifyMatchResultToRemoveIt = async (matchId, options = {}) => {
    return await updateMatchResultToRemoveIt(matchId, options)
}

module.exports = modifyMatchResultToRemoveIt
