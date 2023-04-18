const { findAllMatchesByUserId } = require("./../../dao")

const retrieveAllMatchesByUserId = async (id) => {
    return await findAllMatchesByUserId(id)
}

module.exports = retrieveAllMatchesByUserId
