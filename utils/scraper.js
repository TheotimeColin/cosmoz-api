const createBrowserless = require('browserless')
const getHTML = require('html-get')
const metascraper = require('metascraper')([
    require('metascraper-image')(),
    require('metascraper-title')(),
    require('metascraper-description')(),
    require('metascraper-date')()
])

exports.scrape = async function (url) {
    return new Promise(async resolve => {
        let data = null

        try {
            const browserlessFactory = createBrowserless()
            process.on('exit', browserlessFactory.close)

            const getContent = async url => {
                const browserContext = browserlessFactory.createContext()
                const getBrowserless = () => browserContext
                const result = await getHTML(url, { getBrowserless })
                await getBrowserless(browser => browser.destroyContext())
                return result
            }

            const content = await getContent(url)
            const metadata = await metascraper(content)

            data = metadata
        } catch (e) {
            console.error(e)
        }
        
        resolve(data)
    })
}