const {
    retrieveMatches,
    retrieveMatchesByTeamName,
} = require("./../../service")

const getMatches = async (req, res) => {
    const { query } = req.query
    try {
        if (query) {
            const matches = await retrieveMatchesByTeamName(query)
            res.json(matches)
        } else {
            const matches = await retrieveMatches(10)
            res.json(matches)
        }
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getMatches
