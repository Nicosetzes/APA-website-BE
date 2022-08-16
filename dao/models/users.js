const mongoose = require("mongoose");

const collection = "users";

const usersSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      min: 6,
      max: 1024,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    nickname: {
      type: String,
      required: true,
      min: 1,
      max: 255,
    },
    date: {
      type: Date,
      default: Date.now,
    },
  },
  { collection: "users" }
);

module.exports = mongoose.model(collection, usersSchema);
