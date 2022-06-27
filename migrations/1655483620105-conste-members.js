const { constellation } = require('../api/entities/index')
const mongoose = require('mongoose')
/**
 * Make any changes you need to make to the database here
 */
async function up () {
  try {
    let constes = await constellation.model.find()

    await Promise.all(constes.map(async conste => {
      conste.followers = conste.followers.map(m => mongoose.Types.ObjectId(m))
      conste.members = conste.members.map(m => mongoose.Types.ObjectId(m))
      conste.organizers = conste.organizers.map(m => mongoose.Types.ObjectId(m))
      conste.admins = conste.admins.map(m => mongoose.Types.ObjectId(m))
      
      return await conste.save()
    }))
  } catch (e) {
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
