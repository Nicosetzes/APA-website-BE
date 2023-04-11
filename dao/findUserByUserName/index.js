const usersModel = require("./../models/users.js")

const findUserByUserName = async (email) => {
    const foundUser = await usersModel.findOne({ email })
    return foundUser
}

module.exports = findUserByUserName
