const mongoose = require("mongoose")

const configureMongoose = (environment = process.env.NODE_ENV) => {
    const allowAutomaticIndexes =
        environment === "test" || environment === "development"
    mongoose.set("autoIndex", allowAutomaticIndexes)
    mongoose.set("autoCreate", allowAutomaticIndexes)
    return mongoose
}

module.exports = configureMongoose
