const isKnockoutMatch = (match) =>
    match?.type === "playoff" || match?.type === "playin"

module.exports = { isKnockoutMatch }
