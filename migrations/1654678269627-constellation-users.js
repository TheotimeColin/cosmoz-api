const { constellation } = require('../entities/index')

/**
 * Make any changes you need to make to the database here
 */
async function up () {
  try {
    let constes = await constellation.model.find()

    await Promise.all(constes.map(async conste => {
      
      conste.followers = []
      conste.members = conste.members ? conste.members : []
      conste.organizers = conste.organizers ? conste.organizers : []
      conste.admins = conste.admins ? conste.admins : []
      
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
