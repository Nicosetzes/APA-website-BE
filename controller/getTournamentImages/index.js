const cloudinary = require("../../cloudinary")

const getTournamentImages = async (req, res) => {
    try {
        const result = await cloudinary.api.resources({
            type: "upload",
            resource_type: "image",
            prefix: "tournaments/",
            max_results: 500,
        })

        const images = result.resources.map((resource) => ({
            cloudinary_id: resource.public_id,
            url: resource.secure_url,
            format: resource.format,
            width: resource.width,
            height: resource.height,
        }))

        res.json({
            success: true,
            data: images,
            total: result.total_count,
        })
    } catch (err) {
        console.error("Get tournament images error:", err)
        res.status(500).json({
            success: false,
            message: err.message || "Failed to retrieve tournament images",
        })
    }
}

module.exports = getTournamentImages
