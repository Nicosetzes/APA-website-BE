const { findUserById } = require("./../../dao")

const retrieveUserById = async (id) => {
    return await findUserById(id)
}

module.exports = retrieveUserById
