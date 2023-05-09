const { modifyManyMatches } = require("./../../service")

const majorUpdatesController = async (req, res) => {
    try {
        const matches = await modifyManyMatches()

        res.send(matches)
    } catch (err) {
        console.log(err)
    }
}

module.exports = majorUpdatesController
