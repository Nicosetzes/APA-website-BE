const { updateMatchResultToRemoveIt } = require("./../../dao")

const modifyMatchResultToRemoveIt = async (matchId) => {
    return await updateMatchResultToRemoveIt(matchId)
}

module.exports = modifyMatchResultToRemoveIt
