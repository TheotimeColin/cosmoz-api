const mongoose = require('mongoose')

const TagEntity = {
    read: 'user',
    write: 'admin',
    fields: new mongoose.Schema({
        id: { type: String },
        count: { type: Number, default: 0 },
        
        constellation: { type: mongoose.Schema.Types.ObjectId, ref: 'constellation' }
    }, { timestamps: true })
}

TagEntity.model = global.TagEntity ? global.TagEntity.model : mongoose.model('tag', TagEntity.fields)
global.TagEntity = TagEntity

module.exports = TagEntity