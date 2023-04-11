const { findAllUsers } = require("./../../dao")

const retrieveAllUsers = async () => {
    return await findAllUsers()
}

module.exports = retrieveAllUsers
