const Entities = require('../entities')
const { $fetch } = require('ohmyfetch/node')

exports.getToken = async function (req, res) {
    let errors = []
    let data = null

    try {
        if (process.env.RECAPTCHA_BYPASS != "true") {
            const challenge = await $fetch(`https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET}&response=${req.body.token}`)

            if (!challenge.success) throw Error('challenge-failed')
        }

        const token = await Entities.token.model.findOne({ id: req.body.id, type: req.body.type })
        
        data = token
    } catch (e) {
        console.error(e)
        errors.push(e.message)
    }

    res.send({
        data, errors,
        status: errors.length > 0 ? 0 : 1
    })
}