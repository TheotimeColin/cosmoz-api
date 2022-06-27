const { user, constellation } = require('../api/entities/index')

 async function up () {
  try {
    let users = await user.model.find()
    await constellation.model.updateMany({}, {
      type: 'group'
    })

    await Promise.all(users.map(async user => {
      
      user.followedConstellations = []
      user.createdConstellations = []

      return await user.save()
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