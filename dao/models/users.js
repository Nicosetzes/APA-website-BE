const mongoose = require("mongoose");

const collection = "users";

const usersSchema = new mongoose.Schema({
    username: { type: String, require: true, max: 100 },
    password: { type: String, require: true, max: 100 },
}, { collection: 'users' });

module.exports = mongoose.model(collection, usersSchema);