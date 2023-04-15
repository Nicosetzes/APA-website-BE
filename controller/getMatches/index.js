const { retrieveMatches } = require("./../../service")

const getMatches = async (req, res) => {
    try {
        const { page = 0, teamName } = req.query
        const matches = await retrieveMatches(Number(page), teamName)
        res.json(matches)
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getMatches
