const { updateSquad } = require("./../../dao")

const modifySquad = async (tournament, teams) => {
    return await updateSquad(tournament, teams)
}

module.exports = modifySquad
