const { retrieveAssistantChampions } = require("./../../service")
const createGetAssistantChampions = (dependencies = {}) => {
    const retrieveChampions =
        dependencies.retrieveAssistantChampions || retrieveAssistantChampions
    return async (req, res) => {
        const champions = await retrieveChampions()
        return res.status(200).json({ success: true, data: champions })
    }
}
const getAssistantChampions = createGetAssistantChampions()
module.exports = getAssistantChampions
module.exports.createGetAssistantChampions = createGetAssistantChampions
