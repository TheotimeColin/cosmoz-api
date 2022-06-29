const mongoose = require('mongoose')

let Reaction = {
    write: 'user',
    read: 'user',
    fields: new mongoose.Schema({
        id: { type: String, write: 'self' },
        type: { type: String, write: 'self' },
        
        status: { type: mongoose.Schema.Types.ObjectId, write: 'self', ref: 'status' },

        owner: { type: mongoose.Schema.Types.ObjectId, write: 'self', read: 'public', ref: 'user' }
    }, { timestamps: true })
}

Reaction.model = global.Reaction ? global.Reaction.model : mongoose.model('reaction', Reaction.fields)
global.Reaction = Reaction

module.exports = Reaction