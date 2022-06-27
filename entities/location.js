const mongoose = require('mongoose')

let Location = {
    write: 'editor',
    read: 'public',
    fields: new mongoose.Schema({
        title: { type: String },
        experiences: [
            { type: mongoose.Schema.Types.ObjectId, ref: 'experience' }
        ]
    }, { timestamps: true })
}

Location.model = global.Location ? global.Location.model : mongoose.model('location', Location.fields)
global.Location = Location

module.exports = Location