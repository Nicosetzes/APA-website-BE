const { findUserByUserName } = require("../../dao")

const retrieveUserByUserName = async (email) => {
    return await findUserByUserName(email)
}

module.exports = retrieveUserByUserName
