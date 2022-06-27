const mongoose = require('mongoose')

let Article = {
    write: 'public',
    read: 'public',
    fields: new mongoose.Schema({
        title: { type: String, write: 'editor' },
        slug: { type: String, write: 'editor' },
        category: { type: String, write: 'editor' },
        excerpt: { type: String, write: 'editor' },
        content: { type: String, write: 'editor' },
        excerpt: { type: String, write: 'editor' },
        cover: { type: mongoose.Schema.Types.ObjectId, write: 'editor', ref: 'mediaCollection' },
    }, { timestamps: true })
}

Article.fields.pre('find', function () {
    this.populate('cover')
})

Article.model = global.Article ? global.Article.model : mongoose.model('article', Article.fields)
global.Article = Article

module.exports = Article