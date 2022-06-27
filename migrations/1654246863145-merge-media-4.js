const mongoose = require('mongoose')
const { mediaCollection } = require('../api/entities/index')

let Media = {
    write: 'user',
    read: 'public',
    fields: new mongoose.Schema({
        id: { type: String, write: 'editor' },
        width: { type: Number, write: 'editor' },
        height: { type: Number, write: 'editor' },
        size: { type: String, write: 'editor' },
        src: { type: String, write: 'editor' }
    }, { timestamps: true })
}

Media.model = mongoose.model('media', Media.fields)

 async function up () {
  try {
    let collections = await mediaCollection.model.find()

    await Promise.all(collections.map(async coll => {
      coll.medias = await Promise.all(coll.medias.map(async id => {
        let m = await Media.model.findById(id)
        if (m) delete m._id
        
        return m ? m : null
      }).filter(m => m))

      await coll.save()
      return coll
    }))
  } catch (e) {
    console.error(e)
    return false
  }
}

/**
 * Make any changes that UNDO the up function side effects here (if possible)
 */
async function down () {
  // Write migration here
}

module.exports = { up, down };
