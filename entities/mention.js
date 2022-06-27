const mongoose = require('mongoose')

let Mention = {
    write: 'self',
    read: 'public',
    fields: new mongoose.Schema({
        types: { type: Array, default: () => [], write: 'private' },

        gathering: { type: mongoose.Schema.Types.ObjectId, write: 'private', read: 'user', ref: 'gathering' },
        target: { type: mongoose.Schema.Types.ObjectId, write: 'private', read: 'user', ref: 'user' },
        owner: { type: mongoose.Schema.Types.ObjectId, write: 'private', read: 'self', ref: 'user' }
    }, { timestamps: true })
}

Mention.model = global.Mention ? global.Mention.model : mongoose.model('mention', Mention.fields)
global.Mention = Mention

module.exports = Mention