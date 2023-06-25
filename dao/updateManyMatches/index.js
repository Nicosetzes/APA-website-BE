const matchesModel = require("./../models/matches.js")

// const updateManyMatches = async () => {
//     const allMatches = await matchesModel.findById()

//     allMatches.forEach(async (match) => {
//         let id = match.id
//         let newUpdatedAt = match._id.getTimestamp()
//         await matchesModel.findByIdAndUpdate(
//             id,
//             { updatedAt: newUpdatedAt },
//             { timestamps: false, new: true }
//         )
//     })

//     return "ok"
// }

// const updateManyMatches = async () => {
//     const updatedMatches = matchesModel.updateMany(
//         {
//             "tournament.id": "646ff40e2524b3187034f790",
//             $or: [{ "teamP1.id": "40" }, { "teamP2.id": "40" }],
//             type: "regular",
//         },
//         {
//             $set: {
//                 group: "B",
//             },
//         },
//         { timestamps: false }
//     )
//     return updatedMatches
// }

const updateManyMatches = async () => {
    // const updatedMatches = await matchesModel.updateMany(
    //     {
    //         "tournament.id": "6457ae8d96efc21b03ba4cfe",
    //     },
    //     {
    //         $set: {
    //             tournament: {
    //                 id: "6457ae8d96efc21b03ba4cfe",
    //                 name: "Superliga Inglesa 2022",
    //             },
    //         },
    //     },
    //     { timestamps: false }
    // )
    // return updatedMatches

    return "edit"
}

// const updateManyMatches = async () => {
//     const updatedMatches = matchesModel.updateMany(
//         { "outcome.playerThatLost": "none" },
//         {
//             $unset: {
//                 "outcome.playerThatLost": {
//                     field: 1,
//                 },
//                 "outcome.teamThatLost": {
//                     field: 1,
//                 },
//                 "outcome.scoreFromTeamThatLost": {
//                     field: 1,
//                 },
//             },
//         }
//         // { strict: false } // It's necessary for props that aren't in the model anymore //
//     )
//     return updatedMatches
// }

// const updateManyMatches = async () => {
//     const updatedMatches = matchesModel.updateMany(
//         {
//             "tournament.name": "Copa del Mundo 2022",
//             played: { $ne: true },
//         },
//         { $set: { played: false } }
//     )
//     return updatedMatches
// }

module.exports = updateManyMatches
