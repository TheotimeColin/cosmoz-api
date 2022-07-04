const { $fetch } = require('ohmyfetch/node')
const { authenticate } = require('../utils/user')
const { scrape } = require('../utils/scraper')

exports.scrape = async function (req, res) {
    let data = null
    let errors = []

    try {
        let user = await authenticate(req.headers)
        if (!user) throw Error('no-user')

        data = await scrape(req.query.url)
    } catch (e) {
        console.error(e)
        errors.push(e.message)
    }

    res.send({ data, errors, status: errors.length > 0 ? 0 : 1 })
}