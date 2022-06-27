const { $fetch } = require('ohmyfetch/node')
const { authenticate } = require('../utils/user')
const createBrowserless = require('browserless')
const getHTML = require('html-get')
const metascraper = require('metascraper')([
    require('metascraper-image')(),
    require('metascraper-title')(),
    require('metascraper-date')()
])

exports.scrape = async function (req, res) {
    let data = null
    let errors = []

    try {
        let user = await authenticate(req.headers)
        if (!user) throw Error('no-user')
        
        const browserlessFactory = createBrowserless()
        process.on('exit', browserlessFactory.close)

        const getContent = async url => {
            const browserContext = browserlessFactory.createContext()
            const getBrowserless = () => browserContext
            const result = await getHTML(url, { getBrowserless })
            await getBrowserless(browser => browser.destroyContext())
            return result
        }

        const content = await getContent(req.query.url)
        const metadata = await metascraper(content)

        data = metadata
    } catch (e) {
        console.error(e)
        errors.push(e.message)
    }

    res.send({ data, errors, status: errors.length > 0 ? 0 : 1 })
}