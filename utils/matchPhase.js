const isKnockoutMatch = (match) =>
    match?.type === "playoff" ||
    match?.type === "playin" ||
    (match?.seedP1 !== undefined && match?.seedP2 !== undefined)

module.exports = { isKnockoutMatch }
