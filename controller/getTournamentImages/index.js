const cloudinary = require("../../cloudinary")
const { HttpError } = require("../../middleware/httpErrors")
const logger = require("../../utils/logger")

const TOURNAMENT_IMAGES_QUERY = {
    type: "upload",
    resource_type: "image",
    prefix: "tournaments/",
    max_results: 500,
}

const createGetTournamentImages = (dependencies = {}) => {
    const listImages =
        dependencies.listImages ||
        (() => cloudinary.api.resources(TOURNAMENT_IMAGES_QUERY))

    return async (req, res) => {
        let result

        try {
            result = await listImages()
        } catch (cause) {
            // El error del proveedor no viaja al cliente: puede incluir detalles
            // de la cuenta o de la request firmada.
            logger.error("cloudinary_list_failed", {
                requestId: req.requestId || null,
                provider: "cloudinary",
                providerStatus:
                    cause?.error?.http_code || cause?.http_code || null,
                errorName: cause?.name || "Error",
            })

            throw new HttpError(
                502,
                "IMAGE_PROVIDER_ERROR",
                "No se pudieron obtener las imágenes de torneos",
                [],
                { cause }
            )
        }

        const images = (result?.resources || []).map((resource) => ({
            cloudinary_id: resource.public_id,
            url: resource.secure_url,
            format: resource.format,
            width: resource.width,
            height: resource.height,
        }))

        return res.status(200).json({
            success: true,
            data: images,
            total: result?.total_count,
        })
    }
}

const getTournamentImages = createGetTournamentImages()

module.exports = getTournamentImages
module.exports.createGetTournamentImages = createGetTournamentImages
