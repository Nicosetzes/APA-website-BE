// const mongoose = require("mongoose");

// const collection = "invalid-tokens";

// const tokensSchema = new mongoose.Schema(
//   {
//     token: {
//       type: String,
//       // index: {
//       //   unique: true,
//       // },
//     },
//     expireAt: {
//       type: Date,
//       /* Defaults 2 days from now */
//       default: new Date(new Date().valueOf() + 172800000),
//       /* Remove doc 60 seconds after specified date */
//       expires: 60,
//     },
//     /* Automatically add createdAt and updatedAt fields to schema */
//   },
//   { timestamps: true, collection: collection }
// );

// module.exports = mongoose.model(collection, tokensSchema);
