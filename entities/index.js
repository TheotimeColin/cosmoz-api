const mongoose = require('mongoose')

const mediaCollection = require('./media-collection')
const notification = require('./notification')
const user = require('./user')
const token = require('./token')
const location = require('./location')
const gathering = require('./gathering')
const article = require('./article')
const reaction = require('./reaction')
const status = require('./status')
const constellation = require('./constellation')
const mention = require('./mention')
const mail = require('./mail')
const channelMessage = require('./channel-message')
const channel = require('./channel')

mongoose.connect(process.env.MONGO, { useNewUrlParser: true, useUnifiedTopology: true })

exports.mediaCollection = mediaCollection
exports.notification = notification
exports.token = token
exports.user = user
exports.location = location
exports.gathering = gathering
exports.article = article
exports.reaction = reaction
exports.status = status
exports.constellation = constellation
exports.mention = mention
exports.mail = mail
exports.channelMessage = channelMessage
exports.channel = channel