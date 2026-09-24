const finalizeLongestStreak = (accumulator) => {
    if (
        accumulator._prevType === "W" &&
        accumulator._prevLen > accumulator._maxW
    ) {
        accumulator._maxW = accumulator._prevLen
        accumulator._maxWDate = accumulator._prevEndDate
    }
    if (
        accumulator._prevType === "D" &&
        accumulator._prevLen > accumulator._maxD
    ) {
        accumulator._maxD = accumulator._prevLen
        accumulator._maxDDate = accumulator._prevEndDate
    }
    if (
        accumulator._prevType === "L" &&
        accumulator._prevLen > accumulator._maxL
    ) {
        accumulator._maxL = accumulator._prevLen
        accumulator._maxLDate = accumulator._prevEndDate
    }
}

const updateRun = (accumulator, type, continues, date) => {
    const runKey = `_run${type}`
    const maxKey = `_max${type}`
    const maxDateKey = `_max${type}Date`
    const runEndDateKey = `_run${type}EndDate`

    if (continues) {
        accumulator[runKey] += 1
        if (!accumulator[runEndDateKey]) {
            accumulator[runEndDateKey] = date
        }
    } else {
        accumulator[runKey] = 0
        accumulator[runEndDateKey] = null
    }

    if (accumulator[runKey] > accumulator[maxKey]) {
        accumulator[maxKey] = accumulator[runKey]
        accumulator[maxDateKey] = accumulator[runEndDateKey]
    }
}

// These helpers mutate only accumulators privately owned by playerAggregation.
const updateStreaks = ({
    accumulator,
    result,
    goalsFor,
    goalsAgainst,
    date,
}) => {
    updateRun(accumulator, "CS", goalsAgainst === 0, date)
    updateRun(accumulator, "G1", goalsFor >= 1, date)
    updateRun(accumulator, "G2", goalsFor >= 2, date)
    updateRun(accumulator, "G3", goalsFor >= 3, date)

    if (!accumulator._curDone) {
        if (accumulator._curType === null) {
            accumulator._curType = result
            accumulator._curLen = 1
        } else if (accumulator._curType === result) {
            accumulator._curLen += 1
        } else {
            accumulator._curDone = true
        }
    }

    if (accumulator._prevType === result) {
        accumulator._prevLen += 1
    } else {
        finalizeLongestStreak(accumulator)
        accumulator._prevType = result
        accumulator._prevLen = 1
        accumulator._prevEndDate = date
    }
}

module.exports = { updateStreaks, finalizeLongestStreak }
