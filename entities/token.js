const mongoose = require('mongoose')

const TokenEntity = {
    read: 'user',
    write: 'admin',
    fields: new mongoose.Schema({
        id: { type: String, read: '$read' },
        type: { type: String, read: '$read' },
        read: { type: String, default: 'admin' },

        value: { type: String, read: '$read' },
        value2: { type: String, read: '$read' },
        expiration: { type: Date, read: '$read' },
        
        constellation: { type: mongoose.Schema.Types.ObjectId, ref: 'constellation', read: '$read' },
        owner: { type: mongoose.Schema.Types.ObjectId, ref: 'user', read: '$read' }
    }, { timestamps: true })
}

TokenEntity.model = global.TokenEntity ? global.TokenEntity.model : mongoose.model('token', TokenEntity.fields)
global.TokenEntity = TokenEntity

module.exports = TokenEntity